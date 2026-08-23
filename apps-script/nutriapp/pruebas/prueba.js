/**
 * Pruebas del backend de NutriApp.
 *
 *   node apps-script/nutriapp/pruebas/prueba.js
 *
 * Carga los archivos .gs dentro de un contexto con los servicios de Google
 * simulados y ejercita los caminos que importan: arranque de la base, login,
 * registro de comidas, cálculo de Katch-McArdle, ajuste mensual del déficit,
 * OCR guardado en Drive, chat con alerta y panel del nutriólogo.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { contexto, efectos, reiniciar } = require('./simulador');

const RAIZ = path.join(__dirname, '..');
const ARCHIVOS = ['Code.gs', 'Datos.gs', 'Auth.gs', 'KatchMcArdle.gs', 'Menus.gs', 'MetaWhatsApp.gs', 'Api.gs'];

const sandbox = vm.createContext(Object.assign({ console }, contexto));
ARCHIVOS.forEach((archivo) => {
  vm.runInContext(fs.readFileSync(path.join(RAIZ, archivo), 'utf8'), sandbox, { filename: archivo });
});

/* ---------- Marco de pruebas ---------- */

let pasadas = 0;
let falladas = 0;
const fallos = [];

function prueba(nombre, fn) {
  try {
    fn();
    pasadas++;
    console.log('  ✓ ' + nombre);
  } catch (err) {
    falladas++;
    fallos.push({ nombre, error: err });
    console.log('  ✗ ' + nombre);
    console.log('      ' + err.message);
  }
}

function grupo(nombre) { console.log('\n' + nombre); }

function igual(actual, esperado, mensaje) {
  if (actual !== esperado) {
    throw new Error((mensaje || 'Valores distintos') + ': esperaba ' + JSON.stringify(esperado) + ', llegó ' + JSON.stringify(actual));
  }
}

function cerca(actual, esperado, tolerancia, mensaje) {
  if (Math.abs(actual - esperado) > tolerancia) {
    throw new Error((mensaje || 'Fuera de tolerancia') + ': esperaba ~' + esperado + ', llegó ' + actual);
  }
}

function cierto(condicion, mensaje) {
  if (!condicion) { throw new Error(mensaje || 'Se esperaba verdadero'); }
}

function lanza(fn, fragmento, mensaje) {
  try {
    fn();
  } catch (err) {
    if (fragmento && err.message.toLowerCase().indexOf(fragmento.toLowerCase()) < 0) {
      throw new Error('El error no menciona "' + fragmento + '": ' + err.message);
    }
    return;
  }
  throw new Error(mensaje || 'Se esperaba un error y no ocurrió');
}

function haceDias(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return sandbox.aFechaISO_(d);
}

/* ================= ARRANQUE ================= */

grupo('Arranque de la base de datos');

let resumenSetup;
prueba('setupDatabase crea todas las pestañas del esquema', () => {
  resumenSetup = sandbox.setupDatabase();
  const libro = sandbox.obtenerHojaCalculo_();
  Object.keys(sandbox.ESQUEMA).forEach((nombre) => {
    cierto(libro.getSheetByName(nombre), 'Falta la pestaña ' + nombre);
  });
});

prueba('carga el catálogo de alimentos', () => {
  cierto(resumenSetup.alimentosCargados > 70, 'Se cargaron muy pocos alimentos: ' + resumenSetup.alimentosCargados);
});

prueba('carga la biblioteca de evidencia con los cinco temas de la guía', () => {
  const temas = sandbox.leerTabla_('Evidencia_Cientifica').map((e) => e.Tema);
  ['Bebidas acalóricas', 'Aceite vegetal insaturado', 'Fibra dietética', 'Soya texturizada', 'Mito de la sobreproteína']
    .forEach((tema) => cierto(temas.indexOf(tema) >= 0, 'Falta el tema ' + tema));
});

prueba('es idempotente: correrla dos veces no duplica alimentos', () => {
  const antes = sandbox.leerTabla_('Alimentos_100g').length;
  sandbox.setupDatabase();
  igual(sandbox.leerTabla_('Alimentos_100g').length, antes, 'Se duplicaron alimentos');
});

prueba('crea el usuario nutriólogo con contraseña temporal', () => {
  cierto(resumenSetup.nutriologo.passwordTemporal, 'No se generó contraseña temporal');
  igual(resumenSetup.nutriologo.email, 'nutriologo@ejemplo.com');
});

/* ================= AUTENTICACIÓN ================= */

grupo('Autenticación');

let sesionNutriologo;
prueba('el nutriólogo entra con su contraseña temporal', () => {
  sesionNutriologo = sandbox.loginUser('nutriologo@ejemplo.com', resumenSetup.nutriologo.passwordTemporal);
  igual(sesionNutriologo.rol, 'Nutriologo');
  cierto(sesionNutriologo.token, 'No llegó token');
});

