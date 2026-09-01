'use strict';
/**
 * Orquestador del proceso completo, en el orden pedido:
 *
 *   1. Llenar "Details" desde el archivo Data, cambiando DEFAULT_BUYER.
 *   2. Arrastrar el bloque de "KB Supply" hasta la fila que indica G6.
 *   3. Filtrar por estatus en L9 y por color rojo en la columna de semana.
 *   4. Consolidar por proveedor, un renglon por numero de parte unico.
 *
 * Cada paso deja constancia en `steps` para que la aplicacion pueda mostrar que
 * se hizo y con que numeros, sin que haya que abrir el libro para comprobarlo.
 */

const { Workbook } = require('./workbook');
const E = require('./engine');
const D = require('./dates');
const { writeDetails, FIRST_DATA_ROW, HEADER_ROW } = require('./write-details');
const { writeKbSupply } = require('./write-kb');
const { finalizeWorkbook } = require('./finalize');
const { colToNum, numToCol } = require('./formula');

// dxf del formato condicional "menor que 0" de las semanas: relleno rojo claro
// #FFC7CE con texto rojo oscuro #9C0006. Es el ROJO que se filtra en el paso 3.
const RED_DXF_ID = 4;
const RED_FILL = 'FFC7CE';

const DEFAULT_BUYER_MAP = { LZR22: 'Luis Rodriguez' };

/**
 * @param {object} input
 * @param {Buffer} input.mxBuffer     libro MX Supply Assurance Process
 * @param {Buffer} input.dataBuffer   archivo Data
 * @param {object} [input.options]
 * @param {string} [input.options.today]        ISO; por omision la fecha del equipo
 * @param {object} [input.options.buyerMap]     sustituciones de DEFAULT_BUYER
 * @param {string[]} [input.options.statuses]   estatus a conservar (por omision SHORTAGE)
 * @param {string} [input.options.redMode]      'week' (una columna) | 'range' (rango de fechas)
 * @param {string} [input.options.redColumn]    columna de semana cuando redMode='week' (p.ej. 'W')
 * @param {string} [input.options.from]         ISO inicial cuando redMode='range'
 * @param {string} [input.options.to]           ISO final cuando redMode='range'
 * @param {boolean} [input.options.includeOpenPO]
 * @param {boolean} [input.options.buildWorkbook]  false para solo analizar
 * @param {function} [input.onProgress]
 */
async function runProcess(input) {
  const opts = input.options || {};
  const report = input.onProgress || function () {};
  const steps = [];
  const warnings = [];

  const today = opts.today ? D.isoToSerial(opts.today) : D.todaySerial();
  if (today == null) throw new Error(`Fecha invalida: ${opts.today}`);

  // --- Paso 1: Details -------------------------------------------------------
  report('Leyendo archivo Data');
  const dataWb = await Workbook.open(input.dataBuffer);
  const buyerMap = opts.buyerMap || DEFAULT_BUYER_MAP;
  const dataRead = await E.readDataParts(dataWb, { buyerMap, sheetName: opts.dataSheet });
  if (!dataRead.parts.length) {
    throw new Error(`La hoja "${dataRead.sheetName}" del archivo Data no tiene partes con ORG y PART.`);
  }
  for (const s of dataRead.skipped) {
    warnings.push(`Fila ${s.row} del archivo Data ignorada por no traer ORG ni PART: "${String(s.concat).split('\n')[0].slice(0, 60)}"`);
  }

  report('Abriendo libro MX');
  const wb = await Workbook.open(input.mxBuffer);

  const detailsInfo = await writeDetails(wb, dataRead.parts);
  steps.push({
    n: 1,
    titulo: 'Details llenado desde Data',
    detalle: `${dataRead.parts.length} partes escritas en Details!A${FIRST_DATA_ROW}:J${detailsInfo.lastRow}`
      + ` (Data!A2:I${dataRead.parts[dataRead.parts.length - 1].sourceRow}).`
      + ` DEFAULT_BUYER sustituido en ${dataRead.replacements} renglones: `
      + Object.entries(buyerMap).map(([k, v]) => `${k} -> ${v}`).join(', ') + '.',
  });

  // --- Fuentes de calculo ----------------------------------------------------
  const sources = await E.readSources(wb, report, { includeOpenPO: opts.includeOpenPO !== false });
  const computed = E.compute(dataRead.parts, sources, { todaySerial: today });
  const weekSerials = computed.weekSerials;

  if (sources.gaps.rows > 0 && computed.warn.noGaps === computed.records.length) {
    warnings.push(
      `Ninguna de las ${computed.records.length} partes aparece en la hoja "GAPs files"`
      + ` (${sources.gaps.rows} renglones, otro conjunto de proveedores).`
      + ' Supplier OH y la fila Arrivals quedan en cero para todas, tal como los calcularia Excel:'
      + ' la proyeccion solo resta el plan de suministro al inventario propio.'
    );
  }
  if (computed.warn.noPlan) {
    warnings.push(`${computed.warn.noPlan} partes no tienen renglon en SupplyPlan; su demanda cuenta como cero.`);
  }
  for (const [k, msg] of [
    ['onHandTrim', 'On hand'], ['gapsTrim', 'GAPs files'], ['planTrim', 'SupplyPlan'],
  ]) {
    if (computed.warn[k]) {
      warnings.push(`${computed.warn[k]} coincidencias en ${msg} requirieron ignorar espacios sobrantes en la llave.`);
    }
  }

  // --- Paso 2: arrastre ------------------------------------------------------
  const lastRow = E.FIRST_BLOCK_ROW + computed.records.length * E.BLOCK_SIZE - 1;
  steps.push({
    n: 2,
    titulo: 'KB Supply arrastrado',
    detalle: `Bloque A10:AF21 replicado ${computed.records.length} veces, de 6 filas cada uno,`
      + ` hasta A${lastRow}:AF${lastRow}. G6 = ${lastRow}.`,
  });

  // --- Paso 3: filtros -------------------------------------------------------
  const statuses = (opts.statuses && opts.statuses.length) ? opts.statuses : ['SHORTAGE'];
  const filterCfg = resolveRedWeeks(weekSerials, opts, today);
  const filtered = E.applyFilter(computed, { statuses, redWeeks: filterCfg.weeks, redMode: 'any' });

  steps.push({
    n: 3,
    titulo: 'Filtros aplicados',
    detalle: `L9 = ${statuses.join(' / ')}; rojo (proyeccion negativa, relleno #${RED_FILL})`
      + ` en ${filterCfg.descripcion}. Quedan ${filtered.length} renglones`
      + ` de ${computed.records.length}.`,
  });

  const summary = buildSummary(computed, filtered, filterCfg, statuses, today, weekSerials);

  let workbookBuffer = null;
  let kbInfo = null;
  if (opts.buildWorkbook !== false) {
    report('Escribiendo KB Supply');
    kbInfo = await writeKbSupply(wb, computed.records, {
      visibleIds: new Set(filtered.map((r) => r.id)),
      statusFilter: statuses,
      colorWeek: filterCfg.weeks.length === 1 ? filterCfg.weeks[0] : -1,
      colorDxfId: RED_DXF_ID,
    });
    const notes = await finalizeWorkbook(wb, {
      Details: `A${HEADER_ROW}:J${detailsInfo.lastRow}`,
      'KB Supply': kbInfo.filterRef,
    });
    wb.setFileText('xl/sharedStrings.xml', detailsInfo.sst.toXml());
    report('Comprimiendo libro');
    workbookBuffer = await wb.toBuffer();
    steps.push({ n: 4, titulo: 'Libro guardado', detalle: notes.join('; ') + '.' });
  }

  return {
    computed, filtered, summary, steps, warnings,
    filterCfg, statuses, today, weekSerials,
    monthSerials: sources.header.monthSerials,
    detailsInfo, kbInfo, workbookBuffer,
    sourceCounts: {
      dataParts: dataRead.parts.length,
      onHand: sources.onHand.rows,
      gaps: sources.gaps.rows,
      supplyPlan: sources.supplyPlan.rows,
      openPO: sources.openPO ? sources.openPO.rows : 0,
    },
  };
}

