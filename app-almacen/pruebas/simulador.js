/**
 * Simulador mínimo del entorno de Apps Script para probar la lógica del almacén
 * sin desplegar. No reemplaza una prueba real en GAS, pero atrapa errores de
 * programación y de reglas de negocio, y deja correr todos los flujos.
 *
 * Incluye un reloj controlable (sim.fijarReloj / sim.avanzar) para poder medir
 * los cronómetros de forma determinista.
 */
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const RealDate = Date;

// ------------------------------------------------------------- reloj controlable
let relojMs = RealDate.now();
Date.now = () => relojMs;

// --------------------------------------------------------------- propiedades
const propiedades = {};
global.PropertiesService = {
  getScriptProperties: () => ({
    getProperty: (k) => (k in propiedades ? propiedades[k] : null),
    setProperty: (k, v) => { propiedades[k] = String(v); }
  })
};

// ------------------------------------------------------------------- utilidad
function dosDigitos(n) { return String(n).padStart(2, '0'); }
global.Utilities = {
  getUuid: () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  }),
  base64Decode: (t) => Buffer.from(String(t), 'base64'),
  base64Encode: (b) => Buffer.from(b).toString('base64'),
  newBlob: (datos, tipo, nombre) => blobFalso(datos, tipo, nombre),
  computeDigest: (algo, texto) => {
    // Hash determinista suficiente para pruebas (no es SHA real, pero estable).
    const s = String(texto);
    const out = [];
    for (let i = 0; i < 32; i++) {
      let h = 0;
      for (let j = 0; j < s.length; j++) { h = (h * 31 + s.charCodeAt(j) + i * 7) & 0xff; }
      out.push(h > 127 ? h - 256 : h);
    }
    return out;
  },
  DigestAlgorithm: { SHA_256: 'SHA_256' },
  formatDate: (fecha, tz, formato) => formato
    .replace(/yyyy/g, fecha.getFullYear())
    .replace(/MM/g, dosDigitos(fecha.getMonth() + 1))
    .replace(/dd/g, dosDigitos(fecha.getDate()))
    .replace(/HH/g, dosDigitos(fecha.getHours()))
    .replace(/mm/g, dosDigitos(fecha.getMinutes()))
    .replace(/ss/g, dosDigitos(fecha.getSeconds()))
    .replace(/'T'/g, 'T')
};
function blobFalso(datos, tipo, nombre) {
  return {
    _nombre: nombre, _tipo: tipo, _datos: datos,
    getName() { return this._nombre; }, setName(n) { this._nombre = n; return this; },
    getContentType() { return this._tipo; }, getBytes() { return this._datos; },
    getAs() { return this; }
  };
}

let usuarioSimulado = 'master@tlterminals.com';
global.Session = {
  getActiveUser: () => ({ getEmail: () => usuarioSimulado }),
  getEffectiveUser: () => ({ getEmail: () => usuarioSimulado }),
  getScriptTimeZone: () => 'America/Mexico_City'
};

const registro = [];
global.Logger = { log: (m) => registro.push(String(m)) };

const correosEnviados = [];
global.MailApp = { sendEmail: (o) => correosEnviados.push(o) };

const disparadores = [];
function constructorDisparador(fn) {
  const base = { create: () => { disparadores.push({ getHandlerFunction: () => fn }); } };
  const cada = () => base;
  return { timeBased: () => ({ everyHours: cada, everyMinutes: cada, everyDays: cada, atHour: () => ({ everyDays: cada }) }) };
}
global.ScriptApp = {
  getProjectTriggers: () => disparadores,
  deleteTrigger: (t) => disparadores.splice(disparadores.indexOf(t), 1),
  newTrigger: (fn) => constructorDisparador(fn),
  getOAuthToken: () => 'token-de-prueba',
  getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/PRUEBA/exec' })
};

global.UrlFetchApp = {
  fetch: (url) => ({
    getBlob: () => blobFalso(Buffer.from('archivo-exportado'),
      url.indexOf('pdf') !== -1 ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'export')
  })
};

global.HtmlService = {
  createHtmlOutputFromFile: (nombre) => {
    const archivo = path.join(RAIZ, nombre + '.html');
    if (!fs.existsSync(archivo)) { throw new Error('No HTML file named ' + nombre); }
    return { getContent: () => fs.readFileSync(archivo, 'utf8') };
  },
  createTemplateFromFile: () => ({ evaluate: () => cadenaHtml() }),
  XFrameOptionsMode: { ALLOWALL: 1 }
};
function cadenaHtml() {
  const o = {};
  ['setTitle', 'addMetaTag', 'setXFrameOptionsMode'].forEach((m) => { o[m] = () => o; });
  return o;
}

