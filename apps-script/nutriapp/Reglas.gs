/**
 * NutriApp · Fulcrum
 * Reglas de salud que la aplicación promueve todos los días.
 *
 * Son cuatro, y la app las revisa contra lo que el paciente realmente registró:
 *
 *   1. Fibra entre 25 y 30 gramos al día.
 *   2. Al menos una fruta al día.
 *   3. Más de la mitad de la comida de origen vegetal.
 *   4. Menos grasas saturadas: manteca, carne roja, aceite de coco, aceite de
 *      palma y mantequilla.
 *
 * El tono importa tanto como el número. Estas reglas se muestran como
 * recordatorios, no como reproches: quien registra su comida ya está haciendo
 * el trabajo, y una app que regaña es una app que se desinstala.
 */

/** Rango diario de fibra en gramos, según la guía. */
var FIBRA_MINIMA_G = 25;
var FIBRA_MAXIMA_G = 30;

/** Porciones mínimas de fruta al día. */
var FRUTAS_MINIMAS = 1;

/** Porción de fruta considerada estándar, en gramos. */
var GRAMOS_POR_FRUTA = 80;

/** Proporción de energía de origen vegetal que se busca alcanzar. */
var PROPORCION_VEGETAL_META = 0.6;

/**
 * Categorías del catálogo que cuentan como origen vegetal.
 * "Bebidas y libres" incluye caldos, salsas y leche de soya: todas vegetales.
 */
var CATEGORIAS_VEGETALES = [
  'Cereales y tubérculos', 'Leguminosas', 'Verduras', 'Frutas',
  'Grasas y oleaginosas', 'Bebidas y libres'
];

/**
 * Alimentos altos en grasa saturada que la guía pide limitar.
 *
 * Se comparan por PALABRA COMPLETA, no por subcadena. La diferencia no es
 * cosmética: buscar "res" dentro del texto marca "Salsa mexicana fresca" y
 * "Fresa" como grasa saturada, y la app termina regañando a alguien por comerse
 * una fruta. Con límites de palabra, "Bistec de res magro cocido" sí cae y
 * "fresca" no.
 */
var FRAGMENTOS_GRASA_SATURADA = [
  'manteca', 'mantequilla', 'aceite de coco', 'aceite de palma',
  'crema acida', 'chorizo', 'tocino', 'res', 'cerdo', 'cordero', 'borrego'
];

/* ===================================================================
   CLASIFICACIÓN DE ALIMENTOS
   =================================================================== */

/**
 * Etiqueta un alimento del catálogo según las reglas.
 * @param {Object} alimento Fila del catálogo, con categoria y alimento.
 * @return {Object} Si es fruta, si es vegetal y si es alta en grasa saturada.
 */
function clasificarAlimento_(alimento) {
  var nombre = normalizarTexto_(alimento.alimento || alimento.Alimento);
  var categoria = alimento.categoria || alimento.Categoria;

  var esGrasaSaturada = FRAGMENTOS_GRASA_SATURADA.some(function (f) {
    return contienePalabras_(nombre, f);
  });

  return {
    esFruta: categoria === 'Frutas',
    esVegetal: CATEGORIAS_VEGETALES.indexOf(categoria) >= 0,
    esGrasaSaturada: esGrasaSaturada
  };
}

/**
 * Dice si un texto contiene una secuencia de palabras completas.
 *
 * @param {string} texto El texto ya normalizado.
 * @param {string} secuencia Una o más palabras, ya normalizadas.
 * @return {boolean} true si aparecen como palabras completas y seguidas.
 */
function contienePalabras_(texto, secuencia) {
  var palabras = texto.split(/[^a-z0-9]+/);
  var buscadas = secuencia.split(' ');

  for (var i = 0; i <= palabras.length - buscadas.length; i++) {
    var coincide = true;
    for (var j = 0; j < buscadas.length; j++) {
      if (palabras[i + j] !== buscadas[j]) {
        coincide = false;
        break;
      }
    }
    if (coincide) { return true; }
  }
  return false;
}

/* ===================================================================
   EVALUACIÓN DEL DÍA
   =================================================================== */

/**
 * Revisa el día contra las cuatro reglas y devuelve un aviso por cada una.
 *
 * @param {Array<Object>} comidas Las comidas del día, con su detalle.
 * @param {Object} consumido Totales del día.
 * @param {Array<Object>=} catalogo El catálogo ya cargado, para no releerlo.
 * @return {Array<Object>} Un objeto por regla: clave, estado, título y mensaje.
 */
