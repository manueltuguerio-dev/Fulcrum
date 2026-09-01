'use strict';
/**
 * Pasos 2 y 3 del proceso, sobre la hoja "KB Supply".
 *
 * Paso 2 (arrastrar): el libro trae dos bloques de ejemplo, A10:AF15 y
 * A16:AF21, de seis filas cada uno. Aqui se replica ese bloque una vez por
 * numero de parte hasta la fila que anuncia G6, que es exactamente lo que hace
 * arrastrar la seleccion A10:AF21 en Excel.
 *
 * Paso 3 (filtrar): se deja el autofiltro puesto sobre la columna L con el
 * estatus pedido y, cuando el rojo se evalua en una sola semana, tambien el
 * filtro por color de esa columna. Las filas que no pasan quedan ocultas, igual
 * que al filtrar a mano.
 *
 * Las formulas se clonan trasladando referencias; ademas se escribe el valor en
 * cache de cada celda con lo que calculo el motor, para que el libro se lea
 * correctamente aun antes de que Excel recalcule.
 */

const S = require('./sheet-xml');
const { colToNum, numToCol } = require('./formula');
const { BLOCK_SIZE, FIRST_BLOCK_ROW, WEEK_COUNT } = require('./engine');

const COL_P = colToNum('P');
const LAST_BLOCK_ROW = FIRST_BLOCK_ROW + BLOCK_SIZE - 1;   // 15
const TEMPLATE_ROWS = 2 * BLOCK_SIZE;                      // A10:AF21

// Indices de fila dentro del bloque, tal como los nombra la columna O.
const ROW_BASE = 0;
const ROW_ARRIVALS = 1;
const ROW_PLAN = 2;
const ROW_PROJECTION = 3;
const ROW_PO_PROMISE = 4;
const ROW_PO_NEED = 5;

// Columnas que las filas 2..6 del bloque arrastran desde la fila base.
const CARRY_COLUMNS = new Set(['A', 'C', 'D', 'F', 'G', 'H', 'K', 'L']);

/** Valor numerico para el cache de una celda. */
function numCell(n) {
  if (n === undefined || n === null || !Number.isFinite(n)) return undefined;
  return { v: String(n) };
}
/** Valor de texto: en una celda con formula el tipo correcto es t="str". */
function strCell(s) {
  if (s === undefined || s === null || s === '') return undefined;
  return { v: String(s), t: 'str' };
}

/**
 * Valores en cache de una fila del bloque.
 * Devuelve null para las columnas que deben conservar lo que ya traian.
 */
function makeValueFor(rec, rowIndex) {
  const carry = {
    A: numCell(rec.id),
    C: typeof rec.org === 'number' ? numCell(rec.org) : strCell(rec.org),
    D: strCell(rec.part),
    F: strCell(rec.supplier),
    G: strCell(rec.buyer),
    H: typeof rec.category === 'number' ? numCell(rec.category) : strCell(rec.category),
    K: rec.shortageDate === null ? strCell('FALSE') : numCell(rec.shortageDate),
    L: strCell(rec.status),
  };

  const weekly = (arr) => (col) => {
    const idx = colToNum(col) - COL_P;
    if (idx < 0 || idx >= WEEK_COUNT) return undefined;
    return numCell(arr[idx]);
  };

  return (col) => {
    if (rowIndex === ROW_BASE) {
      switch (col) {
        case 'A': return carry.A;
        case 'B': return strCell(rec.concat);
        case 'C': return carry.C;
        case 'D': return carry.D;
        case 'E': return strCell(rec.description);
        case 'F': return carry.F;
        case 'G': return carry.G;
        case 'H': return carry.H;
        case 'I': return numCell(rec.acuityOH);
        case 'J': return numCell(rec.coldLT);
        case 'K': return carry.K;
        case 'L': return carry.L;
        case 'M': return numCell(rec.supplierOH);
        case 'N': return numCell(rec.totalInv);
        default: return null;      // O y P..AF de la fila base son ceros fijos
      }
    }

    // Las filas 2 a 6 del bloque repiten estas columnas con formulas +X del
    // tipo "+C10", asi que su valor en cache es el mismo de la fila base.
    if (CARRY_COLUMNS.has(col)) return carry[col];

    const c = colToNum(col);
    if (c >= COL_P && c < COL_P + WEEK_COUNT) {
      if (rowIndex === ROW_ARRIVALS) return weekly(rec.arrivals)(col);
      if (rowIndex === ROW_PLAN) return weekly(rec.demand)(col);
      if (rowIndex === ROW_PROJECTION) return weekly(rec.projection)(col);
      if (rowIndex === ROW_PO_PROMISE) return weekly(rec.poPromise)(col);
      if (rowIndex === ROW_PO_NEED) return weekly(rec.poNeed)(col);
      return null;
    }

    if (rowIndex === ROW_PROJECTION && (col === 'AC' || col === 'AD' || col === 'AE')) {
      const i = { AC: 0, AD: 1, AE: 2 }[col];
      return numCell(rec.months[i]);
    }

    return null;
  };
}

