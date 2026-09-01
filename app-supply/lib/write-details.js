'use strict';
/**
 * Paso 1 del proceso: llenar la hoja "Details" del libro MX con las partes del
 * archivo Data.
 *
 * Correspondencia de columnas. El archivo Data trae los nueve campos en A..I
 * desde la fila 2; en Details esos mismos nueve encabezados viven en B8:J8,
 * porque la columna A de Details es el consecutivo ID que usa "KB Supply" para
 * su VLOOKUP. Por eso Data!A va a Details!B, y asi hasta Data!I -> Details!J.
 */

const S = require('./sheet-xml');
const { SharedStrings } = require('./shared-strings');

const FIRST_DATA_ROW = 9;
const HEADER_ROW = 8;

/** Columnas de Details en orden, con el campo del registro que les toca. */
const COLUMNS = [
  { col: 'A', field: 'id' },
  { col: 'B', field: 'concat' },
  { col: 'C', field: 'org' },
  { col: 'D', field: 'part' },
  { col: 'E', field: 'description' },
  { col: 'F', field: 'supplier' },
  { col: 'G', field: 'purchCat' },
  { col: 'H', field: 'leadTime' },
  { col: 'I', field: 'buyer' },
  { col: 'J', field: 'programFlag' },
];

/**
 * Toma los estilos por columna de la primera fila de datos existente, para que
 * las filas escritas se vean igual que las que ya traia el libro.
 */
function styleTemplate(rows) {
  const styles = new Map();
  for (let r = FIRST_DATA_ROW; r < FIRST_DATA_ROW + 5; r++) {
    const raw = rows.get(r);
    if (!raw) continue;
    const { cells } = S.splitCells(raw);
    for (const c of cells) {
      const ref = S.attr(c.attrs, 'r');
      if (!ref) continue;
      const col = /^([A-Z]+)/.exec(ref)[1];
      if (!styles.has(col)) styles.set(col, S.attr(c.attrs, 's'));
    }
    if (styles.size) break;
  }
  return styles;
}

function cellXml(col, row, value, style, sst) {
  const ref = col + row;
  const s = style ? ` s="${style}"` : '';
  if (value === undefined || value === null || value === '') return `<c r="${ref}"${s}/>`;
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"${s}><v>${value}</v></c>`;
  if (typeof value === 'boolean') return `<c r="${ref}"${s} t="b"><v>${value ? 1 : 0}</v></c>`;
  return `<c r="${ref}"${s} t="s"><v>${sst.id(value)}</v></c>`;
}

/**
 * Escribe las partes en la hoja Details.
 *
 * @param {Workbook} wb
 * @param {Array} parts   salida de engine.readDataParts
 * @param {object} [opts]
 * @param {boolean} [opts.clearTrailing]  vacia las filas de datos sobrantes
 * @returns {Promise<object>} resumen de lo escrito
 */
async function writeDetails(wb, parts, opts = {}) {
  const sst = opts.sst || SharedStrings.fromWorkbook(wb);
  const xml = await wb.sheetXml('Details');
  const { head, rows, tail } = S.parseSheet(xml);

  const styles = styleTemplate(rows);
  const lastDataRow = FIRST_DATA_ROW + parts.length - 1;
  const previousLast = Math.max(...rows.keys());

  const out = [];
  // Todo lo anterior a la primera fila de datos se conserva tal cual.
  for (const [num, raw] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
    if (num < FIRST_DATA_ROW) out.push([num, raw]);
  }

  parts.forEach((p, i) => {
    const rowNum = FIRST_DATA_ROW + i;
    const record = { id: i + 1, ...p };
    const cells = COLUMNS
      .map((c) => cellXml(c.col, rowNum, record[c.field], styles.get(c.col), sst))
      .join('');
    out.push([rowNum, `<row r="${rowNum}" spans="1:10">${cells}</row>`]);
  });

  // Filas por debajo de los datos: se conservan (traen formato) y opcionalmente
  // se limpian sus valores, para que no quede residuo de una corrida anterior.
  for (const [num, raw] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
    if (num <= lastDataRow) continue;
    out.push([num, opts.clearTrailing === false ? raw : clearRowValues(raw)]);
  }

  out.sort((a, b) => a[0] - b[0]);

  let newTail = tail;
  // El autofiltro cubria A8:I30693 (un rango heredado). Se ajusta al bloque
  // real de datos, incluyendo la columna J que el encabezado ya declaraba.
  const filterRef = `A${HEADER_ROW}:J${lastDataRow}`;
  newTail = newTail.replace(/(<autoFilter\b[^>]*\sref=")[^"]*(")/, `$1${filterRef}$2`);

  let newHead = head;
  const maxRow = Math.max(lastDataRow, previousLast);
  newHead = newHead.replace(/(<dimension\b[^>]*\sref=")[^"]*(")/, `$1A${HEADER_ROW}:J${maxRow}$2`);

  wb.setSheetXml('Details', S.buildSheet(newHead, out.map((r) => r[1]), newTail));

  return {
    sst,
    rowsWritten: parts.length,
    firstRow: FIRST_DATA_ROW,
    lastRow: lastDataRow,
    filterRef,
  };
}

/** Deja la fila con sus celdas y estilos pero sin valores ni formulas. */
function clearRowValues(rowXml) {
  const { rowAttrs, cells } = S.splitCells(rowXml);
  if (!cells.length) return rowXml;
  const rebuilt = cells.map((c) => {
    if (!c.body) return c.raw;
    const attrs = S.dropAttr(c.attrs, 't');
    return `${attrs}/>`;
  });
  return rowAttrs + rebuilt.join('') + '</row>';
}

module.exports = { writeDetails, FIRST_DATA_ROW, HEADER_ROW, COLUMNS };
