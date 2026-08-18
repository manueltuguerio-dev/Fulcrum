/** Escenario completo del almacén sobre el simulador de Apps Script. */
const sim = require('./simulador.js');

let pasadas = 0, fallidas = 0;
function ok(desc, cond, extra) {
  if (cond) { pasadas++; console.log('  ok   ' + desc); }
  else { fallidas++; console.log('  FALLA ' + desc + (extra !== undefined ? '  -> ' + extra : '')); }
}
function debeFallar(desc, fn, texto) {
  try { fn(); fallidas++; console.log('  FALLA ' + desc + '  -> no lanzó error'); }
  catch (err) {
    const bien = !texto || err.message.indexOf(texto) !== -1;
    if (bien) { pasadas++; console.log('  ok   ' + desc); }
    else { fallidas++; console.log('  FALLA ' + desc + '  -> ' + err.message); }
  }
}
function login(r) { SESION_TOKEN = r.token; return r; }
function idsDe(tabla) { return leerTodo_(tabla).map((f) => String(f.id)); }
const hoy = hoyTexto_();
const yymmdd = hoy.replace(/-/g, '').substring(2);

console.log('\n1. Instalación');
instalar();
ok('crea la hoja de cálculo', !!PropertiesService.getScriptProperties().getProperty(PROP_HOJA));
ok('crea todas las pestañas', Object.keys(TABLAS).every((t) => !!hoja_(t)));
ok('incluye REGISTRO, PRUEBAS, CONFIG_SLA', !!hoja_('REGISTRO') && !!hoja_('PRUEBAS') && !!hoja_('CONFIG_SLA'));
ok('deja al instalador como MASTER', leerTodo_('USUARIOS').some((u) => u.rol === 'MASTER'));
instalar();
ok('reinstalar no duplica al MASTER', leerTodo_('USUARIOS').filter((u) => u.rol === 'MASTER').length === 1);

console.log('\n2. Catálogos de ejemplo');
cargarEjemplo();
ok('carga tipos de maniobra con código', leerTodo_('CATALOGOS').some(
  (c) => c.tipo === 'tiposManiobra' && c.valor === 'Descarga de furgón' && c.extra === 'DESC'));
ok('carga aditamentos', leerTodo_('CATALOGOS').some((c) => c.tipo === 'aditamentos' && c.valor === 'Roll Clamp'));
ok('no duplica al recargar', cargarEjemplo() === false);

console.log('\n3. Acceso (RBAC)');
login(apiEntrarClave('master@tlterminals.com', 'almacen'));
ok('el MASTER entra con contraseña', usuarioActual_().rol === 'MASTER');
apiGuardarUsuario({ nombre: 'Supervisor Ana', rol: 'ADMINISTRADOR', email: 'ana@tlterminals.com', clave: 'ana123' });
apiGuardarUsuario({ nombre: 'Operador Beto', rol: 'OPERATIVO', pin: '4321' });
const betoId = leerTodo_('USUARIOS').find((u) => u.nombre === 'Operador Beto').id;
ok('crea admin y operativo', leerTodo_('USUARIOS').length === 3);
debeFallar('rechaza rol inválido', () => apiGuardarUsuario({ nombre: 'X', rol: 'ROOT' }), 'Rol no válido');
debeFallar('operativo necesita PIN de 4 dígitos', () => apiGuardarUsuario({ nombre: 'Y', rol: 'OPERATIVO', pin: '12' }), '4 dígitos');
login(apiEntrarPin(betoId, '4321'));
ok('el operativo entra con PIN', usuarioActual_().rol === 'OPERATIVO');
debeFallar('PIN incorrecto no entra', () => apiEntrarPin(betoId, '0000'), 'incorrecto');

console.log('\n4. Personal y equipos');
login(apiEntrarClave('ana@tlterminals.com', 'ana123'));
apiGuardarEmpleado({ nombreCompleto: 'Juan Montacarguista', puesto: 'Montacarguista' });
apiGuardarEmpleado({ nombreCompleto: 'Pedro Ayudante', puesto: 'Ayudante de Patio' });
apiGuardarEmpleado({ nombreCompleto: 'Luis Inspector', puesto: 'Inspector de Calidad' });
const emp = {}; leerTodo_('EMPLEADOS').forEach((e) => { emp[e.nombreCompleto] = String(e.id); });
ok('registra 3 empleados', leerTodo_('EMPLEADOS').length === 3);
apiGuardarMontacargas({ skuEquipo: 'MTC-01', tipo: 'Frontal', capacidad: '2.5T' });
apiGuardarMontacargas({ skuEquipo: 'MTC-02-CLAMP', tipo: 'Clamp', capacidad: '3T' });
const maq = {}; leerTodo_('MONTACARGAS').forEach((m) => { maq[m.skuEquipo] = String(m.id); });
ok('registra 2 equipos por SKU', leerTodo_('MONTACARGAS').length === 2);
debeFallar('SKU duplicado se rechaza', () => apiGuardarMontacargas({ skuEquipo: 'MTC-01' }), 'Ya existe');

