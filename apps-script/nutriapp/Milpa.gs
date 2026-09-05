/**
 * NutriApp · Fulcrum
 * El Plato del Buen Comer adaptado a la Dieta de la Milpa.
 *
 * La milpa es el sistema agrícola mesoamericano donde maíz, frijol y calabaza
 * crecen juntos y se complementan: el maíz da el soporte, el frijol fija el
 * nitrógeno del suelo, la calabaza cubre la tierra. En el plato pasa lo mismo
 * en términos nutricionales, y por eso la combinación maíz con frijol da una
 * proteína tan completa como la de la carne.
 *
 * A los tres grupos tradicionales se suman aquí el tofu y la soya texturizada,
 * que la guía incorpora como fuente de proteína vegetal accesible.
 */

/**
 * Los grupos del plato, con la proporción que ocupan y los alimentos que los
 * representan. Los nombres tienen que existir en la pestaña Alimentos_100g:
 * la tabla nutricional se arma leyendo de ahí, no de valores escritos aquí.
 */
var GRUPOS_MILPA = [
  {
    clave: 'verduras',
    nombre: 'Verduras y quelites',
    proporcion: 33,
    color: '#2f9160',
    icono: '🥬',
    descripcion: 'La mitad del plato en volumen. Aportan fibra, agua y micronutrimentos con muy pocas calorías, así que puedes servirte sin medir.',
    alimentos: ['Nopal cocido', 'Quelites (quintoniles) cocidos', 'Verdolagas cocidas', 'Calabacita', 'Flor de calabaza', 'Chayote', 'Jitomate', 'Ejote cocido']
  },
  {
    clave: 'maiz',
    nombre: 'Maíz y otros cereales',
    proporcion: 25,
    color: '#d97706',
    icono: '🌽',
    descripcion: 'La base energética. El maíz nixtamalizado libera niacina y calcio que el grano crudo no tiene: por eso la tortilla es más nutritiva que la harina.',
    alimentos: ['Tortilla de maíz nixtamalizado', 'Elote en grano cocido', 'Avena en hojuelas (cruda)', 'Amaranto tostado', 'Arroz integral cocido', 'Camote cocido']
  },
  {
    clave: 'frijol',
    nombre: 'Frijol y leguminosas',
    proporcion: 25,
    color: '#175840',
    icono: '🫘',
    descripcion: 'La proteína del sistema. Junto con el maíz forma una proteína completa, y es la fuente de fibra más barata que existe en México.',
    alimentos: ['Frijol negro cocido', 'Frijol bayo cocido', 'Frijol ayocote cocido', 'Lenteja cocida', 'Garbanzo cocido', 'Haba cocida']
  },
  {
    clave: 'soya',
    nombre: 'Soya y derivados',
    proporcion: 10,
    color: '#0891b2',
    icono: '🌱',
    descripcion: 'La incorporación moderna a la milpa. Proteína completa, de bajo costo, que sustituye carne sin perder aminoácidos esenciales.',
    alimentos: ['Tofu firme', 'Soya texturizada hidratada', 'Tempeh', 'Edamame cocido', 'Leche de soya sin azúcar']
  },
  {
    clave: 'grasas',
    nombre: 'Grasas buenas y semillas',
    proporcion: 7,
    color: '#7c3aed',
    icono: '🥑',
    descripcion: 'Poca cantidad, mucha densidad. Aguacate, semillas y aceites insaturados en lugar de manteca o mantequilla.',
    alimentos: ['Aguacate', 'Pepita de calabaza', 'Ajonjolí', 'Semilla de chía', 'Aceite de oliva', 'Cacahuate natural']
  }
];

/**
 * Alimentos que la guía pide limitar, con el motivo. Se muestran junto al plato
 * para que quede claro qué se está sustituyendo y por qué.
 */
var LIMITAR_MILPA = [
  { alimento: 'Manteca de cerdo', motivo: 'Casi pura grasa saturada. Cámbiala por aceite de canola o de oliva.' },
  { alimento: 'Mantequilla', motivo: 'Alta en grasa saturada. Para untar, el aguacate hace el mismo trabajo.' },
  { alimento: 'Aceite de coco', motivo: 'Pese a su fama, es de las grasas más saturadas que existen.' },
  { alimento: 'Aceite de palma', motivo: 'Saturada y presente en muchos productos industrializados. Revisa etiquetas.' },
  { alimento: 'Carne roja', motivo: 'Res, cerdo y cordero: déjala como excepción, no como diario. El frijol y la soya cubren la proteína.' }
];

/**
 * Arma el plato con la tabla nutricional de cada grupo, leyendo los valores del
 * catálogo para que nunca se desfasen de la base de datos.
 *
 * @param {Array<Object>} catalogo El catálogo de alimentos ya cargado.
 * @return {Object} Grupos con sus alimentos y la lista de lo que se limita.
 */
function armarPlatoMilpa_(catalogo) {
  var porNombre = {};
  catalogo.forEach(function (a) {
    porNombre[normalizarTexto_(a.alimento)] = a;
  });

  var grupos = GRUPOS_MILPA.map(function (grupo) {
    var filas = grupo.alimentos.map(function (nombre) {
      var base = porNombre[normalizarTexto_(nombre)];
      if (!base) {
        return null;
      }
      return {
        id: base.id,
        alimento: base.alimento,
        calorias: base.calorias,
        proteinas: base.proteina,
        grasas: base.grasa,
        carbohidratos: base.carbohidratos,
        fibra: base.fibra
      };
    }).filter(function (f) { return f; });

    return {
      clave: grupo.clave,
      nombre: grupo.nombre,
      proporcion: grupo.proporcion,
      color: grupo.color,
      icono: grupo.icono,
      descripcion: grupo.descripcion,
      alimentos: filas
    };
  });

  return { grupos: grupos, limitar: LIMITAR_MILPA };
}
