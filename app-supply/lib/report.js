'use strict';
/**
 * Paso 4: consolidado por proveedor, un renglon por numero de parte unico.
 *
 * El acomodo de columnas es el de la hoja oculta "output" del libro MX, que es
 * la que el proceso usa para escalar faltantes, mas las columnas de cantidad
 * que hacen falta para pedirle material a un proveedor.
 *
 * Reglas de consolidacion, cuando una misma parte aparece en varias ORG:
 *   ORG / Concat  se enlistan separadas por coma
 *   Acuity OH     se suma, porque es inventario por sitio
 *   Supplier OH   se toma una sola vez: en "GAPs files" esta por parte, no por
 *                 sitio, de modo que sumarlo lo contaria dos veces
 *   Fecha de faltante  la mas proxima
 *   Faltante      suma, por sitio, de la peor proyeccion negativa de la ventana
 */

const ExcelJS = require('exceljs');
const D = require('./dates');
const { colToNum, numToCol } = require('./formula');

const ROJO = 'FFFFC7CE';        // mismo relleno que el formato condicional del libro
const ROJO_TEXTO = 'FF9C0006';
const ENCABEZADO = 'FF1F3864';
const SUBTOTAL = 'FFDDEBF7';

const COLUMNAS = [
  { header: 'ID', key: 'id', width: 7 },
  { header: 'Concat', key: 'concat', width: 20 },
  { header: 'ORG', key: 'org', width: 10 },
  { header: 'PART', key: 'part', width: 24 },
  { header: 'MPN', key: 'mpn', width: 16 },
  { header: 'DESCRIPTION', key: 'description', width: 38 },
  { header: 'SUPPLIER', key: 'supplier', width: 30 },
  { header: 'Category', key: 'category', width: 10 },
  { header: 'Acuity OH', key: 'acuityOH', width: 12 },
  { header: 'Shortage date', key: 'shortageDate', width: 14 },
  { header: 'Cold LT (dias)', key: 'coldLT', width: 13 },
  { header: 'Supplier OH', key: 'supplierOH', width: 12 },
  { header: 'Total inv', key: 'totalInv', width: 12 },
  { header: 'Faltante en la ventana', key: 'faltante', width: 20 },
  { header: 'Semana del faltante', key: 'semanaFaltante', width: 18 },
  { header: 'DEFAULT_BUYER', key: 'buyer', width: 18 },
  { header: 'Estatus', key: 'status', width: 14 },
];

