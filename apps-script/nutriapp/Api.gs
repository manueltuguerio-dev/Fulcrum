/**
 * NutriApp · Fulcrum
 * Funciones que la interfaz llama con google.script.run.
 *
 * Todas reciben el token de sesión como primer argumento y lo validan antes de
 * tocar la hoja de cálculo. Un paciente solo alcanza sus propios datos; las
 * funciones del panel exigen rol Nutriologo.
 */

/* ===================================================================
   ARRANQUE DE LA INTERFAZ
   =================================================================== */

/**
 * Todo lo que la aplicación necesita al entrar: perfil, plan del día,
 * consumido de hoy, catálogo, platillos y evidencia.
 * @param {string} token El token de sesión.
 * @return {Object} El estado inicial.
 */
function getEstadoInicial(token) {
  var usuario = requerirSesion_(token);

  if (usuario.Rol === 'Nutriologo') {
    return {
      rol: 'Nutriologo',
      perfil: { id: usuario.ID, nombre: usuario.Nombre, email: usuario.Email },
      pacientes: listarPacientes(token),
      evidencia: leerTabla_('Evidencia_Cientifica').map(limpiarFila_)
    };
  }

  var plan = obtenerPlanCaloricoMensual(usuario.ID);
  persistirPlan_(usuario.ID, plan);

  return {
    rol: 'Paciente',
    perfil: { id: usuario.ID, nombre: usuario.Nombre, email: usuario.Email },
    plan: plan,
    resumenHoy: getResumenDiario(token, aFechaISO_(new Date())),
    alimentos: getCatalogoAlimentos(token),
    platillos: getPlatillosSugeridos(token),
    milpa: getPlatoMilpa(token),
    evidencia: leerTabla_('Evidencia_Cientifica').map(limpiarFila_),
    ultimaMetrica: getUltimaMetrica(token),
    datosPerfil: getPerfilPaciente(token),
    tendencia: getTendenciaMetrica(token, 'peso'),
    chat: getChat(token),
    chatAsistente: getChatAsistente(token),
    iaDisponible: hayIA_()
  };
}

/* ===================================================================
   ALIMENTOS Y REGISTRO DIARIO
   =================================================================== */

/**
 * Catálogo completo de alimentos por 100 g.
 * @param {string} token El token de sesión.
 * @return {Array<Object>} Los alimentos.
 */
function getCatalogoAlimentos(token) {
  requerirSesion_(token);
  return leerTabla_('Alimentos_100g').map(function (a) {
    return {
      id: a.ID,
      categoria: a.Categoria,
      alimento: a.Alimento,
      proteina: aNumero_(a.Proteina_g),
      grasa: aNumero_(a.Grasa_g),
      carbohidratos: aNumero_(a.Carbohidratos_g),
      fibra: aNumero_(a.Fibra_g),
      calorias: aNumero_(a.Calorias_100g)
    };
  });
}

/**
 * Busca alimentos por nombre o categoría.
 * @param {string} token El token de sesión.
 * @param {string} texto Lo que se escribió en el buscador.
 * @return {Array<Object>} Hasta 40 coincidencias.
 */
function buscarAlimentos(token, texto) {
  var catalogo = getCatalogoAlimentos(token);
  var buscado = normalizarTexto_(texto);
  if (!buscado) {
    return catalogo.slice(0, 40);
  }
  return catalogo.filter(function (a) {
    return normalizarTexto_(a.alimento).indexOf(buscado) >= 0 ||
      normalizarTexto_(a.categoria).indexOf(buscado) >= 0;
  }).slice(0, 40);
}

/**
 * Calcula los totales de una lista de alimentos con sus gramajes.
 * @param {Array<Object>} items Objetos con idAlimento y gramos.
 * @param {Array<Object>=} catalogo El catálogo ya cargado, para no releerlo.
 * @return {Object} Los totales y el detalle por alimento.
 */
function calcularTotales_(items, catalogo) {
  var tabla = catalogo || leerTabla_('Alimentos_100g').map(function (a) {
    return {
      id: a.ID,
      alimento: a.Alimento,
      proteina: aNumero_(a.Proteina_g),
      grasa: aNumero_(a.Grasa_g),
      carbohidratos: aNumero_(a.Carbohidratos_g),
      fibra: aNumero_(a.Fibra_g),
      calorias: aNumero_(a.Calorias_100g)
    };
  });

  var indice = {};
  tabla.forEach(function (a) { indice[a.id] = a; });

  var totales = { calorias: 0, proteinas: 0, grasas: 0, carbohidratos: 0, fibra: 0 };
  var detalle = [];

  (items || []).forEach(function (item) {
    var base = indice[item.idAlimento];
    if (!base) {
      return;
    }
    var factor = aNumero_(item.gramos) / 100;
    var linea = {
      idAlimento: base.id,
      alimento: base.alimento,
      gramos: redondear_(aNumero_(item.gramos), 1),
      calorias: redondear_(base.calorias * factor, 1),
      proteinas: redondear_(base.proteina * factor, 1),
      grasas: redondear_(base.grasa * factor, 1),
      carbohidratos: redondear_(base.carbohidratos * factor, 1),
      fibra: redondear_(base.fibra * factor, 1)
    };
    detalle.push(linea);
    totales.calorias += linea.calorias;
    totales.proteinas += linea.proteinas;
    totales.grasas += linea.grasas;
    totales.carbohidratos += linea.carbohidratos;
    totales.fibra += linea.fibra;
  });

  Object.keys(totales).forEach(function (llave) {
    totales[llave] = redondear_(totales[llave], 1);
  });

  return { totales: totales, detalle: detalle };
}

