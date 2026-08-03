/** Escenario completo de uso de los tarifarios sobre el simulador. */
const sim = require('./simulador.js');

let pasadas = 0;
let fallidas = 0;

function ok(descripcion, condicion, extra) {
  if (condicion) {
    pasadas++;
    console.log('  ok   ' + descripcion);
  } else {
    fallidas++;
    console.log('  FALLA ' + descripcion + (extra ? '  -> ' + extra : ''));
  }
}

function debeFallar(descripcion, fn, textoEsperado) {
  try {
    fn();
    fallidas++;
    console.log('  FALLA ' + descripcion + '  -> no lanzó error');
  } catch (err) {
    const bien = !textoEsperado || err.message.indexOf(textoEsperado) !== -1;
    if (bien) { pasadas++; console.log('  ok   ' + descripcion); }
    else { fallidas++; console.log('  FALLA ' + descripcion + '  -> ' + err.message); }
  }
}

const hoy = hoyTexto_();
const ayer = sumarDias_(hoy, -1);
const enUnAnio = sumarDias_(hoy, 365);

console.log('\n1. Instalación');
instalar();
ok('crea la hoja de cálculo', !!PropertiesService.getScriptProperties().getProperty(PROP_HOJA));
ok('crea todas las pestañas', Object.keys(TABLAS).every((t) => !!hoja_(t)));
ok('deja al instalador como admin', usuarioActual_().rol === 'admin');
ok('carga el catálogo de equipo', catalogos_().equipo.length >= 7);
ok('trae full y sencillo', ['full', 'sencillo'].every(
  (c) => !!buscarCatalogo_('equipo', c)));
ok('carga el catálogo de mercancía', catalogos_().mercancia.length >= 6);
instalar();
ok('reinstalar no duplica al admin', leerTodo_('Usuarios').length === 1);
ok('reinstalar no duplica catálogos', catalogos_().equipo.length === 7);

console.log('\n2. Proveedores');
const norte = apiGuardarProveedor({ nombre: 'Transportes del Norte', rfc: 'TNO950101AB1',
  contacto: 'Laura Méndez', telefono: '81 1234 5678', ciudad: 'Monterrey', calificacion: 4.5 });
const bajio = apiGuardarProveedor({ nombre: 'Fletes Bajío', ciudad: 'León', calificacion: 4 });
const golfo = apiGuardarProveedor({ nombre: 'Autolíneas del Golfo', ciudad: 'Veracruz' });
ok('da de alta tres proveedores', leerTodo_('Proveedores').length === 3);
debeFallar('no acepta proveedor sin nombre',
  () => apiGuardarProveedor({ nombre: '' }), 'necesita nombre');
debeFallar('no acepta dos proveedores con el mismo nombre',
  () => apiGuardarProveedor({ nombre: 'transportes del norte' }), 'Ya hay un proveedor');
debeFallar('no acepta calificación fuera de rango',
  () => apiGuardarProveedor({ nombre: 'Otro', calificacion: 9 }), 'de 0 a 5');
apiGuardarProveedor({ id: norte, nombre: 'Transportes del Norte', calificacion: 4.8 });
ok('actualiza sin duplicar', leerTodo_('Proveedores').length === 3
  && buscarPorId_('Proveedores', norte).calificacion === 4.8);

console.log('\n3. Rutas');
const mtyGdl = apiGuardarRuta({ origen: 'Monterrey', destino: 'Guadalajara', km: 780 });
const manzCdmx = apiGuardarRuta({ origen: 'Manzanillo', destino: 'CDMX', km: 810 });
ok('da de alta dos rutas', leerTodo_('Rutas').length === 2);
debeFallar('no acepta ruta sin destino',
  () => apiGuardarRuta({ origen: 'Monterrey', destino: '' }), 'origen y destino');
debeFallar('no repite la misma ruta con otro acento',
  () => apiGuardarRuta({ origen: 'monterrey', destino: 'guadalajara' }), 'Ya existe la ruta');

console.log('\n4. Tarifas y costo total');
const t1 = apiGuardarTarifa({ proveedorId: norte, rutaId: mtyGdl, mercancia: 'general',
  equipo: 'full', moneda: 'MXN', tarifa: 38500, combustiblePct: 12, casetas: 2450,
  tiempoHoras: 18, vigenciaDesde: hoy, vigenciaHasta: enUnAnio });
