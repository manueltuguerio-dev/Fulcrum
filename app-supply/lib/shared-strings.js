'use strict';
/**
 * Tabla de cadenas compartidas del libro.
 *
 * Los textos que se escriben en Details y en KB Supply se agregan aqui y las
 * celdas los referencian por indice (t="s"), que es como los guarda Excel. Se
 * reutiliza el indice cuando el texto ya existe, asi que volver a generar el
 * mismo libro no infla el archivo.
 */

const { parseSharedStrings } = require('./xlsx-read');

function escapeText(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

class SharedStrings {
  constructor(list, xml) {
    this.list = list;
    this.index = new Map();
    for (let i = 0; i < list.length; i++) {
      if (!this.index.has(list[i])) this.index.set(list[i], i);
    }
    this.added = [];
    this.newRefs = 0;
    this._originalXml = xml;
  }

  static fromWorkbook(wb) {
    return new SharedStrings(wb.shared.slice(), wb._sharedXml || '');
  }

  /** Indice de un texto, agregandolo si hace falta. */
  id(text) {
    const s = text === undefined || text === null ? '' : String(text);
    this.newRefs++;
    const found = this.index.get(s);
    if (found !== undefined) return found;
    const idx = this.list.length;
    this.list.push(s);
    this.index.set(s, idx);
    this.added.push(s);
    return idx;
  }

  get changed() { return this.added.length > 0; }

  /**
   * Regenera xl/sharedStrings.xml agregando solo las entradas nuevas al final,
   * sin volver a serializar las 120 mil que ya existen.
   */
  toXml() {
    let xml = this._originalXml;
    if (!xml) {
      const body = this.list.map((s) => `<si><t xml:space="preserve">${escapeText(s)}</t></si>`).join('');
      return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        + `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${this.newRefs}" uniqueCount="${this.list.length}">`
        + body + '</sst>';
    }
    const closeAt = xml.lastIndexOf('</sst>');
    if (closeAt === -1) throw new Error('sharedStrings.xml no tiene </sst>.');

    const additions = this.added
      .map((s) => `<si><t xml:space="preserve">${escapeText(s)}</t></si>`)
      .join('');

    let head = xml.slice(0, closeAt);
    // count = total de referencias en el libro; uniqueCount = numero de <si>.
    head = head.replace(/(<sst\b[^>]*?)\scount="\d+"/, (m, p) => `${p} count="${this.countRefs()}"`);
    head = head.replace(/(<sst\b[^>]*?)\suniqueCount="\d+"/, (m, p) => `${p} uniqueCount="${this.list.length}"`);
    return head + additions + '</sst>';
  }

  countRefs() {
    const m = /<sst\b[^>]*\scount="(\d+)"/.exec(this._originalXml || '');
    const base = m ? parseInt(m[1], 10) : 0;
    return base + this.newRefs;
  }
}

module.exports = { SharedStrings, escapeText, parseSharedStrings };
