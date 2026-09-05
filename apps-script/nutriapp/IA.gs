/**
 * NutriApp · Fulcrum
 * Agente de IA: interpreta lo que el paciente escribió que comió, y contesta
 * dudas rápidas en el chat asistente.
 *
 * Usa la API de Claude por HTTP con UrlFetchApp, porque Apps Script no puede
 * instalar el SDK de Anthropic ni ningún paquete de npm.
 *
 * La llave vive en las propiedades del script, nunca en el código. Si no está
 * configurada, las dos funciones siguen respondiendo: el registro de comida cae
 * a un analizador local que busca los alimentos por nombre en el catálogo, y el
 * asistente contesta desde un recetario de respuestas fijas. Peor, pero nunca
 * una pantalla rota.
 */

/** Nombre de la propiedad del script donde vive la llave de la API. */
var ANTHROPIC_API_KEY = 'ANTHROPIC_API_KEY';

/** Modelo y versión de la API. */
var MODELO_IA = 'claude-opus-5';
var VERSION_API_ANTHROPIC = '2023-06-01';
var URL_MENSAJES_ANTHROPIC = 'https://api.anthropic.com/v1/messages';

/** Tope de gasto por respuesta. */
var MAX_TOKENS_IA = 4000;

/**
 * Carga la llave de la API una sola vez. Escribe tu valor, ejecútala desde el
 * editor y vuelve a dejar el marcador antes de guardar el archivo en git.
 */
function setupCredencialIA() {
  var llave = 'PEGA_AQUI_TU_LLAVE_DE_ANTHROPIC';

  if (llave.indexOf('PEGA_AQUI') === 0) {
    Logger.log('Todavía no cambiaste el valor. Edita esta función antes de ejecutarla.');
    return false;
  }

  PropertiesService.getScriptProperties().setProperty(ANTHROPIC_API_KEY, llave);
  Logger.log('Llave guardada. Ahora borra el valor de esta función y guarda el archivo.');
  return true;
}

/**
 * Dice si la IA está configurada, sin revelar la llave.
 * @return {boolean} true si hay llave guardada.
 */
function hayIA_() {
  return !!PropertiesService.getScriptProperties().getProperty(ANTHROPIC_API_KEY);
}

/**
 * Comprueba la configuración desde el editor.
 * @return {Object} Si la IA está lista.
 */
function estadoIA() {
  var listo = hayIA_();
  Logger.log(listo
    ? 'IA configurada con el modelo ' + MODELO_IA + '.'
    : 'Sin llave de Anthropic. El registro por texto usará el analizador local y el asistente, respuestas fijas.');
  return { listo: listo, modelo: MODELO_IA };
}

/* ===================================================================
   LLAMADA A LA API
   =================================================================== */

/**
 * Manda una petición a la API de Claude y devuelve el texto de la respuesta.
 *
 * @param {Object} cuerpo El cuerpo de la petición, sin el modelo ni max_tokens.
 * @return {Object} ok, texto y, cuando falla, el motivo.
 */
function llamarClaude_(cuerpo) {
  var llave = PropertiesService.getScriptProperties().getProperty(ANTHROPIC_API_KEY);
  if (!llave) {
    return { ok: false, motivo: 'sin-llave' };
  }

  var peticion = Object.assign({
    model: MODELO_IA,
    max_tokens: MAX_TOKENS_IA
  }, cuerpo);

  try {
    var respuesta = UrlFetchApp.fetch(URL_MENSAJES_ANTHROPIC, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'x-api-key': llave,
        'anthropic-version': VERSION_API_ANTHROPIC
      },
      payload: JSON.stringify(peticion),
      muteHttpExceptions: true
    });

    var codigo = respuesta.getResponseCode();
    var contenido = respuesta.getContentText();

    if (codigo < 200 || codigo >= 300) {
      Logger.log('La API de Claude respondió ' + codigo + ': ' + contenido);
      return { ok: false, motivo: 'http-' + codigo, detalle: contenido };
    }

    var datos = JSON.parse(contenido);

    /* Los clasificadores de seguridad pueden declinar una petición: llega un
       200 con stop_reason "refusal" y sin contenido utilizable. Hay que
       revisarlo antes de leer content, o se lee un arreglo vacío. */
    if (datos.stop_reason === 'refusal') {
      Logger.log('La petición fue declinada por el clasificador de seguridad.');
      return { ok: false, motivo: 'declinada' };
    }

    var texto = (datos.content || [])
      .filter(function (bloque) { return bloque.type === 'text'; })
      .map(function (bloque) { return bloque.text; })
      .join('\n')
      .trim();

    if (!texto) {
      return { ok: false, motivo: 'respuesta-vacia' };
    }
    return { ok: true, texto: texto, uso: datos.usage };
  } catch (err) {
    Logger.log('Falló la llamada a Claude: ' + err.message);
    return { ok: false, motivo: 'excepcion', detalle: err.message };
  }
}