prueba('la contraseña no queda legible en la hoja', () => {
  const usuario = sandbox.buscarUsuarioPorEmail_('nutriologo@ejemplo.com');
  cierto(usuario.PasswordHash.indexOf(resumenSetup.nutriologo.passwordTemporal) < 0, 'La contraseña está en claro');
  cierto(usuario.PasswordHash.split(':').length === 2, 'El formato salt:hash no es el esperado');
});

prueba('dos usuarios con la misma contraseña producen hashes distintos', () => {
  const a = sandbox.generarHash_('MismaClave123');
  const b = sandbox.generarHash_('MismaClave123');
  cierto(a !== b, 'La sal no está variando');
  cierto(sandbox.verificarPassword_('MismaClave123', a), 'No verifica su propio hash');
});

prueba('rechaza contraseña incorrecta', () => {
  lanza(() => sandbox.loginUser('nutriologo@ejemplo.com', 'equivocada'), 'incorrectos');
});

prueba('rechaza correo inexistente sin revelar que no existe', () => {
  lanza(() => sandbox.loginUser('nadie@ejemplo.com', 'loquesea'), 'incorrectos');
});

prueba('el correo no distingue mayúsculas ni espacios', () => {
  const s = sandbox.loginUser('  NUTRIOLOGO@Ejemplo.com  ', resumenSetup.nutriologo.passwordTemporal);
  igual(s.rol, 'Nutriologo');
});

prueba('un token inventado no abre sesión', () => {
  lanza(() => sandbox.requerirSesion_('token-falso'), 'no es válida');
});

prueba('recoverPassword responde igual exista o no el correo', () => {
  const a = sandbox.recoverPassword('nutriologo@ejemplo.com');
  const b = sandbox.recoverPassword('fantasma@ejemplo.com');
  igual(a.mensaje, b.mensaje, 'El mensaje delata quién está registrado');
});

prueba('el correo de recuperación sale con plantilla HTML', () => {
  reiniciar();
  sandbox.recoverPassword('nutriologo@ejemplo.com');
  igual(efectos.correos.length, 1);
  cierto(efectos.correos[0].opciones.htmlBody.indexOf('<div') === 0, 'No llegó cuerpo HTML');
});

prueba('resetPassword cambia la contraseña con el token del correo', () => {
  sandbox.recoverPassword('nutriologo@ejemplo.com');
  const token = sandbox.leerTabla_('Sesiones').filter((s) => s.Tipo === 'recuperacion').pop().Token;
  sandbox.resetPassword(token, 'ClaveNueva2026');
  const s = sandbox.loginUser('nutriologo@ejemplo.com', 'ClaveNueva2026');
  igual(s.rol, 'Nutriologo');
  sesionNutriologo = s;
});

prueba('el token de recuperación no sirve dos veces', () => {
  sandbox.recoverPassword('nutriologo@ejemplo.com');
  const token = sandbox.leerTabla_('Sesiones').filter((s) => s.Tipo === 'recuperacion').pop().Token;
  sandbox.resetPassword(token, 'OtraClave2026');
  lanza(() => sandbox.resetPassword(token, 'TerceraClave2026'), 'ya no sirve');
  sesionNutriologo = sandbox.loginUser('nutriologo@ejemplo.com', 'OtraClave2026');
});

prueba('rechaza contraseñas de menos de 8 caracteres', () => {
  sandbox.recoverPassword('nutriologo@ejemplo.com');
  const token = sandbox.leerTabla_('Sesiones').filter((s) => s.Tipo === 'recuperacion').pop().Token;
  lanza(() => sandbox.resetPassword(token, 'corta'), '8 caracteres');
});

/* ================= ALTA DE PACIENTE ================= */

grupo('Alta de paciente');

let idPaciente;
let sesionPaciente;

prueba('el nutriólogo da de alta un paciente', () => {
  reiniciar();
  const res = sandbox.crearPaciente(sesionNutriologo.token, {
    nombre: 'María López',
    email: 'maria@ejemplo.com',
    estatura: 162,
    sexo: 'Mujer',
    factorActividad: 1.375
  });
  idPaciente = res.idPaciente;
  sesionPaciente = sandbox.loginUser('maria@ejemplo.com', res.passwordTemporal);
  igual(sesionPaciente.rol, 'Paciente');
});

prueba('le llega su correo de bienvenida', () => {
  igual(efectos.correos.length, 1);
  igual(efectos.correos[0].para, 'maria@ejemplo.com');
});

prueba('no acepta dos cuentas con el mismo correo', () => {
  lanza(() => sandbox.crearPaciente(sesionNutriologo.token, { nombre: 'Otra', email: 'maria@ejemplo.com' }), 'ya hay una cuenta');
});

