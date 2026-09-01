'use strict';
/**
 * Verificacion del libro generado.
 *
 * Vuelve a abrir el .xlsx que produjo la aplicacion y contrasta lo que quedo
 * escrito contra lo que calculo el motor. No comprueba que el codigo haga lo
 * que dice: comprueba que el archivo de salida diga lo mismo que el analisis.
 *
 *   node test/verify.js <libro_generado.xlsx> <analisis.json>
 *
 * El JSON lo escribe cli.js con --dump-analisis.
 */

const fs = require('fs');
const assert = require('assert');
const { Workbook } = require('../lib/workbook');
const { forEachRow } = require('../lib/xlsx-read');
const S = require('../lib/sheet-xml');
const { translate, colToNum, numToCol } = require('../lib/formula');
const { BLOCK_SIZE, FIRST_BLOCK_ROW, WEEK_COUNT } = require('../lib/engine');
const D = require('../lib/dates');

const COL_P = colToNum('P');

let pass = 0;
const fails = [];
function check(name, fn) {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fails.push({ name, message: e.message }); console.log('  FALLA ' + name + '\n         ' + e.message); }
}

async function main() {
  const [file, analysisFile] = process.argv.slice(2);
  if (!file || !analysisFile) {
    console.error('Uso: node test/verify.js <libro.xlsx> <analisis.json>');
    process.exit(2);
  }
  const expected = JSON.parse(fs.readFileSync(analysisFile, 'utf8'));
  const wb = await Workbook.open(fs.readFileSync(file));
  const records = expected.records;

  console.log(`Verificando ${file} contra ${records.length} partes analizadas\n`);

  // --- Details --------------------------------------------------------------
  console.log('Details');
  const detailsXml = await wb.sheetXml('Details');
  const details = new Map();
  forEachRow(detailsXml, wb.shared, { maxCol: 10 }, (r, v) => { if (r >= 8) details.set(r, v); });

  check('encabezados B8:J8 intactos', () => {
    assert.deepStrictEqual(details.get(8).slice(1, 10), [
      'Concat', 'ORG', 'PART', 'DESCRIPTION', 'SUPPLIER', 'PURCH_CAT', 'LEADTIME', 'DEFAULT_BUYER', 'PROGRAM_FLAG',
    ]);
  });

  check(`${records.length} filas de datos en A9:J${8 + records.length}`, () => {
    records.forEach((rec, i) => {
      const row = details.get(9 + i);
      assert.ok(row, `falta la fila ${9 + i}`);
      assert.strictEqual(row[0], rec.id, `ID en A${9 + i}`);
      assert.strictEqual(String(row[1]), String(rec.concat), `Concat en B${9 + i}`);
      assert.strictEqual(String(row[3]), String(rec.part), `PART en D${9 + i}`);
      assert.strictEqual(String(row[5]), String(rec.supplier), `SUPPLIER en F${9 + i}`);
      assert.strictEqual(String(row[8]), String(rec.buyer), `DEFAULT_BUYER en I${9 + i}`);
    });
  });

  check('ningun DEFAULT_BUYER quedo como LZR22', () => {
    for (let i = 0; i < records.length; i++) {
      const v = details.get(9 + i)[8];
      assert.notStrictEqual(String(v).trim().toUpperCase(), 'LZR22', `fila ${9 + i} sigue con LZR22`);
    }
  });

  check(`la fila ${9 + records.length} quedo vacia`, () => {
    const row = details.get(9 + records.length);
    if (!row) return;
    for (let c = 0; c < 10; c++) {
      assert.ok(row[c] === undefined || row[c] === '', `columna ${numToCol(c + 1)} trae "${row[c]}"`);
    }
  });

  // --- KB Supply ------------------------------------------------------------
  console.log('\nKB Supply');
  const kbXml = await wb.sheetXml('KB Supply');
  const kb = new Map();
  forEachRow(kbXml, wb.shared, { maxCol: colToNum('AF') }, (r, v) => kb.set(r, v));
  const lastRow = FIRST_BLOCK_ROW + records.length * BLOCK_SIZE - 1;

  check(`G6 anuncia la fila ${lastRow}`, () => {
    assert.strictEqual(kb.get(6)[colToNum('G') - 1], lastRow);
  });

  check(`el ultimo bloque termina en la fila ${lastRow}`, () => {
    assert.ok(kb.has(lastRow), `no existe la fila ${lastRow}`);
    assert.ok(!kb.has(lastRow + 1) || (kb.get(lastRow + 1) || []).every((x) => x === undefined),
      `la fila ${lastRow + 1} trae datos`);
  });

  check('cada bloque ocupa 6 filas y la columna O las nombra igual', () => {
    const nombres = ['Arrivals', 'Supply Plan', 'Projection', 'Promise. Open POs', 'Need. Open POs'];
    const colO = colToNum('O') - 1;
    for (let i = 0; i < records.length; i++) {
      const base = FIRST_BLOCK_ROW + i * BLOCK_SIZE;
      for (let k = 1; k < BLOCK_SIZE; k++) {
        assert.strictEqual(kb.get(base + k)[colO], nombres[k - 1],
          `fila ${base + k} deberia ser "${nombres[k - 1]}"`);
      }
    }
  });

  check('valores en cache de cada bloque = analisis', () => {
    const c = (l) => colToNum(l) - 1;
    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      const base = FIRST_BLOCK_ROW + i * BLOCK_SIZE;
      const b = kb.get(base);
      assert.strictEqual(String(b[c('B')]), String(rec.concat), `B${base}`);
      assert.strictEqual(String(b[c('D')]), String(rec.part), `D${base}`);
      assert.strictEqual(String(b[c('F')]), String(rec.supplier), `F${base}`);
      assert.strictEqual(String(b[c('G')]), String(rec.buyer), `G${base}`);
      assert.strictEqual(round(b[c('I')]), round(rec.acuityOH), `Acuity OH en I${base}`);
      assert.strictEqual(round(b[c('M')]), round(rec.supplierOH), `Supplier OH en M${base}`);
      assert.strictEqual(round(b[c('N')]), round(rec.totalInv), `Total inv en N${base}`);
      assert.strictEqual(String(b[c('L')]), rec.status, `estatus en L${base}`);
      const kv = b[c('K')];
      if (rec.shortageDate === null) assert.strictEqual(String(kv), 'FALSE', `K${base}`);
      else assert.strictEqual(kv, rec.shortageDate, `fecha de faltante en K${base}`);

      const proy = kb.get(base + 3);
      for (let w = 0; w < WEEK_COUNT; w++) {
        assert.strictEqual(round(proy[COL_P - 1 + w]), round(rec.projection[w]),
          `proyeccion semana ${numToCol(COL_P + w)}${base + 3}`);
      }
      for (const [j, col] of ['AC', 'AD', 'AE'].entries()) {
        assert.strictEqual(round(proy[colToNum(col) - 1]), round(rec.months[j]), `${col}${base + 3}`);
      }
    }
  });

  check('la proyeccion en cache cuadra con N + arribos - plan', () => {
    for (let i = 0; i < records.length; i++) {
      const base = FIRST_BLOCK_ROW + i * BLOCK_SIZE;
      const n = kb.get(base)[colToNum('N') - 1];
      const arr = kb.get(base + 1);
      const plan = kb.get(base + 2);
      const proy = kb.get(base + 3);
      // Se re-acumula con el mismo redondeo de 9 decimales del motor y se
      // compara con tolerancia: aqui se busca un desalineamiento de fila o de
      // columna, no la ultima cifra de un flotante.
      let acc = n;
      for (let w = 0; w < WEEK_COUNT; w++) {
        acc = Math.round((acc + (arr[COL_P - 1 + w] || 0) - (plan[COL_P - 1 + w] || 0)) * 1e9) / 1e9;
        const leido = Number(proy[COL_P - 1 + w] || 0);
        const tolerancia = Math.max(1e-6, Math.abs(acc) * 1e-9);
        assert.ok(Math.abs(leido - acc) <= tolerancia,
          `la fila Projection no cuadra en ${numToCol(COL_P + w)}${base + 3}: leido ${leido}, esperado ${acc}`);
      }
    }
  });

  // --- formulas -------------------------------------------------------------
  console.log('\nFormulas clonadas');
  const { rows } = S.parseSheet(kbXml);
  const formulasDe = (rowXml) => {
    const out = {};
    if (!rowXml) return out;
    for (const cell of S.splitCells(rowXml).cells) {
      if (!cell.body) continue;
      const m = /<f\b[^>]*>([\s\S]*?)<\/f>/.exec(cell.body);
      if (m) out[S.attr(cell.attrs, 'r')] = S.unescapeXml(m[1]);
    }
    return out;
  };

  check('ninguna formula quedo como referencia compartida vacia', () => {
    for (let r = FIRST_BLOCK_ROW; r <= lastRow; r++) {
      const raw = rows.get(r);
      assert.ok(raw, `falta la fila ${r}`);
      assert.ok(!/<f\b[^>]*t="shared"[^>]*\/>/.test(raw),
        `la fila ${r} tiene <f t="shared"/> sin texto`);
    }
  });

  check('ninguna formula quedo con #REF!', () => {
    for (let r = FIRST_BLOCK_ROW; r <= lastRow; r++) {
      assert.ok(!/#REF!/.test(rows.get(r)), `#REF! en la fila ${r}`);
    }
  });

  check('formulas de bloques distantes = plantilla trasladada', () => {
    const muestras = [0, 1, 2, 3, 50, 199, 200, records.length - 2, records.length - 1]
      .filter((i) => i >= 0 && i < records.length);
    const plantillas = [];
    for (let k = 0; k < 2 * BLOCK_SIZE; k++) plantillas.push(rows.get(FIRST_BLOCK_ROW + k));

    for (const i of muestras) {
      const b = i % 2;
      const delta = (i - b) * BLOCK_SIZE;
      for (let k = 0; k < BLOCK_SIZE; k++) {
        const real = formulasDe(rows.get(FIRST_BLOCK_ROW + i * BLOCK_SIZE + k));
        const base = formulasDe(plantillas[b * BLOCK_SIZE + k]);
        for (const [ref, f] of Object.entries(base)) {
          const col = /^([A-Z]+)/.exec(ref)[1];
          const fila = FIRST_BLOCK_ROW + i * BLOCK_SIZE + k;
          const esperada = translate(f, delta, 0);
          assert.strictEqual(real[col + fila], esperada,
            `parte ${i + 1}, celda ${col}${fila}\n           esperada: ${esperada}\n           real:     ${real[col + fila]}`);
        }
      }
    }
  });

  check('el formato condicional del rojo cubre todos los bloques', () => {
    const m = /<conditionalFormatting sqref="([^"]*P13:AB15[^"]*)"/.exec(kbXml);
    assert.ok(m, 'no se encontro la regla P13:AB15');
    const tokens = m[1].trim().split(/\s+/);
    assert.strictEqual(tokens.length, records.length,
      `la regla cubre ${tokens.length} bloques y hay ${records.length}`);
    assert.strictEqual(tokens[tokens.length - 1], `P${lastRow - 2}:AB${lastRow}`);
  });

  // --- filtro ---------------------------------------------------------------
  console.log('\nFiltro');
  const visibles = [];
  for (let r = FIRST_BLOCK_ROW; r <= lastRow; r++) {
    if (!/\shidden="1"/.test(rows.get(r) || '')) visibles.push(r);
  }
  const esperados = new Set(expected.filteredIds);

  check(`${esperados.size} renglones visibles`, () => {
    assert.strictEqual(visibles.length, esperados.size);
  });

  check('cada fila visible es la fila Projection de una parte que pasa el filtro', () => {
    for (const r of visibles) {
      const offset = (r - FIRST_BLOCK_ROW) % BLOCK_SIZE;
      assert.strictEqual(offset, 3, `la fila ${r} no es la de Projection`);
      const id = Math.floor((r - FIRST_BLOCK_ROW) / BLOCK_SIZE) + 1;
      assert.ok(esperados.has(id), `la parte ${id} no deberia estar visible`);
    }
  });

  check('el autofiltro trae el criterio de estatus', () => {
    const m = /<autoFilter\b[^>]*>([\s\S]*?)<\/autoFilter>/.exec(kbXml);
    assert.ok(m, 'el autofiltro no tiene criterios');
    for (const s of expected.statuses) {
      assert.ok(m[1].includes(`<filter val="${s}"/>`), `falta el criterio ${s}`);
    }
  });

  // --- integridad del paquete ----------------------------------------------
  console.log('\nPaquete');
  check('las 9 hojas siguen presentes', () => {
    assert.strictEqual(wb.sheets.length, 9);
    for (const n of ['SupplyPlan', 'On hand', 'Open_PO', 'Details', 'KB Supply', 'GAPs files']) {
      assert.ok(wb.has(n), `falta la hoja ${n}`);
    }
  });

  check('las tablas y consultas siguen en el paquete', () => {
    for (const p of ['xl/tables/table1.xml', 'xl/tables/table2.xml', 'xl/tables/table3.xml',
      'xl/connections.xml', 'xl/drawings/drawing1.xml', 'xl/styles.xml']) {
      assert.ok(wb.file(p), `falta ${p}`);
    }
  });

  check('calcChain.xml eliminado y recalculo forzado', async () => {
    assert.ok(!wb.file('xl/calcChain.xml'), 'calcChain.xml sigue presente');
  });

  const wbXml = await wb.fileText('xl/workbook.xml');
  check('fullCalcOnLoad activado', () => {
    assert.ok(/fullCalcOnLoad="1"/.test(wbXml), 'falta fullCalcOnLoad');
  });
  check('_FilterDatabase apunta al rango nuevo', () => {
    assert.ok(wbXml.includes(`'KB Supply'!$A$9:$AF$${lastRow}`), 'KB Supply');
    assert.ok(wbXml.includes(`Details!$A$8:$J$${8 + records.length}`), 'Details');
  });
  check('no quedaron referencias a calcChain', () => {
    assert.ok(!/calcChain/.test(wbXml), 'workbook.xml menciona calcChain');
  });

  console.log(`\n${pass} comprobaciones correctas, ${fails.length} fallas`);
  if (fails.length) process.exit(1);
}

function round(n) {
  if (n === undefined || n === null || n === '') return 0;
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : n;
}

main().catch((e) => { console.error(e); process.exit(1); });
