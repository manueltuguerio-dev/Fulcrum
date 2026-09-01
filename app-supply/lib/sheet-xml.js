'use strict';
/**
 * Utilidades para leer y reescribir el XML de una hoja conservando todo lo que
 * no se toca (estilos, atributos de fila, metadatos de celda).
 */

const { translate, translateRef } = require('./formula');

/** Separa la hoja en encabezado, filas indexadas y pie. */
function parseSheet(xml) {
  const sdStart = xml.indexOf('<sheetData');
  if (sdStart === -1) throw new Error('La hoja no tiene <sheetData>.');
  const sdOpenEnd = xml.indexOf('>', sdStart);
  const selfClosing = xml[sdOpenEnd - 1] === '/';
  const head = xml.slice(0, sdOpenEnd + 1);
  if (selfClosing) return { head: xml.slice(0, sdStart), rows: new Map(), tail: xml.slice(sdOpenEnd + 1), empty: true };

  const sdEnd = xml.indexOf('</sheetData>', sdOpenEnd);
  const inner = xml.slice(sdOpenEnd + 1, sdEnd);
  const tail = xml.slice(sdEnd + '</sheetData>'.length);

  const rows = new Map();
  let pos = 0;
  for (;;) {
    const rs = inner.indexOf('<row', pos);
    if (rs === -1) break;
    const openEnd = inner.indexOf('>', rs);
    const attrs = inner.slice(rs, openEnd + 1);
    const rm = /\sr="(\d+)"/.exec(attrs);
    const num = rm ? parseInt(rm[1], 10) : 0;
    let raw, next;
    if (inner[openEnd - 1] === '/') {
      raw = inner.slice(rs, openEnd + 1);
      next = openEnd + 1;
    } else {
      const re = inner.indexOf('</row>', openEnd);
      raw = inner.slice(rs, re + 6);
      next = re + 6;
    }
    rows.set(num, raw);
    pos = next;
  }
  return { head, rows, tail, empty: false };
}

function buildSheet(head, rowsInOrder, tail) {
  return head + rowsInOrder.join('') + '</sheetData>' + tail;
}

/** Divide el interior de una fila en celdas. */
function splitCells(rowXml) {
  const openEnd = rowXml.indexOf('>');
  if (rowXml[openEnd - 1] === '/') return { rowAttrs: rowXml.slice(0, openEnd + 1), cells: [] };
  const rowAttrs = rowXml.slice(0, openEnd + 1);
  const inner = rowXml.slice(openEnd + 1, rowXml.lastIndexOf('</row>'));
  const cells = [];
  let pos = 0;
  for (;;) {
    const cs = inner.indexOf('<c', pos);
    if (cs === -1) break;
    const ce = inner.indexOf('>', cs);
    if (inner[ce - 1] === '/') {
      // En una celda auto-cerrada la diagonal es parte del cierre, no de los
      // atributos: si se deja dentro, reconstruir la celda produce "//>".
      cells.push({ raw: inner.slice(cs, ce + 1), attrs: inner.slice(cs, ce - 1), body: null });
      pos = ce + 1;
    } else {
      const end = inner.indexOf('</c>', ce);
      cells.push({ raw: inner.slice(cs, end + 4), attrs: inner.slice(cs, ce), body: inner.slice(ce + 1, end) });
      pos = end + 4;
    }
  }
  return { rowAttrs, cells };
}

function attr(attrs, name) {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(attrs);
  return m ? m[1] : null;
}

function setAttr(attrs, name, value) {
  const re = new RegExp(`\\s${name}="[^"]*"`);
  if (re.test(attrs)) return attrs.replace(re, ` ${name}="${value}"`);
  const insertAt = attrs.indexOf(' ') === -1 ? attrs.length : attrs.indexOf(' ');
  return attrs.slice(0, insertAt) + ` ${name}="${value}"` + attrs.slice(insertAt);
}