/** Marca una fila como oculta, como la deja Excel al aplicar un autofiltro. */
function hideRow(rowXml) {
  const openEnd = rowXml.indexOf('>');
  const selfClosing = rowXml[openEnd - 1] === '/';
  let attrs = rowXml.slice(0, selfClosing ? openEnd - 1 : openEnd);
  if (!/\shidden="/.test(attrs)) attrs += ' hidden="1"';
  return attrs + (selfClosing ? '/>' : rowXml.slice(openEnd));
}

/**
 * Expande un sqref de formato condicional escrito para el primer bloque a todos
 * los bloques generados. "P13:AB15" pasa a "P13:AB15 P19:AB21 P25:AB27 ...".
 */
function expandSqref(sqref, blocks) {
  const tokens = sqref.trim().split(/\s+/);
  const first = tokens[0];
  const rowsOf = first.split(':').map((t) => {
    const m = /^\$?[A-Z]{1,3}\$?(\d+)$/.exec(t);
    return m ? parseInt(m[1], 10) : null;
  });
  if (rowsOf.some((r) => r === null)) return sqref;
  if (rowsOf.some((r) => r < FIRST_BLOCK_ROW || r > LAST_BLOCK_ROW)) return sqref;

  const out = [];
  for (let b = 0; b < blocks; b++) {
    const d = b * BLOCK_SIZE;
    out.push(first.split(':').map((t) => t.replace(/(\d+)$/, (m) => String(parseInt(m, 10) + d))).join(':'));
  }
  return out.join(' ');
}

/**
 * @param {Workbook} wb
 * @param {Array} records     salida de engine.compute().records
 * @param {object} opts
 * @param {Set<number>} [opts.visibleIds]  ids que pasan el filtro; el resto se oculta
 * @param {string[]} [opts.statusFilter]   valores que se escriben en el autofiltro de L
 * @param {number} [opts.colorWeek]        indice de semana con filtro por color, o -1
 * @param {number} [opts.colorDxfId]       dxf del color rojo (4 en este libro)
 */
async function writeKbSupply(wb, records, opts = {}) {
  const xml = await wb.sheetXml('KB Supply');
  const { head, rows, tail } = S.parseSheet(xml);
  const expanded = S.expandSharedFormulas(rows);

  // La seleccion que se arrastra es A10:AF21, o sea DOS bloques. Excel repite el
  // patron completo, asi que los bloques impares salen del primero y los pares
  // del segundo. Importa porque el autor le puso alturas de fila distintas al
  // segundo bloque; tomar siempre el primero cambiaria el aspecto de la hoja.
  const template = [];
  for (let k = 0; k < TEMPLATE_ROWS; k++) {
    const raw = expanded.get(FIRST_BLOCK_ROW + k);
    if (!raw) throw new Error(`Falta la fila plantilla ${FIRST_BLOCK_ROW + k} en "KB Supply".`);
    template.push(raw);
  }
  const templateBlocks = TEMPLATE_ROWS / BLOCK_SIZE;

  const blocks = records.length;
  const lastRow = FIRST_BLOCK_ROW + blocks * BLOCK_SIZE - 1;
  const visibleIds = opts.visibleIds || null;
  if (!blocks) throw new Error('No hay partes que escribir en "KB Supply".');

  const out = [];
  for (const [num, raw] of [...expanded.entries()].sort((a, b) => a[0] - b[0])) {
    if (num >= FIRST_BLOCK_ROW) continue;
    // G6 anuncia hasta que fila llega el arrastre. Su formula no cambia; lo que
    // se actualiza es el valor en cache para que coincida con lo generado.
    out.push([num, num === 6 ? setCachedValue(raw, 'G6', lastRow) : raw]);
  }

  records.forEach((rec, i) => {
    const b = i % templateBlocks;                 // que bloque plantilla toca
    const delta = (i - b) * BLOCK_SIZE;
    const passes = visibleIds ? visibleIds.has(rec.id) : true;
    for (let k = 0; k < BLOCK_SIZE; k++) {
      let row = S.shiftRow(template[b * BLOCK_SIZE + k], delta, makeValueFor(rec, k));
      // Al filtrar por color en una columna de semana, Excel deja visible solo
      // la fila que trae ese color, que es la de Projection.
      const visible = visibleIds
        ? (passes && (opts.colorWeek >= 0 ? k === ROW_PROJECTION : true))
        : true;
      if (!visible) row = hideRow(row);
      out.push([FIRST_BLOCK_ROW + i * BLOCK_SIZE + k, row]);
    }
  });

  // Restos de una corrida anterior por debajo del ultimo bloque.
  for (const [num, raw] of [...expanded.entries()].sort((a, b) => a[0] - b[0])) {
    if (num > lastRow) out.push([num, clearRow(raw)]);
  }
  out.sort((a, b) => a[0] - b[0]);

  // --- encabezado -----------------------------------------------------------
  let newHead = head.replace(/(<dimension\b[^>]*\sref="A\d+:)[A-Z]+\d+(")/, `$1AF${lastRow}$2`);

  // --- pie: autofiltro, formato condicional --------------------------------
  let newTail = tail;
  const filterRef = `A9:AF${lastRow}`;
  newTail = newTail.replace(/<autoFilter\b([^>]*)(\/>|>[\s\S]*?<\/autoFilter>)/, (m, attrs) => {
    const withRef = attrs.replace(/\sref="[^"]*"/, ` ref="${filterRef}"`);
    const cols = buildFilterColumns(opts);
    return cols ? `<autoFilter${withRef}>${cols}</autoFilter>` : `<autoFilter${withRef}/>`;
  });

  newTail = newTail.replace(/<conditionalFormatting\b([^>]*)sqref="([^"]+)"/g,
    (m, pre, sqref) => `<conditionalFormatting ${pre.trim()}${pre.trim() ? ' ' : ''}sqref="${expandSqref(sqref, blocks)}"`);

  wb.setSheetXml('KB Supply', S.buildSheet(newHead, out.map((r) => r[1]), newTail));

  return { blocks, firstRow: FIRST_BLOCK_ROW, lastRow, filterRef, templateRows: TEMPLATE_ROWS };
}