/**
 * Traduce la configuracion de rojo a indices de semana.
 * 'week'  -> una sola columna, que es el paso literal (W9).
 * 'range' -> todas las semanas cuyo tramo de 7 dias toca el rango de fechas.
 */
function resolveRedWeeks(weekSerials, opts, today) {
  const colP = colToNum('P');

  if (opts.redMode === 'week' || (opts.redColumn && !opts.from && !opts.to)) {
    const col = (opts.redColumn || 'W').toUpperCase();
    const idx = colToNum(col) - colP;
    if (idx < 0 || idx >= weekSerials.length) {
      throw new Error(`La columna ${col} no es una columna de semana (P a ${numToCol(colP + weekSerials.length - 1)}).`);
    }
    return {
      modo: 'week',
      weeks: [idx],
      columnas: [col],
      from: weekSerials[idx],
      to: weekSerials[idx] + 6,
      descripcion: `la columna ${col} (semana del ${D.serialToEs(weekSerials[idx])})`,
    };
  }

  const from = opts.from ? D.isoToSerial(opts.from) : today;
  const to = opts.to ? D.isoToSerial(opts.to) : D.endOfMonthSerial(D.startOfNextMonthSerial(today));
  if (from == null || to == null) throw new Error('Rango de fechas invalido.');
  if (to < from) throw new Error('La fecha final del rango es anterior a la inicial.');

  const weeks = E.weeksInRange(weekSerials, from, to);
  if (!weeks.length) {
    throw new Error(
      `El rango ${D.serialToEs(from)} a ${D.serialToEs(to)} no toca ninguna de las 13 semanas del libro`
      + ` (${D.serialToEs(weekSerials[0])} a ${D.serialToEs(weekSerials[weekSerials.length - 1] + 6)}).`
    );
  }
  const columnas = weeks.map((w) => numToCol(colP + w));
  return {
    modo: 'range',
    weeks, columnas, from, to,
    descripcion: `las columnas ${columnas[0]} a ${columnas[columnas.length - 1]}`
      + ` (${D.serialToEs(from)} a ${D.serialToEs(to)}, ${weeks.length} semanas)`,
  };
}

function buildSummary(computed, filtered, filterCfg, statuses, today, weekSerials) {
  const porEstatus = {};
  for (const r of computed.records) porEstatus[r.status] = (porEstatus[r.status] || 0) + 1;

  const partes = new Set(filtered.map((r) => String(r.part)));
  const proveedores = new Set(filtered.map((r) => String(r.supplier)));

  return {
    hoy: D.serialToIso(today),
    totalPartes: computed.records.length,
    porEstatus,
    estatusFiltrado: statuses,
    rango: {
      modo: filterCfg.modo,
      desde: D.serialToIso(filterCfg.from),
      hasta: D.serialToIso(filterCfg.to),
      columnas: filterCfg.columnas,
      descripcion: filterCfg.descripcion,
    },
    renglonesEnRiesgo: filtered.length,
    partesUnicas: partes.size,
    proveedores: proveedores.size,
    semanas: weekSerials.map((s, i) => ({
      columna: numToCol(colToNum('P') + i),
      inicio: D.serialToIso(s),
    })),
  };
}

module.exports = { runProcess, resolveRedWeeks, RED_DXF_ID, RED_FILL, DEFAULT_BUYER_MAP };