prueba('un paciente no puede dar de alta pacientes', () => {
  lanza(() => sandbox.crearPaciente(sesionPaciente.token, { nombre: 'X', email: 'x@ejemplo.com' }), 'permiso');
});

prueba('un paciente no puede listar pacientes', () => {
  lanza(() => sandbox.listarPacientes(sesionPaciente.token), 'permiso');
});

/* ================= KATCH-MCARDLE ================= */

grupo('Cálculo de Katch-McArdle');

prueba('aplica la fórmula 370 + 21.6 × masa libre de grasa', () => {
  igual(sandbox.calcularTMB(60), 370 + 21.6 * 60);
  igual(sandbox.calcularTMB(50), 1450);
});

prueba('deriva la masa libre de grasa del peso y el porcentaje de grasa', () => {
  igual(sandbox.calcularMasaLibreGrasa(80, 25), 60);
  cerca(sandbox.calcularMasaLibreGrasa(72.5, 32.4), 49.01, 0.02);
});

prueba('rechaza porcentajes de grasa imposibles', () => {
  lanza(() => sandbox.calcularMasaLibreGrasa(80, 100), 'entre 0 y 100');
  lanza(() => sandbox.calcularMasaLibreGrasa(80, -5), 'entre 0 y 100');
});

prueba('rechaza masa libre de grasa en cero', () => {
  lanza(() => sandbox.calcularTMB(0), 'mayor que cero');
});

prueba('el gasto total multiplica la TMB por el factor de actividad', () => {
  igual(sandbox.calcularGET(1500, 1.375), 2063);
  igual(sandbox.calcularGET(1500, 'sedentario'), 1800);
});

prueba('la proteína objetivo es 1.0 g por kilo de peso total', () => {
  const macros = sandbox.repartirMacros(1700, 72.5);
  igual(macros.proteinas_g, 73, 'La proteína no sigue el gramaje por peso');
});

prueba('el método del plato reparte 60 / 20 / 20', () => {
  const macros = sandbox.repartirMacros(2000, 0);
  igual(macros.carbohidratos_g, 300, 'Carbohidratos: 2000 × .60 / 4');
  igual(macros.proteinaSegunPlato_g, 100, 'Proteínas: 2000 × .20 / 4');
  igual(macros.grasas_g, 44, 'Grasas: 2000 × .20 / 9');
});

prueba('avisa cuando el gramaje por peso se aparta del 20 % del plato', () => {
  const macros = sandbox.repartirMacros(1700, 55);
  cierto(macros.nota.length > 0, 'No se generó la nota');
  cierto(macros.nota.indexOf('no aporta beneficio') >= 0, 'La nota no explica el mito de la sobreproteína');
});

/* ================= PLAN MENSUAL ================= */

grupo('Ajuste mensual del déficit');

prueba('sin mediciones usa la meta base de 1,700 kcal', () => {
  const plan = sandbox.obtenerPlanCaloricoMensual(idPaciente);
  igual(plan.caloriasObjetivo, 1700);
  igual(plan.estado, 'sin-datos');
});

prueba('con una sola medición sostiene la meta y no ajusta', () => {
  sandbox.guardarMetricas(sesionPaciente.token, {
    fecha: haceDias(60), peso: 78, porcentajeGrasa: 34, masaMuscular: 48, agua: 50
  });
  const plan = sandbox.obtenerPlanCaloricoMensual(idPaciente);
  igual(plan.estado, 'inicio');
  cerca(plan.tmb, sandbox.calcularTMB(sandbox.calcularMasaLibreGrasa(78, 34)), 1);
});

prueba('no ajusta si pasaron menos de siete días', () => {
  sandbox.guardarMetricas(sesionPaciente.token, { fecha: haceDias(57), peso: 77.8, porcentajeGrasa: 34, masaMuscular: 48 });
  igual(sandbox.obtenerPlanCaloricoMensual(idPaciente).estado, 'muy-pronto');
});

prueba('una pérdida dentro del rango sostenible mantiene la meta', () => {
  sandbox.guardarMetricas(sesionPaciente.token, { fecha: haceDias(30), peso: 75.8, porcentajeGrasa: 33, masaMuscular: 48 });
  const plan = sandbox.obtenerPlanCaloricoMensual(idPaciente);
  igual(plan.estado, 'en-rango');
  igual(plan.ajusteKcal, 0);
  cierto(plan.perdidaSemanal_kg >= 0.3 && plan.perdidaSemanal_kg <= 0.7, 'Pérdida fuera del rango: ' + plan.perdidaSemanal_kg);
});

prueba('un estancamiento recorta 100 kcal', () => {
  sandbox.guardarMetricas(sesionPaciente.token, { fecha: haceDias(1), peso: 75.8, porcentajeGrasa: 33, masaMuscular: 48 });
  const plan = sandbox.obtenerPlanCaloricoMensual(idPaciente);
  igual(plan.estado, 'estancado');
  cierto(plan.ajusteKcal < 0, 'No recortó calorías');
});