const tarifaUno = apiTarifas({}).tarifas.filter((t) => t.id === t1)[0];
ok('suma combustible y casetas al costo total', tarifaUno.costoTotal === 45570,
  String(tarifaUno.costoTotal));
ok('calcula el costo por kilómetro', tarifaUno.costoPorKm === 58.42,
  String(tarifaUno.costoPorKm));

const enDolares = apiGuardarTarifa({ proveedorId: golfo, rutaId: manzCdmx, mercancia: 'general',
  equipo: 'sencillo', moneda: 'USD', tarifa: 1000, tiempoHoras: 20 });
const tarifaUsd = apiTarifas({}).tarifas.filter((t) => t.id === enDolares)[0];
ok('convierte dólares a la moneda base', tarifaUsd.costoTotal === 17500,
  String(tarifaUsd.costoTotal));

debeFallar('exige tiempo de entrega',
  () => apiGuardarTarifa({ proveedorId: norte, rutaId: mtyGdl, mercancia: 'general',
    equipo: 'sencillo', tarifa: 100, tiempoHoras: 0 }), 'tiempo de entrega');
debeFallar('exige un proveedor dado de alta',
  () => apiGuardarTarifa({ proveedorId: 'inventado', rutaId: mtyGdl, mercancia: 'general',
    equipo: 'full', tarifa: 100, tiempoHoras: 5 }), 'proveedor dado de alta');
debeFallar('exige un tipo de equipo del catálogo',
  () => apiGuardarTarifa({ proveedorId: norte, rutaId: mtyGdl, mercancia: 'general',
    equipo: 'platillo volador', tarifa: 100, tiempoHoras: 5 }), 'tipo de equipo');
debeFallar('no acepta la misma tarifa dos veces',
  () => apiGuardarTarifa({ proveedorId: norte, rutaId: mtyGdl, mercancia: 'general',
    equipo: 'full', tarifa: 39000, tiempoHoras: 18, vigenciaDesde: hoy }), 'ya tiene una tarifa');
debeFallar('no acepta vigencia al revés',
  () => apiGuardarTarifa({ proveedorId: bajio, rutaId: mtyGdl, mercancia: 'general',
    equipo: 'full', tarifa: 100, tiempoHoras: 5, vigenciaDesde: enUnAnio,
    vigenciaHasta: hoy }), 'termina antes de empezar');

console.log('\n5. Comparador: de la mejor a la peor');
// Un tablero limpio: mismos tres competidores, precios y tiempos conocidos.
const rutaPrueba = apiGuardarRuta({ origen: 'Laredo', destino: 'Querétaro', km: 1000 });
const barata = apiGuardarTarifa({ proveedorId: norte, rutaId: rutaPrueba, mercancia: 'general',
  equipo: 'full', tarifa: 100, tiempoHoras: 20, vigenciaDesde: hoy, vigenciaHasta: enUnAnio });
const rapida = apiGuardarTarifa({ proveedorId: bajio, rutaId: rutaPrueba, mercancia: 'general',
  equipo: 'full', tarifa: 120, tiempoHoras: 10, vigenciaDesde: hoy, vigenciaHasta: enUnAnio });
const cara = apiGuardarTarifa({ proveedorId: golfo, rutaId: rutaPrueba, mercancia: 'general',
  equipo: 'full', tarifa: 200, tiempoHoras: 30, vigenciaDesde: hoy, vigenciaHasta: enUnAnio });

const comp = apiComparar({ rutaId: rutaPrueba });
ok('arma un solo grupo por ruta y características', comp.grupos.length === 1);
const grupo = comp.grupos[0];
ok('ordena las tres opciones', grupo.opciones.length === 3);
ok('gana la de mejor equilibrio precio/tiempo', grupo.mejor.id === rapida,
  grupo.mejor.proveedor + ' con ' + grupo.mejor.puntaje);
ok('el puntaje de la más rápida es 86', grupo.opciones[0].puntaje === 86,
  String(grupo.opciones[0].puntaje));
ok('la segunda es la más barata', grupo.opciones[1].id === barata);
ok('la peor queda al final', grupo.opciones[2].id === cara);
ok('marca cuál es la más barata', grupo.opciones[1].esMasBarata === true);
ok('marca cuál es la más rápida', grupo.opciones[0].esMasRapida === true);
ok('calcula el sobreprecio contra la más barata', grupo.opciones[0].sobreprecio === 20);
ok('calcula el ahorro contra la peor', grupo.ahorro === 80, String(grupo.ahorro));
ok('calcula la ventaja sobre la segunda', grupo.ventaja === -20, String(grupo.ventaja));
ok('explica por qué gana', /más rápida/.test(grupo.mejor.motivo), grupo.mejor.motivo);

