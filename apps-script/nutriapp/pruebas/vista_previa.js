/**
 * Genera una vista previa navegable de la interfaz, sin Apps Script.
 *
 *   node apps-script/nutriapp/pruebas/vista_previa.js [destino.html]
 *
 * Arma un solo archivo HTML con los estilos y los scripts ya incrustados, y
 * sustituye google.script.run por un doble que responde con datos generados
 * por el backend real corriendo en el simulador. Sirve para revisar la
 * interfaz en el navegador antes de desplegar.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { contexto } = require('./simulador');

const RAIZ = path.join(__dirname, '..');
const ARCHIVOS = ['Code.gs', 'Datos.gs', 'Auth.gs', 'KatchMcArdle.gs', 'Reglas.gs', 'Menus.gs', 'Milpa.gs',
  'IA.gs', 'MetaWhatsApp.gs', 'Api.gs'];

const sandbox = vm.createContext(Object.assign({ console }, contexto));
ARCHIVOS.forEach((archivo) => {
  vm.runInContext(fs.readFileSync(path.join(RAIZ, archivo), 'utf8'), sandbox, { filename: archivo });
});

function haceDias(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return sandbox.aFechaISO_(d);
}

/* ---------- Datos de demostración ---------- */

const setup = sandbox.setupDatabase();
const nutriologo = sandbox.loginUser('nutriologo@ejemplo.com', setup.nutriologo.passwordTemporal);

const alta = sandbox.crearPaciente(nutriologo.token, {
  nombre: 'María López', email: 'maria@ejemplo.com', estatura: 162, sexo: 'Mujer', factorActividad: 1.375
});
const paciente = sandbox.loginUser('maria@ejemplo.com', alta.passwordTemporal);

[
  [150, 82.4, 36.0, 47.5, 48.0, 12, 190, 205, 104],
  [120, 81.0, 35.4, 47.6, 48.6, 11, 178, 199, 101],
  [90, 79.2, 34.6, 47.8, 49.2, 11, 165, 196, 98],
  [60, 77.6, 33.8, 48.0, 50.1, 10, 152, 190, 95],
  [30, 76.1, 33.0, 48.1, 50.8, 9, 141, 184, 93],
  [2, 74.8, 32.2, 48.3, 51.4, 9, 133, 179, 91]
].forEach((m) => {
  sandbox.guardarMetricas(paciente.token, {
    fecha: haceDias(m[0]), peso: m[1], porcentajeGrasa: m[2], masaMuscular: m[3],
    agua: m[4], grasaVisceral: m[5], trigliceridos: m[6], colesterol: m[7], glucosa: m[8],
    fotoPesaUrl: 'https://drive.google.com/file/d/demo-' + m[0]
  });
});

const platillos = sandbox.getPlatillosSugeridos(paciente.token);
sandbox.guardarRegistroDiario(paciente.token, {
  tiempoComida: 'Desayuno',
  alimentos: platillos.Desayuno[0].alimentos.map((a) => ({ idAlimento: a.idAlimento, gramos: a.gramos }))
});
sandbox.guardarRegistroDiario(paciente.token, {
  tiempoComida: 'Comida',
  alimentos: platillos.Comida[0].alimentos.map((a) => ({ idAlimento: a.idAlimento, gramos: a.gramos }))
});
sandbox.guardarActividad(paciente.token, { tipo: 'Caminata rápida', minutos: 35 });
sandbox.guardarActividad(paciente.token, { tipo: 'Entrenamiento de fuerza', minutos: 40 });
sandbox.guardarMensajeChat(paciente.token, '¿Puedo cambiar el arroz integral por quinoa en la comida?');
sandbox.responderChat(nutriologo.token, alta.idPaciente, 'Sí. Usa 150 g de quinoa cocida; queda casi igual en calorías.');
sandbox.guardarMensajeChat(paciente.token, 'Perfecto, gracias. ¿Y el aguacate lo dejo igual?');

sandbox.preguntarAsistente(paciente.token, '¿Cuánta fibra debo comer al día?');
sandbox.preguntarAsistente(paciente.token, '¿Con qué puedo sustituir la carne?');