/**
 * Guarda un tiempo de comida en el registro diario.
 * @param {string} token El token de sesión.
 * @param {Object} datos fecha, tiempoComida y alimentos [{idAlimento, gramos}].
 * @return {Object} El resumen del día ya actualizado.
 */
function guardarRegistroDiario(token, datos) {
  var usuario = requerirSesion_(token);

  if (!datos || !datos.tiempoComida) {
    throw new Error('Falta indicar el tiempo de comida.');
  }
  if (!datos.alimentos || !datos.alimentos.length) {
    throw new Error('Agrega al menos un alimento antes de guardar.');
  }

  var calculo = calcularTotales_(datos.alimentos);
  var fecha = datos.fecha || aFechaISO_(new Date());

  agregarFila_('Registro_Diario', {
    ID: nuevoId_('REG'),
    ID_Paciente: usuario.ID,
    Fecha: fecha,
    TiempoComida: datos.tiempoComida,
    AlimentosJSON: JSON.stringify(calculo.detalle),
    CaloriasTotales: calculo.totales.calorias,
    ProteinasTotales: calculo.totales.proteinas,
    GrasasTotales: calculo.totales.grasas,
    CarbohidratosTotales: calculo.totales.carbohidratos,
    FibraTotal: calculo.totales.fibra
  });

  return getResumenDiario(token, fecha);
}

/**
 * Borra un registro del día. Solo el dueño puede hacerlo.
 * @param {string} token El token de sesión.
 * @param {string} idRegistro El identificador del registro.
 * @return {Object} El resumen del día ya actualizado.
 */
function borrarRegistroDiario(token, idRegistro) {
  var usuario = requerirSesion_(token);
  var registros = leerTabla_('Registro_Diario');

  for (var i = 0; i < registros.length; i++) {
    if (String(registros[i].ID) === String(idRegistro)) {
      if (String(registros[i].ID_Paciente) !== String(usuario.ID)) {
        throw new Error('Ese registro no es tuyo.');
      }
      var fecha = aFechaISO_(registros[i].Fecha);
      hoja_('Registro_Diario').deleteRow(registros[i]._fila);
      return getResumenDiario(token, fecha);
    }
  }
  throw new Error('No se encontró el registro.');
}

/**
 * Consumido, quemado y restante de un día, contra la meta vigente.
 * @param {string} token El token de sesión.
 * @param {string=} fecha La fecha en formato aaaa-mm-dd; por omisión hoy.
 * @return {Object} El resumen del día.
 */
function getResumenDiario(token, fecha) {
  var usuario = requerirSesion_(token);
  var dia = fecha || aFechaISO_(new Date());

  var registros = leerTabla_('Registro_Diario').filter(function (r) {
    return String(r.ID_Paciente) === String(usuario.ID) && aFechaISO_(r.Fecha) === dia;
  });

  var consumido = { calorias: 0, proteinas: 0, grasas: 0, carbohidratos: 0, fibra: 0 };
  var comidas = [];

  registros.forEach(function (r) {
    consumido.calorias += aNumero_(r.CaloriasTotales);
    consumido.proteinas += aNumero_(r.ProteinasTotales);
    consumido.grasas += aNumero_(r.GrasasTotales);
    consumido.carbohidratos += aNumero_(r.CarbohidratosTotales);
    consumido.fibra += aNumero_(r.FibraTotal);

    var detalle = [];
    try {
      detalle = JSON.parse(r.AlimentosJSON || '[]');
    } catch (err) {
      detalle = [];
    }

    comidas.push({
      id: r.ID,
      tiempoComida: r.TiempoComida,
      calorias: aNumero_(r.CaloriasTotales),
      proteinas: aNumero_(r.ProteinasTotales),
      grasas: aNumero_(r.GrasasTotales),
      carbohidratos: aNumero_(r.CarbohidratosTotales),
      fibra: aNumero_(r.FibraTotal),
      alimentos: detalle
    });
  });

  Object.keys(consumido).forEach(function (llave) {
    consumido[llave] = redondear_(consumido[llave], 1);
  });

  var actividades = leerTabla_('Actividad_Fisica').filter(function (a) {
    return String(a.ID_Paciente) === String(usuario.ID) && aFechaISO_(a.Fecha) === dia;
  });
  var quemado = actividades.reduce(function (suma, a) {
    return suma + aNumero_(a.CaloriasQuemadasEst);
  }, 0);

  var plan = obtenerPlanCaloricoMensual(usuario.ID);

  return {
    fecha: dia,
    consumido: consumido,
    quemado: redondear_(quemado, 0),
    restante: redondear_(plan.caloriasObjetivo - consumido.calorias, 0),
    meta: plan.caloriasObjetivo,
    macrosObjetivo: plan.macros,
    reglas: evaluarReglasDelDia_(comidas, consumido),
    comidas: comidas,
    actividades: actividades.map(function (a) {
      return {
        id: a.ID,
        tipo: a.TipoActividad,
        minutos: aNumero_(a.DuracionMinutos),
        calorias: aNumero_(a.CaloriasQuemadasEst)
      };
    })
  };
}

/**
 * Consumo de los últimos días, para la gráfica de tendencia del paciente.
 * @param {string} token El token de sesión.
 * @param {number=} dias Cuántos días hacia atrás; por omisión 14.
 * @return {Array<Object>} Un punto por día.
 */
