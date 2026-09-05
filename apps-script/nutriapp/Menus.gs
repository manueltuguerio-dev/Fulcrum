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
    },
    {
      nombre: 'Molletes integrales con frijol',
      descripcion: 'Pan integral tostado con frijoles refritos sin manteca, queso panela gratinado y pico de gallo encima.',
      alternativa: 'Sin queso y con aguacate rebanado queda igual de saciante.',
      ingredientes: [
        ['Pan integral de trigo', 60],
        ['Frijol negro cocido', 100],
        ['Queso panela', 30],
        ['Jitomate', 60],
        ['Cebolla', 20]
      ]
    },
    {
      nombre: 'Licuado verde con avena y amaranto',
      descripcion: 'Leche de soya licuada con espinaca, plátano y avena, con amaranto encima. Se prepara en tres minutos y se lleva en el camino.',
      alternativa: 'Cambia el plátano por media manzana si quieres menos azúcar natural.',
      ingredientes: [
        ['Leche de soya sin azúcar', 250],
        ['Espinaca cruda', 40],
        ['Plátano', 80],
        ['Avena en hojuelas (cruda)', 30],
        ['Amaranto tostado', 15]
      ]
    },
    {
      nombre: 'Quesadillas de nopal al comal',
      descripcion: 'Tortillas de maíz con nopal asado y queso panela, sin freír, con salsa verde al gusto.',
      alternativa: 'Rellena con flor de calabaza o huauzontle cuando sea temporada.',
      ingredientes: [
        ['Tortilla de maíz nixtamalizado', 60],
        ['Nopal cocido', 120],
        ['Queso panela', 50],
        ['Salsa verde cocida', 50]
      ]
    },
    {
      nombre: 'Yogur griego con papaya y chía',
      descripcion: 'Yogur griego natural con papaya en cubos, chía y amaranto tostado. Alto en proteína y muy rápido.',
      alternativa: 'La guayaba en lugar de papaya duplica la fibra.',
      ingredientes: [
        ['Yogur griego natural sin azúcar', 180],
        ['Papaya', 150],
        ['Semilla de chía', 12],
        ['Amaranto tostado', 15]
      ]
    },
    {
      nombre: 'Enfrijoladas con pollo',
      descripcion: 'Tortillas bañadas en frijol licuado con pechuga deshebrada, cebolla y queso panela espolvoreado.',
      alternativa: 'Rellénalas de soya texturizada para una versión sin carne.',
      ingredientes: [
        ['Tortilla de maíz nixtamalizado', 90],
        ['Frijol negro cocido', 120],
        ['Pechuga de pollo sin piel cocida', 70],
        ['Queso panela', 25],
        ['Cebolla', 20]
      ]
    },
    {
      nombre: 'Huevos con nopal y frijoles',
      descripcion: 'Huevo revuelto con nopalitos y salsa mexicana, acompañado de frijoles de la olla y tortilla.',
      alternativa: 'Una pieza entera más dos claras baja la grasa sin perder proteína.',
      ingredientes: [
        ['Huevo entero cocido', 100],
        ['Nopal cocido', 120],
        ['Frijol bayo cocido', 90],
        ['Tortilla de maíz nixtamalizado', 60],
        ['Salsa mexicana fresca', 40]
      ]
    },
    {
      nombre: 'Atole de masa con guayaba y pepitas',
      descripcion: 'Atole de masa sin azúcar con guayaba partida y pepitas de calabaza. Desayuno caliente y muy de la milpa.',
      alternativa: 'Endúlzalo con la fruta, no con azúcar: la guayaba basta.',
      ingredientes: [
        ['Atole de masa sin azúcar', 300],
        ['Guayaba', 120],
        ['Pepita de calabaza', 20]
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
    },
    {
      nombre: 'Caldo tlalpeño con garbanzo',
      descripcion: 'Caldo de verduras con garbanzo, pollo deshebrado, zanahoria y chile chipotle, con aguacate al servir.',
      alternativa: 'Sin pollo y con doble garbanzo queda igual de completo.',
      ingredientes: [
        ['Caldo de verduras desgrasado', 300],
        ['Garbanzo cocido', 120],
        ['Pechuga de pollo sin piel cocida', 90],
        ['Zanahoria', 60],
        ['Chile jalapeño', 15],
        ['Aguacate', 40]
      ]
    },
    {
      nombre: 'Tacos de tofu con verdolagas',
      descripcion: 'Tofu desmenuzado guisado con jitomate y cebolla, servido con verdolagas y tortillas de maíz.',
      alternativa: 'Los quelites o el huauzontle funcionan igual que las verdolagas.',
      ingredientes: [
        ['Tofu firme', 150],
        ['Verdolagas cocidas', 120],
        ['Jitomate', 90],
        ['Cebolla', 30],
        ['Tortilla de maíz nixtamalizado', 90],
        ['Aceite de canola', 6]
      ]
    },
    {
      nombre: 'Chiles rellenos de frijol al horno',
      descripcion: 'Chiles poblanos asados y rellenos de frijol con queso panela, en caldillo de jitomate, con arroz integral.',
      alternativa: 'Al horno y no capeados: ahorra la mitad de la grasa.',
      ingredientes: [
        ['Chile poblano', 150],
        ['Frijol bayo cocido', 120],
        ['Queso panela', 50],
        ['Jitomate', 100],
        ['Arroz integral cocido', 100]
      ]
    },
    {
      nombre: 'Ensalada de quinoa con edamame',
      descripcion: 'Quinoa fría con edamame, jitomate, pepino y aguacate, aliñada con limón y aceite de oliva.',
      alternativa: 'Se prepara la noche anterior y se lleva al trabajo.',
      ingredientes: [
        ['Quinoa cocida', 150],
        ['Edamame cocido', 100],
        ['Jitomate', 80],
        ['Pepino con cáscara', 80],
        ['Aguacate', 40],
        ['Aceite de oliva', 7],
        ['Jugo de limón', 15]
      ]
    },
    {
      nombre: 'Pescado a la veracruzana',
      descripcion: 'Tilapia en salsa de jitomate con cebolla y aceitunas, acompañada de arroz integral y calabacitas.',
      alternativa: 'El salmón sube el omega 3 si el presupuesto lo permite.',
      ingredientes: [
        ['Tilapia cocida', 150],
        ['Jitomate', 120],
        ['Cebolla', 30],
        ['Aceite de oliva', 7],
        ['Arroz integral cocido', 120],
        ['Calabacita', 100]
      ]
    },
    {
      nombre: 'Mole de olla vegetariano',
      descripcion: 'Caldo de chile guajillo con elote, calabacita, chayote, ejote y frijol ayocote. La milpa entera en un plato.',
      alternativa: 'Agrega 100 g de tofu si quieres subir la proteína.',
      ingredientes: [
        ['Caldo de verduras desgrasado', 300],
        ['Elote en grano cocido', 100],
        ['Calabacita', 100],
        ['Chayote', 80],
        ['Ejote cocido', 80],
        ['Frijol ayocote cocido', 120],
        ['Tortilla de maíz nixtamalizado', 60]
      ]
    },
    {
      nombre: 'Huauzontles al horno con frijoles',
      descripcion: 'Huauzontles con queso panela, gratinados al horno en lugar de capeados, en salsa verde y con frijoles de la olla.',
      alternativa: 'Fuera de temporada, el brócoli o los quelites lo sustituyen.',
      ingredientes: [
        ['Huauzontle cocido', 150],
        ['Queso panela', 50],
        ['Frijol negro cocido', 120],
        ['Salsa verde cocida', 80],
        ['Tortilla de maíz nixtamalizado', 60]
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
    },
    {
      nombre: 'Sopa de tortilla ligera',
      descripcion: 'Caldillo de jitomate con tiras de tortilla horneada, queso panela y aguacate. Sin freír la tortilla.',
      alternativa: 'Agrega 80 g de pollo deshebrado si vas a entrenar mañana temprano.',
      ingredientes: [
        ['Caldo de verduras desgrasado', 300],
        ['Jitomate', 120],
        ['Tostada de maíz horneada', 30],
        ['Queso panela', 40],
        ['Aguacate', 30]
      ]
    },
    {
      nombre: 'Tostadas de ceviche de soya',
      descripcion: 'Soya texturizada hidratada marinada en limón con jitomate, cebolla y cilantro, sobre tostada horneada.',
      alternativa: 'Sirve en hoja de lechuga si quieres bajar el carbohidrato.',
      ingredientes: [
        ['Soya texturizada hidratada', 120],
        ['Jitomate', 80],
        ['Cebolla', 25],
        ['Jugo de limón', 20],
        ['Cilantro fresco', 5],
        ['Tostada de maíz horneada', 25],
        ['Aguacate', 30]
      ]
    },
    {
      nombre: 'Calabacitas rellenas de requesón',
      descripcion: 'Calabacitas horneadas rellenas de requesón con elote y jitomate, con una tortilla de maíz.',
      alternativa: 'El requesón se puede cambiar por tofu desmenuzado.',
      ingredientes: [
        ['Calabacita', 200],
        ['Requesón', 100],
        ['Elote en grano cocido', 60],
        ['Jitomate', 60],
        ['Tortilla de maíz nixtamalizado', 30]
      ]
    },
    {
      nombre: 'Ensalada de garbanzo con espinaca',
      descripcion: 'Garbanzo con espinaca, jitomate y pepino, con limón y aceite de oliva. Fría, rápida y con mucha fibra.',
      alternativa: 'La lenteja funciona igual y sale más barata.',
      ingredientes: [
        ['Garbanzo cocido', 150],
        ['Espinaca cruda', 60],
        ['Jitomate', 80],
        ['Pepino con cáscara', 80],
        ['Aceite de oliva', 7],
        ['Jugo de limón', 15]
      ]
    },
    {
      nombre: 'Omelette de claras con champiñones',
      descripcion: 'Claras batidas con champiñones salteados y espinaca, con un poco de queso panela y una tortilla.',
      alternativa: 'Una yema entera aporta vitaminas sin cambiar mucho las calorías.',
      ingredientes: [
        ['Clara de huevo', 180],
        ['Champiñón', 100],
        ['Espinaca cruda', 50],
        ['Queso panela', 40],
        ['Tortilla de maíz nixtamalizado', 60]
      ]
    },
    {
      nombre: 'Crema de calabacita con pepitas',
      descripcion: 'Calabacita licuada con leche de soya y cebolla, con pepitas tostadas encima. Cena caliente y muy ligera.',
      alternativa: 'Sirve con una tortilla si te quedas con hambre.',
      ingredientes: [
        ['Calabacita', 250],
        ['Leche de soya sin azúcar', 150],
        ['Cebolla', 30],
        ['Pepita de calabaza', 20],
        ['Tortilla de maíz nixtamalizado', 30]
      ]
    },
    {
      nombre: 'Sardinas con ensalada de nopal',
      descripcion: 'Sardinas en agua sobre ensalada de nopal con jitomate, cebolla y cilantro. Omega 3 y calcio a bajo costo.',
      alternativa: 'El atún en agua sirve igual si la sardina no te gusta.',
      ingredientes: [
        ['Sardina en agua drenada', 100],
        ['Nopal cocido', 150],
        ['Jitomate', 80],
        ['Cebolla', 25],
        ['Cilantro fresco', 5],
        ['Tostada de maíz horneada', 25]
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
    },
    {
      nombre: 'Tuna con pepitas de calabaza',
      descripcion: 'Tuna fría partida en cubos con un puño de pepitas tostadas. Fruta de temporada con grasa buena.',
      alternativa: 'El zapote negro o la ciruela funcionan igual.',
      ingredientes: [
        ['Tuna', 150],
        ['Pepita de calabaza', 15]
      ]
    },
    {
      nombre: 'Edamame al vapor con limón',
      descripcion: 'Edamame al vapor con limón y chile en polvo. Proteína vegetal y fibra para el antojo de la tarde.',
      alternativa: 'Un puño de cacahuates naturales resuelve lo mismo.',
      ingredientes: [
        ['Edamame cocido', 120],
        ['Jugo de limón', 10],
        ['Chile en polvo', 2]
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

/* ===================================================================
   ROTACIÓN DE SUGERENCIAS
   =================================================================== */

/** Cada cuántos días cambian los platillos destacados. */
var DIAS_ROTACION = 3;

/** Cuántos se destacan por tiempo de comida. Los demás siguen disponibles. */
var DESTACADOS_POR_TIEMPO = 3;

/**
 * Número del periodo de rotación al que pertenece una fecha.
 *
 * Se cuenta desde la época de Unix en bloques de tres días, así que cambia solo
 * y de golpe para todos los pacientes, sin necesidad de guardar nada ni de
 * correr un activador. Dos personas que abran la app el mismo día ven lo mismo.
 *
 * @param {Date=} fecha La fecha a evaluar; por omisión, hoy.
 * @return {number} El número de periodo.
 */
function periodoRotacion_(fecha) {
  var dia = Math.floor((fecha || new Date()).getTime() / (24 * 60 * 60 * 1000));
  return Math.floor(dia / DIAS_ROTACION);
}

/**
 * Elige qué platillos destacar en el periodo actual.
 *
 * Recorre la lista con un paso de 3 posiciones por periodo. Como 3 y 10 no
 * tienen divisores comunes, la ventana pasa por todas las combinaciones antes
 * de repetirse: variedad real, no un azar que a veces repite lo de ayer.
 *
 * @param {number} total Cuántos platillos hay en la lista.
 * @param {number} cuantos Cuántos destacar.
 * @param {number} periodo El número de periodo.
 * @return {Array<number>} Los índices destacados.
 */
function indicesDestacados_(total, cuantos, periodo) {
  if (total <= cuantos) {
    var todos = [];
    for (var t = 0; t < total; t++) { todos.push(t); }
    return todos;
  }

  var inicio = (periodo * 3) % total;
  var indices = [];
  for (var i = 0; i < cuantos; i++) {
    indices.push((inicio + i) % total);
  }
  return indices;
}

/**
 * Cuándo cambia la próxima tanda de sugerencias.
 * @param {Date=} fecha La fecha de referencia.
 * @return {string} La fecha del siguiente cambio, en formato aaaa-mm-dd.
 */
function proximaRotacion_(fecha) {
  var base = fecha || new Date();
  var dia = Math.floor(base.getTime() / (24 * 60 * 60 * 1000));
  var diasRestantes = DIAS_ROTACION - (dia % DIAS_ROTACION);
  var siguiente = new Date(base.getTime() + diasRestantes * 24 * 60 * 60 * 1000);
  return aFechaISO_(siguiente);
}
