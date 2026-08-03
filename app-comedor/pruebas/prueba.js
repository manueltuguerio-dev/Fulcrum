/** Escenario completo de uso del comedor sobre el simulador. */
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
const manana = sumarDias_(hoy, 1);

console.log('\n1. Instalación');
instalar();
ok('crea la hoja de cálculo', !!PropertiesService.getScriptProperties().getProperty(PROP_HOJA));
ok('crea las 9 pestañas', Object.keys(TABLAS).every((t) => !!hoja_(t)));
ok('deja al instalador como admin', usuarioActual_().rol === 'admin');
instalar();
ok('reinstalar no duplica al admin', leerTodo_('Empleados').length === 1);

console.log('\n2. Catálogo');
cargarEjemplo();
ok('carga 10 platillos', leerTodo_('Platillos').length === 10);
ok('no duplica al recargar', cargarEjemplo() === false && leerTodo_('Platillos').length === 10);

console.log('\n3. Empleados');
const idAna = apiGuardarEmpleado({ email: 'ana@tlterminals.com', nombre: 'Ana Ruiz', numeroNomina: '1024' });
const idBeto = apiGuardarEmpleado({ email: 'beto@tlterminals.com', nombre: 'Beto Lara', numeroNomina: '1025' });
ok('registra dos empleados', leerTodo_('Empleados').length === 3);
debeFallar('rechaza correo inválido', () => apiGuardarEmpleado({ email: 'no-es-correo' }), 'correo válido');

console.log('\n4. Menú del día');
apiCrearMenu(hoy);
const fijos = menuDeFecha_(hoy).platillos.length;
ok('agrega solos los platillos fijos', fijos === 7, 'fijos=' + fijos);
const principales = leerTodo_('Platillos').filter((p) => String(p.tipo) === 'principal');
apiAgregarAlMenu(hoy, principales[0].id, '');
apiAgregarAlMenu(hoy, principales[1].id, '');
ok('agrega principales', menuDeFecha_(hoy).platillos.length === 9);
debeFallar('no permite repetir platillo', () => apiAgregarAlMenu(hoy, principales[0].id, ''), 'ya está');

const antesDePublicar = menuDeFecha_(hoy);
ok('sin publicar, el menú está cerrado', antesDePublicar.abierto === false);

console.log('\n5. Hora corte');
apiActualizarMenu(hoy, '23:59', 'Hoy hay postre');
apiPublicarMenu(hoy);
const publicado = menuDeFecha_(hoy);
ok('publicado y abierto', publicado.abierto === true);
ok('conserva el aviso', publicado.aviso === 'Hoy hay postre');

console.log('\n6. Pedido del empleado');
sim.comoUsuario('ana@tlterminals.com');
const inicial = apiEstadoInicial();
ok('Ana ve dos días', inicial.dias.length === 2);
ok('Ana aún no tiene pedido', inicial.dias[0].miPedido === null);

const complementos = leerTodo_('Platillos').filter((p) => String(p.tipo) === 'complemento');
const salsas = leerTodo_('Platillos').filter((p) => String(p.tipo) === 'salsa');

apiGuardarPedido({
  fecha: hoy, principalId: String(principales[0].id),
  complementos: [String(complementos[0].id), String(complementos[1].id)],
  salsas: [String(salsas[0].id)], comentarios: 'Sin cebolla'
});
const conPedido = apiEstadoInicial();
ok('el pedido queda registrado', conPedido.dias[0].miPedido !== null);
ok('cobra el precio del principal', conPedido.dias[0].miPedido.importe === 65,
   'importe=' + conPedido.dias[0].miPedido.importe);
ok('guarda el comentario', conPedido.dias[0].miPedido.comentarios === 'Sin cebolla');

console.log('\n7. Reglas de armado');
debeFallar('máximo dos complementos', () => apiGuardarPedido({
  fecha: hoy, principalId: String(principales[0].id),
  complementos: complementos.map((c) => String(c.id)), salsas: []
}), 'máximo');
debeFallar('el platillo debe estar en el menú', () => apiGuardarPedido({
  fecha: hoy, principalId: 'inventado', complementos: [], salsas: []
}), 'no está en el menú');
debeFallar('no se puede pedir a tres días', () => apiGuardarPedido({
  fecha: sumarDias_(hoy, 3), principalId: String(principales[0].id), complementos: [], salsas: []
}), 'hoy y para mañana');

