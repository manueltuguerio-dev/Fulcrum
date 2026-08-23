/**
 * NutriApp · Fulcrum
 * Poblado inicial del catálogo de alimentos por cada 100 gramos y de la
 * biblioteca de evidencia científica.
 *
 * Los valores siguen la composición de alimentos de uso corriente en México
 * (base USDA FoodData Central y Sistema Mexicano de Alimentos Equivalentes).
 * Puedes editarlos, corregirlos o agregar más desde la pestaña Alimentos_100g
 * de la hoja de cálculo: la app lee siempre de ahí, no de este archivo.
 */

/**
 * Catálogo base. Cada renglón es
 * [Categoria, Alimento, Proteina_g, Grasa_g, Carbohidratos_g, Fibra_g, Calorias_100g].
 */
var ALIMENTOS_BASE = [
  ['Cereales y tubérculos', 'Avena en hojuelas (cruda)', 13.2, 6.5, 67.7, 10.1, 389],
  ['Cereales y tubérculos', 'Avena cocida en agua', 2.4, 1.4, 12.0, 1.7, 71],
  ['Cereales y tubérculos', 'Arroz integral cocido', 2.6, 0.9, 23.0, 1.8, 111],
  ['Cereales y tubérculos', 'Arroz blanco cocido', 2.7, 0.3, 28.2, 0.4, 130],
  ['Cereales y tubérculos', 'Tortilla de maíz nixtamalizado', 5.7, 1.8, 44.6, 5.2, 218],
  ['Cereales y tubérculos', 'Tostada de maíz horneada', 7.0, 4.5, 73.0, 7.5, 380],
  ['Cereales y tubérculos', 'Pan integral de trigo', 13.4, 3.5, 43.3, 6.8, 247],
  ['Cereales y tubérculos', 'Pan blanco de caja', 9.0, 3.3, 49.0, 2.7, 265],
  ['Cereales y tubérculos', 'Pasta integral cocida', 5.3, 0.5, 27.0, 3.2, 124],
  ['Cereales y tubérculos', 'Papa cocida sin cáscara', 2.0, 0.1, 20.1, 1.8, 87],
  ['Cereales y tubérculos', 'Camote cocido', 1.6, 0.1, 20.7, 3.0, 90],
  ['Cereales y tubérculos', 'Elote en grano cocido', 3.4, 1.5, 21.0, 2.4, 96],
  ['Cereales y tubérculos', 'Amaranto tostado', 14.5, 7.0, 65.0, 6.7, 371],
  ['Cereales y tubérculos', 'Quinoa cocida', 4.4, 1.9, 21.3, 2.8, 120],

  ['Leguminosas', 'Frijol negro cocido', 8.9, 0.5, 23.7, 8.7, 132],
  ['Leguminosas', 'Frijol bayo cocido', 9.1, 0.5, 22.8, 9.0, 127],
  ['Leguminosas', 'Lenteja cocida', 9.0, 0.4, 20.1, 7.9, 116],
  ['Leguminosas', 'Garbanzo cocido', 8.9, 2.6, 27.4, 7.6, 164],
  ['Leguminosas', 'Haba cocida', 7.6, 0.4, 19.6, 5.4, 110],
  ['Leguminosas', 'Soya texturizada seca', 52.0, 1.2, 33.0, 17.5, 327],
  ['Leguminosas', 'Soya texturizada hidratada', 17.3, 0.4, 11.0, 5.8, 109],
  ['Leguminosas', 'Tofu firme', 17.3, 8.7, 2.8, 2.3, 144],
  ['Leguminosas', 'Tempeh', 20.3, 10.8, 7.6, 5.4, 192],
  ['Leguminosas', 'Edamame cocido', 11.9, 5.2, 8.9, 5.2, 121],

  ['Origen animal', 'Huevo entero cocido', 12.6, 10.6, 1.1, 0.0, 155],
  ['Origen animal', 'Clara de huevo', 10.9, 0.2, 0.7, 0.0, 52],
  ['Origen animal', 'Pechuga de pollo sin piel cocida', 31.0, 3.6, 0.0, 0.0, 165],
  ['Origen animal', 'Atún en agua drenado', 25.5, 0.8, 0.0, 0.0, 116],
  ['Origen animal', 'Salmón cocido', 25.4, 13.4, 0.0, 0.0, 208],
  ['Origen animal', 'Tilapia cocida', 26.2, 2.7, 0.0, 0.0, 128],
  ['Origen animal', 'Bistec de res magro cocido', 27.0, 8.0, 0.0, 0.0, 187],
  ['Origen animal', 'Lomo de cerdo cocido', 27.0, 6.0, 0.0, 0.0, 165],
  ['Origen animal', 'Queso panela', 18.0, 14.0, 3.0, 0.0, 208],
  ['Origen animal', 'Requesón', 11.0, 4.3, 3.4, 0.0, 98],
  ['Origen animal', 'Yogur griego natural sin azúcar', 10.0, 0.4, 3.6, 0.0, 59],
  ['Origen animal', 'Leche descremada', 3.4, 0.2, 5.0, 0.0, 35],

  ['Verduras', 'Nopal cocido', 1.3, 0.1, 3.3, 2.2, 15],
  ['Verduras', 'Calabacita', 1.2, 0.3, 3.1, 1.0, 17],
  ['Verduras', 'Jitomate', 0.9, 0.2, 3.9, 1.2, 18],
  ['Verduras', 'Chayote', 0.8, 0.1, 4.5, 1.7, 19],
  ['Verduras', 'Espinaca cruda', 2.9, 0.4, 3.6, 2.2, 23],
  ['Verduras', 'Brócoli cocido', 2.4, 0.4, 7.2, 3.3, 35],
  ['Verduras', 'Zanahoria', 0.9, 0.2, 9.6, 2.8, 41],
  ['Verduras', 'Cebolla', 1.1, 0.1, 9.3, 1.7, 40],
  ['Verduras', 'Chile poblano', 1.0, 0.2, 4.6, 1.7, 20],
  ['Verduras', 'Chile serrano', 1.7, 0.4, 8.8, 3.7, 40],
  ['Verduras', 'Lechuga romana', 1.2, 0.3, 3.3, 2.1, 17],
  ['Verduras', 'Pepino con cáscara', 0.7, 0.1, 3.6, 0.5, 15],
  ['Verduras', 'Champiñón', 3.1, 0.3, 3.3, 1.0, 22],
  ['Verduras', 'Ejote cocido', 1.9, 0.3, 7.9, 3.2, 35],
  ['Verduras', 'Jícama', 0.7, 0.1, 8.8, 4.9, 38],

  ['Frutas', 'Manzana con cáscara', 0.3, 0.2, 13.8, 2.4, 52],
  ['Frutas', 'Plátano', 1.1, 0.3, 22.8, 2.6, 89],
  ['Frutas', 'Papaya', 0.5, 0.3, 10.8, 1.7, 43],
  ['Frutas', 'Naranja', 0.9, 0.1, 11.8, 2.4, 47],
  ['Frutas', 'Fresa', 0.7, 0.3, 7.7, 2.0, 32],
  ['Frutas', 'Guayaba', 2.6, 1.0, 14.3, 5.4, 68],
  ['Frutas', 'Melón', 0.8, 0.2, 8.2, 0.9, 34],
  ['Frutas', 'Sandía', 0.6, 0.2, 7.6, 0.4, 30],
  ['Frutas', 'Mango', 0.8, 0.4, 15.0, 1.6, 60],
  ['Frutas', 'Piña', 0.5, 0.1, 13.1, 1.4, 50],
  ['Frutas', 'Toronja', 0.8, 0.1, 10.7, 1.6, 42],

  ['Grasas y oleaginosas', 'Aguacate', 2.0, 14.7, 8.5, 6.7, 160],
  ['Grasas y oleaginosas', 'Aceite de oliva', 0.0, 100.0, 0.0, 0.0, 884],
  ['Grasas y oleaginosas', 'Aceite de canola', 0.0, 100.0, 0.0, 0.0, 884],
  ['Grasas y oleaginosas', 'Aceite de girasol', 0.0, 100.0, 0.0, 0.0, 884],
  ['Grasas y oleaginosas', 'Almendra', 21.2, 49.9, 21.6, 12.5, 579],
  ['Grasas y oleaginosas', 'Nuez de Castilla', 15.2, 65.2, 13.7, 6.7, 654],
  ['Grasas y oleaginosas', 'Cacahuate natural', 25.8, 49.2, 16.1, 8.5, 567],
  ['Grasas y oleaginosas', 'Crema de cacahuate natural', 25.1, 50.4, 20.0, 6.0, 588],
  ['Grasas y oleaginosas', 'Semilla de chía', 16.5, 30.7, 42.1, 34.4, 486],
  ['Grasas y oleaginosas', 'Linaza molida', 18.3, 42.2, 28.9, 27.3, 534],
  ['Grasas y oleaginosas', 'Semilla de girasol', 20.8, 51.5, 20.0, 8.6, 584],

  ['Bebidas y libres', 'Agua natural', 0.0, 0.0, 0.0, 0.0, 0],
  ['Bebidas y libres', 'Agua mineral sin azúcar', 0.0, 0.0, 0.0, 0.0, 0],
  ['Bebidas y libres', 'Café negro sin azúcar', 0.1, 0.0, 0.0, 0.0, 2],
  ['Bebidas y libres', 'Té sin azúcar', 0.0, 0.0, 0.3, 0.0, 1],
  ['Bebidas y libres', 'Bebida acalórica con edulcorante', 0.0, 0.0, 0.0, 0.0, 1],
  ['Bebidas y libres', 'Leche de soya sin azúcar', 3.3, 1.8, 1.8, 0.5, 33],
  ['Bebidas y libres', 'Caldo de verduras desgrasado', 0.5, 0.2, 1.0, 0.1, 8],
  ['Bebidas y libres', 'Salsa mexicana fresca', 1.0, 0.2, 4.0, 1.0, 22],
  ['Bebidas y libres', 'Salsa verde cocida', 1.0, 0.5, 5.0, 1.5, 30],
  ['Bebidas y libres', 'Cilantro fresco', 2.1, 0.5, 3.7, 2.8, 23],
  ['Bebidas y libres', 'Jugo de limón', 0.4, 0.2, 6.9, 0.3, 22]
];