function dropAttr(attrs, name) {
  return attrs.replace(new RegExp(`\\s${name}="[^"]*"`), '');
}

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function unescapeXml(s) {
  return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

/**
 * Convierte todas las fórmulas compartidas de la hoja en fórmulas explícitas.
 *
 * Excel guarda una sola vez el texto de una fórmula arrastrada y deja las demás
 * celdas como <f t="shared" si="N"/>. Ese índice apunta al rango original, así
 * que no puede clonarse: hay que materializar cada fórmula antes de replicar.
 */
function expandSharedFormulas(rows) {
  const masters = new Map();   // si -> { ref, text }
  for (const raw of rows.values()) {
    const { cells } = splitCells(raw);
    for (const c of cells) {
      if (!c.body) continue;
      const fm = /<f\b([^>]*)>([\s\S]*?)<\/f>/.exec(c.body);
      if (!fm) continue;
      const si = attr(fm[1], 'si');
      if (si !== null && attr(fm[1], 't') === 'shared' && fm[2]) {
        masters.set(si, { ref: attr(c.attrs, 'r'), text: unescapeXml(fm[2]) });
      }
    }
  }

  const out = new Map();
  for (const [num, raw] of rows) {
    const { rowAttrs, cells } = splitCells(raw);
    if (!cells.length) { out.set(num, raw); continue; }
    let changed = false;
    const rebuilt = cells.map((c) => {
      if (!c.body) return c.raw;
      const fm = /<f\b([^>]*)(?:\/>|>([\s\S]*?)<\/f>)/.exec(c.body);
      if (!fm) return c.raw;
      const fAttrs = fm[1];
      if (attr(fAttrs, 't') !== 'shared') return c.raw;
      const si = attr(fAttrs, 'si');
      const master = masters.get(si);
      if (!master) return c.raw;

      const ref = attr(c.attrs, 'r');
      const { parseRef } = require('./formula');
      const from = parseRef(master.ref);
      const to = parseRef(ref);
      const text = (from && to)
        ? translate(master.text, to.row - from.row, to.col - from.col)
        : master.text;

      const keepCa = attr(fAttrs, 'ca') ? ' ca="1"' : '';
      const newF = `<f${keepCa}>${escapeXml(text)}</f>`;
      changed = true;
      return `<c${c.attrs.slice(2)}>` + c.body.replace(fm[0], newF) + '</c>';
    });
    out.set(num, changed ? rowAttrs + rebuilt.join('') + '</row>' : raw);
  }
  return out;
}

/**
 * Clona una fila desplazándola dRow filas: traslada r, las referencias de cada
 * celda y las fórmulas, y opcionalmente sustituye los valores en caché.
 *
 * @param {function} [valueFor] recibe (colLetter) y devuelve
 *        { v, t } para escribir el valor calculado, null para dejar el original
 *        o undefined para borrar el caché.
 */
function shiftRow(rowXml, dRow, valueFor) {
  const { rowAttrs, cells } = splitCells(rowXml);
  const srcNum = parseInt(attr(rowAttrs, 'r'), 10);
  const newNum = srcNum + dRow;
  let newRowAttrs = setAttr(rowAttrs, 'r', newNum);

  const rebuilt = cells.map((c) => {
    const ref = attr(c.attrs, 'r');
    const colLetter = ref ? /^([A-Z]+)/.exec(ref)[1] : null;
    let attrs = ref ? setAttr(c.attrs, 'r', colLetter + newNum) : c.attrs;

    if (!c.body) return `${attrs}/>`;

    let body = c.body;
    body = body.replace(/<f\b([^>]*)(\/>|>([\s\S]*?)<\/f>)/, (m, fAttrs, rest, text) => {
      let na = fAttrs;
      const arrayRef = attr(na, 'ref');
      if (arrayRef) na = setAttr(na, 'ref', translateRef(arrayRef, dRow, 0));
      if (rest === '/>') return `<f${na}/>`;
      return `<f${na}>${escapeXml(translate(unescapeXml(text), dRow, 0))}</f>`;
    });

    if (valueFor && colLetter) {
      const val = valueFor(colLetter);
      if (val !== null) {
        body = body.replace(/<v>[\s\S]*?<\/v>/, '');
        attrs = dropAttr(attrs, 't');
        if (val !== undefined) {
          if (val.t) attrs = setAttr(attrs, 't', val.t);
          body += `<v>${escapeXml(val.v)}</v>`;
        }
      }
    }
    return `${attrs}>${body}</c>`;
  });

  return newRowAttrs + rebuilt.join('') + '</row>';
}

module.exports = {
  parseSheet, buildSheet, splitCells, attr, setAttr, dropAttr,
  escapeXml, unescapeXml, expandSharedFormulas, shiftRow,
};