prueba('bajar demasiado rápido sube las calorías', () => {
  const otra = sandbox.crearPaciente(sesionNutriologo.token, { nombre: 'Rápido', email: 'rapido@ejemplo.com' });
  const s = sandbox.loginUser('rapido@ejemplo.com', otra.passwordTemporal);
  sandbox.guardarMetricas(s.token, { fecha: haceDias(30), peso: 90, porcentajeGrasa: 30, masaMuscular: 60 });
  sandbox.guardarMetricas(s.token, { fecha: haceDias(2), peso: 84, porcentajeGrasa: 29, masaMuscular: 60 });
  const plan = sandbox.obtenerPlanCaloricoMensual(otra.idPaciente);
  igual(plan.estado, 'muy-rapido');
  cierto(plan.ajusteKcal > 0, 'No subió las calorías');
});

prueba('perder masa muscular manda subir las calorías aunque el peso baje bien', () => {
  const otra = sandbox.crearPaciente(sesionNutriologo.token, { nombre: 'Músculo', email: 'musculo@ejemplo.com' });
  const s = sandbox.loginUser('musculo@ejemplo.com', otra.passwordTemporal);
  sandbox.guardarMetricas(s.token, { fecha: haceDias(30), peso: 85, porcentajeGrasa: 28, masaMuscular: 58 });
  sandbox.guardarMetricas(s.token, { fecha: haceDias(2), peso: 83, porcentajeGrasa: 28, masaMuscular: 56.5 });
  const plan = sandbox.obtenerPlanCaloricoMensual(otra.idPaciente);
  igual(plan.estado, 'perdiendo-musculo');
  cierto(plan.diagnostico.indexOf('fuerza') >= 0, 'No recomienda entrenamiento de fuerza');
});

prueba('la meta nunca queda por debajo de la TMB', () => {
  const otra = sandbox.crearPaciente(sesionNutriologo.token, { nombre: 'Piso', email: 'piso@ejemplo.com' });
  const s = sandbox.loginUser('piso@ejemplo.com', otra.passwordTemporal);
  /* Una persona grande tiene una TMB por encima de la meta base: la cota
     tiene que levantar el objetivo en lugar de dejarlo en 1,700. */
  sandbox.guardarMetricas(s.token, { fecha: haceDias(40), peso: 120, porcentajeGrasa: 30, masaMuscular: 80 });
  sandbox.guardarMetricas(s.token, { fecha: haceDias(2), peso: 120, porcentajeGrasa: 30, masaMuscular: 80 });
  const plan = sandbox.obtenerPlanCaloricoMensual(otra.idPaciente);
  cierto(plan.caloriasObjetivo >= plan.tmb, 'La meta ' + plan.caloriasObjetivo + ' quedó bajo la TMB ' + plan.tmb);
  cierto(plan.diagnostico.indexOf('déficit deja de ser lento') >= 0, 'No explica por qué levantó la meta');
});

prueba('leer el plan muchas veces no mueve la meta', () => {
  const primera = sandbox.obtenerPlanCaloricoMensual(idPaciente).caloriasObjetivo;
  for (let i = 0; i < 25; i++) { sandbox.getResumenDiario(sesionPaciente.token, hoy()); }
  igual(sandbox.obtenerPlanCaloricoMensual(idPaciente).caloriasObjetivo, primera,
    'La meta se movió sola al releerla: el ajuste se está aplicando en cada lectura');
});

prueba('capturar una meta a mano la fija aunque no se marque la casilla', () => {
  const otra = sandbox.crearPaciente(sesionNutriologo.token, { nombre: 'Fija', email: 'fija@ejemplo.com' });
  const plan = sandbox.actualizarMetaPaciente(sesionNutriologo.token, otra.idPaciente, { calorias: 1900 });
  igual(plan.caloriasObjetivo, 1900);
  igual(plan.ajusteManual, true, 'Un número capturado a mano tiene que quedar fijo');
});

prueba('la meta fijada a mano por el nutriólogo manda sobre el recálculo', () => {
  sandbox.actualizarMetaPaciente(sesionNutriologo.token, idPaciente, { calorias: 1850, manual: true });
  const plan = sandbox.obtenerPlanCaloricoMensual(idPaciente);
  igual(plan.caloriasObjetivo, 1850);
  igual(plan.estado, 'manual');
});

prueba('rechaza metas fuera de rango', () => {
  lanza(() => sandbox.actualizarMetaPaciente(sesionNutriologo.token, idPaciente, { calorias: 400 }), '1200');
  lanza(() => sandbox.actualizarMetaPaciente(sesionNutriologo.token, idPaciente, { calorias: 9000 }), 'fuera de rango');
});

