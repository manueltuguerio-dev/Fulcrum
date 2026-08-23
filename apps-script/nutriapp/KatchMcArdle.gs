/**
 * NutriApp · Fulcrum
 * Cálculo antropométrico y reajuste mensual de calorías.
 *
 * El objetivo es sostener un déficit lento: perder entre 0.3 y 0.7 kg por
 * semana conservando la masa muscular. Por eso las calorías se recalculan mes
 * con mes a partir de lo que realmente pasó en la báscula, en lugar de fijar
 * un número y no volver a moverlo.
 */

/** Velocidad de pérdida que se busca, en kilogramos por semana. */
var PERDIDA_SEMANAL_MINIMA = 0.3;
var PERDIDA_SEMANAL_MAXIMA = 0.7;

/** Tope del déficit como fracción del gasto energético total. */
var DEFICIT_MAXIMO = 0.20;

/** Piso absoluto de calorías, por seguridad. */
var CALORIAS_PISO = 1200;

/** Cuánta masa muscular puede bajar en un mes antes de subir las calorías. */
var PERDIDA_MUSCULAR_TOLERADA_KG = 0.3;

/** Factores de actividad para pasar de TMB a gasto energético total. */
var FACTORES_ACTIVIDAD = {
  sedentario: 1.2,
  ligero: 1.375,
  moderado: 1.55,
  intenso: 1.725,
  muyIntenso: 1.9
};

/* ===================================================================
   CALCULADORA DE TASA METABÓLICA BASAL
   =================================================================== */

/**
 * Fórmula de Katch-McArdle: TMB = 370 + (21.6 × masa libre de grasa en kg).
 * A diferencia de Harris-Benedict o Mifflin, parte de la composición corporal,
 * que es lo que mide la báscula inteligente del paciente.
 * @param {number} masaLibreGrasa_kg La masa libre de grasa en kilogramos.
 * @return {number} La tasa metabólica basal en kilocalorías por día.
 */
function calcularTMB(masaLibreGrasa_kg) {
  var ffm = aNumero_(masaLibreGrasa_kg);
  if (ffm <= 0) {
    throw new Error('La masa libre de grasa tiene que ser mayor que cero.');
  }
  return redondear_(370 + (21.6 * ffm), 0);
}

/**
 * Masa libre de grasa a partir del peso total y el porcentaje de grasa.
 * @param {number} peso_kg El peso corporal total.
 * @param {number} porcentajeGrasa El porcentaje de grasa corporal.
 * @return {number} La masa libre de grasa en kilogramos.
 */
function calcularMasaLibreGrasa(peso_kg, porcentajeGrasa) {
  var peso = aNumero_(peso_kg);
  var grasa = aNumero_(porcentajeGrasa);

  if (peso <= 0) {
    throw new Error('El peso tiene que ser mayor que cero.');
  }
  if (grasa < 0 || grasa >= 100) {
    throw new Error('El porcentaje de grasa tiene que estar entre 0 y 100.');
  }
  return redondear_(peso * (1 - (grasa / 100)), 2);
}

/**
 * Atajo que acepta peso y porcentaje de grasa y devuelve la TMB.
 * @param {number} peso_kg El peso corporal total.
 * @param {number} porcentajeGrasa El porcentaje de grasa corporal.
 * @return {Object} La masa libre de grasa y la TMB.
 */
function calcularTMBDesdePeso(peso_kg, porcentajeGrasa) {
  var ffm = calcularMasaLibreGrasa(peso_kg, porcentajeGrasa);
  return { masaLibreGrasa_kg: ffm, tmb: calcularTMB(ffm) };
}

/**
 * Gasto energético total: TMB por el factor de actividad.
 * @param {number} tmb La tasa metabólica basal.
 * @param {number|string} factor Un número o una llave de FACTORES_ACTIVIDAD.
 * @return {number} El gasto energético total en kilocalorías por día.
 */
