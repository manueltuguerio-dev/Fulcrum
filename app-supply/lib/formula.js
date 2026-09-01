'use strict';
/**
 * Traslado de fórmulas de Excel entre celdas (equivalente a arrastrar).
 *
 * Hace falta por dos motivos en "KB Supply":
 *  1. El bloque plantilla usa fórmulas compartidas (<f t="shared" si="N"/>),
 *     que hay que expandir a texto explícito antes de clonarlas, porque el
 *     índice si apunta al rango original y no puede reutilizarse.
 *  2. Al replicar el bloque de 6 filas hacia abajo hay que recorrer las
 *     referencias relativas y respetar las absolutas ($P$9, P$6, $B10).
 */

const COL_MAX = 16384;   // XFD
const ROW_MAX = 1048576;

function colToNum(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
  return n;
}

function numToCol(n) {
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * Sustituye por marcadores los tramos que no deben tocarse: literales de texto
 * entre comillas dobles, nombres de hoja entre comillas simples y referencias
 * estructuradas de tabla entre corchetes.
 */
function mask(formula) {
  const parts = [];
  const masked = formula.replace(/"(?:[^"]|"")*"|'(?:[^']|'')*'|\[[^\]]*\]/g, (m) => {
    parts.push(m);
    return `\u0000${parts.length - 1}\u0000`;
  });
  return { masked, parts };
}

function unmask(masked, parts) {
  return masked.replace(/\u0000(\d+)\u0000/g, (m, i) => parts[+i]);
}

const PREV_BLOCK = /[A-Za-z0-9_.$\u0000]/;   // un ref no puede venir pegado a esto
const NEXT_BLOCK = /[A-Za-z0-9_.\u0000]/;

/**
 * Desplaza las referencias de una fórmula dRow filas y dCol columnas.
 * Devuelve el texto ya trasladado (sin el "=" inicial, como lo guarda el XML).
 */
function translate(formula, dRow, dCol) {
  if (!formula || (dRow === 0 && dCol === 0)) return formula;
  const { masked, parts } = mask(formula);

  // Paso 1: rangos de columna completa (D:D, $B:$B). No llevan fila.
  let out = masked.replace(/(\$?)([A-Z]{1,3}):(\$?)([A-Z]{1,3})/g, (m, a1, c1, a2, c2, off, str) => {
    const prev = off > 0 ? str[off - 1] : '';
    const next = str[off + m.length] || '';
    if (prev && PREV_BLOCK.test(prev)) return m;
    if (next && (NEXT_BLOCK.test(next) || next === '$')) return m;
    const shift = (abs, col) => {
      if (abs) return abs + col;
      const n = colToNum(col) + dCol;
      if (n < 1 || n > COL_MAX) return '#REF!';
      return numToCol(n);
    };
    return `${shift(a1, c1)}:${shift(a2, c2)}`;
  });

  // Paso 2: referencias A1 normales.
  out = out.replace(/(\$?)([A-Z]{1,3})(\$?)(\d{1,7})/g, (m, aCol, col, aRow, row, off, str) => {
    const prev = off > 0 ? str[off - 1] : '';
    const next = str[off + m.length] || '';
    if (prev && PREV_BLOCK.test(prev)) return m;
    if (next === '(') return m;               // era un nombre de función (LOG10(...))
    if (next && NEXT_BLOCK.test(next)) return m;

    let newCol = col;
    if (!aCol && dCol) {
      const n = colToNum(col) + dCol;
      if (n < 1 || n > COL_MAX) return '#REF!';
      newCol = numToCol(n);
    }
    let newRow = row;
    if (!aRow && dRow) {
      const n = parseInt(row, 10) + dRow;
      if (n < 1 || n > ROW_MAX) return '#REF!';
      newRow = String(n);
    }
    return `${aCol}${newCol}${aRow}${newRow}`;
  });

  return unmask(out, parts);
}

/** "AB13" -> { col: 28, row: 13 } */
function parseRef(ref) {
  const m = /^\$?([A-Z]{1,3})\$?(\d+)$/.exec(ref);
  if (!m) return null;
  return { col: colToNum(m[1]), row: parseInt(m[2], 10) };
}

/** { col, row } -> "AB13" */
function makeRef(col, row) { return numToCol(col) + row; }

/** Traslada un rango tipo "R13:AB13" o una celda suelta "K10". */
function translateRef(ref, dRow, dCol) {
  return ref.split(':').map((part) => {
    const p = parseRef(part);
    return p ? makeRef(p.col + dCol, p.row + dRow) : part;
  }).join(':');
}

module.exports = { translate, translateRef, parseRef, makeRef, colToNum, numToCol };
