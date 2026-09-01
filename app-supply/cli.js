'use strict';
/**
 * Ejecucion del proceso desde la linea de comandos, para correrlo sin abrir la
 * aplicacion web o para dejarlo programado.
 *
 *   node cli.js --mx "MX Supply Assurance Process.xlsx" --data "data.xlsx"
 *
 * Opciones:
 *   --out <carpeta>      donde dejar los archivos (por omision ./salida)
 *   --hoy <AAAA-MM-DD>   valor de TODAY() para la columna L; por omision hoy
 *   --modo week|rango    week = una sola columna de semana (el paso literal)
 *   --columna <letra>    columna de semana cuando --modo week (por omision W)
 *   --desde <AAAA-MM-DD> inicio del rango cuando --modo rango
 *   --hasta <AAAA-MM-DD> fin del rango cuando --modo rango
 *   --estatus <lista>    estatus separados por coma (por omision SHORTAGE)
 *   --sin-libro          solo analiza y consolida, no reescribe el libro MX
 *   --sin-openpo         omite leer Open_PO (mas rapido; deja esas filas en cero)
 *   --dump-analisis <f>  guarda el analisis en JSON para test/verify.js
 */

const fs = require('fs');
const path = require('path');
const { runProcess } = require('./lib/process');
const { buildReport } = require('./lib/report');
const D = require('./lib/dates');

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const name = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[name] = true;
      else { out[name] = next; i++; }
    } else out._.push(a);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.mx || !args.data) {
    console.error(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^'use strict';\n\/\*\*\n/, '').replace(/^ \* ?/gm, ''));
    process.exit(2);
  }

  const outDir = path.resolve(args.out || 'salida');
  fs.mkdirSync(outDir, { recursive: true });

  const modo = args.modo === 'rango' ? 'range' : (args.modo === 'week' ? 'week' : (args.desde || args.hasta ? 'range' : 'week'));
  const options = {
    today: args.hoy && args.hoy !== true ? args.hoy : undefined,
    statuses: args.estatus && args.estatus !== true ? String(args.estatus).split(',').map((s) => s.trim()) : undefined,
    redMode: modo,
    redColumn: args.columna && args.columna !== true ? String(args.columna) : 'W',
    from: args.desde && args.desde !== true ? args.desde : undefined,
    to: args.hasta && args.hasta !== true ? args.hasta : undefined,
    includeOpenPO: !args['sin-openpo'],
    buildWorkbook: !args['sin-libro'],
  };

  const t0 = Date.now();
  const result = await runProcess({
    mxBuffer: fs.readFileSync(args.mx),
    dataBuffer: fs.readFileSync(args.data),
    options,
    onProgress: (m) => process.stderr.write(`   ${m}...\n`),
  });

  console.log('');
  for (const s of result.steps) console.log(`PASO ${s.n}. ${s.titulo}\n   ${s.detalle}\n`);

  if (result.warnings.length) {
    console.log('AVISOS');
    for (const w of result.warnings) console.log(`   - ${w}`);
    console.log('');
  }

  const sello = D.serialToIso(result.today).replace(/-/g, '');
  const archivos = [];

  if (result.workbookBuffer) {
    const f = path.join(outDir, `MX_Supply_Assurance_Process_${sello}.xlsx`);
    fs.writeFileSync(f, result.workbookBuffer);
    archivos.push(f);
  }

  const { buffer, proveedores } = await buildReport(result);
  const f2 = path.join(outDir, `Consolidado_por_proveedor_${sello}.xlsx`);
  fs.writeFileSync(f2, buffer);
  archivos.push(f2);

  if (args['dump-analisis'] && args['dump-analisis'] !== true) {
    fs.writeFileSync(args['dump-analisis'], JSON.stringify({
      records: result.computed.records,
      filteredIds: result.filtered.map((r) => r.id),
      statuses: result.statuses,
      summary: result.summary,
    }));
  }

  console.log('CONSOLIDADO');
  console.log(`   ${result.summary.renglonesEnRiesgo} renglones, ${result.summary.partesUnicas} numeros de parte unicos, ${proveedores.length} proveedores`);
  for (const p of proveedores) {
    console.log(`   ${String(p.totalPartes).padStart(4)} parte(s)  ${p.nombre}`
      + (p.fechaMasProxima ? `  (el mas proximo ${D.serialToEs(p.fechaMasProxima)})` : ''));
  }

  console.log('\nARCHIVOS');
  for (const f of archivos) console.log('   ' + f);
  console.log(`\nListo en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

main().catch((e) => { console.error('\nError: ' + e.message); process.exit(1); });