const sinComplementos = leerTodo_('Platillos').filter(
  (p) => String(p.tipo) === 'base' && !esSi_(p.permiteComplementos))[0];
sim.comoUsuario('admin@tlterminals.com');
debeFallar('un empleado no puede tocar el menú', () => {
  sim.comoUsuario('ana@tlterminals.com');
  apiAgregarAlMenu(hoy, principales[2].id, '');
}, 'solo para el administrador');
sim.comoUsuario('admin@tlterminals.com');
ok('el platillo base ya venía en el menú por ser fijo',
   menuDeFecha_(hoy).platillos.some((p) => p.platilloId === String(sinComplementos.id)));
sim.comoUsuario('ana@tlterminals.com');
debeFallar('respeta permiteComplementos', () => apiGuardarPedido({
  fecha: hoy, principalId: String(sinComplementos.id),
  complementos: [String(complementos[0].id)], salsas: []
}), 'no lleva complementos');

console.log('\n8. Un solo pedido vigente por día');
apiGuardarPedido({
  fecha: hoy, principalId: String(principales[1].id), complementos: [], salsas: []
});
const deAna = leerTodo_('Pedidos').filter(
  (p) => String(p.email) === 'ana@tlterminals.com' && textoFecha_(p.fecha) === hoy);
ok('editar no crea un segundo pedido', deAna.length === 1, 'encontrados=' + deAna.length);
ok('el pedido quedó actualizado', String(deAna[0].principalId) === String(principales[1].id));

console.log('\n9. Tarifas personalizadas');
sim.comoUsuario('admin@tlterminals.com');
apiGuardarTarifa({ empleadoId: idBeto, platilloId: '', modo: 'descuento_pct', valor: 50 });
sim.comoUsuario('beto@tlterminals.com');
apiGuardarPedido({ fecha: hoy, principalId: String(principales[0].id), complementos: [], salsas: [] });
const pedidoBeto = apiEstadoInicial().dias[0].miPedido;
ok('aplica 50% de descuento', pedidoBeto.importe === 32.5, 'importe=' + pedidoBeto.importe);

console.log('\n10. Cancelar');
apiCancelarPedido(pedidoBeto.id);
ok('queda sin pedido vigente', apiEstadoInicial().dias[0].miPedido === null);
apiGuardarPedido({ fecha: hoy, principalId: String(principales[0].id), complementos: [], salsas: [] });
ok('puede volver a pedir tras cancelar', apiEstadoInicial().dias[0].miPedido !== null);

console.log('\n11. Cierre por hora corte');
sim.comoUsuario('admin@tlterminals.com');
apiActualizarMenu(hoy, '00:01', 'Hoy hay postre');
sim.comoUsuario('ana@tlterminals.com');
ok('pasada la hora, el día está cerrado', menuDeFecha_(hoy).abierto === false);
debeFallar('el empleado ya no puede pedir', () => apiGuardarPedido({
  fecha: hoy, principalId: String(principales[0].id), complementos: [], salsas: []
}), 'ya cerraron');

console.log('\n12. Poderes del administrador');
sim.comoUsuario('admin@tlterminals.com');
const idCarla = apiGuardarEmpleado({ email: 'carla@tlterminals.com', nombre: 'Carla Mora', numeroNomina: '1026' });
apiPedidoExpreso(idCarla, {
  fecha: hoy, principalId: String(principales[0].id), complementos: [], salsas: [], comentarios: 'Llegó tarde'
});
const deCarla = leerTodo_('Pedidos').filter((p) => String(p.email) === 'carla@tlterminals.com');
ok('el expreso ignora la hora corte', deCarla.length === 1);
ok('el expreso queda marcado', String(deCarla[0].origen) === 'admin_expreso');

const entregados = apiMarcarEntregados(hoy);
ok('marca entregas en masa', entregados === 3, 'entregados=' + entregados);