console.log('\n5. Matriz de SLA');
apiGuardarSla({ cliente: 'Cliente A', material: 'Celulosa', etapa: '', objetivoMin: 30 });
ok('guarda una regla de SLA', leerTodo_('CONFIG_SLA').length === 1);

console.log('\n6. Validación de furgón y folio dinámico');
login(apiEntrarPin(betoId, '4321'));
debeFallar('rechaza ID de furgón inválido', () => apiIniciar({ furgonId: 'x 1', tipoManiobra: 'Descarga de furgón' }), 'formato');
debeFallar('rechaza tipo de maniobra fuera de catálogo', () => apiIniciar({ furgonId: 'TBOX667792', tipoManiobra: 'Inventada' }), 'no válido');

const ev1 = apiIniciar({
  furgonId: 'tbox667792', tipoManiobra: 'Descarga de furgón',
  cliente: 'Cliente A', material: 'Celulosa',
  staffIds: [emp['Pedro Ayudante'], emp['Luis Inspector']],
  maquinas: [{ id: maq['MTC-01'], operadorId: emp['Juan Montacarguista'], aditamento: 'Cuchillas' }]
});
ok('normaliza el furgón a mayúsculas', ev1.furgonId === 'TBOX667792');
ok('arma el folio [FURGON]-[AAMMDD]-[COD]-[NN]', ev1.folio === 'TBOX667792-' + yymmdd + '-DESC-01', ev1.folio);
ok('el evento arranca en arribo', ev1.estado === 'arribo');
ok('cuenta 1 montacarguista (operador de la máquina)', ev1.numMontac === 1 && ev1.montacarguistas === 'Juan Montacarguista');
ok('cuenta 1 ayudante', ev1.numAyud === 1 && ev1.ayudantes === 'Pedro Ayudante');
ok('liga aditamento y operador al SKU', ev1.maquinas[0].aditamento === 'Cuchillas' && ev1.maquinas[0].operador === 'Juan Montacarguista');

console.log('\n7. Cronómetro por sub-etapas + demora');
sim.avanzar(60 * 1000);           // 1 min en patio
const ev1b = apiAvanzarEtapa(ev1.id);
ok('avanza a espera de andén', ev1b.estado === 'espera');
sim.avanzar(120 * 1000);          // 2 min de espera
apiAvanzarEtapa(ev1.id);
sim.avanzar(60 * 1000);           // 1 min ejecutando
debeFallar('la causa de demora es obligatoria', () => { apiPausar(ev1.id, ''); }, 'causa');
apiPausar(ev1.id, 'Falla de montacargas');
ok('pausar exige y guarda causa', leerTodo_('REGISTRO').find((r) => r.id === ev1.id).estado === 'pausado');
sim.avanzar(30 * 1000);           // 30 s de demora
apiReanudar(ev1.id);
sim.avanzar(90 * 1000);           // 1.5 min ejecutando
const ev1f = apiFinalizar(ev1.id, { cantPiezas: 100 });
ok('tiempo total = 6 min', ev1f.tiempoTotalMin === 6, ev1f.tiempoTotalMin);
ok('demora = 0.5 min', ev1f.demoraMin === 0.5, ev1f.demoraMin);
ok('efectivo = 5.5 min', ev1f.tiempoEfectivoMin === 5.5, ev1f.tiempoEfectivoMin);
ok('recepción = 1 min', ev1f.tiempoRecepcionMin === 1, ev1f.tiempoRecepcionMin);
ok('espera = 2 min', ev1f.tiempoEsperaMin === 2, ev1f.tiempoEsperaMin);
ok('ejecución = 2.5 min (menos demora)', ev1f.tiempoEjecucionMin === 2.5, ev1f.tiempoEjecucionMin);
ok('sub-etapas suman el efectivo',
  ev1f.tiempoRecepcionMin + ev1f.tiempoEsperaMin + ev1f.tiempoEjecucionMin === ev1f.tiempoEfectivoMin);