function getHistorialDiario(token, dias) {
  var usuario = requerirSesion_(token);
  var cuantos = aNumero_(dias) || 14;
  var desde = new Date();
  desde.setDate(desde.getDate() - cuantos);

  var porDia = {};
  leerTabla_('Registro_Diario').forEach(function (r) {
    if (String(r.ID_Paciente) !== String(usuario.ID)) {
      return;
    }
    var fecha = aFechaISO_(r.Fecha);
    if (new Date(fecha) < desde) {
      return;
    }
    if (!porDia[fecha]) {
      porDia[fecha] = { fecha: fecha, calorias: 0, proteinas: 0 };
    }
    porDia[fecha].calorias += aNumero_(r.CaloriasTotales);
    porDia[fecha].proteinas += aNumero_(r.ProteinasTotales);
  });

  return Object.keys(porDia).sort().map(function (fecha) {
    return {
      fecha: fecha,
      calorias: redondear_(porDia[fecha].calorias, 0),
      proteinas: redondear_(porDia[fecha].proteinas, 0)
    };
  });
}

/* ===================================================================
   PLATILLOS SUGERIDOS
   =================================================================== */

/**
 * Los platillos mexicanos prediseñados, con sus macros ya calculados.
 *
 * Cada platillo trae `destacado`, que marca los que la rotación de tres días
 * pone al frente hoy. Los demás siguen viajando al navegador: la variedad es
 * de presentación, no de disponibilidad, y quien quiera ver los diez los ve.
 *
 * @param {string} token El token de sesión.
 * @return {Object} Los platillos agrupados por tiempo de comida.
 */
function getPlatillosSugeridos(token) {
  var catalogo = getCatalogoAlimentos(token);
  var porNombre = {};
  catalogo.forEach(function (a) {
    porNombre[normalizarTexto_(a.alimento)] = a;
  });

  var periodo = periodoRotacion_();
  var salida = {};

  Object.keys(PLATILLOS_MEXICANOS).forEach(function (tiempo) {
    var lista = PLATILLOS_MEXICANOS[tiempo];
    var destacados = indicesDestacados_(lista.length, DESTACADOS_POR_TIEMPO, periodo);

    salida[tiempo] = lista.map(function (platillo, indice) {
      var items = platillo.ingredientes.map(function (ing) {
        var base = porNombre[normalizarTexto_(ing[0])];
        return base ? { idAlimento: base.id, gramos: ing[1] } : null;
      }).filter(function (x) { return x; });

      var calculo = calcularTotales_(items, catalogo);
      return {
        nombre: platillo.nombre,
        descripcion: platillo.descripcion,
        alternativa: platillo.alternativa || '',
        alimentos: calculo.detalle,
        totales: calculo.totales,
        destacado: destacados.indexOf(indice) >= 0
      };
    });
  });

  salida._rotacion = {
    periodo: periodo,
    cambia: proximaRotacion_(),
    cadaDias: DIAS_ROTACION
  };
  return salida;
}

/**
 * El Plato del Buen Comer adaptado a la Dieta de la Milpa, con su tabla
 * nutricional armada desde el catálogo.
 * @param {string} token El token de sesión.
 * @return {Object} Los grupos del plato y los alimentos a limitar.
 */
function getPlatoMilpa(token) {
  return armarPlatoMilpa_(getCatalogoAlimentos(token));
}

/* ===================================================================
   REGISTRO POR TEXTO CON IA
   =================================================================== */

/**
 * Interpreta en texto libre lo que el paciente comió, sin guardarlo todavía.
 *
 * Devolver sin guardar es deliberado: la IA estima porciones, y estimar no es
 * medir. El paciente confirma o corrige los gramos en pantalla y de ahí pasa al
 * registro normal, que es el que hace las cuentas definitivas.
 *
 * @param {string} token El token de sesión.
 * @param {string} descripcion Lo que escribió el paciente.
 * @return {Object} Alimentos reconocidos, totales y comentario.
 */
function analizarComidaTexto(token, descripcion) {
  requerirSesion_(token);
  var texto = String(descripcion || '').trim();

  if (!texto) {
    throw new Error('Escribe qué comiste.');
  }
  if (texto.length > 1500) {
    throw new Error('La descripción es muy larga. Resúmela en menos de 1500 caracteres.');
  }

  var catalogo = getCatalogoAlimentos(token);
  var analisis = analizarDescripcionComida_(texto, catalogo);

  var totales = { calorias: 0, proteinas: 0, grasas: 0, carbohidratos: 0, fibra: 0 };
  analisis.alimentos.forEach(function (a) {
    totales.calorias += aNumero_(a.calorias);
    totales.proteinas += aNumero_(a.proteinas);
    totales.grasas += aNumero_(a.grasas);
    totales.carbohidratos += aNumero_(a.carbohidratos);
    totales.fibra += aNumero_(a.fibra);
  });
  Object.keys(totales).forEach(function (llave) {
    totales[llave] = redondear_(totales[llave], 1);
  });

  return {
    alimentos: analisis.alimentos,
    totales: totales,
    comentario: analisis.comentario,
    confianza: analisis.confianza,
    origen: analisis.origen,
    aviso: analisis.avisoIA || ''
  };
}

/* ===================================================================
   CHAT ASISTENTE
   =================================================================== */

/**
 * Contesta una duda en el chat asistente.
 *
 * Esta conversación es aparte de la del nutriólogo: se guarda con EnviadoPor
 * "Asistente" y no dispara alertas. Las dudas para el humano siguen su propio
 * camino, en guardarMensajeChat.
 *
 * @param {string} token El token de sesión.
 * @param {string} pregunta La duda.
 * @return {Object} La respuesta y la conversación actualizada.
 */