function evaluarReglasDelDia_(comidas, consumido, catalogo) {
  var tabla = catalogo || leerTabla_('Alimentos_100g').map(function (a) {
    return { id: a.ID, categoria: a.Categoria, alimento: a.Alimento, calorias: aNumero_(a.Calorias_100g) };
  });

  var porId = {};
  tabla.forEach(function (a) { porId[a.id] = a; });

  var gramosFruta = 0;
  var kcalVegetal = 0;
  var kcalTotal = 0;
  var saturadas = [];

  (comidas || []).forEach(function (comida) {
    (comida.alimentos || []).forEach(function (item) {
      var base = porId[item.idAlimento];
      if (!base) { return; }

      var etiquetas = clasificarAlimento_(base);
      var kcal = aNumero_(item.calorias);
      kcalTotal += kcal;

      if (etiquetas.esFruta) { gramosFruta += aNumero_(item.gramos); }
      if (etiquetas.esVegetal) { kcalVegetal += kcal; }
      if (etiquetas.esGrasaSaturada && saturadas.indexOf(base.alimento) < 0) {
        saturadas.push(base.alimento);
      }
    });
  });

  var frutas = gramosFruta / GRAMOS_POR_FRUTA;
  var proporcionVegetal = kcalTotal > 0 ? kcalVegetal / kcalTotal : 0;
  var huboRegistro = kcalTotal > 0;

  return [
    reglaFibra_(aNumero_(consumido && consumido.fibra), huboRegistro),
    reglaFruta_(frutas, huboRegistro),
    reglaVegetal_(proporcionVegetal, huboRegistro),
    reglaGrasaSaturada_(saturadas, huboRegistro)
  ];
}

/**
 * Regla de fibra: entre 25 y 30 g al día.
 * @param {number} fibra Gramos consumidos.
 * @param {boolean} huboRegistro Si el paciente registró algo hoy.
 * @return {Object} El aviso.
 */
function reglaFibra_(fibra, huboRegistro) {
  var base = { clave: 'fibra', titulo: 'Fibra', icono: '🌾', valor: redondear_(fibra, 1), meta: FIBRA_MINIMA_G };

  if (!huboRegistro) {
    return Object.assign(base, { estado: 'pendiente', mensaje: 'Registra tu comida y aquí te digo cómo vas con la fibra.' });
  }
  if (fibra >= FIBRA_MINIMA_G && fibra <= FIBRA_MAXIMA_G) {
    return Object.assign(base, { estado: 'logrado', mensaje: 'Vas en el rango de ' + FIBRA_MINIMA_G + ' a ' + FIBRA_MAXIMA_G + ' g. Justo ahí.' });
  }
  if (fibra > FIBRA_MAXIMA_G) {
    return Object.assign(base, {
      estado: 'logrado',
      mensaje: 'Llevas ' + redondear_(fibra, 1) + ' g, por encima de los ' + FIBRA_MAXIMA_G + ' g. No es problema; solo toma bastante agua.'
    });
  }
  return Object.assign(base, {
    estado: 'pendiente',
    mensaje: 'Te faltan ' + redondear_(FIBRA_MINIMA_G - fibra, 1) + ' g. Media taza de frijol o una guayaba cierran la brecha.'
  });
}

/**
 * Regla de fruta: al menos una porción al día.
 * @param {number} frutas Porciones estimadas.
 * @param {boolean} huboRegistro Si el paciente registró algo hoy.
 * @return {Object} El aviso.
 */
function reglaFruta_(frutas, huboRegistro) {
  var base = { clave: 'fruta', titulo: 'Fruta', icono: '🍎', valor: redondear_(frutas, 1), meta: FRUTAS_MINIMAS };

  if (!huboRegistro) {
    return Object.assign(base, { estado: 'pendiente', mensaje: 'Recuerda incluir al menos una fruta hoy.' });
  }
  if (frutas >= FRUTAS_MINIMAS) {
    return Object.assign(base, {
      estado: 'logrado',
      mensaje: frutas >= 2
        ? 'Llevas ' + redondear_(frutas, 1) + ' porciones de fruta. Muy bien.'
        : 'Ya llevas tu fruta del día.'
    });
  }
  return Object.assign(base, {
    estado: 'pendiente',
    mensaje: 'Todavía no registras fruta. Una manzana, una guayaba o una tuna cuentan.'
  });
}

/**
 * Regla de origen vegetal: que la mayor parte del día lo sea.
 * @param {number} proporcion Fracción de la energía de origen vegetal.
 * @param {boolean} huboRegistro Si el paciente registró algo hoy.
 * @return {Object} El aviso.
 */
function reglaVegetal_(proporcion, huboRegistro) {
  var porcentaje = Math.round(proporcion * 100);
  var base = {
    clave: 'vegetal', titulo: 'Origen vegetal', icono: '🌱',
    valor: porcentaje, meta: Math.round(PROPORCION_VEGETAL_META * 100)
  };

  if (!huboRegistro) {
    return Object.assign(base, { estado: 'pendiente', mensaje: 'Entre más plantas, mejor: frijol, nopal, avena, tofu.' });
  }
  if (proporcion >= PROPORCION_VEGETAL_META) {
    return Object.assign(base, {
      estado: 'logrado',
      mensaje: 'El ' + porcentaje + ' % de lo que llevas hoy es de origen vegetal.'
    });
  }
  return Object.assign(base, {
    estado: 'pendiente',
    mensaje: 'Vas en ' + porcentaje + ' % de origen vegetal. Cambiar una porción de carne por frijol o soya texturizada sube ese número rápido.'
  });
}