console.log('\n13. Producción y cobros');
const produccion = apiResumenProduccion(hoy);
ok('cuenta las comidas del día', produccion.totalComidas === 3, 'comidas=' + produccion.totalComidas);
ok('desglosa por platillo', produccion.principales.length >= 1);

const cobros = apiReporteCobros(hoy, hoy);
ok('cobra a tres personas', cobros.empleados === 3, 'empleados=' + cobros.empleados);
ok('suma 65 + 32.50 + 65', cobros.total === 162.5, 'total=' + cobros.total);
ok('marca el expreso como excepción', cobros.excepciones === 1);

console.log('\n14. Condonación');
apiCondonar(deCarla[0].id, 'No se presentó y avisó', true);
const trasCondonar = apiReporteCobros(hoy, hoy);
ok('el condonado deja de sumar', trasCondonar.total === 97.5, 'total=' + trasCondonar.total);
ok('sigue contando como excepción', trasCondonar.excepciones === 1);
ok('sigue contando para producción', apiResumenProduccion(hoy).totalComidas === 3);

console.log('\n15. Baja y reactivación');
apiCambiarEstadoEmpleado(idAna, 'inactivo');
sim.comoUsuario('ana@tlterminals.com');
debeFallar('la cuenta inactiva no entra', () => exigirSesion_(), 'desactivada');
sim.comoUsuario('admin@tlterminals.com');
ok('conserva su historial', apiReporteCobros(hoy, hoy).resumen.some((e) => e.nombre === 'Ana Ruiz'));
apiCambiarEstadoEmpleado(idAna, 'activo');
sim.comoUsuario('ana@tlterminals.com');
ok('la reactivación devuelve el acceso', exigirSesion_().estado === 'activo');

console.log('\n16. Permisos');
debeFallar('un empleado no entra a admin', () => apiAdminEstado(), 'solo para el administrador');
debeFallar('un empleado no ve los cobros', () => apiReporteCobros(hoy, hoy), 'solo para el administrador');

console.log('\n17. Cierre automático');
sim.comoUsuario('admin@tlterminals.com');
const totalAntesDelCierre = apiReporteCobros(hoy, hoy).total;
jobCierre();
const noComen = leerTodo_('Pedidos').filter(
  (p) => textoFecha_(p.fecha) === hoy && String(p.estado) === 'no_come');
ok('registra no_come solo a quien no pidió', noComen.length === 1, 'no_come=' + noComen.length);
ok('cierra el menú vencido', menuDeFecha_(hoy).estado === 'cerrado');
ok('el no_come no cobra', apiReporteCobros(hoy, hoy).total === totalAntesDelCierre);
ok('avisa al administrador por correo',
   sim.correosEnviados.some((c) => c.subject.indexOf('cerró el pedido') !== -1));
jobCierre();
const trasSegundaCorrida = leerTodo_('Pedidos').filter(
  (p) => textoFecha_(p.fecha) === hoy && String(p.estado) === 'no_come');
ok('correrlo dos veces no duplica', trasSegundaCorrida.length === 1);

apiCrearMenu(manana);
apiAgregarAlMenu(manana, principales[0].id, '');
apiActualizarMenu(manana, '23:59', '');
apiPublicarMenu(manana);
jobCierre();
ok('no cierra un menú que aún no vence', menuDeFecha_(manana).estado === 'publicado');

console.log('\n18. WhatsApp y exportación');
const mensaje = apiMensajeWhatsApp(hoy);
ok('el mensaje trae los platillos', mensaje.texto.indexOf('Milanesa') !== -1);
ok('el mensaje trae la liga', mensaje.texto.indexOf('macros/s/PRUEBA/exec') !== -1);
ok('genera la liga de WhatsApp', mensaje.ligaWhatsApp.indexOf('wa.me') === 8);

const exportado = apiExportarCobros(hoy, hoy);
ok('exporta a hoja de cálculo', exportado.url.indexOf('spreadsheets') !== -1);

console.log('\n19. Disparadores y verificación');
instalarDisparadores();
ok('deja dos disparadores', sim.disparadores.length === 2);
ok('verificar() pasa', verificar() === true);