prueba('liberar el ajuste manual devuelve el control al recálculo', () => {
  sandbox.actualizarMetaPaciente(sesionNutriologo.token, idPaciente, { manual: false });
  cierto(sandbox.obtenerPlanCaloricoMensual(idPaciente).estado !== 'manual', 'Sigue en modo manual');
});

/* ================= REGISTRO DE ALIMENTOS ================= */

grupo('Registro de alimentos');

prueba('el buscador encuentra alimentos por nombre y sin acentos', () => {
  cierto(sandbox.buscarAlimentos(sesionPaciente.token, 'nopal').length > 0, 'No encontró nopal');
  cierto(sandbox.buscarAlimentos(sesionPaciente.token, 'platano').length > 0, 'No encontró plátano sin acento');
  cierto(sandbox.buscarAlimentos(sesionPaciente.token, 'Leguminosas').length > 5, 'No busca por categoría');
});

prueba('calcula bien las calorías por gramaje', () => {
  const frijol = sandbox.buscarAlimentos(sesionPaciente.token, 'Frijol negro cocido')[0];
  const resumen = sandbox.guardarRegistroDiario(sesionPaciente.token, {
    fecha: hoy(), tiempoComida: 'Comida', alimentos: [{ idAlimento: frijol.id, gramos: 200 }]
  });
  cerca(resumen.consumido.calorias, frijol.calorias * 2, 0.5, 'Las calorías no escalan con los gramos');
  cerca(resumen.consumido.fibra, frijol.fibra * 2, 0.5, 'La fibra no escala');
});

prueba('suma varios tiempos de comida en el mismo día', () => {
  const avena = sandbox.buscarAlimentos(sesionPaciente.token, 'Avena en hojuelas')[0];
  const resumen = sandbox.guardarRegistroDiario(sesionPaciente.token, {
    fecha: hoy(), tiempoComida: 'Desayuno', alimentos: [{ idAlimento: avena.id, gramos: 50 }]
  });
  igual(resumen.comidas.length, 2, 'No aparecen las dos comidas del día');
});

prueba('el restante refleja la meta menos lo consumido', () => {
  const resumen = sandbox.getResumenDiario(sesionPaciente.token, hoy());
  cerca(resumen.restante, resumen.meta - resumen.consumido.calorias, 1);
});

prueba('rechaza guardar sin alimentos', () => {
  lanza(() => sandbox.guardarRegistroDiario(sesionPaciente.token, { tiempoComida: 'Cena', alimentos: [] }), 'al menos un alimento');
});

prueba('rechaza guardar sin tiempo de comida', () => {
  lanza(() => sandbox.guardarRegistroDiario(sesionPaciente.token, { alimentos: [{ idAlimento: 'ALI-001', gramos: 100 }] }), 'tiempo de comida');
});

prueba('un paciente no puede borrar el registro de otro', () => {
  const registro = sandbox.leerTabla_('Registro_Diario')
    .filter((r) => String(r.ID_Paciente) === String(idPaciente))[0];
  const intruso = sandbox.crearPaciente(sesionNutriologo.token, { nombre: 'Intruso', email: 'intruso@ejemplo.com' });
  const s = sandbox.loginUser('intruso@ejemplo.com', intruso.passwordTemporal);
  lanza(() => sandbox.borrarRegistroDiario(s.token, registro.ID), 'no es tuyo');
});

prueba('borrar un registro actualiza el total del día', () => {
  const antes = sandbox.getResumenDiario(sesionPaciente.token, hoy());
  const resumen = sandbox.borrarRegistroDiario(sesionPaciente.token, antes.comidas[0].id);
  igual(resumen.comidas.length, antes.comidas.length - 1);
  cierto(resumen.consumido.calorias < antes.consumido.calorias, 'El total no bajó');
});

/* ================= PLATILLOS ================= */

grupo('Platillos mexicanos prediseñados');

prueba('hay tres opciones por cada tiempo de comida', () => {
  const platillos = sandbox.getPlatillosSugeridos(sesionPaciente.token);
  ['Desayuno', 'Comida', 'Cena', 'Colacion'].forEach((tiempo) => {
    igual(platillos[tiempo].length, 3, 'Faltan platillos en ' + tiempo);
  });
});

prueba('incluye los tres platillos que nombra la guía', () => {
  const platillos = sandbox.getPlatillosSugeridos(sesionPaciente.token);
  const nombres = [].concat(platillos.Desayuno, platillos.Comida, platillos.Cena, platillos.Colacion)
    .map((p) => p.nombre.toLowerCase());
  cierto(nombres.some((n) => n.indexOf('chilaquiles') >= 0), 'Faltan los chilaquiles ligeros');
  cierto(nombres.some((n) => n.indexOf('nopal') >= 0), 'Faltan los tacos de nopal');
  cierto(nombres.some((n) => n.indexOf('avena') >= 0), 'Falta la avena con manzana');
});