function preguntarAsistente(token, pregunta) {
  var usuario = requerirSesion_(token);
  var texto = String(pregunta || '').trim();

  if (!texto) {
    throw new Error('Escribe tu pregunta.');
  }
  if (texto.length > 1000) {
    throw new Error('La pregunta es muy larga. Resúmela en menos de 1000 caracteres.');
  }

  var historial = getChatAsistente(token);
  var plan = obtenerPlanCaloricoMensual(usuario.ID);
  var resumen = getResumenDiario(token, aFechaISO_(new Date()));

  agregarFila_('Chat_Soporte', {
    ID: nuevoId_('AST'),
    ID_Paciente: usuario.ID,
    Mensaje: texto,
    EnviadoPor: 'Paciente-Asistente',
    Fecha: new Date(),
    Estado: 'Leido'
  });

  var respuesta = responderAsistente_(
    { nombre: usuario.Nombre },
    { plan: plan, resumen: resumen },
    historial,
    texto
  );

  agregarFila_('Chat_Soporte', {
    ID: nuevoId_('AST'),
    ID_Paciente: usuario.ID,
    Mensaje: respuesta.texto,
    EnviadoPor: 'Asistente',
    Fecha: new Date(),
    Estado: 'Leido'
  });

  return {
    ok: true,
    respuesta: respuesta.texto,
    origen: respuesta.origen,
    aviso: respuesta.aviso || '',
    chat: getChatAsistente(token)
  };
}

/**
 * La conversación con el asistente, separada de la del nutriólogo.
 * @param {string} token El token de sesión.
 * @return {Array<Object>} Los mensajes ordenados por fecha.
 */
function getChatAsistente(token) {
  var usuario = requerirSesion_(token);
  return leerTabla_('Chat_Soporte')
    .filter(function (c) {
      return String(c.ID_Paciente) === String(usuario.ID) &&
        (String(c.EnviadoPor) === 'Asistente' || String(c.EnviadoPor) === 'Paciente-Asistente');
    })
    .sort(function (a, b) { return new Date(a.Fecha) - new Date(b.Fecha); })
    .map(function (c) {
      return {
        id: c.ID,
        mensaje: c.Mensaje,
        enviadoPor: c.EnviadoPor === 'Asistente' ? 'Asistente' : 'Paciente',
        fecha: c.Fecha instanceof Date ? c.Fecha.toISOString() : String(c.Fecha)
      };
    });
}

/* ===================================================================
   PERFIL DEL PACIENTE
   =================================================================== */

/**
 * Los datos personales, físicos y clínicos del paciente, con el IMC calculado.
 * @param {string} token El token de sesión.
 * @return {Object} El perfil completo.
 */
function getPerfilPaciente(token) {
  var usuario = requerirSesion_(token);
  var config = obtenerConfigPaciente_(usuario.ID);
  var ultima = getUltimaMetrica(token);

  var peso = ultima ? aNumero_(ultima.Peso_kg) : 0;
  var estatura = aNumero_(config.Estatura_cm);

  return {
    nombre: usuario.Nombre,
    email: usuario.Email,
    edad: calcularEdad_(config.FechaNacimiento),
    fechaNacimiento: config.FechaNacimiento ? aFechaISO_(config.FechaNacimiento) : '',
    sexo: config.Sexo || '',
    estatura_cm: estatura || null,
    peso_kg: peso || null,
    imc: calcularIMC(peso, estatura),
    porcentajeGrasa: ultima ? aNumero_(ultima.PorcentajeGrasa) || null : null,
    nivelActividad: config.NivelActividad || 'Moderada',
    tipoEjercicio: config.TipoEjercicio || '',
    patologias: config.Patologias || '',
    laboratorio: ultima ? {
      trigliceridos: aNumero_(ultima.Trigliceridos) || null,
      colesterol: aNumero_(ultima.Colesterol) || null,
      glucosa: aNumero_(ultima.Glucosa) || null,
      fecha: ultima.Fecha || ''
    } : null
  };
}

/**
 * Guarda los datos del perfil que el paciente puede editar.
 *
 * El nivel de actividad mueve el factor con el que se calcula el gasto
 * energético, así que cambiarlo recalcula la meta calórica: por eso devuelve el
 * plan ya actualizado.
 *
 * @param {string} token El token de sesión.
 * @param {Object} datos Estatura, fecha de nacimiento, sexo, nivel y patologías.
 * @return {Object} El perfil y el plan recalculados.
 */
function guardarPerfilPaciente(token, datos) {
  var usuario = requerirSesion_(token);
  var config = obtenerConfigPaciente_(usuario.ID);
  var cambios = { FechaActualizacion: new Date(), ActualizadoPor: usuario.Nombre };

  if (datos.estatura_cm !== undefined && datos.estatura_cm !== '') {
    var estatura = aNumero_(datos.estatura_cm);
    if (estatura < 80 || estatura > 250) {
      throw new Error('Revisa la estatura: debe estar entre 80 y 250 cm.');
    }
    cambios.Estatura_cm = estatura;
  }
  if (datos.fechaNacimiento) {
    if (calcularEdad_(datos.fechaNacimiento) === null) {
      throw new Error('Revisa la fecha de nacimiento.');
    }
    cambios.FechaNacimiento = datos.fechaNacimiento;
  }
  if (datos.sexo !== undefined) { cambios.Sexo = datos.sexo; }
  if (datos.tipoEjercicio !== undefined) { cambios.TipoEjercicio = datos.tipoEjercicio; }
  if (datos.patologias !== undefined) { cambios.Patologias = String(datos.patologias).slice(0, 500); }

  if (datos.nivelActividad && NIVELES_ACTIVIDAD[datos.nivelActividad]) {
    cambios.NivelActividad = datos.nivelActividad;
    cambios.FactorActividad = factorPorNivel_(datos.nivelActividad);
  }

  actualizarFila_('Config_Paciente', config._fila, cambios);

  return {
    perfil: getPerfilPaciente(token),
    plan: obtenerPlanCaloricoMensual(usuario.ID)
  };
}

/**
 * Serie histórica de una métrica, para la gráfica de tendencias del paciente.
 * @param {string} token El token de sesión.
 * @param {string} metrica La métrica a graficar.
 * @return {Object} Puntos, unidad y etiqueta.
 */