const porPrecio = apiComparar({ rutaId: rutaPrueba, orden: 'precio' });
ok('ordenar solo por precio pone primero a la más barata',
  porPrecio.grupos[0].opciones[0].id === barata);
const porTiempo = apiComparar({ rutaId: rutaPrueba, orden: 'tiempo' });
ok('ordenar solo por tiempo pone primero a la más rápida',
  porTiempo.grupos[0].opciones[0].id === rapida);
const soloPrecio = apiComparar({ rutaId: rutaPrueba, pesoPrecio: 100 });
ok('con el precio al 100 % gana la más barata',
  soloPrecio.grupos[0].mejor.id === barata);
const soloTiempo = apiComparar({ rutaId: rutaPrueba, pesoPrecio: 0 });
ok('con el tiempo al 100 % gana la más rápida',
  soloTiempo.grupos[0].mejor.id === rapida);

apiGuardarTarifa({ proveedorId: norte, rutaId: rutaPrueba, mercancia: 'general',
  equipo: 'sencillo', tarifa: 60, tiempoHoras: 24, vigenciaDesde: hoy, vigenciaHasta: enUnAnio });
ok('separa los grupos por tipo de equipo',
  apiComparar({ rutaId: rutaPrueba }).grupos.length === 2);
ok('filtrar por equipo deja un solo grupo',
  apiComparar({ rutaId: rutaPrueba, equipo: 'sencillo' }).grupos.length === 1);

console.log('\n6. Vigencias');
const vencida = apiGuardarTarifa({ proveedorId: golfo, rutaId: rutaPrueba, mercancia: 'general',
  equipo: 'sencillo', tarifa: 10, tiempoHoras: 5, vigenciaDesde: sumarDias_(hoy, -60),
  vigenciaHasta: ayer });
const conVencidas = apiComparar({ rutaId: rutaPrueba, equipo: 'sencillo' });
ok('deja fuera las tarifas vencidas', conVencidas.grupos[0].opciones.length === 1);
ok('reporta cuántas descartó', conVencidas.descartadas.vencidas === 1);
const incluyendo = apiComparar({ rutaId: rutaPrueba, equipo: 'sencillo', incluirVencidas: true });
ok('las incluye si se le pide', incluyendo.grupos[0].opciones.length === 2);
ok('el resumen de portada cuenta las vencidas', apiEstadoInicial().resumen.vencidas === 1);
ok('el filtro "solo vigentes" deja fuera las vencidas',
  apiTarifas({ soloVigentes: true }).tarifas.every((t) => !t.vencida));

const futura = apiGuardarTarifa({ proveedorId: golfo, rutaId: rutaPrueba, mercancia: 'general',
  equipo: 'torton', tarifa: 90, tiempoHoras: 22, vigenciaDesde: sumarDias_(hoy, 30) });
ok('y las que todavía no arrancan',
  apiTarifas({ soloVigentes: true }).tarifas.every((t) => t.id !== futura));
ok('el comparador de hoy tampoco las toma',
  apiComparar({ rutaId: rutaPrueba, equipo: 'torton' }).grupos.length === 0);
ok('pero sí aparecen si se consulta esa fecha',
  apiComparar({ rutaId: rutaPrueba, equipo: 'torton',
                fecha: sumarDias_(hoy, 45) }).grupos.length === 1);
apiBorrarTarifa(futura);
apiBorrarTarifa(vencida);

console.log('\n7. Mejores opciones');
const mejores = apiMejoresOpciones({});
ok('devuelve una línea por combinación', mejores.mejores.length === 4, String(mejores.mejores.length));
const lineaPrueba = mejores.mejores.filter((m) => m.ruta === 'Laredo → Querétaro'
  && m.equipo === 'full')[0];
ok('la mejor de la ruta de prueba es la más rápida', lineaPrueba.proveedor === 'Fletes Bajío');
ok('trae al segundo lugar', lineaPrueba.segundo === 'Transportes del Norte');
ok('cuenta las opciones de la combinación', lineaPrueba.opciones === 3);
ok('detecta las combinaciones sin competencia', mejores.resumen.sinCompetencia === 3,
  String(mejores.resumen.sinCompetencia));
ok('suma el ahorro de todas las combinaciones', mejores.resumen.ahorroTotal === 80);
ok('cuenta las rutas involucradas', mejores.resumen.rutas === 3);