prueba('todos los ingredientes existen en el catálogo', () => {
  const platillos = sandbox.getPlatillosSugeridos(sesionPaciente.token);
  Object.keys(sandbox.PLATILLOS_MEXICANOS).forEach((tiempo) => {
    sandbox.PLATILLOS_MEXICANOS[tiempo].forEach((definido, i) => {
      const calculado = platillos[tiempo][i];
      igual(calculado.alimentos.length, definido.ingredientes.length,
        'En "' + definido.nombre + '" hay ingredientes que no existen en Alimentos_100g');
    });
  });
});

prueba('las calorías de cada platillo caen en un rango razonable', () => {
  const platillos = sandbox.getPlatillosSugeridos(sesionPaciente.token);
  const rangos = { Desayuno: [250, 550], Comida: [400, 700], Cena: [250, 550], Colacion: [100, 320] };
  Object.keys(rangos).forEach((tiempo) => {
    platillos[tiempo].forEach((p) => {
      const kcal = p.totales.calorias;
      cierto(kcal >= rangos[tiempo][0] && kcal <= rangos[tiempo][1],
        '"' + p.nombre + '" tiene ' + kcal + ' kcal, fuera de ' + rangos[tiempo].join('-'));
    });
  });
});

prueba('un menú completo del día se acerca a la meta base', () => {
  const platillos = sandbox.getPlatillosSugeridos(sesionPaciente.token);
  const total = platillos.Desayuno[0].totales.calorias + platillos.Comida[0].totales.calorias +
    platillos.Cena[0].totales.calorias + platillos.Colacion[0].totales.calorias;
  cierto(total > 1300 && total < 2000, 'El día completo suma ' + Math.round(total) + ' kcal');
});

/* ================= MÉTRICAS Y DRIVE ================= */

grupo('Métricas, báscula y Drive');

prueba('rechaza una medición vacía', () => {
  lanza(() => sandbox.guardarMetricas(sesionPaciente.token, { fecha: hoy() }), 'al menos el peso');
});

prueba('acepta una medición solo de laboratorio', () => {
  const antes = sandbox.getHistorialMetricas(sesionPaciente.token).length;
  sandbox.guardarMetricas(sesionPaciente.token, { fecha: hoy(), trigliceridos: 150, colesterol: 190, glucosa: 95 });
  igual(sandbox.getHistorialMetricas(sesionPaciente.token).length, antes + 1);
});

prueba('guarda la imagen en Drive dentro de la carpeta del paciente', () => {
  reiniciar();
  const res = sandbox.uploadFileToDrive(sesionPaciente.token, {
    nombre: 'bascula.jpg',
    mimeType: 'image/jpeg',
    base64: 'data:image/jpeg;base64,' + Buffer.from('imagen falsa').toString('base64'),
    tipo: 'pesa'
  });
  cierto(res.url.indexOf('drive.google.com') >= 0, 'No devolvió URL de Drive');
  igual(efectos.archivos.length, 1);
  cierto(efectos.archivos[0].carpeta.indexOf('María López') >= 0, 'No usó la carpeta del paciente');
  cierto(efectos.archivos[0].blob.nombre.indexOf('pesa-') === 0, 'El nombre no distingue el tipo');
});

prueba('rechaza una subida sin imagen', () => {
  lanza(() => sandbox.uploadFileToDrive(sesionPaciente.token, { nombre: 'x.jpg' }), 'ninguna imagen');
});

prueba('la URL de la imagen queda ligada a la medición', () => {
  sandbox.guardarMetricas(sesionPaciente.token, {
    fecha: hoy(), peso: 75.5, fotoPesaUrl: 'https://drive.google.com/file/d/prueba'
  });
  const ultima = sandbox.getUltimaMetrica(sesionPaciente.token);
  igual(ultima.FotoPesa_DriveUrl, 'https://drive.google.com/file/d/prueba');
});

/* ================= ACTIVIDAD FÍSICA ================= */

grupo('Actividad física');

prueba('estima las calorías quemadas con el peso del paciente', () => {
  const resumen = sandbox.guardarActividad(sesionPaciente.token, { fecha: hoy(), tipo: 'Caminata ligera', minutos: 20 });
  const registrada = resumen.actividades[resumen.actividades.length - 1];
  cerca(registrada.calorias, 3.0 * 75.5 * (20 / 60), 2, 'El MET de la caminata no cuadra');
});