/* ===================================================================
   REGISTRO DE COMIDA POR TEXTO
   =================================================================== */

/**
 * Esquema con el que la IA debe responder al analizar una comida. Al pedirlo
 * como structured output, la respuesta llega como JSON válido y no hay que
 * adivinar el formato ni recortar texto alrededor.
 */
var ESQUEMA_ANALISIS_COMIDA = {
  type: 'object',
  properties: {
    alimentos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nombre: { type: 'string' },
          gramos: { type: 'number' },
          calorias: { type: 'number' },
          proteinas: { type: 'number' },
          grasas: { type: 'number' },
          carbohidratos: { type: 'number' },
          fibra: { type: 'number' },
          idCatalogo: { type: 'string' }
        },
        required: ['nombre', 'gramos', 'calorias', 'proteinas', 'grasas', 'carbohidratos', 'fibra', 'idCatalogo'],
        additionalProperties: false
      }
    },
    comentario: { type: 'string' },
    confianza: { type: 'string' }
  },
  required: ['alimentos', 'comentario', 'confianza'],
  additionalProperties: false
};

/**
 * Interpreta en texto libre lo que el paciente comió y devuelve el desglose.
 *
 * Se le pasa el catálogo para que reutilice sus IDs cuando el alimento ya
 * existe: así el registro queda ligado al catálogo y las reglas de fibra,
 * fruta y grasas saturadas pueden clasificarlo. Cuando no existe, la IA estima
 * los macros y el alimento se guarda suelto, sin ID.
 *
 * @param {string} descripcion Lo que escribió el paciente.
 * @param {Array<Object>} catalogo El catálogo de alimentos.
 * @return {Object} Alimentos con sus macros, comentario y de dónde salió.
 */
function analizarDescripcionComida_(descripcion, catalogo) {
  if (!hayIA_()) {
    return analizarComidaLocal_(descripcion, catalogo);
  }

  /* Solo se manda el nombre, el ID y las calorías: mandar el catálogo entero
     con todos los macros triplicaría el prompt sin mejorar la respuesta. */
  var resumenCatalogo = catalogo.map(function (a) {
    return a.id + '\t' + a.alimento + '\t' + a.calorias;
  }).join('\n');

  var sistema = [
    'Eres el analizador nutricional de NutriApp, una app mexicana de seguimiento nutricional.',
    'Recibes lo que una persona escribió que comió, en español coloquial de México, y devuelves el desglose nutricional.',
    '',
    'Reglas:',
    '- Usa el catálogo de abajo siempre que el alimento exista ahí: copia su ID exacto en idCatalogo.',
    '- Si el alimento no está en el catálogo, deja idCatalogo como cadena vacía y estima los macros por cada 100 g de referencia.',
    '- Los valores que devuelves (calorias, proteinas, grasas, carbohidratos, fibra) son los TOTALES de la porción, no por 100 g.',
    '- Si la persona no dice cantidades, asume porciones caseras normales para un adulto mexicano y dilo en el comentario.',
    '- Reconoce el vocabulario mexicano: "un plato de", "una torta de", "dos tacos de", "un vaso de", "sopa aguada", "guisado".',
    '- confianza es "alta" cuando la persona dio cantidades claras, "media" cuando estimaste porciones, "baja" cuando la descripción es vaga.',
    '- El comentario es una frase corta y amable, sin regañar. Si la descripción es muy vaga, pide el dato que falta.',
    '',
    'Catálogo disponible (ID, nombre, kcal por 100 g):',
    resumenCatalogo
  ].join('\n');

  var resultado = llamarClaude_({
    system: [{ type: 'text', text: sistema, cache_control: { type: 'ephemeral' } }],
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: ESQUEMA_ANALISIS_COMIDA }
    },
    messages: [{ role: 'user', content: 'Esto es lo que comí: ' + descripcion }]
  });

  if (!resultado.ok) {
    var local = analizarComidaLocal_(descripcion, catalogo);
    local.avisoIA = resultado.motivo === 'sin-llave'
      ? ''
      : 'La IA no respondió, así que se buscaron los alimentos por nombre. Revisa las cantidades.';
    return local;
  }

  try {
    var datos = JSON.parse(resultado.texto);
    return {
      alimentos: (datos.alimentos || []).map(function (a) {
        return {
          idAlimento: a.idCatalogo || '',
          alimento: a.nombre,
          gramos: redondear_(aNumero_(a.gramos), 1),
          calorias: redondear_(aNumero_(a.calorias), 1),
          proteinas: redondear_(aNumero_(a.proteinas), 1),
          grasas: redondear_(aNumero_(a.grasas), 1),
          carbohidratos: redondear_(aNumero_(a.carbohidratos), 1),
          fibra: redondear_(aNumero_(a.fibra), 1)
        };
      }),
      comentario: datos.comentario || '',
      confianza: datos.confianza || 'media',
      origen: 'ia'
    };
  } catch (err) {
    Logger.log('No se pudo interpretar la respuesta de la IA: ' + err.message);
    return analizarComidaLocal_(descripcion, catalogo);
  }
}