function calcularGET(tmb, factor) {
  var multiplicador = typeof factor === 'string'
    ? (FACTORES_ACTIVIDAD[factor] || FACTORES_ACTIVIDAD.ligero)
    : (aNumero_(factor) || FACTORES_ACTIVIDAD.ligero);
  return redondear_(aNumero_(tmb) * multiplicador, 0);
}

/* ===================================================================
   REPARTO DE MACRONUTRIMENTOS
   =================================================================== */

/**
 * Reparte las calorías del día con el método del plato de la guía:
 * 60 % carbohidratos, 20 % proteínas, 20 % grasas insaturadas. La meta de
 * proteína se calcula aparte, a 1.0 g por kilogramo de peso corporal total,
 * y se reporta cuál de las dos manda.
 * @param {number} calorias La meta calórica del día.
 * @param {number} peso_kg El peso corporal total.
 * @return {Object} Gramos por macronutrimento y las advertencias del caso.
 */
function repartirMacros(calorias, peso_kg) {
  var kcal = aNumero_(calorias);
  var peso = aNumero_(peso_kg);

  var carbohidratos_g = redondear_((kcal * METODO_DEL_PLATO.carbohidratos / 100) / 4, 0);
  var grasas_g = redondear_((kcal * METODO_DEL_PLATO.grasas / 100) / 9, 0);
  var proteinaPlato_g = redondear_((kcal * METODO_DEL_PLATO.proteinas / 100) / 4, 0);
  var proteinaPorPeso_g = redondear_(peso * PROTEINA_G_POR_KG, 0);

  var proteinaObjetivo_g = peso > 0 ? proteinaPorPeso_g : proteinaPlato_g;
  var nota = '';

  if (peso > 0 && Math.abs(proteinaPlato_g - proteinaPorPeso_g) > 15) {
    nota = proteinaPorPeso_g > proteinaPlato_g
      ? 'La meta de 1.0 g por kilo queda por encima del 20 % del plato. Manda el gramaje por peso.'
      : 'La meta de 1.0 g por kilo queda por debajo del 20 % del plato. Manda el gramaje por peso: más proteína no aporta beneficio adicional.';
  }

  return {
    calorias: kcal,
    carbohidratos_g: carbohidratos_g,
    proteinas_g: proteinaObjetivo_g,
    grasas_g: grasas_g,
    fibra_g: META_FIBRA_G,
    proteinaSegunPlato_g: proteinaPlato_g,
    proteinaSegunPeso_g: proteinaPorPeso_g,
    metodoDelPlato: METODO_DEL_PLATO,
    nota: nota
  };
}

/* ===================================================================
   PLAN CALÓRICO MENSUAL
   =================================================================== */

/**
 * Calcula el plan calórico vigente de un paciente.
 *
 * La meta se deriva del historial completo, no del último valor guardado: se
 * parte de las 1,700 kcal de la guía y se aplica un ajuste por cada periodo
 * entre mediciones consecutivas.
 *
 *   - Baja demasiado rápido o perdió músculo → sube las calorías.
 *   - Baja demasiado despacio → recorta 100 kcal.
 *   - Va dentro del rango → sostiene la meta que traía.
 *
 * Que sea función pura del historial importa: esta función se llama en cada
 * carga de pantalla, y si el ajuste partiera del número ya guardado, cada
 * lectura volvería a recortar calorías hasta dejar al paciente en el piso.
 *
 * El resultado nunca queda por debajo de la TMB ni del piso de seguridad, ni
 * el déficit pasa del 20 % del gasto energético total.
 *
 * @param {string} idPaciente El identificador del paciente.
 * @return {Object} Meta calórica, macros, diagnóstico y datos de respaldo.
 */
