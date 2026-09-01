'use strict';
/**
 * Motor de calculo del proceso MX Supply Assurance.
 *
 * Reproduce en JavaScript, celda por celda, las formulas del bloque de 6 filas
 * de la hoja "KB Supply". No inventa ni ajusta nada: cada campo de aqui
 * corresponde a una formula concreta del libro, anotada en el comentario.
 */

const { forEachRow } = require('./xlsx-read');
const { colToNum } = require('./formula');
const dates = require('./dates');

const BLOCK_SIZE = 6;        // filas por numero de parte en "KB Supply"
const FIRST_BLOCK_ROW = 10;  // primera fila del primer bloque
const WEEK_COUNT = 13;       // columnas P..AB

// Separador de claves compuestas (sitio + parte). Es el caracter "unit
// separator", que no aparece en datos capturados en Excel, de modo que el
// sitio 1 con la parte "52X" nunca colisiona con el sitio 15 y la parte "2X".
const SEP = String.fromCharCode(31);

/** Clave de busqueda equivalente a la de SUMIFS/VLOOKUP: sin distinguir mayusculas. */
function key(v) {
  if (v === undefined || v === null) return '';
  return String(v).toUpperCase();
}
function keyTrim(v) {
  if (v === undefined || v === null) return '';
  return String(v).trim().toUpperCase();
}
/** Corta el ruido de punto flotante sin tocar cantidades reales. */
function round9(n) {
  return Math.round(n * 1e9) / 1e9;
}