ok('min/pieza calculado', ev1f.minPorPieza === 0.06, ev1f.minPorPieza);
ok('aplica SLA de la matriz (objetivo 30)', ev1f.slaObjetivoMin === 30 && ev1f.sla === 'verde', ev1f.sla);

console.log('\n8. Consecutivo por furgón (agregar evento al mismo furgón)');
const ev2 = apiIniciar({ furgonId: 'TBOX667792', tipoManiobra: 'Descarga de furgón' });
ok('mismo furgón + tipo incrementa el consecutivo', ev2.folio === 'TBOX667792-' + yymmdd + '-DESC-02', ev2.folio);
const ev3 = apiIniciar({ furgonId: 'TBOX667792', tipoManiobra: 'Carga de furgón' });
ok('otro tipo reinicia su propio consecutivo', ev3.folio === 'TBOX667792-' + yymmdd + '-CARG-01', ev3.folio);

console.log('\n9. Campos condicionales (Carga plataforma desde piso)');
const evP = apiIniciar({
  furgonId: 'TBOX667792', tipoManiobra: 'Carga plataforma desde piso',
  placaPlataforma: 'ABC-1234', transportista: 'Fletes Bajío', pesoCargado: 21.5
});
ok('guarda placa/transportista/peso cargado',
  evP.placaPlataforma === 'ABC-1234' && evP.transportista === 'Fletes Bajío' && evP.pesoCargado === 21.5);
ok('un evento normal ignora los campos de plataforma',
  ev2.placaPlataforma === '' && ev2.transportista === '');

console.log('\n10. Edición y borrado con bitácora');
login(apiEntrarClave('ana@tlterminals.com', 'ana123'));
apiEditarRegistro(ev1.id, { observaciones: 'Corrección de prueba', cantPiezas: 120 });
const ev1Edit = leerTodo_('REGISTRO').find((r) => r.id === ev1.id);
ok('la edición aplica y recalcula min/pieza', String(ev1Edit.observaciones) === 'Corrección de prueba');
ok('la edición queda en la bitácora', leerTodo_('LOG_AUDITORIA').some(
  (l) => l.folio === ev1f.folio && l.accion === 'editar' && l.campo === 'observaciones'));
apiEliminarRegistro(ev3.id, false, 'duplicado');
ok('el borrado suave oculta el evento', !apiHistorial('', '', '').some((r) => r.id === ev3.id)
  && leerTodo_('REGISTRO').some((r) => r.id === ev3.id));
debeFallar('un admin no puede borrar definitivo', () => apiEliminarRegistro(ev2.id, true, ''), 'solo para el MASTER');
login(apiEntrarClave('master@tlterminals.com', 'almacen'));
apiEliminarRegistro(ev2.id, true, 'prueba borrado duro');
ok('el MASTER sí borra definitivo', !leerTodo_('REGISTRO').some((r) => r.id === ev2.id));

console.log('\n11. Módulo de prueba controlada (estudio de tiempos)');
login(apiEntrarPin(betoId, '4321'));
const pr = apiIniciarPrueba({
  furgonId: 'TCAR112233', config: 'C', totalTons: 24, totalAtados: 40,
  presentacion: 'Atado', cliente: 'Cliente A',
  maquinas: [{ id: maq['MTC-01'], operadorId: emp['Juan Montacarguista'] }]
});
ok('la prueba arranca posicionada', pr.estado === 'posicionado' && pr.posicionadoMs > 0);
ok('folio de prueba con código PC', pr.folio === 'TCAR112233-' + yymmdd + '-PC-01', pr.folio);
sim.avanzar(120 * 1000);
apiMarcaPrueba(pr.id, 'inicioExt');
sim.avanzar(300 * 1000);          // 5 min extracción
apiMarcaPrueba(pr.id, 'finExt');
debeFallar('no repite una marca ya tomada', () => apiMarcaPrueba(pr.id, 'finExt'), 'ya se registró');
sim.avanzar(60 * 1000);
apiMarcaPrueba(pr.id, 'inicioAco');
sim.avanzar(240 * 1000);          // 4 min acomodo
apiMarcaPrueba(pr.id, 'finAco');
sim.avanzar(60 * 1000);
const prf = apiFinalizarPrueba(pr.id, { esperaFL1Min: 3, m2: 50, nivelesEstiba: 4 });
ok('prueba finalizada', prf.estado === 'finalizado');
ok('tiempo de extracción = 5 min', prf.tiempoExtraccionMin === 5, prf.tiempoExtraccionMin);
ok('tiempo de acomodo = 4 min', prf.tiempoAcomodoMin === 4, prf.tiempoAcomodoMin);
ok('tiempo total = 13 min', prf.tiempoTotalMin === 13, prf.tiempoTotalMin);
ok('toneladas por hora ≈ 110.77', Math.abs(prf.tonsPorHora - 110.77) < 0.1, prf.tonsPorHora);
ok('guarda espera FL1, m2 y niveles', prf.esperaFL1Min === 3 && prf.m2 === 50 && prf.nivelesEstiba === 4);

