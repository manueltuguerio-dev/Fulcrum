'use strict';
/**
 * Acceso de bajo nivel al .xlsx como paquete OPC.
 *
 * Se trabaja sobre el ZIP en crudo, no sobre un modelo de libro, por dos
 * razones: el archivo real pesa 26 MB con hojas de 78 MB descomprimidas, y al
 * escribir hay que conservar intactos tablas, formato condicional, consultas y
 * dibujos. JSZip reutiliza los bytes ya comprimidos de las entradas que no se
 * tocan, así que reemplazar dos hojas cuesta milisegundos.
 */

const JSZip = require('jszip');
const { parseSharedStrings } = require('./xlsx-read');

const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

class Workbook {
  constructor(zip, sheets, shared, sharedXml) {
    this.zip = zip;
    this.sheets = sheets;        // [{ name, path, sheetId, rId, state }]
    this.shared = shared;        // string[]
    this._sharedXml = sharedXml;
    this._cache = new Map();
  }

  static async open(buffer) {
    const zip = await JSZip.loadAsync(buffer);
    const wbFile = zip.file('xl/workbook.xml');
    if (!wbFile) throw new Error('El archivo no es un libro de Excel válido (falta xl/workbook.xml).');
    const wbXml = await wbFile.async('string');
    const relsXml = await zip.file('xl/_rels/workbook.xml.rels').async('string');

    const rels = new Map();
    for (const m of relsXml.matchAll(/<Relationship\b[^>]*\/>/g)) {
      const id = /\bId="([^"]+)"/.exec(m[0]);
      const target = /\bTarget="([^"]+)"/.exec(m[0]);
      if (id && target) rels.set(id[1], target[1].replace(/^\/?xl\//, '').replace(/^\//, ''));
    }

    const sheets = [];
    for (const m of wbXml.matchAll(/<sheet\b[^>]*\/>/g)) {
      const name = /\bname="([^"]*)"/.exec(m[0]);
      const rId = /\br:id="([^"]+)"/.exec(m[0]);
      const sheetId = /\bsheetId="(\d+)"/.exec(m[0]);
      const state = /\bstate="([^"]+)"/.exec(m[0]);
      if (!name || !rId) continue;
      const target = rels.get(rId[1]);
      if (!target) continue;
      sheets.push({
        name: decodeAttr(name[1]),
        path: 'xl/' + target,
        sheetId: sheetId ? +sheetId[1] : null,
        rId: rId[1],
        state: state ? state[1] : 'visible',
      });
    }

    const ssFile = zip.file('xl/sharedStrings.xml');
    const sharedXml = ssFile ? await ssFile.async('string') : '';
    return new Workbook(zip, sheets, parseSharedStrings(sharedXml), sharedXml);
  }

  sheet(name) {
    const s = this.sheets.find((x) => x.name === name);
    if (!s) {
      throw new Error(
        `El libro no tiene la hoja "${name}". Hojas encontradas: ${this.sheets.map((x) => x.name).join(', ')}`
      );
    }
    return s;
  }

  has(name) { return this.sheets.some((x) => x.name === name); }

  /** XML de una hoja, cacheado. Descomprime solo lo que se pide. */
  async sheetXml(name) {
    if (this._cache.has(name)) return this._cache.get(name);
    const xml = await this.zip.file(this.sheet(name).path).async('string');
    this._cache.set(name, xml);
    return xml;
  }

  /** Libera el XML cacheado de una hoja; las hojas grandes ocupan cientos de MB. */
  release(name) { this._cache.delete(name); }

  setSheetXml(name, xml) {
    const s = this.sheet(name);
    this.zip.file(s.path, xml);
    this._cache.set(name, xml);
  }

  file(path) { return this.zip.file(path); }

  async fileText(path) {
    const f = this.zip.file(path);
    return f ? f.async('string') : null;
  }

  setFileText(path, text) { this.zip.file(path, text); }

  removeFile(path) { this.zip.remove(path); }

  toBuffer() {
    return this.zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }
}

function decodeAttr(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

module.exports = { Workbook, MAIN_NS };
