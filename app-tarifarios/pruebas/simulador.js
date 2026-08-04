/**
 * Simulador mínimo del entorno de Apps Script para probar la lógica de los
 * tarifarios sin desplegar. No reemplaza una prueba real, pero atrapa errores
 * de programación y de reglas de negocio.
 */
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

// ---------------------------------------------------------------- propiedades
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
  sleep: () => undefined,
  getUuid: () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  }),
  formatDate: (fecha, tz, formato) => formato
    .replace(/yyyy/g, fecha.getFullYear())
    .replace(/MM/g, dosDigitos(fecha.getMonth() + 1))
    .replace(/dd/g, dosDigitos(fecha.getDate()))
    .replace(/HH/g, dosDigitos(fecha.getHours()))
    .replace(/mm/g, dosDigitos(fecha.getMinutes()))
    .replace(/ss/g, dosDigitos(fecha.getSeconds()))
};

let usuarioSimulado = 'admin@tlterminals.com';
global.Session = {
  getActiveUser: () => ({ getEmail: () => usuarioSimulado }),
  getEffectiveUser: () => ({ getEmail: () => usuarioSimulado }),
  getScriptTimeZone: () => 'America/Mexico_City'
};

const registro = [];
global.Logger = { log: (m) => registro.push(String(m)) };

global.ScriptApp = {
  getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/PRUEBA/exec' })
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
class HojaFalsa {
  constructor(nombre) { this.nombre = nombre; this.datos = []; }
  getName() { return this.nombre; }
  setName(n) { this.nombre = n; return this; }
  getLastRow() { return this.datos.length; }
  getLastColumn() {
    return this.datos.reduce((max, f) => Math.max(max, f.length), 0);
  }
  appendRow(fila) { this.datos.push(fila.slice()); }
  deleteRow(n) { this.datos.splice(n - 1, 1); }
  setFrozenRows() { return this; }
  autoResizeColumns() { return this; }
  hideSheet() { this.oculta = true; return this; }
  getRange(fila, col, nFilas, nCols) {
    const hoja = this;
    nFilas = nFilas || 1;
    nCols = nCols || 1;
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
      setFontWeight() { return this; },
      setValue(v) { return this.setValues([[v]]); },
      // GOOGLEFINANCE no existe fuera de Google: la fórmula se queda como texto
      // y el sistema tiene que aguantarlo y seguir con el valor manual.
      setFormula(f) { return this.setValues([[f]]); },
      getValue() { return this.getValues()[0][0]; },
      clearContent() { return this.setValues([['']]); }
    };
  }
}

class LibroFalso {
  constructor(nombre) {
    this.nombre = nombre;
    this.id = 'libro_' + Math.random().toString(36).slice(2, 8);
    this.hojas = [new HojaFalsa('Hoja 1')];
    librosPorId[this.id] = this;
    const archivo = new ArchivoFalso(nombre);
    delete archivosPorId[archivo.id];
    archivo.id = this.id;
    archivosPorId[this.id] = archivo;
  }
  getId() { return this.id; }
  getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this.id; }
  getSheets() { return this.hojas; }
  getActiveSheet() { return this.hojas[0]; }
  getSheetByName(n) { return this.hojas.find((h) => h.getName() === n) || null; }
  insertSheet(n, posicion) {
    const h = new HojaFalsa(n === undefined ? 'Hoja ' + (this.hojas.length + 1) : n);
    if (posicion === undefined) { this.hojas.push(h); } else { this.hojas.splice(posicion, 0, h); }
    return h;
  }
  deleteSheet(h) { this.hojas.splice(this.hojas.indexOf(h), 1); }
}

const librosPorId = {};
global.SpreadsheetApp = {
  flush: () => undefined,
  create: (nombre) => new LibroFalso(nombre),
  openById: (id) => {
    if (!librosPorId[id]) { throw new Error('No existe la hoja ' + id); }
    return librosPorId[id];
  }
};

// ------------------------------------------------------------------ Drive
class ArchivoFalso {
  constructor(nombre) {
    this.nombre = nombre;
    this.id = 'arch_' + Math.random().toString(36).slice(2, 8);
    this.padre = null;
    archivosPorId[this.id] = this;
  }
  getId() { return this.id; }
  getName() { return this.nombre; }
  moveTo(carpeta) { this.padre = carpeta; return this; }
}

class CarpetaFalsa {
  constructor(nombre) {
    this.nombre = nombre;
    this.id = 'carp_' + Math.random().toString(36).slice(2, 8);
    this.subcarpetas = [];
    this.archivos = [];
    carpetasPorId[this.id] = this;
  }
  getId() { return this.id; }
  getName() { return this.nombre; }
  getUrl() { return 'https://drive.google.com/drive/folders/' + this.id; }
  createFolder(nombre) { const c = new CarpetaFalsa(nombre); this.subcarpetas.push(c); return c; }
  getFoldersByName(nombre) {
    const encontradas = this.subcarpetas.filter((c) => c.getName() === nombre);
    let i = 0;
    return { hasNext: () => i < encontradas.length, next: () => encontradas[i++] };
  }
}

const carpetasPorId = {};
const archivosPorId = {};
global.DriveApp = {
  createFolder: (nombre) => new CarpetaFalsa(nombre),
  getFolderById: (id) => {
    if (!carpetasPorId[id]) { throw new Error('No existe la carpeta ' + id); }
    return carpetasPorId[id];
  },
  getFileById: (id) => {
    if (!archivosPorId[id]) { archivosPorId[id] = new ArchivoFalso('archivo_' + id); }
    return archivosPorId[id];
  }
};

// ------------------------------------------------------- cargar el código real
// Normalmente carga los diez .gs del proyecto. Con ARCHIVO_UNICO carga en su
// lugar la versión de todo-en-uno, para comprobar que esa también sirve.
const ARCHIVOS = process.env.ARCHIVO_UNICO
  ? [process.env.ARCHIVO_UNICO]
  : ['Db.gs', 'Sesion.gs', 'TipoCambio.gs', 'Campos.gs', 'Catalogos.gs', 'Tarifas.gs',
     'Comparador.gs', 'Importar.gs', 'Exportar.gs', 'Code.gs'];

ARCHIVOS.forEach((archivo) => {
  const codigo = fs.readFileSync(path.isAbsolute(archivo) ? archivo : path.join(RAIZ, archivo), 'utf8');
  try {
    (0, eval)(codigo);
  } catch (err) {
    console.error('ERROR DE SINTAXIS en ' + archivo + ': ' + err.message);
    process.exit(1);
  }
});

module.exports = {
  comoUsuario: (correo) => { usuarioSimulado = correo; },
  librosPorId,
  carpetasPorId,
  archivosPorId,
  registro
};