// ------------------------------------------------------------ hojas de cálculo
function proteccionFalsa() {
  return {
    setDescription() { return this; }, addEditor() { return this; },
    canEdit() { return true; }, remove() {}, canDomainEdit() { return false; },
    setDomainEdit() { return this; }
  };
}
class HojaFalsa {
  constructor(nombre) { this.nombre = nombre; this.datos = []; }
  getName() { return this.nombre; }
  setName(n) { this.nombre = n; return this; }
  getLastRow() { return this.datos.length; }
  getLastColumn() { return this.datos.reduce((max, f) => Math.max(max, f.length), 0); }
  appendRow(fila) { this.datos.push(fila.slice()); }
  deleteRow(n) { this.datos.splice(n - 1, 1); }
  setFrozenRows() { return this; }
  autoResizeColumns() { return this; }
  protect() { return proteccionFalsa(); }
  getProtections() { return []; }
  getRange(fila, col, nFilas, nCols) {
    const hoja = this;
    nFilas = nFilas || 1; nCols = nCols || 1;
    return {
      getValues() {
        const salida = [];
        for (let i = 0; i < nFilas; i++) {
          const origen = hoja.datos[fila - 1 + i] || [];
          const renglon = [];
          for (let j = 0; j < nCols; j++) {
            renglon.push(origen[col - 1 + j] === undefined ? '' : origen[col - 1 + j]);
          }
          salida.push(renglon);
        }
        return salida;
      },
      setValues(valores) {
        for (let i = 0; i < valores.length; i++) {
          const indice = fila - 1 + i;
          if (!hoja.datos[indice]) { hoja.datos[indice] = []; }
          for (let j = 0; j < valores[i].length; j++) {
            hoja.datos[indice][col - 1 + j] = valores[i][j];
          }
        }
        return this;
      },
      setFontWeight() { return this; }
    };
  }
}
class LibroFalso {
  constructor(nombre) {
    this.nombre = nombre;
    this.id = 'libro_' + Math.random().toString(36).slice(2, 8);
    this.hojas = [new HojaFalsa('Hoja 1')];
    librosPorId[this.id] = this;
    const arch = new ArchivoFalso(nombre); arch.id = this.id; archivosPorId[this.id] = arch;
  }
  getId() { return this.id; }
  getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this.id; }
  getSheets() { return this.hojas; }
  getActiveSheet() { return this.hojas[0]; }
  getSheetByName(n) { return this.hojas.find((h) => h.getName() === n) || null; }
  insertSheet(n) { const h = new HojaFalsa(n); this.hojas.push(h); return h; }
  deleteSheet(h) { this.hojas.splice(this.hojas.indexOf(h), 1); }
}
const librosPorId = {};
global.SpreadsheetApp = {
  create: (nombre) => new LibroFalso(nombre),
  openById: (id) => {
    if (!librosPorId[id]) { throw new Error('No existe la hoja ' + id); }
    return librosPorId[id];
  },
  flush: () => {},
  ProtectionType: { SHEET: 'SHEET' }
};

// ------------------------------------------------------------------ Drive
class ArchivoFalso {
  constructor(nombre, blob) {
    this.nombre = nombre; this.blob = blob || null;
    this.id = 'arch_' + Math.random().toString(36).slice(2, 8);
    this.padre = null; this.compartido = null; this.trashed = false;
    archivosPorId[this.id] = this;
  }
  getId() { return this.id; }
  getName() { return this.nombre; }
  getUrl() { return 'https://drive.google.com/file/d/' + this.id; }
  moveTo(carpeta) { this.padre = carpeta; return this; }
  setSharing(a, p) { this.compartido = [a, p]; return this; }
  setTrashed(v) { this.trashed = v; return this; }
  getAs() { return this.blob || blobFalso(Buffer.from(''), 'application/pdf', this.nombre); }
}
class CarpetaFalsa {
  constructor(nombre) {
    this.nombre = nombre;
    this.id = 'carp_' + Math.random().toString(36).slice(2, 8);
    this.subcarpetas = []; this.archivos = [];
    carpetasPorId[this.id] = this;
  }
  getId() { return this.id; }
  getName() { return this.nombre; }
  getUrl() { return 'https://drive.google.com/drive/folders/' + this.id; }
  createFolder(nombre) { const c = new CarpetaFalsa(nombre); this.subcarpetas.push(c); return c; }
  createFile(blob) {
    const a = new ArchivoFalso(blob.getName ? blob.getName() : 'archivo', blob);
    a.padre = this; this.archivos.push(a); return a;
  }
  getFoldersByName(nombre) {
    const enc = this.subcarpetas.filter((c) => c.getName() === nombre);
    let i = 0;
    return { hasNext: () => i < enc.length, next: () => enc[i++] };
  }
}
const carpetasPorId = {};
const archivosPorId = {};
global.DriveApp = {
  createFolder: (nombre) => new CarpetaFalsa(nombre),
  getFolderById: (id) => { if (!carpetasPorId[id]) { throw new Error('No existe la carpeta ' + id); } return carpetasPorId[id]; },
  getFileById: (id) => { if (!archivosPorId[id]) { archivosPorId[id] = new ArchivoFalso('archivo_' + id); } return archivosPorId[id]; },
  Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' },
  Permission: { VIEW: 'VIEW' }
};

// ------------------------------------------------------- cargar el código real
[
  'Db.gs', 'Auth.gs', 'Registro.gs', 'Prueba.gs', 'Empleados.gs',
  'Sla.gs', 'Catalogos.gs', 'Reportes.gs', 'Master.gs', 'Fotos.gs', 'Code.gs'
].forEach((archivo) => {
  const codigo = fs.readFileSync(path.join(RAIZ, archivo), 'utf8');
  try {
    (0, eval)(codigo);
  } catch (err) {
    console.error('ERROR DE SINTAXIS en ' + archivo + ': ' + err.message);
    process.exit(1);
  }
});

module.exports = {
  comoUsuario: (correo) => { usuarioSimulado = correo; },
  fijarReloj: (ms) => { relojMs = ms; },
  avanzar: (ms) => { relojMs += ms; },
  ahoraMs: () => relojMs,
  carpetasPorId, archivosPorId, registro, correosEnviados, disparadores
};