/**
 * Analizador de respaldo, sin IA: busca nombres del catálogo dentro del texto
 * y toma las cantidades en gramos que aparezcan junto a cada uno.
 *
 * Es tosco a propósito. No entiende "dos tacos de nopal", pero sí reconoce
 * "150 g de frijol", y deja al paciente corrigiendo cantidades en lugar de
 * capturando todo desde cero.
 *
 * @param {string} descripcion Lo que escribió el paciente.
 * @param {Array<Object>} catalogo El catálogo de alimentos.
 * @return {Object} Alimentos reconocidos y un comentario.
 */
function analizarComidaLocal_(descripcion, catalogo) {
  var texto = normalizarTexto_(descripcion);
  var candidatos = [];

  /* Primera pasada: coincidencias del nombre completo. Son las confiables. */
  catalogo.forEach(function (base) {
    var nombre = normalizarTexto_(base.alimento);
    var posicion = texto.indexOf(nombre);
    if (posicion >= 0) {
      candidatos.push({ base: base, posicion: posicion, exacta: true, raiz: nombre.split(' ')[0] });
    }
  });

  /* Segunda pasada: la primera palabra, que es como suele escribir la gente
     ("frijol" por "Frijol negro cocido"). Solo se acepta si ningún alimento ya
     encontrado comparte esa raíz; si no, "avena" traería a la vez la cruda y la
     cocida y el día quedaría contado dos veces. */
  catalogo.forEach(function (base) {
    var nombre = normalizarTexto_(base.alimento);
    var raiz = nombre.split(' ')[0];
    if (raiz.length < 5) {
      return;
    }
    if (candidatos.some(function (c) { return c.raiz === raiz; })) {
      return;
    }
    var posicion = texto.indexOf(raiz);
    if (posicion >= 0) {
      candidatos.push({ base: base, posicion: posicion, exacta: false, raiz: raiz });
    }
  });

  var vistos = {};
  var encontrados = [];

  candidatos.forEach(function (candidato) {
    if (vistos[candidato.raiz] || vistos[candidato.base.id]) {
      return;
    }
    vistos[candidato.raiz] = true;
    vistos[candidato.base.id] = true;

    var base = candidato.base;

    /* Busca una cantidad en los 30 caracteres previos al nombre. La unidad y el
       "de" son opcionales, porque en español la cantidad casi nunca queda
       pegada al alimento: "200 g de frijol", "200 gramos de frijol", "200 g
       frijol" y "200 frijol" tienen que caer todas. */
    var contexto = texto.slice(Math.max(0, candidato.posicion - 30), candidato.posicion);
    var cantidad = contexto.match(/(\d{1,4})\s*(?:g|gr|gramos)?\s*(?:de\s+|del\s+)?$/);
    var gramos = cantidad ? parseInt(cantidad[1], 10) : 100;
    if (gramos < 1 || gramos > 2000) { gramos = 100; }

    var factor = gramos / 100;
    encontrados.push({
      idAlimento: base.id,
      alimento: base.alimento,
      gramos: gramos,
      calorias: redondear_(base.calorias * factor, 1),
      proteinas: redondear_(base.proteina * factor, 1),
      grasas: redondear_(base.grasa * factor, 1),
      carbohidratos: redondear_(base.carbohidratos * factor, 1),
      fibra: redondear_(base.fibra * factor, 1)
    });
  });

  return {
    alimentos: encontrados,
    comentario: encontrados.length
      ? 'Encontré estos alimentos por su nombre y asumí 100 g donde no pusiste cantidad. Ajusta los gramos antes de guardar.'
      : 'No reconocí ningún alimento. Escribe los nombres tal como aparecen en el buscador, o agrégalos desde ahí.',
    confianza: 'baja',
    origen: 'local'
  };
}

