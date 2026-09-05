/**
 * Simulador mínimo de los servicios de Google Apps Script.
 *
 * Permite ejecutar el backend de NutriApp en Node para probar la lógica sin
 * desplegar nada. No reproduce Google Sheets con fidelidad: reproduce lo que
 * el código realmente usa (rangos rectangulares, appendRow, deleteRow).
 */

const crypto = require('crypto');

/* ---------- Hoja de cálculo en memoria ---------- */

class HojaFalsa {
  constructor(nombre) {
    this.nombre = nombre;
    this.celdas = [];
    this.filasCongeladas = 0;
  }

  getName() { return this.nombre; }
  setFrozenRows(n) { this.filasCongeladas = n; return this; }

  getLastRow() {
    for (let i = this.celdas.length - 1; i >= 0; i--) {
      const fila = this.celdas[i] || [];
      if (fila.some((v) => v !== '' && v !== null && v !== undefined)) { return i + 1; }
    }
    return 0;
  }

  getLastColumn() {
    return this.celdas.reduce((max, fila) => Math.max(max, (fila || []).length), 0);
  }

  asegurar(fila, columna) {
    while (this.celdas.length < fila) { this.celdas.push([]); }
    const f = this.celdas[fila - 1];
    while (f.length < columna) { f.push(''); }
  }

  getRange(fila, columna, alto, ancho) {
    alto = alto || 1;
    ancho = ancho || 1;
    const hoja = this;
    return {
      getValues() {
        const salida = [];
        for (let i = 0; i < alto; i++) {
          const renglon = [];
          for (let j = 0; j < ancho; j++) {
            const f = hoja.celdas[fila - 1 + i] || [];
            const v = f[columna - 1 + j];
            renglon.push(v === undefined ? '' : v);
          }
          salida.push(renglon);
        }
        return salida;
      },
      setValues(valores) {
        valores.forEach((renglon, i) => {
          renglon.forEach((valor, j) => {
            hoja.asegurar(fila + i, columna + j);
            hoja.celdas[fila - 1 + i][columna - 1 + j] = valor;
          });
        });
        return this;
      },
      setValue(valor) { return this.setValues([[valor]]); },
      setFontWeight() { return this; },
      setBackground() { return this; },
      setFontColor() { return this; }
    };
  }

  appendRow(valores) {
    const fila = this.getLastRow() + 1;
    this.getRange(fila, 1, 1, valores.length).setValues([valores]);
    return this;
  }

  deleteRow(fila) {
    this.celdas.splice(fila - 1, 1);
    return this;
  }
}

class LibroFalso {
  constructor(nombre, id) {
    this.nombre = nombre;
    this.id = id;
    this.hojas = [];
  }
  getId() { return this.id; }
  getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this.id; }
  getSheets() { return this.hojas; }
  getSheetByName(nombre) { return this.hojas.find((h) => h.getName() === nombre) || null; }
  insertSheet(nombre) { const h = new HojaFalsa(nombre); this.hojas.push(h); return h; }
  deleteSheet(hoja) { this.hojas = this.hojas.filter((h) => h !== hoja); }
}

/* ---------- Registro de efectos observables ---------- */

const efectos = { correos: [], peticiones: [], archivos: [], log: [] };

/* ---------- Servicios ---------- */

const libros = {};

const SpreadsheetApp = {
  create(nombre) {
    const id = 'ss-' + Object.keys(libros).length;
    const libro = new LibroFalso(nombre, id);
    libro.insertSheet('Hoja 1');
    libros[id] = libro;
    return libro;
  },
  openById(id) {
    if (!libros[id]) { throw new Error('No existe ' + id); }
    return libros[id];
  }
};

const propiedades = {};
const PropertiesService = {
  getScriptProperties() {
    return {
      getProperty: (k) => (k in propiedades ? propiedades[k] : null),
      setProperty: (k, v) => { propiedades[k] = v; },
      setProperties: (o) => { Object.assign(propiedades, o); },
      deleteProperty: (k) => { delete propiedades[k]; }
    };
  }
};

