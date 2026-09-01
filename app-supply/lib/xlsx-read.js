'use strict';
/**
 * Lector de hojas .xlsx orientado a archivos grandes.
 *
 * No construye un modelo del libro completo: recorre el XML de una hoja de una
 * pasada y entrega cada fila como arreglo de valores. Es lo que permite leer
 * SupplyPlan (97 mil filas) o On hand (110 mil) sin agotar la memoria.
 */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeXml(s) {
  if (s.indexOf('&') === -1) return s;
  return s.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (m, ent) => {
    if (ent[0] === '#') {
      const code = ent[1] === 'x' || ent[1] === 'X'
        ? parseInt(ent.slice(2), 16)
        : parseInt(ent.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[ent] !== undefined ? ENTITIES[ent] : m;
  });
}

/** "AF" -> 32 (1-based) */
function colToIndex(ref) {
  let n = 0;
  for (let i = 0; i < ref.length; i++) {
    const c = ref.charCodeAt(i);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n;
}

/** 32 -> "AF" (1-based) */
function indexToCol(n) {
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Extrae la tabla de cadenas compartidas de xl/sharedStrings.xml */
function parseSharedStrings(xml) {
  const out = [];
  if (!xml) return out;
  let pos = 0;
  for (;;) {
    const siStart = xml.indexOf('<si', pos);
    if (siStart === -1) break;
    const openEnd = xml.indexOf('>', siStart);
    if (openEnd === -1) break;
    if (xml[openEnd - 1] === '/') { out.push(''); pos = openEnd + 1; continue; }
    const siEnd = xml.indexOf('</si>', openEnd);
    if (siEnd === -1) break;
    const body = xml.slice(openEnd + 1, siEnd);
    // Una <si> puede venir partida en varias <r><t>; se concatenan en orden.
    let text = '';
    let tp = 0;
    for (;;) {
      const tStart = body.indexOf('<t', tp);
      if (tStart === -1) break;
      const tOpenEnd = body.indexOf('>', tStart);
      if (tOpenEnd === -1) break;
      if (body[tOpenEnd - 1] === '/') { tp = tOpenEnd + 1; continue; }
      const tEnd = body.indexOf('</t>', tOpenEnd);
      if (tEnd === -1) break;
      text += decodeXml(body.slice(tOpenEnd + 1, tEnd));
      tp = tEnd + 4;
    }
    out.push(text);
    pos = siEnd + 5;
  }
  return out;
}

/**
 * Recorre las filas de una hoja.
 *
 * @param {string} xml            contenido de xl/worksheets/sheetN.xml
 * @param {string[]} shared       tabla de cadenas compartidas
 * @param {object} [opts]
 * @param {number} [opts.maxCol]  ignora columnas más allá de esta (1-based)
 * @param {function} cb           recibe (rowNumber, valuesArray)
 *
 * valuesArray es 0-based por columna: values[0] = columna A.
 * Las celdas vacías quedan como undefined.
 */
function forEachRow(xml, shared, opts, cb) {
  if (typeof opts === 'function') { cb = opts; opts = {}; }
  const maxCol = opts.maxCol || 0;
  const sheetEnd = xml.length;
  let pos = xml.indexOf('<sheetData');
  if (pos === -1) return;

  for (;;) {
    const rowStart = xml.indexOf('<row', pos);
    if (rowStart === -1 || rowStart >= sheetEnd) break;
    const rowOpenEnd = xml.indexOf('>', rowStart);
    if (rowOpenEnd === -1) break;

    const attrs = xml.slice(rowStart, rowOpenEnd);
    const rm = /\sr="(\d+)"/.exec(attrs);
    const rowNum = rm ? parseInt(rm[1], 10) : 0;

    if (xml[rowOpenEnd - 1] === '/') {          // <row r="5"/> sin celdas
      cb(rowNum, []);
      pos = rowOpenEnd + 1;
      continue;
    }

    const rowEnd = xml.indexOf('</row>', rowOpenEnd);
    if (rowEnd === -1) break;

    const values = [];
    let cp = rowOpenEnd + 1;
    while (cp < rowEnd) {
      const cStart = xml.indexOf('<c', cp);
      if (cStart === -1 || cStart >= rowEnd) break;
      const cOpenEnd = xml.indexOf('>', cStart);
      if (cOpenEnd === -1 || cOpenEnd > rowEnd) break;

      const cAttrs = xml.slice(cStart, cOpenEnd);
      const refM = /\sr="([A-Z]+)\d+"/.exec(cAttrs);
      const colIdx = refM ? colToIndex(refM[1]) : 0;
      const typeM = /\st="([a-zA-Z]+)"/.exec(cAttrs);
      const type = typeM ? typeM[1] : 'n';

      if (xml[cOpenEnd - 1] === '/') {          // <c r="B5"/> vacía
        cp = cOpenEnd + 1;
        continue;
      }
      const cEnd = xml.indexOf('</c>', cOpenEnd);
      if (cEnd === -1) break;

      if (colIdx > 0 && (!maxCol || colIdx <= maxCol)) {
        const body = xml.slice(cOpenEnd + 1, cEnd);
        let value;
        if (type === 'inlineStr') {
          let text = '';
          let tp = 0;
          for (;;) {
            const tStart = body.indexOf('<t', tp);
            if (tStart === -1) break;
            const tOpenEnd = body.indexOf('>', tStart);
            if (tOpenEnd === -1) break;
            if (body[tOpenEnd - 1] === '/') { tp = tOpenEnd + 1; continue; }
            const tEnd = body.indexOf('</t>', tOpenEnd);
            if (tEnd === -1) break;
            text += decodeXml(body.slice(tOpenEnd + 1, tEnd));
            tp = tEnd + 4;
          }
          value = text;
        } else {
          const vStart = body.indexOf('<v>');
          if (vStart !== -1) {
            const vEnd = body.indexOf('</v>', vStart);
            const raw = vEnd === -1 ? '' : body.slice(vStart + 3, vEnd);
            if (type === 's') {
              const idx = parseInt(raw, 10);
              value = shared[idx] !== undefined ? shared[idx] : '';
            } else if (type === 'str') {
              value = decodeXml(raw);
            } else if (type === 'b') {
              value = raw === '1';
            } else if (type === 'e') {
              value = { error: decodeXml(raw) };
            } else {
              const num = Number(raw);
              value = Number.isNaN(num) ? decodeXml(raw) : num;
            }
          }
        }
        if (value !== undefined) values[colIdx - 1] = value;
      }
      cp = cEnd + 4;
    }

    cb(rowNum, values);
    pos = rowEnd + 6;
  }
}

module.exports = { decodeXml, colToIndex, indexToCol, parseSharedStrings, forEachRow };