const otro = sandbox.crearPaciente(nutriologo.token, { nombre: 'Jorge Ramírez', email: 'jorge@ejemplo.com' });
const sesionJorge = sandbox.loginUser('jorge@ejemplo.com', otro.passwordTemporal);
sandbox.guardarMetricas(sesionJorge.token, { fecha: haceDias(45), peso: 95.2, porcentajeGrasa: 31, masaMuscular: 62 });
sandbox.guardarMetricas(sesionJorge.token, { fecha: haceDias(10), peso: 93.0, porcentajeGrasa: 30.2, masaMuscular: 62.2 });

/* ---------- Respuestas precocinadas ---------- */

const respuestas = {
  paciente: {
    getEstadoInicial: sandbox.getEstadoInicial(paciente.token),
    getTiposActividad: sandbox.getTiposActividad(paciente.token),
    getResumenDiario: sandbox.getResumenDiario(paciente.token, sandbox.aFechaISO_(new Date())),
    getChat: sandbox.getChat(paciente.token),
    getChatAsistente: sandbox.getChatAsistente(paciente.token),
    analisisEjemplo: sandbox.analizarComidaTexto(paciente.token, '200 g de frijol negro cocido con nopal y una guayaba'),
    tendencias: ['peso', 'masaMuscular', 'porcentajeGrasa', 'agua', 'grasaVisceral', 'trigliceridos', 'colesterol', 'glucosa']
      .reduce(function (acumulado, metrica) {
        acumulado[metrica] = sandbox.getTendenciaMetrica(paciente.token, metrica);
        return acumulado;
      }, {})
  },
  nutriologo: {
    getEstadoInicial: sandbox.getEstadoInicial(nutriologo.token),
    listarPacientes: sandbox.listarPacientes(nutriologo.token),
    expedientes: {
      [alta.idPaciente]: sandbox.getExpediente(nutriologo.token, alta.idPaciente),
      [otro.idPaciente]: sandbox.getExpediente(nutriologo.token, otro.idPaciente)
    }
  },
  credenciales: {
    paciente: { email: 'maria@ejemplo.com', password: alta.passwordTemporal },
    nutriologo: { email: 'nutriologo@ejemplo.com', password: setup.nutriologo.passwordTemporal }
  }
};

/* ---------- Armado del archivo ---------- */

function leer(nombre) {
  return fs.readFileSync(path.join(RAIZ, nombre), 'utf8');
}