console.log('\n8. Importar');
const csv = [
  'Proveedor;Origen;Destino;Tipo de Mercancía;Tipo de Equipo;Tarifa;Combustible;Casetas;Tiempo de entrega (horas);Vigencia desde;Vigencia hasta',
  'Transportes del Norte;Monterrey;Saltillo;General;Full;$12,500.00;10;450;6;01/01/2026;31/12/2026',
  'Fletes Bajío;Monterrey;Saltillo;General;Full;11,900;12;450;8;01/01/2026;31/12/2026',
  'Mudanzas Express;Monterrey;Saltillo;General;Torton;9,300;10;450;9;01/01/2026;31/12/2026',
  'Fletes Bajío;Monterrey;Saltillo;General;Full;10,000;12;450;;01/01/2026;31/12/2026'
].join('\n');

const informe = apiImportarRevisar('tarifas', csv, {});
ok('detecta el punto y coma como separador', informe.delimitador === ';');
ok('reconoce las columnas con acentos y mayúsculas',
  informe.reconocidas.indexOf('mercancia') !== -1
  && informe.reconocidas.indexOf('tiempoHoras') !== -1);
ok('cuenta cuatro renglones', informe.resumen.total === 4);
ok('marca el renglón sin tiempo como error', informe.resumen.errores === 1);
ok('avisa qué proveedores va a dar de alta', informe.nuevos.proveedores.length === 1
  && informe.nuevos.proveedores[0] === 'Mudanzas Express');
ok('avisa qué rutas va a dar de alta', informe.nuevos.rutas.length === 1);
ok('revisar no escribe nada', leerTodo_('Rutas').length === 3);

debeFallar('puede negarse a crear lo que falta',
  () => { const r = apiImportarRevisar('tarifas', csv, { crearFaltantes: false });
    if (r.resumen.errores !== 4) { throw new Error('errores: ' + r.resumen.errores); }
    throw new Error('marca los cuatro renglones'); }, 'marca los cuatro');

const aplicado = apiImportarAplicar('tarifas', csv, {});
ok('importa los renglones buenos', aplicado.altas === 3, JSON.stringify(aplicado));
ok('omite el renglón con problemas', aplicado.omitidas === 1);
ok('da de alta al proveedor nuevo', !!proveedorPorNombre_('Mudanzas Express'));
ok('da de alta la ruta nueva', !!rutaPorExtremos_('Monterrey', 'Saltillo'));
ok('lee el número con signo de pesos y comas',
  apiTarifas({ texto: 'Saltillo' }).tarifas.filter((t) => t.proveedor === 'Transportes del Norte')[0]
    .tarifa === 12500);
ok('convierte la fecha dd/mm/aaaa',
  apiTarifas({ texto: 'Saltillo' }).tarifas[0].vigenciaDesde === '2026-01-01');

const csvActualiza = [
  'Proveedor,Origen,Destino,Tipo de Mercancía,Tipo de Equipo,Tarifa,Tiempo de entrega (horas),Vigencia desde',
  'Transportes del Norte,Monterrey,Saltillo,General,Full,13100,6,01/01/2026'
].join('\n');
const segunda = apiImportarAplicar('tarifas', csvActualiza, {});
ok('la segunda pasada actualiza en vez de duplicar',
  segunda.actualizaciones === 1 && segunda.altas === 0, JSON.stringify(segunda));
const actualizada = apiTarifas({ texto: 'Saltillo' }).tarifas
  .filter((t) => t.proveedor === 'Transportes del Norte')[0];
ok('cambia el precio', actualizada.tarifa === 13100);
ok('no borra las casetas que el archivo no traía', actualizada.casetas === 450,
  String(actualizada.casetas));

const csvProveedores = [
  'nombre\trfc\tciudad\tcalificacion',
  'Logística Peninsular\tLPE050920KJ8\tMérida\t4.2'
].join('\n');
const impProv = apiImportarAplicar('proveedores', csvProveedores, {});
ok('importa proveedores pegados desde Excel (tabuladores)', impProv.altas === 1);
ok('no pierde la calificación', proveedorPorNombre_('Logística Peninsular').calificacion === 4.2);

const plantilla = apiPlantilla('tarifas');
ok('genera plantilla con encabezados', plantilla.contenido.split('\n')[0].indexOf('proveedor') === 0);
ok('la plantilla se puede volver a importar',
  apiImportarRevisar('tarifas', plantilla.contenido, {}).resumen.errores === 0);