function num(v) {
  if (typeof v === 'number') return v;
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

// ---------------------------------------------------------------------------
// Lectura del archivo Data
// ---------------------------------------------------------------------------

/**
 * Lee la hoja de partes del archivo Data (columnas A..I desde la fila 2).
 *
 * @param {object} wb          Workbook del archivo Data
 * @param {object} opts
 * @param {string} [opts.sheetName]  hoja a leer; por omision la primera
 * @param {object} [opts.buyerMap]   sustituciones de DEFAULT_BUYER
 */
async function readDataParts(wb, opts = {}) {
  const sheetName = opts.sheetName || wb.sheets[0].name;
  const xml = await wb.sheetXml(sheetName);
  const buyerMap = opts.buyerMap || {};
  const buyerLookup = new Map(Object.entries(buyerMap).map(([k, v]) => [keyTrim(k), v]));

  const parts = [];
  const headers = [];
  const skipped = [];
  let replacements = 0;

  forEachRow(xml, wb.shared, { maxCol: 9 }, (rowNum, v) => {
    if (rowNum === 1) { for (let i = 0; i < 9; i++) headers[i] = v[i]; return; }
    if (rowNum < 2) return;
    // Una fila solo cuenta como parte si trae ORG y PART. El export termina con
    // una nota al pie ("Applied filters: ...") que ocupa unicamente la columna A
    // y que no debe entrar al listado.
    const hasOrg = v[1] !== undefined && v[1] !== '';
    const hasPart = v[2] !== undefined && v[2] !== '';
    if (!hasOrg || !hasPart) {
      if (v[0] !== undefined && v[0] !== '') skipped.push({ row: rowNum, concat: v[0] });
      return;
    }

    const rawBuyer = v[7];
    const mapped = buyerLookup.get(keyTrim(rawBuyer));
    if (mapped !== undefined && rawBuyer !== mapped) replacements++;

    parts.push({
      sourceRow: rowNum,
      concat: v[0],
      org: v[1],
      part: v[2],
      description: v[3],
      supplier: v[4],
      purchCat: v[5],
      leadTime: v[6],
      buyer: mapped !== undefined ? mapped : rawBuyer,
      buyerOriginal: rawBuyer,
      programFlag: v[8],
    });
  });

  return { parts, headers, replacements, skipped, sheetName };
}

// ---------------------------------------------------------------------------
// Lectura de las fuentes del libro MX
// ---------------------------------------------------------------------------

/** Encabezado de "KB Supply": seriales de semana (P9..AB9) y cubetas mensuales. */
async function readKbHeader(wb) {
  const xml = await wb.sheetXml('KB Supply');
  const colP = colToNum('P');
  let weekSerials = null;
  let monthSerials = null;

  let weekNumbers = null;   // fila 6: WEEKNUM de cada semana
  let weekYears = null;     // fila 5: anio de cada semana

  forEachRow(xml, wb.shared, { maxCol: colToNum('AE') }, (rowNum, v) => {
    if (rowNum === 5) {
      weekYears = [];
      for (let i = 0; i < WEEK_COUNT; i++) weekYears.push(num(v[colP - 1 + i]));
      return;
    }
    if (rowNum === 6) {
      weekNumbers = [];
      for (let i = 0; i < WEEK_COUNT; i++) weekNumbers.push(num(v[colP - 1 + i]));
      return;
    }
    if (rowNum !== 9) return;
    weekSerials = [];
    for (let i = 0; i < WEEK_COUNT; i++) weekSerials.push(num(v[colP - 1 + i]));
    monthSerials = [
      num(v[colToNum('AC') - 1]),
      num(v[colToNum('AD') - 1]),
      num(v[colToNum('AE') - 1]),
    ];
  });

  if (!weekSerials || !weekSerials[0]) {
    throw new Error('No se pudo leer la fila 9 de "KB Supply" (fechas de semana P9:AB9).');
  }

  // Las cubetas mensuales AC/AD/AE agrupan semanas segun las formulas de la
  // fila "Projection" (AC13 = N10-SUM(P12:T12)+SUM(P11:T11)).
  const buckets = readMonthBuckets(xml);

  return { weekSerials, monthSerials, weekNumbers, weekYears, buckets };
}

/** Deduce de las formulas AC/AD/AE que semanas entran en cada cubeta mensual. */
function readMonthBuckets(xml) {
  const fallback = [[0, 4], [5, 8], [9, 12]];
  const rowM = /<row r="13"[^>]*>([\s\S]*?)<\/row>/.exec(xml);
  if (!rowM) return fallback;
  const colP = colToNum('P');
  const out = [];
  for (const col of ['AC', 'AD', 'AE']) {
    const cm = new RegExp('<c r="' + col + '13"[^>]*><f[^>]*>([\\s\\S]*?)</f>').exec(rowM[1]);
    if (!cm) return fallback;
    const rm = /SUM\(([A-Z]{1,3})\d+:([A-Z]{1,3})\d+\)/.exec(cm[1]);
    if (!rm) return fallback;
    out.push([colToNum(rm[1]) - colP, colToNum(rm[2]) - colP]);
  }
  return out;
}

/** Inventario propio: hoja "On hand", tabla Current[Site]/[Part]/[Qty]. */
async function readOnHand(wb) {
  const xml = await wb.sheetXml('On hand');
  const exact = new Map();
  const trimmed = new Map();
  let rows = 0;
  forEachRow(xml, wb.shared, { maxCol: 5 }, (rowNum, v) => {
    if (rowNum < 2) return;
    const site = v[1];
    const part = v[3];
    if (site === undefined && part === undefined) return;
    rows++;
    const qty = num(v[4]);
    const k = key(site) + SEP + key(part);
    exact.set(k, (exact.get(k) || 0) + qty);
    const kt = keyTrim(site) + SEP + keyTrim(part);
    trimmed.set(kt, (trimmed.get(kt) || 0) + qty);
  });
  wb.release('On hand');
  return { exact, trimmed, rows };
}

/** Inventario y arribos del proveedor: "GAPs files" (A=Supplier, B=Part, C=OH, D..P=semanas). */
async function readGaps(wb) {
  const xml = await wb.sheetXml('GAPs files');
  const exact = new Map();
  const trimmed = new Map();
  const supplierByPart = new Map();
  let rows = 0;
  forEachRow(xml, wb.shared, { maxCol: 16 }, (rowNum, v) => {
    if (rowNum < 3) return;                       // la fila 2 es el encabezado
    const part = v[1];
    if (part === undefined || part === '') return;
    rows++;
    const oh = num(v[2]);
    const add = (map, k) => {
      let e = map.get(k);
      if (!e) { e = { oh: 0, arrivals: new Array(WEEK_COUNT).fill(0) }; map.set(k, e); }
      e.oh += oh;
      for (let i = 0; i < WEEK_COUNT; i++) e.arrivals[i] += num(v[3 + i]);
    };
    add(exact, key(part));
    add(trimmed, keyTrim(part));
    if (v[0] !== undefined && !supplierByPart.has(keyTrim(part))) supplierByPart.set(keyTrim(part), v[0]);
  });
  wb.release('GAPs files');
  return { exact, trimmed, supplierByPart, rows };
}

/** Demanda: hoja "SupplyPlan" (A=Concat, D..P=semanas). VLOOKUP toma la primera coincidencia. */
async function readSupplyPlan(wb) {
  const xml = await wb.sheetXml('SupplyPlan');
  const exact = new Map();
  const trimmed = new Map();
  let rows = 0;
  forEachRow(xml, wb.shared, { maxCol: 16 }, (rowNum, v) => {
    if (rowNum < 2) return;
    const concat = v[0];
    if (concat === undefined || concat === '') return;
    rows++;
    const weeks = [];
    for (let i = 0; i < WEEK_COUNT; i++) weeks.push(num(v[3 + i]));
    const k = key(concat);
    if (!exact.has(k)) exact.set(k, weeks);       // VLOOKUP: gana la primera fila
    const kt = keyTrim(concat);
    if (!trimmed.has(kt)) trimmed.set(kt, weeks);
  });
  wb.release('SupplyPlan');
  return { exact, trimmed, rows };
}

/**
 * Ordenes de compra abiertas: hoja "Open_PO", tabla Open_PO (A1:BG).
 * Solo alimenta las dos filas informativas del bloque ("Promise. Open POs" y
 * "Need. Open POs"); no interviene en la proyeccion ni en el estatus.
 * Columnas usadas: A=Concat, BB=PO_QTY_DUE, BC=week, BD=Year, BE=Nweek, BF=Nyear.
 */
async function readOpenPO(wb) {
  if (!wb.has('Open_PO')) return { promise: new Map(), need: new Map(), rows: 0, missing: true };
  const cQty = colToNum('BB');
  const cWeek = colToNum('BC');
  const cYear = colToNum('BD');
  const cNweek = colToNum('BE');
  const cNyear = colToNum('BF');

  const xml = await wb.sheetXml('Open_PO');
  const promise = new Map();
  const need = new Map();
  let rows = 0;
  forEachRow(xml, wb.shared, { maxCol: cNyear }, (rowNum, v) => {
    if (rowNum < 2) return;
    const concat = v[0];
    if (concat === undefined || concat === '') return;
    rows++;
    const qty = num(v[cQty - 1]);
    if (!qty) return;
    const c = key(concat);
    const kp = c + SEP + num(v[cWeek - 1]) + SEP + num(v[cYear - 1]);
    promise.set(kp, (promise.get(kp) || 0) + qty);
    const kn = c + SEP + num(v[cNweek - 1]) + SEP + num(v[cNyear - 1]);
    need.set(kn, (need.get(kn) || 0) + qty);
  });
  wb.release('Open_PO');
  return { promise, need, rows, missing: false };
}

async function readSources(wb, onProgress, opts = {}) {
  const report = onProgress || function () {};
  report('Leyendo encabezado de KB Supply');
  const header = await readKbHeader(wb);
  report('Leyendo On hand');
  const onHand = await readOnHand(wb);
  report('Leyendo GAPs files');
  const gaps = await readGaps(wb);
  report('Leyendo SupplyPlan');
  const supplyPlan = await readSupplyPlan(wb);
  let openPO = { promise: new Map(), need: new Map(), rows: 0, skipped: true };
  if (opts.includeOpenPO !== false) {
    report('Leyendo Open_PO');
    openPO = await readOpenPO(wb);
  }
  return { header, onHand, gaps, supplyPlan, openPO };
}

// ---------------------------------------------------------------------------
// Calculo
// ---------------------------------------------------------------------------

/**
 * Calcula el bloque de "KB Supply" para cada parte.
 *
 * @param {Array}  parts    salida de readDataParts
 * @param {object} sources  salida de readSources
 * @param {object} opts
 * @param {number} [opts.todaySerial]  valor de TODAY() usado por la columna L
 */
function compute(parts, sources, opts = {}) {
  const { weekSerials, buckets } = sources.header;
  const today = opts.todaySerial != null ? opts.todaySerial : dates.todaySerial();
  const warn = { onHandTrim: 0, gapsTrim: 0, planTrim: 0, noPlan: 0, noGaps: 0 };

  const records = parts.map((p, i) => {
    const id = i + 1;
    const baseRow = FIRST_BLOCK_ROW + i * BLOCK_SIZE;

    // B: +CONCAT(D,"-",C)
    const concat = (p.part == null ? '' : p.part) + '-' + (p.org == null ? '' : p.org);

    // I: SUMIFS(Current[Qty],Current[Site],C,Current[Part],D)
    let acuityOH = sources.onHand.exact.get(key(p.org) + SEP + key(p.part));
    if (acuityOH === undefined) {
      const alt = sources.onHand.trimmed.get(keyTrim(p.org) + SEP + keyTrim(p.part));
      if (alt !== undefined) { acuityOH = alt; warn.onHandTrim++; } else acuityOH = 0;
    }

    // M: IFNA(SUMIFS('GAPs files'!C:C,'GAPs files'!B:B,D),0) y la fila "Arrivals"
    let g = sources.gaps.exact.get(key(p.part));
    if (!g) {
      const alt = sources.gaps.trimmed.get(keyTrim(p.part));
      if (alt) { g = alt; warn.gapsTrim++; } else warn.noGaps++;
    }
    const supplierOH = g ? g.oh : 0;
    const arrivals = g ? g.arrivals.slice() : new Array(WEEK_COUNT).fill(0);

    // Fila "Supply Plan": IFNA(VLOOKUP(B,SupplyPlan!A:V,...),0)
    let plan = sources.supplyPlan.exact.get(key(concat));
    if (!plan) {
      const alt = sources.supplyPlan.trimmed.get(keyTrim(concat));
      if (alt) { plan = alt; warn.planTrim++; } else warn.noPlan++;
    }
    const demand = plan ? plan.slice() : new Array(WEEK_COUNT).fill(0);

    // N: +I+M
    const totalInv = acuityOH + supplierOH;

    // Fila "Projection": la primera semana parte de N y de ahi se acumula.
    // Se redondea a 9 decimales en cada paso: acumular 13 restas de flotantes
    // deja residuos del orden de 1e-13 que convertirian un cero exacto en un
    // negativo y dispararian un faltante que no existe. El plan de suministro
    // llega a manejar 2e-4, asi que 9 decimales no pierden informacion real.
    const projection = new Array(WEEK_COUNT);
    for (let w = 0; w < WEEK_COUNT; w++) {
      const prev = w === 0 ? totalInv : projection[w - 1];
      projection[w] = round9(prev + arrivals[w] - demand[w]);
    }

    // K: primera semana con proyeccion negativa, evaluando P..AA (la formula no llega a AB).
    let shortageWeek = -1;
    for (let w = 0; w < WEEK_COUNT - 1; w++) {
      if (projection[w] < 0) { shortageWeek = w; break; }
    }
    const shortageDate = shortageWeek === -1 ? null : weekSerials[shortageWeek];

    // L: IF(K="FALSE","OK",IF((K-J)<TODAY(),"SHORTAGE","OK PER LT"))
    const leadTime = num(p.leadTime);
    let status;
    if (shortageDate === null) status = 'OK';
    else if (shortageDate - leadTime < today) status = 'SHORTAGE';
    else status = 'OK PER LT';

    // AC/AD/AE: N - SUM(plan del mes) + SUM(arribos del mes). Cada mes parte de N.
    const months = buckets.map((range) => {
      let s = totalInv;
      for (let w = range[0]; w <= range[1] && w < WEEK_COUNT; w++) s += arrivals[w] - demand[w];
      return round9(s);
    });

    // Filas "Promise. Open POs" y "Need. Open POs":
    // SUMIFS(Open_PO[PO_QTY_DUE], Open_PO[Concat], B, Open_PO[week], P$6, Open_PO[Year], P$5)
    const poPromise = new Array(WEEK_COUNT).fill(0);
    const poNeed = new Array(WEEK_COUNT).fill(0);
    if (sources.openPO && sources.openPO.promise.size) {
      const ck = key(concat);
      const wn = sources.header.weekNumbers || [];
      const wy = sources.header.weekYears || [];
      for (let w = 0; w < WEEK_COUNT; w++) {
        const k = ck + SEP + num(wn[w]) + SEP + num(wy[w]);
        poPromise[w] = sources.openPO.promise.get(k) || 0;
        poNeed[w] = sources.openPO.need.get(k) || 0;
      }
    }

    return {
      id, baseRow, sourceRow: p.sourceRow,
      concat, org: p.org, part: p.part, description: p.description,
      supplier: p.supplier, buyer: p.buyer, buyerOriginal: p.buyerOriginal,
      category: p.purchCat, programFlag: p.programFlag,
      acuityOH, coldLT: leadTime, supplierOH, totalInv,
      arrivals, demand, projection, months, poPromise, poNeed,
      shortageWeek, shortageDate, status,
      gapsSupplier: sources.gaps.supplierByPart.get(keyTrim(p.part)) || null,
    };
  });

  return { records, today, warn, weekSerials, buckets };
}

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------

/**
 * Semanas cuyo tramo de 7 dias se cruza con el rango [fromSerial, toSerial].
 * Es lo que hace que "mes actual y el siguiente" incluya la semana que empezo
 * el 31-ago pero contiene hoy.
 */
function weeksInRange(weekSerials, fromSerial, toSerial) {
  const idx = [];
  for (let w = 0; w < weekSerials.length; w++) {
    const start = weekSerials[w];
    if (start + 6 >= fromSerial && start <= toSerial) idx.push(w);
  }
  return idx;
}

/**
 * Aplica los filtros de la hoja: estatus en la columna L y "rojo" en las
 * columnas de semana. El rojo del libro es formato condicional "celda < 0"
 * sobre la fila Projection, asi que aqui equivale a proyeccion negativa.
 *
 * @param {object} computed  salida de compute()
 * @param {object} f
 * @param {string[]} [f.statuses]  estatus aceptados (por omision ['SHORTAGE'])
 * @param {number[]} [f.redWeeks]  indices de semana donde se exige rojo
 * @param {string} [f.redMode]     'any' (rojo en alguna) | 'all' (en todas)
 */
function applyFilter(computed, f) {
  const statuses = (f.statuses && f.statuses.length ? f.statuses : ['SHORTAGE'])
    .map((s) => String(s).toUpperCase());
  const redWeeks = f.redWeeks || [];
  const mode = f.redMode === 'all' ? 'all' : 'any';

  return computed.records.filter((r) => {
    if (!statuses.includes(r.status)) return false;
    if (!redWeeks.length) return true;
    const hits = redWeeks.filter((w) => r.projection[w] < 0);
    return mode === 'all' ? hits.length === redWeeks.length : hits.length > 0;
  });
}

module.exports = {
  BLOCK_SIZE, FIRST_BLOCK_ROW, WEEK_COUNT, SEP,
  readDataParts, readSources, readKbHeader, readOpenPO,
  compute, applyFilter, weeksInRange,
};