/**
 * Carga el catálogo en la pestaña Alimentos_100g sin duplicar lo ya cargado.
 * @return {number} Cuántos alimentos quedaron en el catálogo.
 */
function sembrarAlimentos_() {
  var hoja = hoja_('Alimentos_100g');
  var existentes = leerTabla_('Alimentos_100g');
  var yaCargados = {};
  existentes.forEach(function (fila) {
    yaCargados[normalizarTexto_(fila.Alimento)] = true;
  });

  var nuevas = [];
  ALIMENTOS_BASE.forEach(function (a, indice) {
    if (yaCargados[normalizarTexto_(a[1])]) {
      return;
    }
    var id = 'ALI-' + ('000' + (indice + 1)).slice(-3);
    nuevas.push([id, a[0], a[1], a[2], a[3], a[4], a[5], a[6]]);
  });

  if (nuevas.length) {
    hoja.getRange(hoja.getLastRow() + 1, 1, nuevas.length, 8).setValues(nuevas);
  }
  return existentes.length + nuevas.length;
}

/**
 * Fichas de la biblioteca de evidencia. El enlace apunta a una búsqueda de
 * PubMed acotada al tema, para que siempre resuelva a literatura vigente. Si
 * prefieres fijar un estudio concreto, sustituye el enlace por el del PMID
 * directamente en la pestaña Evidencia_Cientifica.
 */