function getTendenciaMetrica(token, metrica) {
  var historial = getHistorialMetricas(token);

  var definiciones = {
    peso: { columna: 'Peso_kg', etiqueta: 'Peso', unidad: 'kg' },
    masaMuscular: { columna: 'MasaMuscular_kg', etiqueta: 'Masa muscular', unidad: 'kg' },
    porcentajeGrasa: { columna: 'PorcentajeGrasa', etiqueta: 'Grasa corporal', unidad: '%' },
    agua: { columna: 'Agua_Porcentaje', etiqueta: 'Agua', unidad: '%' },
    grasaVisceral: { columna: 'GrasaVisceral', etiqueta: 'Grasa visceral', unidad: '' },
    trigliceridos: { columna: 'Trigliceridos', etiqueta: 'Triglicéridos', unidad: 'mg/dL' },
    colesterol: { columna: 'Colesterol', etiqueta: 'Colesterol', unidad: 'mg/dL' },
    glucosa: { columna: 'Glucosa', etiqueta: 'Glucosa', unidad: 'mg/dL' }
  };

  var definicion = definiciones[metrica] || definiciones.peso;

  var puntos = historial.map(function (m) {
    return { fecha: aFechaISO_(m.Fecha), valor: aNumero_(m[definicion.columna]) || null };
  }).filter(function (p) { return p.valor !== null; });

  var cambio = puntos.length > 1
    ? redondear_(puntos[puntos.length - 1].valor - puntos[0].valor, 1)
    : 0;

  return {
    metrica: metrica,
    etiqueta: definicion.etiqueta,
    unidad: definicion.unidad,
    puntos: puntos,
    cambio: cambio,
    disponibles: Object.keys(definiciones).map(function (llave) {
      return { clave: llave, etiqueta: definiciones[llave].etiqueta, unidad: definiciones[llave].unidad };
    })
  };
}

/* ===================================================================
   MÉTRICAS Y BÁSCULA
   =================================================================== */

/**
 * Guarda una medición de báscula o de laboratorio.
 * @param {string} token El token de sesión.
 * @param {Object} datos Los valores capturados o extraídos por OCR.
 * @return {Object} El plan recalculado con la medición nueva.
 */
function guardarMetricas(token, datos) {
  var usuario = requerirSesion_(token);
  if (!datos) {
    throw new Error('No llegó ningún dato.');
  }

  var peso = aNumero_(datos.peso);
  var tieneLaboratorio = aNumero_(datos.trigliceridos) || aNumero_(datos.colesterol) || aNumero_(datos.glucosa);
  if (!peso && !tieneLaboratorio) {
    throw new Error('Captura al menos el peso o un valor de laboratorio.');
  }

  agregarFila_('Metricas_Paciente', {
    ID_Paciente: usuario.ID,
    Fecha: datos.fecha || aFechaISO_(new Date()),
    Peso_kg: peso || '',
    MasaMuscular_kg: aNumero_(datos.masaMuscular) || '',
    PorcentajeGrasa: aNumero_(datos.porcentajeGrasa) || '',
    Agua_Porcentaje: aNumero_(datos.agua) || '',
    Trigliceridos: aNumero_(datos.trigliceridos) || '',
    Colesterol: aNumero_(datos.colesterol) || '',
    Glucosa: aNumero_(datos.glucosa) || '',
    FotoPesa_DriveUrl: datos.fotoPesaUrl || '',
    FotoEstudios_DriveUrl: datos.fotoEstudiosUrl || '',
    GrasaVisceral: aNumero_(datos.grasaVisceral) || '',
    Notas: datos.notas || ''
  });

  var plan = obtenerPlanCaloricoMensual(usuario.ID);
  persistirPlan_(usuario.ID, plan);
  return plan;
}

/**
 * La medición más reciente del paciente.
 * @param {string} token El token de sesión.
 * @return {Object|null} La medición, o null si no hay ninguna.
 */
function getUltimaMetrica(token) {
  var usuario = requerirSesion_(token);
  var metricas = leerTabla_('Metricas_Paciente')
    .filter(function (m) { return String(m.ID_Paciente) === String(usuario.ID); })
    .sort(function (a, b) { return new Date(a.Fecha) - new Date(b.Fecha); });

  if (!metricas.length) {
    return null;
  }
  return limpiarFila_(metricas[metricas.length - 1]);
}

/**
 * Todo el historial de mediciones del paciente que tiene la sesión abierta.
 * @param {string} token El token de sesión.
 * @return {Array<Object>} Las mediciones ordenadas por fecha.
 */
function getHistorialMetricas(token) {
  var usuario = requerirSesion_(token);
  return leerTabla_('Metricas_Paciente')
    .filter(function (m) { return String(m.ID_Paciente) === String(usuario.ID); })
    .sort(function (a, b) { return new Date(a.Fecha) - new Date(b.Fecha); })
    .map(limpiarFila_);
}

/* ===================================================================
   ARCHIVOS EN DRIVE
   =================================================================== */

/**
 * Guarda en Drive la foto de la báscula o del estudio de laboratorio.
 * @param {string} token El token de sesión.
 * @param {Object} fileData nombre, mimeType, base64 y tipo ("pesa" o "estudios").
 * @return {Object} La URL del archivo y su ID.
 */