function obtenerPlanCaloricoMensual(idPaciente) {
  var metricas = leerTabla_('Metricas_Paciente')
    .filter(function (m) { return String(m.ID_Paciente) === String(idPaciente); })
    .sort(function (a, b) { return new Date(a.Fecha) - new Date(b.Fecha); });

  var config = obtenerConfigPaciente_(idPaciente);
  var factor = aNumero_(config.FactorActividad) || FACTORES_ACTIVIDAD.ligero;
  var esManual = String(config.AjusteManual).toUpperCase() === 'SI' && aNumero_(config.CaloriasObjetivo) > 0;

  /* Solo las mediciones con peso sirven para la antropometría. Una carga de
     laboratorio suelta, sin báscula, no debe romper el cálculo. */
  var conPeso = metricas.filter(function (m) { return aNumero_(m.Peso_kg) > 0; });

  if (!conPeso.length) {
    var metaSinDatos = esManual ? aNumero_(config.CaloriasObjetivo) : META_CALORICA_BASE;
    return {
      caloriasObjetivo: metaSinDatos,
      macros: repartirMacros(metaSinDatos, 0),
      diagnostico: metricas.length
        ? 'Todavía no hay una medición con peso. Se usa la meta base de la guía, ' + metaSinDatos + ' kcal.'
        : 'Sin mediciones todavía. Se usa la meta base de la guía, ' + metaSinDatos + ' kcal.',
      estado: esManual ? 'manual' : 'sin-datos',
      ajusteManual: esManual,
      tieneHistorial: false
    };
  }

  var ultima = conPeso[conPeso.length - 1];
  var peso = aNumero_(ultima.Peso_kg);
  var porcentajeGrasa = aNumero_(ultima.PorcentajeGrasa);
  var masaMuscular = aNumero_(ultima.MasaMuscular_kg);

  var ffm = porcentajeGrasa > 0 && porcentajeGrasa < 100
    ? calcularMasaLibreGrasa(peso, porcentajeGrasa)
    : (masaMuscular > 0 ? masaMuscular : redondear_(peso * 0.75, 2));

  var tmb = calcularTMB(ffm);
  var get = calcularGET(tmb, factor);

  /* Si el nutriólogo fijó la meta a mano, esa manda y no se recalcula. */
  if (esManual) {
    var manualKcal = aNumero_(config.CaloriasObjetivo);
    return {
      caloriasObjetivo: manualKcal,
      macros: repartirMacros(manualKcal, peso),
      tmb: tmb,
      get: get,
      masaLibreGrasa_kg: ffm,
      peso_kg: peso,
      porcentajeGrasa: porcentajeGrasa,
      masaMuscular_kg: masaMuscular,
      factorActividad: factor,
      diagnostico: 'Meta fijada a mano por el nutriólogo.',
      estado: 'manual',
      ajusteManual: true,
      tieneHistorial: true,
      ultimaMedicion: aFechaISO_(ultima.Fecha)
    };
  }

  var recorrido = recorrerHistorial_(conPeso, tmb, get);
  var evaluacion = recorrido.ultimaEvaluacion;

  return {
    caloriasObjetivo: recorrido.meta,
    macros: repartirMacros(recorrido.meta, peso),
    tmb: tmb,
    get: get,
    masaLibreGrasa_kg: ffm,
    peso_kg: peso,
    porcentajeGrasa: porcentajeGrasa,
    masaMuscular_kg: masaMuscular,
    factorActividad: factor,
    metaPrevia: recorrido.metaPrevia,
    ajusteKcal: recorrido.meta - recorrido.metaPrevia,
    diagnostico: evaluacion.diagnostico + (recorrido.aviso ? ' ' + recorrido.aviso : ''),
    estado: evaluacion.estado,
    perdidaSemanal_kg: evaluacion.perdidaSemanal,
    cambioMuscular_kg: evaluacion.cambioMuscular,
    ajusteManual: false,
    tieneHistorial: true,
    ultimaMedicion: aFechaISO_(ultima.Fecha)
  };
}