var EVIDENCIA_BASE = [
  [
    'Bebidas acalóricas',
    'Sustituir bebidas azucaradas por bebidas sin calorías',
    'Los ensayos aleatorizados muestran que cambiar refrescos azucarados por agua o bebidas con edulcorantes no calóricos reduce la ingesta energética y favorece la pérdida de peso, sin el daño metabólico que se les atribuye popularmente.',
    'Ensayos clínicos aleatorizados y metaanálisis',
    'https://pubmed.ncbi.nlm.nih.gov/?term=non-nutritive+sweetened+beverages+body+weight+randomized+controlled+trial'
  ],
  [
    'Aceite vegetal insaturado',
    'Grasa insaturada en lugar de grasa saturada',
    'Reemplazar manteca y grasas saturadas por aceites vegetales insaturados (oliva, canola, girasol) baja el colesterol LDL y el riesgo cardiovascular. La grasa no engorda por sí misma: lo que cuenta es el total de energía del día.',
    'Metaanálisis de ensayos de alimentación controlada',
    'https://pubmed.ncbi.nlm.nih.gov/?term=replacing+saturated+fat+with+polyunsaturated+vegetable+oil+LDL+cardiovascular+meta-analysis'
  ],
  [
    'Fibra dietética',
    'Fibra, saciedad y control de peso',
    'Una ingesta alta de fibra (25 a 30 g al día) se asocia con mayor saciedad, mejor control glucémico y menor peso corporal. En la dieta mexicana el frijol, el nopal, la avena y las tortillas de maíz integral son las fuentes más accesibles.',
    'Revisiones sistemáticas y estudios de cohorte',
    'https://pubmed.ncbi.nlm.nih.gov/?term=dietary+fiber+intake+satiety+body+weight+systematic+review'
  ],
  [
    'Soya texturizada',
    'Proteína de soya como sustituto de la carne',
    'La proteína de soya texturizada aporta todos los aminoácidos esenciales, es de bajo costo y su consumo se asocia con mejoras discretas en el perfil de lípidos. No altera las hormonas en hombres, contrario al mito difundido.',
    'Metaanálisis de ensayos clínicos',
    'https://pubmed.ncbi.nlm.nih.gov/?term=soy+protein+isoflavones+testosterone+lipid+profile+meta-analysis'
  ],
  [
    'Mito de la sobreproteína',
    'Cuánta proteína hace falta en realidad',
    'Para conservar la masa muscular durante un déficit calórico moderado basta con alrededor de 1.0 g de proteína por kilogramo de peso corporal al día. Cantidades mucho mayores no aportan beneficio adicional en personas sin entrenamiento de alto rendimiento y encarecen la dieta sin razón.',
    'Ensayos clínicos y posicionamientos de sociedades científicas',
    'https://pubmed.ncbi.nlm.nih.gov/?term=protein+intake+lean+mass+preservation+energy+restriction+randomized'
  ],
  [
    'Déficit calórico lento',
    'Velocidad de pérdida de peso y masa muscular',
    'Perder peso de forma gradual, entre 0.3 y 0.7 kg por semana, conserva más masa libre de grasa que un déficit agresivo y se sostiene mejor en el tiempo. Es la razón por la que esta app ajusta las calorías mes con mes en lugar de recortarlas de golpe.',
    'Ensayos clínicos comparativos',
    'https://pubmed.ncbi.nlm.nih.gov/?term=rate+of+weight+loss+lean+body+mass+preservation+randomized'
  ],
  [
    'Actividad física',
    'Ejercicio de fuerza durante la pérdida de peso',
    'Añadir entrenamiento de fuerza dos o tres veces por semana durante un déficit calórico reduce de forma significativa la pérdida de masa muscular y mejora la sensibilidad a la insulina, incluso sin cambios adicionales en la dieta.',
    'Metaanálisis de ensayos aleatorizados',
    'https://pubmed.ncbi.nlm.nih.gov/?term=resistance+training+energy+restriction+lean+mass+meta-analysis'
  ]
];

/**
 * Carga las fichas de evidencia sin duplicar las ya cargadas.
 * @return {number} Cuántas fichas quedaron.
 */
function sembrarEvidencia_() {
  var hoja = hoja_('Evidencia_Cientifica');
  var existentes = leerTabla_('Evidencia_Cientifica');
  var yaCargadas = {};
  existentes.forEach(function (fila) {
    yaCargadas[normalizarTexto_(fila.Titulo)] = true;
  });

  var nuevas = [];
  EVIDENCIA_BASE.forEach(function (e, indice) {
    if (yaCargadas[normalizarTexto_(e[1])]) {
      return;
    }
    nuevas.push(['EVI-' + ('00' + (indice + 1)).slice(-2), e[0], e[1], e[2], e[3], e[4]]);
  });

  if (nuevas.length) {
    hoja.getRange(hoja.getLastRow() + 1, 1, nuevas.length, 6).setValues(nuevas);
  }
  return existentes.length + nuevas.length;
}

/**
 * Quita acentos, espacios sobrantes y mayúsculas para comparar textos.
 * @param {*} texto El texto a normalizar.
 * @return {string} El texto comparable.
 */
function normalizarTexto_(texto) {
  return String(texto === undefined || texto === null ? '' : texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}