function uploadFileToDrive(token, fileData) {
  var usuario = requerirSesion_(token);

  if (!fileData || !fileData.base64) {
    throw new Error('No llegó ninguna imagen.');
  }

  var raiz = obtenerCarpetaDrive_();
  var nombreCarpeta = usuario.Nombre + ' (' + usuario.ID + ')';
  var carpetas = raiz.getFoldersByName(nombreCarpeta);
  var carpeta = carpetas.hasNext() ? carpetas.next() : raiz.createFolder(nombreCarpeta);

  var limpio = String(fileData.base64).replace(/^data:[^;]+;base64,/, '');
  var bytes = Utilities.base64Decode(limpio);
  var tipo = fileData.tipo === 'estudios' ? 'estudios' : 'pesa';
  var nombre = tipo + '-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss') +
    '-' + (fileData.nombre || 'imagen.jpg');

  var blob = Utilities.newBlob(bytes, fileData.mimeType || 'image/jpeg', nombre);
  var archivo = carpeta.createFile(blob);
  archivo.setDescription('NutriApp · ' + tipo + ' · ' + usuario.Nombre);

  return { url: archivo.getUrl(), id: archivo.getId(), nombre: nombre, tipo: tipo };
}

/* ===================================================================
   ACTIVIDAD FÍSICA
   =================================================================== */

/**
 * Estimación de gasto por minuto según el tipo de actividad, en kcal por kg.
 * Son valores MET convertidos: kcal = MET × peso_kg × horas.
 */
var MET_ACTIVIDADES = {
  'Caminata ligera': 3.0,
  'Caminata rápida': 4.3,
  'Trote': 7.0,
  'Correr': 9.8,
  'Bicicleta': 6.8,
  'Natación': 7.0,
  'Entrenamiento de fuerza': 5.0,
  'Yoga o estiramiento': 2.5,
  'Baile': 5.0,
  'Deporte en equipo': 7.0,
  'Labores del hogar': 3.3,
  'Otro': 4.0
};

/**
 * La lista de actividades disponibles, para llenar el selector.
 * @param {string} token El token de sesión.
 * @return {Array<string>} Los nombres de las actividades.
 */
function getTiposActividad(token) {
  requerirSesion_(token);
  return Object.keys(MET_ACTIVIDADES);
}

/**
 * Registra una sesión de ejercicio y estima las calorías quemadas.
 * @param {string} token El token de sesión.
 * @param {Object} datos tipo, minutos y opcionalmente fecha.
 * @return {Object} El resumen del día ya actualizado.
 */
function guardarActividad(token, datos) {
  var usuario = requerirSesion_(token);

  if (!datos || !datos.tipo || !aNumero_(datos.minutos)) {
    throw new Error('Indica el tipo de actividad y cuántos minutos duró.');
  }

  var metricas = leerTabla_('Metricas_Paciente')
    .filter(function (m) { return String(m.ID_Paciente) === String(usuario.ID) && aNumero_(m.Peso_kg) > 0; })
    .sort(function (a, b) { return new Date(a.Fecha) - new Date(b.Fecha); });

  var peso = metricas.length ? aNumero_(metricas[metricas.length - 1].Peso_kg) : 70;
  var met = MET_ACTIVIDADES[datos.tipo] || MET_ACTIVIDADES.Otro;
  var minutos = aNumero_(datos.minutos);
  var quemadas = redondear_(met * peso * (minutos / 60), 0);
  var fecha = datos.fecha || aFechaISO_(new Date());

  agregarFila_('Actividad_Fisica', {
    ID: nuevoId_('ACT'),
    ID_Paciente: usuario.ID,
    Fecha: fecha,
    TipoActividad: datos.tipo,
    DuracionMinutos: minutos,
    CaloriasQuemadasEst: quemadas
  });

  return getResumenDiario(token, fecha);
}

/* ===================================================================
   CHAT DE SOPORTE
   =================================================================== */

/**
 * Guarda un mensaje del chat, avisa al nutriólogo por WhatsApp y manda un
 * correo de respaldo.
 * @param {string} token El token de sesión.
 * @param {string} mensaje El texto del paciente.
 * @return {Object} La conversación actualizada y si la alerta salió.
 */
function guardarMensajeChat(token, mensaje) {
  var usuario = requerirSesion_(token);
  var texto = String(mensaje || '').trim();

  if (!texto) {
    throw new Error('Escribe tu duda antes de enviarla.');
  }
  if (texto.length > 2000) {
    throw new Error('El mensaje es muy largo. Resúmelo en menos de 2000 caracteres.');
  }

  agregarFila_('Chat_Soporte', {
    ID: nuevoId_('CHT'),
    ID_Paciente: usuario.ID,
    Mensaje: texto,
    EnviadoPor: usuario.Rol === 'Nutriologo' ? 'Nutriologo' : 'Paciente',
    Fecha: new Date(),
    Estado: 'Pendiente'
  });

  var alerta = { enviado: false };
  if (usuario.Rol !== 'Nutriologo') {
    alerta = notificarConsultaWhatsApp(usuario.Nombre, texto);
    notificarConsultaCorreo_(usuario.Nombre, texto);
  }

  return { ok: true, alertaWhatsApp: alerta.enviado, chat: getChat(token) };
}

/**
 * La conversación del paciente que tiene la sesión abierta.
 * @param {string} token El token de sesión.
 * @return {Array<Object>} Los mensajes ordenados por fecha.
 */
function getChat(token) {
  var usuario = requerirSesion_(token);
  return leerTabla_('Chat_Soporte')
    .filter(function (c) {
      return String(c.ID_Paciente) === String(usuario.ID) && !esMensajeDeAsistente_(c);
    })
    .sort(function (a, b) { return new Date(a.Fecha) - new Date(b.Fecha); })
    .map(function (c) {
      return {
        id: c.ID,
        mensaje: c.Mensaje,
        enviadoPor: c.EnviadoPor,
        fecha: c.Fecha instanceof Date ? c.Fecha.toISOString() : String(c.Fecha),
        estado: c.Estado
      };
    });
}