prueba('el entrenamiento de fuerza quema más que el yoga a igual duración', () => {
  const r = sandbox.guardarActividad(sesionPaciente.token, { fecha: hoy(), tipo: 'Entrenamiento de fuerza', minutos: 30 });
  const s = sandbox.guardarActividad(sesionPaciente.token, { fecha: hoy(), tipo: 'Yoga o estiramiento', minutos: 30 });
  const fuerza = r.actividades.filter((a) => a.tipo === 'Entrenamiento de fuerza')[0];
  const yoga = s.actividades.filter((a) => a.tipo === 'Yoga o estiramiento')[0];
  cierto(fuerza.calorias > yoga.calorias, 'La estimación no distingue intensidades');
});

prueba('rechaza actividad sin duración', () => {
  lanza(() => sandbox.guardarActividad(sesionPaciente.token, { tipo: 'Trote' }), 'minutos');
});

prueba('lo quemado aparece en el resumen del día', () => {
  const resumen = sandbox.getResumenDiario(sesionPaciente.token, hoy());
  cierto(resumen.quemado > 0, 'El resumen no suma lo quemado');
});

/* ================= CHAT Y ALERTAS ================= */

grupo('Chat de soporte y alertas');

prueba('sin credenciales de WhatsApp la alerta viaja por correo', () => {
  reiniciar();
  const res = sandbox.guardarMensajeChat(sesionPaciente.token, '¿Puedo cambiar el arroz por quinoa?');
  igual(res.alertaWhatsApp, false, 'Dijo que envió WhatsApp sin credenciales');
  igual(efectos.correos.length, 1, 'No salió el correo de respaldo');
  cierto(efectos.correos[0].asunto.indexOf('María López') >= 0);
});

prueba('con credenciales llama a la Meta Cloud API', () => {
  reiniciar();
  sandbox.PropertiesService.getScriptProperties().setProperties({
    WHATSAPP_TOKEN: 'token-de-prueba',
    WHATSAPP_PHONE_NUMBER_ID: '123456789',
    NUTRIOLOGO_PHONE_NUMBER: '5215500000000'
  });
  const res = sandbox.guardarMensajeChat(sesionPaciente.token, '¿La tortilla de nopal cuenta como verdura?');
  igual(res.alertaWhatsApp, true, 'No reportó el envío');
  igual(efectos.peticiones.length, 1, 'No llamó a la API');

  const peticion = efectos.peticiones[0];
  cierto(peticion.url.indexOf('graph.facebook.com/v18.0/123456789/messages') >= 0, 'URL incorrecta: ' + peticion.url);
  igual(peticion.opciones.method, 'post');
  igual(peticion.opciones.headers.Authorization, 'Bearer token-de-prueba');

  const cuerpo = JSON.parse(peticion.opciones.payload);
  igual(cuerpo.messaging_product, 'whatsapp');
  igual(cuerpo.to, '5215500000000');
  cierto(cuerpo.text.body.indexOf('Nueva consulta de paciente: María López') >= 0, 'El texto no sigue la plantilla');
  cierto(cuerpo.text.body.indexOf('panel de administración') >= 0, 'Falta la instrucción de responder');
});

prueba('el mensaje también queda en la pestaña Chat_Soporte', () => {
  const mensajes = sandbox.leerTabla_('Chat_Soporte').filter((c) => String(c.ID_Paciente) === String(idPaciente));
  cierto(mensajes.length >= 2, 'No se registraron los mensajes');
  igual(mensajes[mensajes.length - 1].Estado, 'Pendiente');
});

prueba('rechaza mensajes vacíos y demasiado largos', () => {
  lanza(() => sandbox.guardarMensajeChat(sesionPaciente.token, '   '), 'escribe tu duda');
  lanza(() => sandbox.guardarMensajeChat(sesionPaciente.token, 'a'.repeat(2500)), 'muy largo');
});

prueba('responder marca los pendientes como leídos y avisa al paciente', () => {
  reiniciar();
  sandbox.responderChat(sesionNutriologo.token, idPaciente, 'Sí, la quinoa funciona igual. Usa 150 g cocidos.');
  const pendientes = sandbox.leerTabla_('Chat_Soporte')
    .filter((c) => String(c.ID_Paciente) === String(idPaciente) && c.Estado === 'Pendiente');
  igual(pendientes.length, 0, 'Quedaron mensajes pendientes');
  igual(efectos.correos.length, 1, 'No se avisó al paciente');
});

prueba('el paciente ve la respuesta en su chat', () => {
  const chat = sandbox.getChat(sesionPaciente.token);
  const ultimo = chat[chat.length - 1];
  igual(ultimo.enviadoPor, 'Nutriologo');
});

/* ================= PANEL DEL NUTRIÓLOGO ================= */

grupo('Panel del nutriólogo');

prueba('lista los pacientes con su último peso y su meta', () => {
  const pacientes = sandbox.listarPacientes(sesionNutriologo.token);
  cierto(pacientes.length >= 4, 'Faltan pacientes en la lista');
  const maria = pacientes.filter((p) => p.id === idPaciente)[0];
  cierto(maria.ultimoPeso > 0, 'No trae el último peso');
  cierto(maria.caloriasObjetivo > 0, 'No trae la meta');
});