console.log('\n20. Acceso con correos externos');
sim.comoUsuario('admin@tlterminals.com');
const idDiana = apiGuardarEmpleado({
  email: 'diana.perez@hotmail.com', nombre: 'Diana Pérez', numeroNomina: '1027' });
const fichaDiana = leerTodo_('Empleados').filter((e) => String(e.id) === String(idDiana))[0];
ok('el alta genera token', String(fichaDiana.token).length >= 32);
ok('la liga personal lleva el token',
   apiAdminEstado().empleados.some((e) => e.liga.indexOf('?t=' + fichaDiana.token) !== -1));

// Nadie identificado: ni token ni sesión de Google conocida.
sim.comoUsuario('desconocido@outlook.com');
SESION_TOKEN = '';
ok('sin token ni alta, no hay sesión', apiEstadoInicial().registrado === false);

// Con su liga personal sí entra, aunque su correo sea externo.
SESION_TOKEN = String(fichaDiana.token);
const comoDiana = usuarioActual_();
ok('el token identifica a Diana', comoDiana && comoDiana.email === 'diana.perez@hotmail.com');
ok('y queda como empleada', comoDiana.rol === 'empleado');
debeFallar('una empleada externa no es admin', () => apiAdminEstado(), 'solo para el administrador');

SESION_TOKEN = 'token-inventado';
ok('un token falso no identifica a nadie', usuarioActual_().tokenInvalido === true);
debeFallar('y no deja operar', () => exigirSesion_(), 'ya no es válida');

// Regenerar invalida la liga anterior.
SESION_TOKEN = '';
sim.comoUsuario('admin@tlterminals.com');
const ligaNueva = apiRegenerarLiga(idDiana);
SESION_TOKEN = String(fichaDiana.token);
ok('la liga vieja deja de servir', usuarioActual_().tokenInvalido === true);
SESION_TOKEN = ligaNueva.split('?t=')[1];
ok('la liga nueva sí sirve', usuarioActual_().email === 'diana.perez@hotmail.com');
SESION_TOKEN = '';

console.log('\n21. Despachador');
sim.comoUsuario('admin@tlterminals.com');
ok('ejecutar() enruta la llamada', ejecutar('', 'apiEstadoInicial', []).registrado === true);
ok('ejecutar() fija el token', ejecutar(ligaNueva.split('?t=')[1], 'apiEstadoInicial', [])
   .usuario.email === 'diana.perez@hotmail.com');
debeFallar('bloquea funciones no expuestas',
  () => ejecutar('', 'instalar', []), 'no permitida');
debeFallar('bloquea funciones inventadas',
  () => ejecutar('', 'borrarTodo', []), 'no permitida');
SESION_TOKEN = '';

console.log('\n22. Drive como base de datos');
sim.comoUsuario('admin@tlterminals.com');
const carpeta = carpeta_();
ok('existe la carpeta del comedor', carpeta.getName() === NOMBRE_CARPETA);
ok('la hoja de cálculo vive en ella',
   sim.archivosPorId[PropertiesService.getScriptProperties().getProperty(PROP_HOJA)].padre === carpeta);
ok('hay subcarpeta de fotos', carpetaFotos_().getName() === 'Fotos');
const ligaFoto = apiSubirFoto('milanesa.jpg', Buffer.from('imagen falsa').toString('base64'), 'image/jpeg');
ok('la foto se guarda y devuelve liga', ligaFoto.indexOf('drive.google.com/thumbnail') === 8);
ok('la foto queda pública',
   carpetaFotos_().archivos[0].compartido[0] === 'ANYONE_WITH_LINK');
const exportado2 = apiExportarCobros(hoy, hoy);
ok('el reporte también va a la carpeta',
   Object.keys(sim.archivosPorId).some((k) => sim.archivosPorId[k].padre === carpeta));

console.log('\n23. Bitácora');
ok('registra los movimientos', leerTodo_('Bitacora').length > 15,
   'renglones=' + leerTodo_('Bitacora').length);

console.log('\n' + '='.repeat(52));
console.log('  ' + pasadas + ' pruebas pasadas, ' + fallidas + ' fallidas');
console.log('='.repeat(52) + '\n');
process.exit(fallidas ? 1 : 0);