/* ===================================================================
   PANEL DEL NUTRIÓLOGO
   =================================================================== */

/**
 * Lista de pacientes con su último peso y su meta vigente.
 * @param {string} token El token de sesión del nutriólogo.
 * @return {Array<Object>} Los pacientes.
 */
function listarPacientes(token) {
  requerirSesion_(token, 'Nutriologo');

  var metricas = leerTabla_('Metricas_Paciente');
  var configs = leerTabla_('Config_Paciente');
  var pendientes = leerTabla_('Chat_Soporte').filter(function (c) {
    return String(c.Estado) === 'Pendiente' && String(c.EnviadoPor) === 'Paciente';
  });

  return leerTabla_('Usuarios')
    .filter(function (u) { return String(u.Rol) === 'Paciente'; })
    .map(function (u) {
      var suyas = metricas
        .filter(function (m) { return String(m.ID_Paciente) === String(u.ID); })
        .sort(function (a, b) { return new Date(a.Fecha) - new Date(b.Fecha); });
      var ultima = suyas.length ? suyas[suyas.length - 1] : null;
      var config = configs.filter(function (c) { return String(c.ID_Paciente) === String(u.ID); })[0];

      return {
        id: u.ID,
        nombre: u.Nombre,
        email: u.Email,
        activo: String(u.Activo).toUpperCase() !== 'NO',
        fechaRegistro: aFechaISO_(u.FechaRegistro),
        ultimoPeso: ultima ? aNumero_(ultima.Peso_kg) : null,
        ultimaMedicion: ultima ? aFechaISO_(ultima.Fecha) : null,
        mediciones: suyas.length,
        caloriasObjetivo: config ? aNumero_(config.CaloriasObjetivo) : META_CALORICA_BASE,
        ajusteManual: config ? String(config.AjusteManual).toUpperCase() === 'SI' : false,
        mensajesPendientes: pendientes.filter(function (c) {
          return String(c.ID_Paciente) === String(u.ID);
        }).length
      };
    });
}

/**
 * Expediente completo de un paciente: métricas, plan, registros, actividad,
 * chat e imágenes subidas a Drive.
 * @param {string} token El token de sesión del nutriólogo.
 * @param {string} idPaciente El identificador del paciente.
 * @return {Object} El expediente.
 */
function getExpediente(token, idPaciente) {
  requerirSesion_(token, 'Nutriologo');

  var paciente = buscarUsuarioPorId_(idPaciente);
  if (!paciente || String(paciente.Rol) !== 'Paciente') {
    throw new Error('No se encontró ese paciente.');
  }

  var metricas = leerTabla_('Metricas_Paciente')
    .filter(function (m) { return String(m.ID_Paciente) === String(idPaciente); })
    .sort(function (a, b) { return new Date(a.Fecha) - new Date(b.Fecha); })
    .map(function (m) {
      return {
        fecha: aFechaISO_(m.Fecha),
        peso: aNumero_(m.Peso_kg),
        masaMuscular: aNumero_(m.MasaMuscular_kg),
        porcentajeGrasa: aNumero_(m.PorcentajeGrasa),
        agua: aNumero_(m.Agua_Porcentaje),
        grasaVisceral: aNumero_(m.GrasaVisceral),
        trigliceridos: aNumero_(m.Trigliceridos),
        colesterol: aNumero_(m.Colesterol),
        glucosa: aNumero_(m.Glucosa),
        fotoPesa: m.FotoPesa_DriveUrl || '',
        fotoEstudios: m.FotoEstudios_DriveUrl || '',
        notas: m.Notas || ''
      };
    });

  var registros = leerTabla_('Registro_Diario')
    .filter(function (r) { return String(r.ID_Paciente) === String(idPaciente); })
    .sort(function (a, b) { return new Date(b.Fecha) - new Date(a.Fecha); })
    .slice(0, 60)
    .map(function (r) {
      return {
        id: r.ID,
        fecha: aFechaISO_(r.Fecha),
        tiempoComida: r.TiempoComida,
        calorias: aNumero_(r.CaloriasTotales),
        proteinas: aNumero_(r.ProteinasTotales),
        grasas: aNumero_(r.GrasasTotales),
        carbohidratos: aNumero_(r.CarbohidratosTotales),
        fibra: aNumero_(r.FibraTotal)
      };
    });

  var actividad = leerTabla_('Actividad_Fisica')
    .filter(function (a) { return String(a.ID_Paciente) === String(idPaciente); })
    .sort(function (a, b) { return new Date(b.Fecha) - new Date(a.Fecha); })
    .slice(0, 40)
    .map(function (a) {
      return {
        fecha: aFechaISO_(a.Fecha),
        tipo: a.TipoActividad,
        minutos: aNumero_(a.DuracionMinutos),
        calorias: aNumero_(a.CaloriasQuemadasEst)
      };
    });

  var chat = leerTabla_('Chat_Soporte')
    .filter(function (c) {
      return String(c.ID_Paciente) === String(idPaciente) && !esMensajeDeAsistente_(c);
    })
    .sort(function (a, b) { return new Date(a.Fecha) - new Date(b.Fecha); })
    .map(function (c) {
      return {
        id: c.ID,
        mensaje: c.Mensaje,
        enviadoPor: c.EnviadoPor,
        fecha: c.Fecha instanceof Date ? c.Fecha.toISOString() : String(c.Fecha),
        estado: c.Estado
      };
    });

  var imagenes = [];
  metricas.forEach(function (m) {
    if (m.fotoPesa) {
      imagenes.push({ fecha: m.fecha, tipo: 'Báscula', url: m.fotoPesa });
    }
    if (m.fotoEstudios) {
      imagenes.push({ fecha: m.fecha, tipo: 'Laboratorio', url: m.fotoEstudios });
    }
  });

  return {
    paciente: {
      id: paciente.ID,
      nombre: paciente.Nombre,
      email: paciente.Email,
      activo: String(paciente.Activo).toUpperCase() !== 'NO'
    },
    config: limpiarFila_(obtenerConfigPaciente_(idPaciente)),
    plan: obtenerPlanCaloricoMensual(idPaciente),
    metricas: metricas,
    registros: registros,
    actividad: actividad,
    chat: chat,
    imagenes: imagenes.reverse()
  };
}