console.log('\n12. Tablero (KPIs)');
login(apiEntrarClave('ana@tlterminals.com', 'ana123'));
const dash = apiDashboard('', '');
ok('el tablero cuenta la maniobra finalizada', dash.total >= 1, dash.total);
ok('reporta cumplimiento de SLA', typeof dash.cumplimiento === 'number');
ok('desglosa productividad por operador', dash.operadores.some((o) => o.operador === 'Juan Montacarguista'));
ok('desglosa uso de maquinaria por SKU', dash.maquinas.some((m) => m.sku === 'MTC-01'));

console.log('\n13. Exportación');
const xlsx = apiExportar('xlsx', '', '', '');
ok('exporta a Excel (data URL)', xlsx.dataUrl.indexOf('data:') === 0 && xlsx.nombre.indexOf('.xlsx') !== -1);
const pdf = apiExportar('pdf', '', '', '');
ok('exporta a PDF', pdf.nombre.indexOf('.pdf') !== -1);

console.log('\n14. Reportes por correo');
login(apiEntrarClave('master@tlterminals.com', 'almacen'));
apiGuardarReporte({ nombre: 'Diario patio', frecuencia: 'diario', hora: 7, destinatarios: 'jefe@tlterminals.com' });
ok('instala el disparador de reportes', sim.disparadores.some((t) => t.getHandlerFunction() === 'jobReportes'));
const repId = leerTodo_('CONFIG_REPORTES')[0].id;
const antesCorreos = sim.correosEnviados.length;
apiEnviarReporteAhora(repId);
ok('envía el reporte de inmediato con adjunto', sim.correosEnviados.length === antesCorreos + 1
  && sim.correosEnviados[sim.correosEnviados.length - 1].attachments.length === 1);

console.log('\n15. Despachador y permisos');
ok('ejecutar() enruta una función pública',
  ejecutar(SESION_TOKEN, 'apiEstadoApp', []).sesion === true);
debeFallar('bloquea funciones no expuestas', () => ejecutar('', 'instalar', []), 'no permitida');
debeFallar('bloquea funciones inventadas', () => ejecutar('', 'borrarTodo', []), 'no permitida');
login(apiEntrarPin(betoId, '4321'));
debeFallar('un operativo no ve usuarios', () => apiUsuarios(), 'permiso');
debeFallar('un operativo no edita registros', () => apiEditarRegistro(ev1.id, { cliente: 'X' }), 'permiso');

console.log('\n16. Protección de hoja y verificación');
ok('protegerHojas() corre sin error', protegerHojas() === true);
ok('verificar() pasa', verificar() === true);

console.log('\n17. Bitácora y Drive');
ok('la bitácora acumula movimientos', leerTodo_('LOG_AUDITORIA').length > 15, leerTodo_('LOG_AUDITORIA').length);
ok('existe la carpeta del almacén', carpeta_().getName() === NOMBRE_CARPETA);
login(apiEntrarPin(betoId, '4321'));
const foto = apiSubirFoto(ev1.id, { nombre: 'daño.jpg', tipo: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,' + Buffer.from('x').toString('base64') }, 'daño');
ok('sube foto a Drive y devuelve liga', foto.liga.indexOf('drive.google.com') !== -1);

console.log('\n' + '='.repeat(52));
console.log('  ' + pasadas + ' pruebas pasadas, ' + fallidas + ' fallidas');
console.log('='.repeat(52) + '\n');
process.exit(fallidas ? 1 : 0);