/**
 * Recorre el historial desde la meta base aplicando el ajuste de cada periodo.
 * @param {Array<Object>} conPeso Las mediciones con peso, ordenadas por fecha.
 * @param {number} tmb La tasa metabólica basal actual.
 * @param {number} get El gasto energético total actual.
 * @return {Object} La meta final, la previa, el último diagnóstico y el aviso.
 */
function recorrerHistorial_(conPeso, tmb, get) {
  var meta = META_CALORICA_BASE;
  var metaPrevia = META_CALORICA_BASE;
  var evaluacion = evaluarProgreso_(null, conPeso[0]);
  var aviso = '';

  for (var i = 1; i < conPeso.length; i++) {
    var paso = evaluarProgreso_(conPeso[i - 1], conPeso[i]);
    if (paso.estado === 'muy-pronto') {
      /* Un pesaje muy seguido del anterior no ajusta nada, pero tampoco borra
         el diagnóstico del último periodo que sí contó. */
      if (i === conPeso.length - 1) { evaluacion = paso; }
      continue;
    }
    metaPrevia = meta;
    var acotada = acotarMeta_(meta + paso.ajuste, tmb, get);
    meta = acotada.meta;
    aviso = acotada.aviso;
    evaluacion = paso;
  }

  if (conPeso.length === 1) {
    var inicial = acotarMeta_(meta, tmb, get);
    meta = inicial.meta;
    aviso = inicial.aviso;
  }

  return { meta: meta, metaPrevia: metaPrevia, ultimaEvaluacion: evaluacion, aviso: aviso };
}

/**
 * Aplica las cotas de seguridad a una meta calórica.
 * @param {number} propuesta La meta antes de acotar.
 * @param {number} tmb La tasa metabólica basal.
 * @param {number} get El gasto energético total.
 * @return {Object} La meta acotada y el aviso que la explica.
 */
function acotarMeta_(propuesta, tmb, get) {
  var piso = Math.max(CALORIAS_PISO, tmb, redondear_(get * (1 - DEFICIT_MAXIMO), 0));
  var meta = propuesta;
  var aviso = '';

  if (meta < piso) {
    aviso = 'La meta se levantó a ' + piso + ' kcal: por debajo de eso el déficit deja de ser lento y se pierde músculo.';
    meta = piso;
  }
  if (meta > get) {
    meta = redondear_(get * 0.9, 0);
    aviso = 'La meta se ajustó para mantener un déficit real frente al gasto de ' + get + ' kcal.';
  }

  return { meta: Math.round(meta / 10) * 10, aviso: aviso };
}

/**
 * Compara dos mediciones y decide cuánto mover las calorías.
 * @param {Object|null} previa La medición anterior.
 * @param {Object} ultima La medición más reciente.
 * @return {Object} Ajuste en kcal, diagnóstico y estado.
 */