/**
 * Fija o libera la meta calórica de un paciente.
 *
 * Capturar un número de calorías es, por definición, fijarla a mano: el
 * recálculo automático parte del historial y no del valor guardado, así que un
 * número escrito sin marcar "manual" quedaría almacenado pero nunca se
 * aplicaría. Para soltarla, se manda manual en false y sin calorías.
 *
 * @param {string} token El token de sesión del nutriólogo.
 * @param {string} idPaciente El identificador del paciente.
 * @param {Object} ajustes calorias, manual y factorActividad.
 * @return {Object} El plan resultante.
 */
function actualizarMetaPaciente(token, idPaciente, ajustes) {
  var nutriologo = requerirSesion_(token, 'Nutriologo');
  var config = obtenerConfigPaciente_(idPaciente);
  var calorias = ajustes ? aNumero_(ajustes.calorias) : 0;
  var cambios = {
    FechaActualizacion: new Date(),
    ActualizadoPor: nutriologo.Nombre || nutriologo.Email
  };

  if (calorias > 0) {
    if (calorias < CALORIAS_PISO) {
      throw new Error('La meta no puede quedar por debajo de ' + CALORIAS_PISO + ' kcal.');
    }
    if (calorias > 5000) {
      throw new Error('Esa meta calórica está fuera de rango.');
    }
    cambios.CaloriasObjetivo = calorias;
    cambios.AjusteManual = 'SI';
  } else {
    cambios.AjusteManual = ajustes && ajustes.manual ? 'SI' : 'NO';
  }

  if (ajustes && aNumero_(ajustes.factorActividad) > 0) {
    cambios.FactorActividad = aNumero_(ajustes.factorActividad);
  }

  actualizarFila_('Config_Paciente', config._fila, cambios);
  return obtenerPlanCaloricoMensual(idPaciente);
}

/**
 * Responde en el chat de un paciente y marca sus mensajes como leídos.
 * @param {string} token El token de sesión del nutriólogo.
 * @param {string} idPaciente El identificador del paciente.
 * @param {string} mensaje La respuesta.
 * @return {Object} Confirmación.
 */
function responderChat(token, idPaciente, mensaje) {
  requerirSesion_(token, 'Nutriologo');
  var texto = String(mensaje || '').trim();
  if (!texto) {
    throw new Error('Escribe la respuesta antes de enviarla.');
  }

  agregarFila_('Chat_Soporte', {
    ID: nuevoId_('CHT'),
    ID_Paciente: idPaciente,
    Mensaje: texto,
    EnviadoPor: 'Nutriologo',
    Fecha: new Date(),
    Estado: 'Leido'
  });

  leerTabla_('Chat_Soporte').forEach(function (c) {
    if (String(c.ID_Paciente) === String(idPaciente) && String(c.Estado) === 'Pendiente') {
      actualizarFila_('Chat_Soporte', c._fila, { Estado: 'Leido' });
    }
  });

  var paciente = buscarUsuarioPorId_(idPaciente);
  if (paciente && paciente.Email) {
    try {
      GmailApp.sendEmail(paciente.Email, 'NutriApp · Respuesta de tu nutriólogo', texto, { name: 'NutriApp' });
    } catch (err) {
      Logger.log('No se pudo avisar al paciente: ' + err.message);
    }
  }

  return { ok: true };
}

/**
 * Activa o desactiva la cuenta de un paciente.
 * @param {string} token El token de sesión del nutriólogo.
 * @param {string} idPaciente El identificador del paciente.
 * @param {boolean} activo Si la cuenta queda activa.
 * @return {Object} Confirmación.
 */
function cambiarEstadoPaciente(token, idPaciente, activo) {
  requerirSesion_(token, 'Nutriologo');
  var paciente = buscarUsuarioPorId_(idPaciente);
  if (!paciente) {
    throw new Error('No se encontró ese paciente.');
  }
  actualizarFila_('Usuarios', paciente._fila, { Activo: activo ? 'SI' : 'NO' });
  return { ok: true };
}

/**
 * Dice si una fila de Chat_Soporte pertenece a la conversación con el bot.
 *
 * Las dos conversaciones comparten pestaña pero no son la misma cosa: la del
 * nutriólogo dispara alertas y espera respuesta de una persona; la del
 * asistente se contesta sola. Mezclarlas haría que el nutriólogo viera
 * preguntas que ya fueron contestadas y que el paciente creyera que un humano
 * le respondió.
 *
 * @param {Object} fila La fila de Chat_Soporte.
 * @return {boolean} true si es del asistente.
 */
function esMensajeDeAsistente_(fila) {
  var de = String(fila.EnviadoPor);
  return de === 'Asistente' || de === 'Paciente-Asistente';
}

/**
 * Quita las llaves internas antes de mandar una fila al navegador.
 * @param {Object} fila La fila leída de la hoja.
 * @return {Object} La fila sin metadatos.
 */
function limpiarFila_(fila) {
  var salida = {};
  Object.keys(fila).forEach(function (llave) {
    if (llave.charAt(0) === '_') {
      return;
    }
    var valor = fila[llave];
    salida[llave] = valor instanceof Date ? aFechaISO_(valor) : valor;
  });
  return salida;
}