debeFallar('rechaza un archivo sin las columnas necesarias',
  () => apiImportarRevisar('tarifas', 'a,b,c\n1,2,3', {}), 'Faltan columnas');
debeFallar('rechaza un archivo vacío',
  () => apiImportarRevisar('tarifas', '   ', {}), 'llegó vacío');

console.log('\n9. Exportar');
const csvMejores = apiExportarCsv('mejores', {});
ok('el CSV de mejores opciones trae encabezado y datos',
  csvMejores.contenido.split('\n').length > 2);
ok('el CSV escapa las comas de los textos',
  csvExportaBien(apiExportarCsv('comparativo', {}).contenido));
const libro = apiExportarLibro({});
ok('genera la hoja de cálculo en Drive', /docs.google.com/.test(libro.url));
const hojasLibro = sim.librosPorId[libro.url.split('/').pop()].getSheets().map((h) => h.getName());
ok('el libro trae la portada de criterio', hojasLibro[0] === 'Criterio');
ok('el libro trae las cinco tablas', hojasLibro.length === 6, hojasLibro.join(', '));

function csvExportaBien(texto) {
  return texto.split('\n').every((linea) => (linea.match(/"/g) || []).length % 2 === 0);
}

console.log('\n10. Permisos');
apiGuardarUsuario({ email: 'compras@tlterminals.com', nombre: 'Compras', rol: 'consulta' });
sim.comoUsuario('compras@tlterminals.com');
ok('el usuario de consulta sí puede comparar', apiComparar({}).grupos.length > 0);
ok('el usuario de consulta sí puede exportar', !!apiExportarCsv('mejores', {}).contenido);
debeFallar('el usuario de consulta no puede capturar tarifas',
  () => apiGuardarTarifa({ proveedorId: norte, rutaId: mtyGdl, mercancia: 'general',
    equipo: 'torton', tarifa: 1, tiempoHoras: 1 }), 'solo para el administrador');
debeFallar('el usuario de consulta no puede importar',
  () => apiImportarAplicar('tarifas', csv, {}), 'solo para el administrador');
sim.comoUsuario('nadie@fuera.com');
debeFallar('un correo desconocido no entra',
  () => apiTarifas({}), 'no está dado de alta');
ok('el estado inicial lo dice sin reventar', apiEstadoInicial().registrado === false);

sim.comoUsuario('admin@tlterminals.com');
console.log('\n11. Usuarios y ajustes');
debeFallar('no se puede quitar al último administrador',
  () => apiGuardarUsuario({ email: 'admin@tlterminals.com', rol: 'consulta' }),
  'último administrador');
const usuarios = apiUsuarios();
ok('la liga personal sale con el token', /\?t=/.test(usuarios[0].liga));
const ligaNueva = apiRegenerarLiga(usuarios[1].id);
ok('regenerar la liga cambia el token', ligaNueva !== usuarios[1].liga);

apiGuardarConfig({ pesoPrecio: '50', pesoTiempo: '50', tipoCambioUSD: '20' });
ok('guarda los pesos', leerConfig('pesoPrecio') === '50');
ok('el tipo de cambio nuevo cambia el costo en dólares',
  apiTarifas({}).tarifas.filter((t) => t.id === enDolares)[0].costoTotal === 20000);
apiGuardarConfig({ pesoPrecio: '80', pesoTiempo: '80' });
ok('normaliza pesos que no suman 100',
  Number(leerConfig('pesoPrecio')) + Number(leerConfig('pesoTiempo')) === 100);

console.log('\n12. Bajas');
const borradoProveedor = apiBorrarProveedor(norte);
ok('un proveedor con tarifas se desactiva en vez de borrarse',
  borradoProveedor.desactivado === true && borradoProveedor.borrado === false);
ok('sus tarifas salen del comparador',
  apiComparar({ rutaId: rutaPrueba, equipo: 'full' }).grupos[0].opciones.length === 2);
const sinTarifas = apiGuardarProveedor({ nombre: 'Prueba efímera' });
ok('un proveedor sin tarifas sí se borra',
  apiBorrarProveedor(sinTarifas).borrado === true);

console.log('\n13. Verificación final');
ok('verificar() dice que todo está listo', verificar() === true);

console.log('\n' + pasadas + ' pasadas, ' + fallidas + ' fallidas\n');
process.exit(fallidas ? 1 : 0);
