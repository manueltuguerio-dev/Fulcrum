/**
 * NutriApp · Fulcrum
 * Platillos mexicanos prediseñados, tres por cada tiempo de comida.
 *
 * Cada ingrediente se declara como [nombre del alimento, gramos]. El nombre
 * tiene que coincidir con la columna Alimento de la pestaña Alimentos_100g:
 * las calorías y los macros se calculan desde ahí, así que nunca quedan
 * desfasados si corriges el catálogo.
 *
 * Los gramajes buscan un desayuno o cena de 350 a 450 kcal, una comida de 500
 * a 600 y una colación de 150 a 250, para que las tres comidas más una o dos
 * colaciones caigan cerca de las 1,700 kcal de la meta base.
 */

var PLATILLOS_MEXICANOS = {
  Desayuno: [
    {
      nombre: 'Avena cocida con manzana y canela',
      descripcion: 'Avena hervida en leche de soya, con manzana en cubos, canela y una cucharada de linaza. Fibra soluble que sostiene la saciedad toda la mañana.',
      alternativa: 'Cambia la manzana por guayaba o fresas si quieres menos carbohidrato.',
      ingredientes: [
        ['Avena en hojuelas (cruda)', 50],
        ['Leche de soya sin azúcar', 200],
        ['Manzana con cáscara', 120],
        ['Linaza molida', 10]
      ]
    },
    {
      nombre: 'Chilaquiles ligeros con pollo',
      descripcion: 'Tostadas de maíz horneadas, no fritas, con salsa verde cocida, pechuga deshebrada, queso panela y cebolla. Todo el sabor sin el aceite de la fritura.',
      alternativa: 'Versión sin carne: cambia el pollo por 100 g de tofu firme desmenuzado.',
      ingredientes: [
        ['Tostada de maíz horneada', 40],
        ['Salsa verde cocida', 120],
        ['Pechuga de pollo sin piel cocida', 80],
        ['Queso panela', 30],
        ['Cebolla', 20],
        ['Cilantro fresco', 5]
      ]
    },
    {
      nombre: 'Huevo a la mexicana con frijoles',
      descripcion: 'Dos huevos revueltos con jitomate, cebolla y chile serrano, acompañados de frijoles de la olla y dos tortillas de maíz.',
      alternativa: 'Usa una pieza entera y dos claras para bajar la grasa sin perder proteína.',
      ingredientes: [
        ['Huevo entero cocido', 100],
        ['Jitomate', 60],
        ['Cebolla', 20],
        ['Chile serrano', 10],
        ['Frijol negro cocido', 90],
        ['Tortilla de maíz nixtamalizado', 60],
        ['Aceite de canola', 3]
      ]
    }
  ],

  Comida: [
    {
      nombre: 'Tacos de nopal con frijol y aguacate',
      descripcion: 'Nopales asados con cebolla, frijoles de la olla, aguacate en rebanadas y salsa mexicana sobre tortillas de maíz. Fibra, grasa insaturada y proteína vegetal en un solo plato.',
      alternativa: 'Agrega 60 g de queso panela si quieres subir la proteína.',
      ingredientes: [
        ['Nopal cocido', 150],
        ['Frijol bayo cocido', 120],
        ['Aguacate', 50],
        ['Tortilla de maíz nixtamalizado', 90],
        ['Cebolla', 25],
        ['Salsa mexicana fresca', 40],
        ['Jugo de limón', 10]
      ]
    },
    {
      nombre: 'Pechuga a la plancha con arroz integral',
      descripcion: 'Pechuga al comal con un toque de aceite de oliva, arroz integral y una guarnición generosa de calabacita, zanahoria y brócoli al vapor.',
      alternativa: 'Cambia la pechuga por tilapia o salmón para sumar omega 3.',
      ingredientes: [
        ['Pechuga de pollo sin piel cocida', 120],
        ['Arroz integral cocido', 150],
        ['Calabacita', 80],
        ['Zanahoria', 60],
        ['Brócoli cocido', 80],
        ['Aceite de oliva', 7]
      ]
    },
    {
      nombre: 'Tinga de soya texturizada',
      descripcion: 'Soya texturizada hidratada guisada con jitomate, cebolla y chipotle, servida con tortillas de maíz y calabacitas al vapor. Sale más barata que la carne y aporta la misma proteína.',
      alternativa: 'Sirve sobre tostadas horneadas con lechuga y un poco de requesón.',
      ingredientes: [
        ['Soya texturizada hidratada', 150],
        ['Jitomate', 100],
        ['Cebolla', 30],
        ['Chile poblano', 40],
        ['Tortilla de maíz nixtamalizado', 90],
        ['Calabacita', 100],
        ['Aceite de canola', 7]
      ]
    }
  ],

  Cena: [
    {
      nombre: 'Ensalada de atún con tostada horneada',
      descripcion: 'Atún en agua con pepino, jitomate, cebolla morada y cilantro, con limón y una tostada horneada. Ligera, alta en proteína y se arma en cinco minutos.',
      alternativa: 'Agrega 40 g de aguacate si te quedas con hambre.',
      ingredientes: [
        ['Atún en agua drenado', 100],
        ['Pepino con cáscara', 100],
        ['Jitomate', 80],
        ['Cebolla', 20],
        ['Cilantro fresco', 5],
        ['Tostada de maíz horneada', 25],
        ['Jugo de limón', 15],
        ['Aceite de oliva', 5]
      ]
    },
    {
      nombre: 'Sopa de lentejas con nopal',
      descripcion: 'Lentejas cocidas con nopal, jitomate y zanahoria en caldo de verduras. Una cena caliente con mucha fibra y muy poca grasa.',
      alternativa: 'Acompáñala con una tortilla de maíz si vas a entrenar en la mañana.',
      ingredientes: [
        ['Lenteja cocida', 180],
        ['Nopal cocido', 100],
        ['Jitomate', 60],
        ['Zanahoria', 50],
        ['Caldo de verduras desgrasado', 200],
        ['Aceite de oliva', 5]
      ]
    },
    {
      nombre: 'Tofu al comal con ejotes',
      descripcion: 'Tofu firme dorado al comal con salsa verde, ejotes al vapor y una tortilla de maíz. Proteína vegetal completa y muy baja carga calórica.',
      alternativa: 'Cambia el tofu por 100 g de queso panela asado.',
      ingredientes: [
        ['Tofu firme', 150],
        ['Ejote cocido', 120],
        ['Salsa verde cocida', 60],
        ['Tortilla de maíz nixtamalizado', 30],
        ['Aceite de canola', 5]
      ]
    }
  ],

  Colacion: [
    {
      nombre: 'Yogur griego con fresas y chía',
      descripcion: 'Yogur griego natural sin azúcar con fresas partidas y una cucharadita de chía. Proteína y fibra que cortan el antojo de la tarde.',
      alternativa: 'Cambia las fresas por papaya o guayaba.',
      ingredientes: [
        ['Yogur griego natural sin azúcar', 150],
        ['Fresa', 100],
        ['Semilla de chía', 10]
      ]
    },
    {
      nombre: 'Manzana con crema de cacahuate',
      descripcion: 'Manzana en gajos con una cucharada de crema de cacahuate natural, sin azúcar añadida. Dulce, saciante y portátil.',
      alternativa: 'Si la crema de cacahuate no está a la mano, usa 15 g de almendras.',
      ingredientes: [
        ['Manzana con cáscara', 150],
        ['Crema de cacahuate natural', 15]
      ]
    },
    {
      nombre: 'Jícama y pepino con limón y chile',
      descripcion: 'Bastones de jícama y pepino con limón y chile en polvo, más un puño de almendras. Volumen alto con muy pocas calorías.',
      alternativa: 'Agrega zanahoria en bastones para variar la textura.',
      ingredientes: [
        ['Jícama', 150],
        ['Pepino con cáscara', 100],
        ['Jugo de limón', 15],
        ['Almendra', 15]
      ]
    }
  ]
};

/**
 * Los cuatro tiempos de comida, en el orden en que aparecen en la interfaz.
 * @return {Array<string>} Los nombres de los tiempos de comida.
 */
function getTiemposComida() {
  return ['Desayuno', 'Comida', 'Cena', 'Colacion'];
}