/* ===================================================================
   CHAT ASISTENTE
   =================================================================== */

/**
 * Contesta una duda del paciente sobre nutrición o sobre el uso de la app.
 *
 * El prompt lleva el contexto del día para que la respuesta sea concreta, y
 * dos límites explícitos: no diagnosticar y no cambiar el plan. Esas dos cosas
 * son del nutriólogo, y una app que las confunde hace daño.
 *
 * @param {Object} paciente Nombre y datos del paciente.
 * @param {Object} contexto Plan, resumen del día y reglas.
 * @param {Array<Object>} historial Mensajes previos de la conversación.
 * @param {string} pregunta La duda.
 * @return {Object} La respuesta y de dónde salió.
 */
function responderAsistente_(paciente, contexto, historial, pregunta) {
  if (!hayIA_()) {
    return { texto: respuestaFija_(pregunta), origen: 'local' };
  }

  var plan = contexto.plan || {};
  var resumen = contexto.resumen || {};
  var consumido = resumen.consumido || {};

  var sistema = [
    'Eres el asistente de NutriApp, una app mexicana de seguimiento nutricional.',
    'Contestas dudas rápidas sobre nutrición, sobre los alimentos y sobre cómo usar la app.',
    '',
    'Cómo respondes:',
    '- En español de México, claro y breve: dos o tres frases, salvo que pidan una lista.',
    '- Con calidez y sin regañar. Quien pregunta ya está haciendo el esfuerzo de cuidarse.',
    '- Concreto y accionable: gramos, porciones, ejemplos de comida mexicana real.',
    '',
    'Lo que NO haces, nunca:',
    '- No diagnosticas ni interpretas estudios de laboratorio. Eso lo hace su nutriólogo.',
    '- No cambias su meta de calorías ni su plan. Si te lo piden, dile que lo consulte con su nutriólogo desde el chat de la app.',
    '- No recomiendas suplementos, medicamentos ni ayunos prolongados.',
    '- Si la duda es clínica, de embarazo, de un síntoma o de un medicamento, dilo directo: eso es para su nutriólogo o su médico.',
    '',
    'Metas que promueve la app: 25 a 30 g de fibra al día, al menos una fruta,',
    'más alimentos de origen vegetal, y limitar manteca, carne roja, aceite de coco,',
    'aceite de palma y mantequilla. El reparto del plato es 60 % carbohidratos,',
    '20 % proteínas y 20 % grasas insaturadas, con 1.0 g de proteína por kilo de peso.',
    '',
    'Contexto de quien te escribe:',
    '- Nombre: ' + (paciente.nombre || 'paciente'),
    '- Meta de hoy: ' + Math.round(aNumero_(plan.caloriasObjetivo)) + ' kcal',
    '- Lleva consumidas: ' + Math.round(aNumero_(consumido.calorias)) + ' kcal',
    '- Fibra de hoy: ' + redondear_(aNumero_(consumido.fibra), 1) + ' g',
    '- Peso más reciente: ' + (plan.peso_kg ? plan.peso_kg + ' kg' : 'sin registro')
  ].join('\n');

  var mensajes = (historial || []).slice(-6).map(function (m) {
    return { role: m.enviadoPor === 'Asistente' ? 'assistant' : 'user', content: String(m.mensaje) };
  });
  mensajes.push({ role: 'user', content: String(pregunta) });

  var resultado = llamarClaude_({
    system: [{ type: 'text', text: sistema, cache_control: { type: 'ephemeral' } }],
    thinking: { type: 'adaptive' },
    output_config: { effort: 'low' },
    messages: mensajes
  });

  if (!resultado.ok) {
    return {
      texto: respuestaFija_(pregunta),
      origen: 'local',
      aviso: resultado.motivo === 'sin-llave' ? '' : 'El asistente no está disponible en este momento.'
    };
  }

  return { texto: resultado.texto, origen: 'ia' };
}

/**
 * Respuestas de respaldo cuando no hay IA configurada. Cubre las preguntas que
 * más se repiten; para todo lo demás, remite al nutriólogo.
 * @param {string} pregunta La duda.
 * @return {string} La respuesta.
 */