const doble = `
<script>
/* Doble de google.script.run para la vista previa. Responde con los datos que
   generó el backend real dentro del simulador. */
var DATOS_DEMO = ${JSON.stringify(respuestas)};
var sesionDemo = null;

var respuestasDemo = {
  loginUser: function (email, password) {
    var c = DATOS_DEMO.credenciales;
    if (email.trim().toLowerCase() === c.paciente.email && password === c.paciente.password) {
      sesionDemo = 'paciente';
      return { token: 'demo-paciente', rol: 'Paciente', nombre: 'María López' };
    }
    if (email.trim().toLowerCase() === c.nutriologo.email && password === c.nutriologo.password) {
      sesionDemo = 'nutriologo';
      return { token: 'demo-nutriologo', rol: 'Nutriologo', nombre: 'Nutriólogo' };
    }
    throw new Error('Correo o contraseña incorrectos.');
  },
  getEstadoInicial: function (token) {
    var quien = token === 'demo-nutriologo' ? 'nutriologo' : 'paciente';
    sesionDemo = quien;
    return DATOS_DEMO[quien].getEstadoInicial;
  },
  getTiposActividad: function () { return DATOS_DEMO.paciente.getTiposActividad; },
  getPlatoMilpa: function () { return DATOS_DEMO.paciente.getEstadoInicial.milpa; },
  getPerfilPaciente: function () { return DATOS_DEMO.paciente.getEstadoInicial.datosPerfil; },
  guardarPerfilPaciente: function () {
    return { perfil: DATOS_DEMO.paciente.getEstadoInicial.datosPerfil, plan: DATOS_DEMO.paciente.getEstadoInicial.plan };
  },
  getTendenciaMetrica: function (token, metrica) {
    return DATOS_DEMO.paciente.tendencias[metrica] || DATOS_DEMO.paciente.tendencias.peso;
  },
  getChatAsistente: function () { return DATOS_DEMO.paciente.getChatAsistente; },
  analizarComidaTexto: function () { return DATOS_DEMO.paciente.analisisEjemplo; },
  preguntarAsistente: function (token, pregunta) {
    var chat = DATOS_DEMO.paciente.getChatAsistente.slice();
    chat.push({ mensaje: pregunta, enviadoPor: 'Paciente' });
    chat.push({ mensaje: 'En la vista previa el asistente responde esto para que puedas ver el formato del chat.', enviadoPor: 'Asistente' });
    return { ok: true, respuesta: 'Respuesta de ejemplo.', origen: 'local', chat: chat };
  },
  getResumenDiario: function () { return DATOS_DEMO.paciente.getResumenDiario; },
  getChat: function () { return DATOS_DEMO.paciente.getChat; },
  listarPacientes: function () { return DATOS_DEMO.nutriologo.listarPacientes; },
  getExpediente: function (token, id) { return DATOS_DEMO.nutriologo.expedientes[id]; },
  logoutUser: function () { return { ok: true }; },
  recoverPassword: function () { return { ok: true, mensaje: 'Vista previa: no se envían correos.' }; },
  guardarRegistroDiario: function () { return DATOS_DEMO.paciente.getResumenDiario; },
  borrarRegistroDiario: function () { return DATOS_DEMO.paciente.getResumenDiario; },
  guardarActividad: function () { return DATOS_DEMO.paciente.getResumenDiario; },
  guardarMetricas: function () { return DATOS_DEMO.paciente.getEstadoInicial.plan; },
  guardarMensajeChat: function () { return { ok: true, alertaWhatsApp: false, chat: DATOS_DEMO.paciente.getChat }; },
  uploadFileToDrive: function () { return { url: 'https://drive.google.com/file/d/vista-previa' }; },
  actualizarMetaPaciente: function () { return DATOS_DEMO.nutriologo.expedientes[Object.keys(DATOS_DEMO.nutriologo.expedientes)[0]].plan; },
  responderChat: function () { return { ok: true }; },
  crearPaciente: function () { return { ok: true, passwordTemporal: 'DemoTemporal123' }; },
  cambiarPassword: function () { return { ok: true, mensaje: 'Vista previa: sin cambios reales.' }; }
};

window.google = { script: { run: (function () {
  function constructor() {
    var exito = function () {};
    var fallo = function (e) { console.error(e); };
    var api = {
      withSuccessHandler: function (fn) { exito = fn; return api; },
      withFailureHandler: function (fn) { fallo = fn; return api; }
    };
    Object.keys(respuestasDemo).forEach(function (nombre) {
      api[nombre] = function () {
        var args = arguments;
        setTimeout(function () {
          try { exito(respuestasDemo[nombre].apply(null, args)); }
          catch (err) { fallo(err); }
        }, 60);
      };
    });
    return api;
  }
  var raiz = constructor();
  return new Proxy(raiz, { get: function (destino, llave) {
    var fresco = constructor();
    return typeof fresco[llave] === 'function' ? fresco[llave].bind(fresco) : fresco[llave];
  } });
})() } };
</script>
`;

/* El reemplazo va con función y no con cadena a propósito: String.replace
   interpreta $$ dentro del texto de sustitución como un $ literal, y Scripts
   define el ayudante $$ para querySelectorAll. Con una cadena, ese $$ se
   convertiría en $ y la vista previa quedaría rota de una forma que no ocurre
   en el archivo real. */
const salida = leer('Index.html')
  .replace("<?!= include('Estilos'); ?>", () => leer('Estilos.html'))
  .replace("<?!= include('Scripts'); ?>", () => doble + leer('Scripts.html'));

const destino = process.argv[2] || path.join(__dirname, 'vista-previa.html');
fs.writeFileSync(destino, salida);

/* Las contraseñas temporales se generan al azar en cada corrida. Se dejan
   junto al HTML para que una prueba automatizada pueda leerlas. */
const rutaCredenciales = destino.replace(/\.html$/, '') + '-credenciales.json';
fs.writeFileSync(rutaCredenciales, JSON.stringify(respuestas.credenciales, null, 2));

console.log('Vista previa escrita en ' + destino);
console.log('Credenciales en ' + rutaCredenciales);
console.log('Paciente:   ' + respuestas.credenciales.paciente.email + ' / ' + respuestas.credenciales.paciente.password);
console.log('Nutriólogo: ' + respuestas.credenciales.nutriologo.email + ' / ' + respuestas.credenciales.nutriologo.password);