prueba('el expediente trae métricas, registros, actividad, chat e imágenes', () => {
  const exp = sandbox.getExpediente(sesionNutriologo.token, idPaciente);
  cierto(exp.metricas.length >= 4, 'Faltan métricas');
  cierto(exp.registros.length >= 1, 'Faltan registros de comida');
  cierto(exp.actividad.length >= 1, 'Falta la actividad');
  cierto(exp.chat.length >= 2, 'Falta el chat');
  cierto(exp.imagenes.length >= 1, 'Faltan las imágenes de Drive');
});

prueba('las métricas del expediente vienen ordenadas por fecha', () => {
  const fechas = sandbox.getExpediente(sesionNutriologo.token, idPaciente).metricas.map((m) => m.fecha);
  const ordenadas = fechas.slice().sort();
  igual(JSON.stringify(fechas), JSON.stringify(ordenadas), 'Las gráficas saldrían desordenadas');
});

prueba('el expediente incluye las siete series que grafica el panel', () => {
  const m = sandbox.getExpediente(sesionNutriologo.token, idPaciente).metricas[0];
  ['peso', 'masaMuscular', 'porcentajeGrasa', 'agua', 'grasaVisceral', 'trigliceridos', 'colesterol', 'glucosa']
    .forEach((llave) => cierto(llave in m, 'Falta la serie ' + llave));
});

prueba('un paciente no puede abrir el expediente de otro', () => {
  lanza(() => sandbox.getExpediente(sesionPaciente.token, idPaciente), 'permiso');
});

prueba('desactivar una cuenta impide entrar', () => {
  const otra = sandbox.crearPaciente(sesionNutriologo.token, { nombre: 'Baja', email: 'baja@ejemplo.com' });
  sandbox.cambiarEstadoPaciente(sesionNutriologo.token, otra.idPaciente, false);
  lanza(() => sandbox.loginUser('baja@ejemplo.com', otra.passwordTemporal), 'desactivada');
});

/* ================= SESIONES ================= */

grupo('Ciclo de vida de la sesión');

prueba('cerrar sesión invalida el token', () => {
  const temp = sandbox.crearPaciente(sesionNutriologo.token, { nombre: 'Temporal', email: 'temporal@ejemplo.com' });
  const s = sandbox.loginUser('temporal@ejemplo.com', temp.passwordTemporal);
  sandbox.logoutUser(s.token);
  lanza(() => sandbox.getChat(s.token), 'no es válida');
});

prueba('una sesión vencida se rechaza', () => {
  const temp = sandbox.crearPaciente(sesionNutriologo.token, { nombre: 'Vencido', email: 'vencido@ejemplo.com' });
  const s = sandbox.loginUser('vencido@ejemplo.com', temp.passwordTemporal);
  const fila = sandbox.leerTabla_('Sesiones').filter((x) => x.Token === s.token)[0];
  sandbox.actualizarFila_('Sesiones', fila._fila, { Expira: new Date(Date.now() - 1000) });
  lanza(() => sandbox.getChat(s.token), 'expiró');
});

prueba('limpiarSesionesVencidas borra solo las vencidas', () => {
  const antes = sandbox.leerTabla_('Sesiones').length;
  const borradas = sandbox.limpiarSesionesVencidas();
  cierto(borradas > 0, 'No borró ninguna');
  igual(sandbox.leerTabla_('Sesiones').length, antes - borradas);
  igual(sandbox.requerirSesion_(sesionNutriologo.token, 'Nutriologo').Rol, 'Nutriologo');
});

prueba('el estado inicial del paciente trae todo lo que pinta la interfaz', () => {
  const estado = sandbox.getEstadoInicial(sesionPaciente.token);
  igual(estado.rol, 'Paciente');
  ['plan', 'resumenHoy', 'alimentos', 'platillos', 'evidencia', 'chat'].forEach((llave) => {
    cierto(estado[llave], 'Falta ' + llave + ' en el estado inicial');
  });
});

prueba('el estado inicial del nutriólogo trae la lista de pacientes', () => {
  const estado = sandbox.getEstadoInicial(sesionNutriologo.token);
  igual(estado.rol, 'Nutriologo');
  cierto(estado.pacientes.length > 0, 'No trae pacientes');
});

/* ---------- Cierre ---------- */

function hoy() { return sandbox.aFechaISO_(new Date()); }

console.log('\n' + '─'.repeat(56));
console.log(pasadas + ' pasaron, ' + falladas + ' fallaron');
if (falladas) {
  console.log('\nFallos:');
  fallos.forEach((f) => console.log('  · ' + f.nombre + '\n    ' + f.error.message));
}
process.exit(falladas ? 1 : 0);