function respuestaFija_(pregunta) {
  var texto = normalizarTexto_(pregunta);

  var recetario = [
    { claves: ['fibra'], respuesta: 'La meta es de 25 a 30 g de fibra al día. El frijol, el nopal, la avena, la guayaba y la tortilla de maíz son las fuentes más accesibles: media taza de frijol ya te da unos 7 g.' },
    { claves: ['proteina', 'proteína'], respuesta: 'Tu meta es 1.0 g de proteína por kilo de peso al día. Más que eso no aporta beneficio adicional si no eres deportista de alto rendimiento. Pollo, huevo, atún, frijol con arroz, tofu y soya texturizada cubren bien.' },
    { claves: ['agua', 'tomar agua'], respuesta: 'Entre 1.5 y 2 litros al día es una buena referencia, más si entrenas o hace calor. El agua natural, el café sin azúcar y el té sin azúcar cuentan.' },
    { claves: ['tortilla', 'maiz'], respuesta: 'La tortilla de maíz nixtamalizado es una buena base: aporta fibra, calcio y carbohidrato de digestión lenta. Dos o tres por comida entran bien en la mayoría de los planes.' },
    { claves: ['bajar de peso', 'adelgazar', 'perder peso'], respuesta: 'La app ajusta tus calorías mes con mes buscando entre 0.3 y 0.7 kg por semana. Bajar más rápido cuesta masa muscular y se sostiene peor. Registra tu comida y tus pesajes, y el plan se acomoda solo.' },
    { claves: ['grasa saturada', 'manteca', 'mantequilla', 'aceite'], respuesta: 'Conviene limitar manteca, mantequilla, aceite de coco, aceite de palma y carne roja, y preferir aceite de oliva o de canola, aguacate, nueces y semillas.' },
    { claves: ['fruta'], respuesta: 'Al menos una fruta al día. Con cáscara cuando se pueda, porque ahí está buena parte de la fibra. La guayaba, la manzana, la tuna y la papaya son excelentes opciones.' },
    { claves: ['soya', 'tofu'], respuesta: 'La soya texturizada y el tofu aportan proteína completa, salen más baratos que la carne y no alteran las hormonas: ese es un mito. 100 g de soya texturizada seca traen unos 52 g de proteína.' },
    { claves: ['ejercicio', 'entrenar', 'gimnasio'], respuesta: 'Entrenamiento de fuerza dos o tres veces por semana es lo que más protege tu masa muscular mientras bajas de peso. Regístralo en la pestaña de actividad y las calorías quemadas se estiman solas.' },
    { claves: ['como uso', 'como funciona', 'registrar'], respuesta: 'En la pestaña Comer puedes elegir un platillo sugerido, describir lo que comiste con tus palabras, o buscar alimentos y capturar los gramos. En Perfil registras tus pesajes y estudios, con la cámara o a mano.' },
    { claves: ['sustituir la carne', 'sustituyo la carne', 'sustituto de la carne', 'carne'], respuesta: 'La soya texturizada, el tofu, el tempeh y el frijol con maíz cubren la misma proteína a menor costo. 150 g de soya texturizada hidratada aportan lo mismo que una porción de carne, y además traen fibra, que la carne no tiene.' },
    { claves: ['aguacate'], respuesta: 'El aguacate no engorda por sí mismo: son las calorías totales del día las que cuentan. Aporta grasa insaturada, que conviene. Una porción razonable son 40 a 50 g, más o menos un tercio de pieza.' },
    { claves: ['engorda', 'engordan'], respuesta: 'Ningún alimento engorda por sí solo: lo que decide es el total de energía del día. Lo que sí cambia es qué tanto te llena cada cosa, y ahí la fibra y la proteína ganan.' },
    { claves: ['tortillas puedo', 'cuantas tortillas'], respuesta: 'Dos o tres tortillas de maíz por comida entran bien en la mayoría de los planes. Cada una ronda las 65 kcal y aporta fibra y calcio.' },
    { claves: ['antojo', 'ansiedad', 'hambre'], respuesta: 'El antojo de la tarde se corta mejor con volumen y proteína que con voluntad: jícama con limón, yogur griego con fruta, o un puño de almendras. Revisa también que no estés comiendo demasiado poco en la comida.' },
    { claves: ['alcohol', 'cerveza'], respuesta: 'El alcohol aporta 7 kcal por gramo y no da saciedad, así que suma rápido sin que te des cuenta. Si vas a tomar, cuéntalo dentro de tu meta del día y acompáñalo con agua.' }
  ];

  for (var i = 0; i < recetario.length; i++) {
    for (var j = 0; j < recetario[i].claves.length; j++) {
      if (texto.indexOf(normalizarTexto_(recetario[i].claves[j])) >= 0) {
        return recetario[i].respuesta;
      }
    }
  }

  return 'Esa la puede contestar mejor tu nutriólogo. Escríbele desde el chat de consulta de la app y te responde en cuanto la vea.';
}