/** Criterios del autofiltro: estatus en L y, si aplica, color en la semana elegida. */
function buildFilterColumns(opts) {
  const parts = [];
  const statuses = opts.statusFilter || [];
  if (statuses.length) {
    const colId = colToNum('L') - 1;   // colId es 0-based desde la columna A
    const filters = statuses.map((s) => `<filter val="${S.escapeXml(s)}"/>`).join('');
    parts.push(`<filterColumn colId="${colId}"><filters>${filters}</filters></filterColumn>`);
  }
  if (opts.colorWeek >= 0 && opts.colorDxfId != null) {
    const colId = COL_P - 1 + opts.colorWeek;
    parts.push(`<filterColumn colId="${colId}"><colorFilter dxfId="${opts.colorDxfId}"/></filterColumn>`);
  }
  return parts.join('');
}

/** Reemplaza el valor en cache de una celda concreta sin tocar su formula. */
function setCachedValue(rowXml, ref, value) {
  const re = new RegExp('(<c r="' + ref + '"[^>]*>)([\\s\\S]*?)(</c>)');
  return rowXml.replace(re, (m, open, body, close) => {
    const withValue = /<v>[\s\S]*?<\/v>/.test(body)
      ? body.replace(/<v>[\s\S]*?<\/v>/, '<v>' + value + '</v>')
      : body + '<v>' + value + '</v>';
    return open + withValue + close;
  });
}

function clearRow(rowXml) {
  const { rowAttrs, cells } = S.splitCells(rowXml);
  if (!cells.length) return rowXml;
  return rowAttrs + cells.map((c) => (c.body ? `${S.dropAttr(c.attrs, 't')}/>` : c.raw)).join('') + '</row>';
}

module.exports = {
  writeKbSupply, expandSqref, numToCol,
  ROW_BASE, ROW_ARRIVALS, ROW_PLAN, ROW_PROJECTION, ROW_PO_PROMISE, ROW_PO_NEED,
};