/** Columnas mensuales, cuyos encabezados dependen de las cubetas del libro. */
function columnasMes(monthSerials) {
  return (monthSerials || []).map((s, i) => ({
    header: mesLargo(s),
    key: 'mes' + i,
    width: 14,
  }));
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function mesLargo(serial) {
  const d = D.serialToDate(serial);
  return `${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * Agrupa los renglones filtrados por proveedor y numero de parte unico.
 *
 * @param {Array} filtered   registros que pasaron el filtro
 * @param {number[]} weeks   indices de semana de la ventana evaluada
 */
function consolidar(filtered, weeks) {
  const porProveedor = new Map();

  for (const r of filtered) {
    const proveedor = r.supplier == null ? '(sin proveedor)' : String(r.supplier);
    if (!porProveedor.has(proveedor)) porProveedor.set(proveedor, new Map());
    const partes = porProveedor.get(proveedor);
    const clave = String(r.part);

    // Peor proyeccion negativa dentro de la ventana, como cantidad positiva.
    let peor = 0;
    let peorSemana = null;
    for (const w of weeks) {
      if (r.projection[w] < peor) { peor = r.projection[w]; peorSemana = w; }
    }

    if (!partes.has(clave)) {
      partes.set(clave, {
        supplier: proveedor,
        part: r.part,
        mpn: '',
        description: r.description,
        category: r.category,
        buyer: r.buyer,
        coldLT: r.coldLT,
        orgs: [], concats: [], ids: [],
        acuityOH: 0,
        supplierOH: r.supplierOH,     // por parte, no por sitio: se toma una vez
        faltante: 0,
        peorSemana: null,
        shortageDate: null,
        status: r.status,
        meses: r.months.map(() => 0),
        registros: [],
      });
    }
    const g = partes.get(clave);
    g.orgs.push(r.org);
    g.concats.push(r.concat);
    g.ids.push(r.id);
    g.acuityOH += r.acuityOH;
    g.faltante += -peor;
    if (peorSemana !== null && (g.peorSemana === null || peorSemana < g.peorSemana)) g.peorSemana = peorSemana;
    if (r.shortageDate !== null && (g.shortageDate === null || r.shortageDate < g.shortageDate)) {
      g.shortageDate = r.shortageDate;
    }
    r.months.forEach((m, i) => { g.meses[i] += m; });
    g.registros.push(r);
  }

  const proveedores = [...porProveedor.entries()]
    .map(([nombre, partes]) => {
      const lista = [...partes.values()]
        .map((g) => ({ ...g, totalInv: g.acuityOH + g.supplierOH }))
        .sort((a, b) => {
          const fa = a.shortageDate || Infinity;
          const fb = b.shortageDate || Infinity;
          return fa - fb || String(a.part).localeCompare(String(b.part));
        });
      return {
        nombre,
        partes: lista,
        totalPartes: lista.length,
        totalRenglones: lista.reduce((s, g) => s + g.registros.length, 0),
        totalFaltante: lista.reduce((s, g) => s + g.faltante, 0),
        fechaMasProxima: lista.reduce((m, g) => (g.shortageDate && (!m || g.shortageDate < m) ? g.shortageDate : m), null),
      };
    })
    .sort((a, b) => (a.fechaMasProxima || Infinity) - (b.fechaMasProxima || Infinity)
      || b.totalPartes - a.totalPartes
      || a.nombre.localeCompare(b.nombre));

  return proveedores;
}

// ---------------------------------------------------------------------------
// Generacion del archivo
// ---------------------------------------------------------------------------

function estiloEncabezado(row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ENCABEZADO } };
  row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  row.height = 30;
}

function pintarNegativos(sheet, columnas, desdeFila) {
  const objetivo = columnas
    .map((c, i) => ({ c, i: i + 1 }))
    .filter(({ c }) => c.key === 'faltante' || /^mes\d+$/.test(c.key));
  for (let r = desdeFila; r <= sheet.rowCount; r++) {
    for (const { c, i } of objetivo) {
      const cell = sheet.getCell(r, i);
      const v = cell.value;
      if (typeof v !== 'number') continue;
      const malo = c.key === 'faltante' ? v > 0 : v < 0;
      if (malo) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROJO } };
        cell.font = { color: { argb: ROJO_TEXTO }, bold: true };
      }
    }
  }
}

function filaDe(g, columnas) {
  const orgs = [...new Set(g.orgs.map(String))];
  const base = {
    id: g.ids.join(', '),
    concat: [...new Set(g.concats.map(String))].join(', '),
    org: orgs.join(', '),
    part: g.part,
    mpn: g.mpn,
    description: g.description,
    supplier: g.supplier,
    category: g.category,
    acuityOH: g.acuityOH,
    shortageDate: g.shortageDate ? D.serialToDate(g.shortageDate) : null,
    coldLT: g.coldLT,
    supplierOH: g.supplierOH,
    totalInv: g.totalInv,
    faltante: g.faltante,
    semanaFaltante: g.peorSemana === null ? null : numToCol(colToNum('P') + g.peorSemana),
    buyer: g.buyer,
    status: g.status,
  };
  g.meses.forEach((m, i) => { base['mes' + i] = m; });
  return columnas.map((c) => base[c.key]);
}

function armarHoja(sheet, columnas, titulo, subtitulo) {
  sheet.mergeCells(1, 1, 1, columnas.length);
  const t = sheet.getCell(1, 1);
  t.value = titulo;
  t.font = { bold: true, size: 14, color: { argb: ENCABEZADO } };
  t.alignment = { vertical: 'middle' };
  sheet.getRow(1).height = 24;

  sheet.mergeCells(2, 1, 2, columnas.length);
  const s = sheet.getCell(2, 1);
  s.value = subtitulo;
  s.font = { size: 9, color: { argb: 'FF666666' } };
  sheet.getRow(2).height = 16;

  sheet.getRow(3).values = [];
  const head = sheet.getRow(4);
  head.values = columnas.map((c) => c.header);
  estiloEncabezado(head);
  columnas.forEach((c, i) => { sheet.getColumn(i + 1).width = c.width; });
  return 5;
}

/**
 * @param {object} result  salida de process.runProcess
 * @returns {Promise<Buffer>} el .xlsx del consolidado
 */
async function buildReport(result) {
  const { filtered, summary, filterCfg } = result;
  const columnas = COLUMNAS.concat(columnasMes(result.monthSerials || []));
  const proveedores = consolidar(filtered, filterCfg.weeks);

  const libro = new ExcelJS.Workbook();
  libro.creator = 'MX Supply Assurance';
  libro.created = new Date();

  const ventana = `${D.serialToEs(filterCfg.from)} a ${D.serialToEs(filterCfg.to)}`;
  const subtitulo = `Estatus ${summary.estatusFiltrado.join(' / ')} con proyeccion negativa en ${filterCfg.descripcion}.`
    + ` Corrida del ${D.serialToEs(D.isoToSerial(summary.hoy))}.`;

  // --- Hoja 1: consolidado --------------------------------------------------
  const cons = libro.addWorksheet('Consolidado', { views: [{ state: 'frozen', ySplit: 4 }] });
  let fila = armarHoja(cons, columnas, 'Consolidado por proveedor', subtitulo);
  const primeraDatos = fila;

  for (const prov of proveedores) {
    const enc = cons.getRow(fila++);
    cons.mergeCells(enc.number, 1, enc.number, columnas.length);
    const c = cons.getCell(enc.number, 1);
    c.value = `${prov.nombre}   -   ${prov.totalPartes} parte(s), faltante total ${redondear(prov.totalFaltante)}`
      + (prov.fechaMasProxima ? `, el mas proximo el ${D.serialToEs(prov.fechaMasProxima)}` : '');
    c.font = { bold: true, size: 11 };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SUBTOTAL } };
    enc.height = 20;

    for (const g of prov.partes) {
      cons.getRow(fila++).values = filaDe(g, columnas);
    }
  }
  pintarNegativos(cons, columnas, primeraDatos);
  cons.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: columnas.length } };

  // --- Hoja 2: resumen por proveedor ---------------------------------------
  const resumenCols = [
    { header: 'Proveedor', key: 'p', width: 34 },
    { header: 'Partes en riesgo', key: 'n', width: 16 },
    { header: 'Renglones (parte x ORG)', key: 'r', width: 20 },
    { header: 'Faltante total', key: 'f', width: 16 },
    { header: 'Faltante mas proximo', key: 'd', width: 20 },
    { header: 'Correo', key: 'c', width: 34 },
  ];
  const res = libro.addWorksheet('Resumen proveedores', { views: [{ state: 'frozen', ySplit: 4 }] });
  let fr = armarHoja(res, resumenCols, 'Resumen por proveedor', subtitulo);
  const contactos = result.contactos || {};
  for (const prov of proveedores) {
    res.getRow(fr++).values = [
      prov.nombre, prov.totalPartes, prov.totalRenglones, redondear(prov.totalFaltante),
      prov.fechaMasProxima ? D.serialToDate(prov.fechaMasProxima) : null,
      (contactos[prov.nombre] || []).join('; ') || '(sin correo registrado)',
    ];
  }
  const tot = res.getRow(fr++);
  tot.values = ['TOTAL', proveedores.reduce((s, p) => s + p.totalPartes, 0),
    filtered.length, redondear(proveedores.reduce((s, p) => s + p.totalFaltante, 0)), null, null];
  tot.font = { bold: true };
  tot.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SUBTOTAL } };
  res.getColumn(5).numFmt = 'dd-mmm-yyyy';

  // --- Hoja 3: detalle por ORG, sin consolidar -----------------------------
  const detCols = columnas.filter((c) => c.key !== 'id').map((c) => ({ ...c }));
  const det = libro.addWorksheet('Detalle por ORG', { views: [{ state: 'frozen', ySplit: 4 }] });
  let fd = armarHoja(det, detCols, 'Detalle sin consolidar',
    'Un renglon por combinacion parte + ORG, tal como salio de KB Supply. Sirve para rastrear de donde viene cada cifra del consolidado.');
  for (const r of filtered) {
    const uno = consolidar([r], filterCfg.weeks)[0].partes[0];
    det.getRow(fd++).values = filaDe(uno, detCols);
  }
  pintarNegativos(det, detCols, 5);
  det.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: detCols.length } };

  // --- Una hoja por proveedor ----------------------------------------------
  const usados = new Set(['Consolidado', 'Resumen proveedores', 'Detalle por ORG', 'Parametros']);
  for (const prov of proveedores) {
    const hoja = libro.addWorksheet(nombreHoja(prov.nombre, usados), { views: [{ state: 'frozen', ySplit: 4 }] });
    let f = armarHoja(hoja, columnas, prov.nombre, subtitulo);
    for (const g of prov.partes) hoja.getRow(f++).values = filaDe(g, columnas);
    pintarNegativos(hoja, columnas, 5);
  }

  // --- Parametros ----------------------------------------------------------
  const par = libro.addWorksheet('Parametros');
  par.getColumn(1).width = 34;
  par.getColumn(2).width = 82;
  const filas = [
    ['Generado', new Date().toISOString().slice(0, 19).replace('T', ' ')],
    ['TODAY usado en la columna L', summary.hoy],
    ['Partes leidas del archivo Data', summary.totalPartes],
    ['Estatus filtrado (columna L9)', summary.estatusFiltrado.join(', ')],
    ['Criterio de rojo', `proyeccion negativa en ${filterCfg.descripcion}`],
    ['Ventana evaluada', ventana],
    ['Columnas de semana evaluadas', filterCfg.columnas.join(', ')],
    ['Renglones que pasan el filtro', summary.renglonesEnRiesgo],
    ['Numeros de parte unicos', summary.partesUnicas],
    ['Proveedores', summary.proveedores],
    ['', ''],
    ['Estatus de las 597 partes', Object.entries(summary.porEstatus).map(([k, v]) => `${k}: ${v}`).join(' | ')],
    ['', ''],
    ['Como se calcula la proyeccion', 'Total inv (Acuity OH + Supplier OH) + Arrivals - Supply Plan, acumulado semana a semana. Es la fila "Projection" del bloque de KB Supply.'],
    ['Como se calcula el estatus', 'SHORTAGE cuando la fecha del primer faltante menos el Cold LT ya paso. OK PER LT cuando aun alcanza el tiempo de entrega. OK cuando no hay semana negativa.'],
    ['Consolidacion', 'Por proveedor (columna F) y numero de parte unico (columna D). Acuity OH se suma entre ORG; Supplier OH se toma una vez porque en GAPs files esta por parte.'],
  ];
  for (const [k, v] of filas) {
    const row = par.addRow([k, v]);
    row.getCell(1).font = { bold: true };
    row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
  }
  if (result.warnings && result.warnings.length) {
    par.addRow([]);
    const t = par.addRow(['Avisos', '']);
    t.getCell(1).font = { bold: true, color: { argb: ROJO_TEXTO } };
    for (const w of result.warnings) {
      const row = par.addRow(['', w]);
      row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    }
  }

  for (const hoja of libro.worksheets) {
    const idx = columnas.findIndex((c) => c.key === 'shortageDate');
    if (idx >= 0 && hoja.name !== 'Parametros' && hoja.name !== 'Resumen proveedores') {
      hoja.getColumn(idx + 1).numFmt = 'dd-mmm-yyyy';
    }
  }

  const buf = await libro.xlsx.writeBuffer();
  return { buffer: Buffer.from(buf), proveedores };
}

function redondear(n) { return Math.round(n * 1e6) / 1e6; }

/** Nombre de hoja valido para Excel: 31 caracteres, sin : \\ / ? * [ ] y unico. */
function nombreHoja(nombre, usados) {
  let base = String(nombre).replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31) || 'Proveedor';
  let n = base;
  let i = 2;
  while (usados.has(n)) {
    const sufijo = ` (${i++})`;
    n = base.slice(0, 31 - sufijo.length) + sufijo;
  }
  usados.add(n);
  return n;
}

module.exports = { buildReport, consolidar, COLUMNAS, nombreHoja };