/**
 * Regla de grasas saturadas: señalar las que la guía pide limitar.
 * @param {Array<string>} encontradas Los alimentos detectados.
 * @param {boolean} huboRegistro Si el paciente registró algo hoy.
 * @return {Object} El aviso.
 */
function reglaGrasaSaturada_(encontradas, huboRegistro) {
  var base = {
    clave: 'saturadas', titulo: 'Grasas saturadas', icono: '🧈',
    valor: encontradas.length, meta: 0, detectados: encontradas
  };

  if (!huboRegistro) {
    return Object.assign(base, {
      estado: 'pendiente',
      mensaje: 'Procura dejar fuera manteca, mantequilla, aceite de coco, aceite de palma y carne roja.'
    });
  }
  if (!encontradas.length) {
    return Object.assign(base, { estado: 'logrado', mensaje: 'Hoy no registraste ninguna de las grasas que conviene limitar.' });
  }
  return Object.assign(base, {
    estado: 'atencion',
    mensaje: 'Hoy aparece ' + encontradas.join(', ') + '. No es prohibido, pero conviene que sea la excepción: cambia el aceite por oliva o canola.'
  });
}

/* ===================================================================
   ÍNDICE DE MASA CORPORAL
   =================================================================== */

/**
 * Calcula el IMC y su clasificación.
 *
 * El IMC no distingue músculo de grasa, así que en alguien con mucha masa
 * muscular sale alto sin que signifique lo que parece. Por eso se devuelve
 * junto con una advertencia, y en la app se muestra al lado del porcentaje de
 * grasa corporal, que sí distingue.
 *
 * @param {number} peso_kg El peso corporal.
 * @param {number} estatura_cm La estatura en centímetros.
 * @return {Object|null} Valor, clasificación y color, o null si faltan datos.
 */
function calcularIMC(peso_kg, estatura_cm) {
  var peso = aNumero_(peso_kg);
  var estatura = aNumero_(estatura_cm);

  if (peso <= 0 || estatura <= 0) {
    return null;
  }

  var metros = estatura / 100;
  var imc = redondear_(peso / (metros * metros), 1);
  var clasificacion;
  var color;

  if (imc < 18.5) {
    clasificacion = 'Bajo peso';
    color = 'ambar';
  } else if (imc < 25) {
    clasificacion = 'Peso normal';
    color = 'verde';
  } else if (imc < 30) {
    clasificacion = 'Sobrepeso';
    color = 'ambar';
  } else if (imc < 35) {
    clasificacion = 'Obesidad grado I';
    color = 'rojo';
  } else if (imc < 40) {
    clasificacion = 'Obesidad grado II';
    color = 'rojo';
  } else {
    clasificacion = 'Obesidad grado III';
    color = 'rojo';
  }

  return {
    valor: imc,
    clasificacion: clasificacion,
    color: color,
    advertencia: 'El IMC no distingue músculo de grasa. Léelo junto con tu porcentaje de grasa corporal.'
  };
}

/**
 * Calcula la edad a partir de la fecha de nacimiento.
 * @param {Date|string} fechaNacimiento La fecha de nacimiento.
 * @return {number|null} La edad en años, o null si no se pudo calcular.
 */
function calcularEdad_(fechaNacimiento) {
  if (!fechaNacimiento) {
    return null;
  }
  var nacimiento = fechaNacimiento instanceof Date ? fechaNacimiento : new Date(fechaNacimiento);
  if (isNaN(nacimiento.getTime())) {
    return null;
  }

  var hoy = new Date();
  var edad = hoy.getFullYear() - nacimiento.getFullYear();
  var mes = hoy.getMonth() - nacimiento.getMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) {
    edad--;
  }
  return edad >= 0 && edad < 130 ? edad : null;
}

/**
 * Niveles de actividad de la guía y el factor con el que se multiplica la TMB.
 */
var NIVELES_ACTIVIDAD = {
  'Baja': 1.2,
  'Moderada': 1.375,
  'Alta': 1.55,
  'Muy Alta': 1.725
};

/**
 * Traduce un nivel de actividad a su factor.
 * @param {string} nivel Baja, Moderada, Alta o Muy Alta.
 * @return {number} El factor correspondiente.
 */
function factorPorNivel_(nivel) {
  return NIVELES_ACTIVIDAD[nivel] || NIVELES_ACTIVIDAD.Moderada;
}