const Utilities = {
  DigestAlgorithm: { SHA_256: 'SHA_256' },
  Charset: { UTF_8: 'UTF_8' },
  computeDigest(algoritmo, texto) {
    const hash = crypto.createHash('sha256').update(texto, 'utf8').digest();
    return Array.from(hash).map((b) => (b > 127 ? b - 256 : b));
  },
  getUuid() { return crypto.randomUUID(); },
  sleep() { /* no bloquea en las pruebas */ },
  formatDate(fecha, zona, formato) {
    const p = (n, l) => String(n).padStart(l || 2, '0');
    return formato
      .replace('yyyy', fecha.getFullYear())
      .replace('MM', p(fecha.getMonth() + 1))
      .replace('dd', p(fecha.getDate()))
      .replace('HH', p(fecha.getHours()))
      .replace('mm', p(fecha.getMinutes()))
      .replace('ss', p(fecha.getSeconds()));
  },
  base64Decode(texto) { return Array.from(Buffer.from(texto, 'base64')); },
  newBlob(bytes, tipo, nombre) { return { bytes, tipo, nombre }; }
};

const Session = {
  getScriptTimeZone: () => 'America/Mexico_City',
  getEffectiveUser: () => ({ getEmail: () => 'nutriologo@ejemplo.com' }),
  getActiveUser: () => ({ getEmail: () => 'nutriologo@ejemplo.com' })
};

const GmailApp = {
  sendEmail(para, asunto, cuerpo, opciones) {
    efectos.correos.push({ para, asunto, cuerpo, opciones });
  }
};

const DriveApp = {
  carpetas: {},
  createFolder(nombre) { return this.crearCarpeta(nombre); },
  crearCarpeta(nombre) {
    const id = 'folder-' + Object.keys(this.carpetas).length;
    const carpeta = {
      id,
      nombre,
      hijas: {},
      getId: () => id,
      getFoldersByName(n) {
        const encontrada = carpeta.hijas[n];
        let usado = false;
        return {
          hasNext: () => !!encontrada && !usado,
          next: () => { usado = true; return encontrada; }
        };
      },
      createFolder(n) {
        const hija = DriveApp.crearCarpeta(n);
        carpeta.hijas[n] = hija;
        return hija;
      },
      createFile(blob) {
        const archivo = {
          getUrl: () => 'https://drive.google.com/file/d/' + blob.nombre,
          getId: () => 'file-' + blob.nombre,
          setDescription: () => archivo
        };
        efectos.archivos.push({ carpeta: nombre, blob });
        return archivo;
      }
    };
    this.carpetas[id] = carpeta;
    return carpeta;
  },
  getFolderById(id) {
    if (!this.carpetas[id]) { throw new Error('No existe la carpeta'); }
    return this.carpetas[id];
  }
};

const UrlFetchApp = {
  fetch(url, opciones) {
    efectos.peticiones.push({ url, opciones });
    return {
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({ messages: [{ id: 'wamid.simulado' }] })
    };
  }
};

const Logger = { log: (m) => efectos.log.push(String(m)) };

const HtmlService = {
  createTemplateFromFile: () => ({ evaluate: () => ({ setTitle: () => ({ addMetaTag: () => ({ setXFrameOptionsMode: () => 'html' }) }) }) }),
  createHtmlOutputFromFile: () => ({ getContent: () => '' }),
  XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' }
};

const ScriptApp = {
  getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/simulado/exec' })
};

module.exports = {
  contexto: {
    SpreadsheetApp, PropertiesService, Utilities, Session, GmailApp,
    DriveApp, UrlFetchApp, Logger, HtmlService, ScriptApp
  },
  efectos,
  reiniciar() {
    efectos.correos.length = 0;
    efectos.peticiones.length = 0;
    efectos.archivos.length = 0;
    efectos.log.length = 0;
  }
};