function evaluarProgreso_(previa, ultima) {
  if (!previa) {
    return {
      ajuste: 0,
      estado: 'inicio',
      diagnostico: 'Primera medición registrada. Se sostiene la meta actual hasta tener con qué comparar.',
      perdidaSemanal: 0,
      cambioMuscular: 0
    };
  }

  var dias = (new Date(ultima.Fecha) - new Date(previa.Fecha)) / (1000 * 60 * 60 * 24);
  if (dias < 7) {
    return {
      ajuste: 0,
      estado: 'muy-pronto',
      diagnostico: 'Pasaron menos de siete días desde la medición anterior. El peso fluctúa por agua; no se ajusta nada todavía.',
      perdidaSemanal: 0,
      cambioMuscular: 0
    };
  }

  var semanas = dias / 7;
  var cambioPeso = aNumero_(previa.Peso_kg) - aNumero_(ultima.Peso_kg);
  var perdidaSemanal = redondear_(cambioPeso / semanas, 2);
  var cambioMuscular = redondear_(aNumero_(ultima.MasaMuscular_kg) - aNumero_(previa.MasaMuscular_kg), 2);
  var hayDatoMuscular = aNumero_(previa.MasaMuscular_kg) > 0 && aNumero_(ultima.MasaMuscular_kg) > 0;

  if (hayDatoMuscular && cambioMuscular < -PERDIDA_MUSCULAR_TOLERADA_KG) {
    return {
      ajuste: 150,
      estado: 'perdiendo-musculo',
      diagnostico: 'Bajaron ' + Math.abs(cambioMuscular) + ' kg de masa muscular. Se suben 150 kcal y conviene sumar entrenamiento de fuerza.',
      perdidaSemanal: perdidaSemanal,
      cambioMuscular: cambioMuscular
    };
  }

  if (perdidaSemanal > PERDIDA_SEMANAL_MAXIMA) {
    return {
      ajuste: 120,
      estado: 'muy-rapido',
      diagnostico: 'La pérdida va a ' + perdidaSemanal + ' kg por semana, más rápido de lo sostenible. Se suben 120 kcal para proteger la masa muscular.',
      perdidaSemanal: perdidaSemanal,
      cambioMuscular: cambioMuscular
    };
  }

  if (perdidaSemanal < PERDIDA_SEMANAL_MINIMA) {
    return {
      ajuste: -100,
      estado: 'estancado',
      diagnostico: perdidaSemanal <= 0
        ? 'El peso no bajó en este periodo. Se recortan 100 kcal y conviene revisar el registro de alimentos.'
        : 'La pérdida va a ' + perdidaSemanal + ' kg por semana, por debajo de la meta. Se recortan 100 kcal.',
      perdidaSemanal: perdidaSemanal,
      cambioMuscular: cambioMuscular
    };
  }

  return {
    ajuste: 0,
    estado: 'en-rango',
    diagnostico: 'La pérdida va a ' + perdidaSemanal + ' kg por semana, justo en el rango sostenible. Se mantiene la meta.',
    perdidaSemanal: perdidaSemanal,
    cambioMuscular: cambioMuscular
  };
}

/**
 * Devuelve la configuración de un paciente, creándola si no existía.
 * @param {string} idPaciente El identificador del paciente.
 * @return {Object} La fila de Config_Paciente.
 */
function obtenerConfigPaciente_(idPaciente) {
  var filas = leerTabla_('Config_Paciente');
  for (var i = 0; i < filas.length; i++) {
    if (String(filas[i].ID_Paciente) === String(idPaciente)) {
      return filas[i];
    }
  }

  var nueva = {
    ID_Paciente: idPaciente,
    CaloriasObjetivo: META_CALORICA_BASE,
    ProteinaObjetivo_g: '',
    FactorActividad: FACTORES_ACTIVIDAD.ligero,
    Estatura_cm: '',
    FechaNacimiento: '',
    Sexo: '',
    AjusteManual: 'NO',
    FechaActualizacion: new Date(),
    ActualizadoPor: 'Automático'
  };
  agregarFila_('Config_Paciente', nueva);

  var recargada = leerTabla_('Config_Paciente');
  for (var j = 0; j < recargada.length; j++) {
    if (String(recargada[j].ID_Paciente) === String(idPaciente)) {
      return recargada[j];
    }
  }
  return nueva;
}

/**
 * Guarda la meta recalculada para que el próximo mes parta de ahí.
 * @param {string} idPaciente El identificador del paciente.
 * @param {Object} plan El resultado de obtenerPlanCaloricoMensual.
 */
function persistirPlan_(idPaciente, plan) {
  if (plan.ajusteManual || !plan.tieneHistorial) {
    return;
  }
  var config = obtenerConfigPaciente_(idPaciente);
  if (aNumero_(config.CaloriasObjetivo) === plan.caloriasObjetivo) {
    return;
  }
  actualizarFila_('Config_Paciente', config._fila, {
    CaloriasObjetivo: plan.caloriasObjetivo,
    ProteinaObjetivo_g: plan.macros.proteinas_g,
    FechaActualizacion: new Date(),
    ActualizadoPor: 'Recálculo automático'
  });
}
