'use strict';
/**
 * Prueba de paridad entre el motor de Apps Script y el de la aplicacion Node.
 *
 * Carga los archivos .gs en un contexto de Node con las APIs de Google
 * simuladas, les da exactamente los mismos datos que recibe la aplicacion Node
 * y compara registro por registro. Si el port se desvia aunque sea en un
 * decimal, esta prueba lo dice.
 *
 *   node pruebas/paridad.js <MX.xlsx> <data.xlsx> [AAAA-MM-DD]
 *
 * No sustituye probar en Google, pero sirve para lo unico que realmente puede
 * divergir sin que se note: la aritmetica.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const RAIZ_NODE = path.join(__dirname, '..', '..', 'app-supply');
const { Workbook } = require(path.join(RAIZ_NODE, 'lib', 'workbook'));
const E = require(path.join(RAIZ_NODE, 'lib', 'engine'));

// ---------------------------------------------------------------------------
// Contexto que imita lo poco que el motor necesita de Apps Script
// ---------------------------------------------------------------------------

function cargarGs(archivos) {
  const contexto = {
    console,
    Session: {
      getScriptTimeZone: () => 'America/Mexico_City',
      getActiveUser: () => ({ getEmail: () => 'prueba@local' }),
    },
    Utilities: {
      formatDate: (d, tz, formato) => {
        const p = (n) => String(n).padStart(2, '0');
        if (formato === 'yyyy-MM-dd') return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
        return d.toISOString();
      },
    },
  };
  vm.createContext(contexto);
  for (const nombre of archivos) {
    const ruta = path.join(__dirname, '..', nombre);
    const fuente = fs.readFileSync(ruta, 'utf8');
    try {
      new vm.Script(fuente, { filename: nombre });   // revisa la sintaxis
    } catch (e) {
      throw new Error(`${nombre} no compila: ${e.message}`);
    }
    vm.runInContext(fuente, contexto, { filename: nombre });
  }
  return contexto;
}

/** Comprueba que todos los .gs compilen, incluso los que no se ejecutan aqui. */
function revisarSintaxis() {
  const archivos = fs.readdirSync(path.join(__dirname, '..'))
    .filter((f) => f.endsWith('.gs')).sort();
  const malos = [];
  for (const f of archivos) {
    const fuente = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    try { new vm.Script(fuente, { filename: f }); }
    catch (e) { malos.push(`${f}: ${e.message}`); }
  }
  console.log(`Sintaxis: ${archivos.length - malos.length} de ${archivos.length} archivos .gs compilan`);
  for (const m of malos) console.log('  FALLA ' + m);
  return malos.length === 0;
}

// ---------------------------------------------------------------------------

async function main() {
  const [rutaMx, rutaData, fecha] = process.argv.slice(2);
  if (!rutaMx || !rutaData) {
    console.error('Uso: node pruebas/paridad.js <MX.xlsx> <data.xlsx> [AAAA-MM-DD]');
    process.exit(2);
  }

  if (!revisarSintaxis()) process.exit(1);

  const ctx = cargarGs(['Config.gs', 'Fechas.gs', 'Motor.gs']);
  const MOTOR = ctx.MOTOR;
  const FECHAS = ctx.FECHAS;

  // --- lo que calcula la aplicacion Node -----------------------------------
  const dataWb = await Workbook.open(fs.readFileSync(rutaData));
  const lecturaNode = await E.readDataParts(dataWb, { buyerMap: { LZR22: 'Luis Rodriguez' } });
  const mx = await Workbook.open(fs.readFileSync(rutaMx));
  const fuentesNode = await E.readSources(mx, () => {});
  const hoy = fecha
    ? require(path.join(RAIZ_NODE, 'lib', 'dates')).isoToSerial(fecha)
    : require(path.join(RAIZ_NODE, 'lib', 'dates')).todaySerial();
  const nodeCalc = E.compute(lecturaNode.parts, fuentesNode, { todaySerial: hoy });

  // --- lo que calcula el motor de Apps Script ------------------------------
  // Se le entregan los mismos datos, con la forma que produciria Fuentes.gs.
  const filasData = [];
  {
    const xml = await dataWb.sheetXml(dataWb.sheets[0].name);
    require(path.join(RAIZ_NODE, 'lib', 'xlsx-read'))
      .forEachRow(xml, dataWb.shared, { maxCol: 9 }, (r, v) => {
        if (r >= 2) filasData[r - 2] = normalizar(v, 9);
      });
  }
  const lecturaGs = MOTOR.leerPartes(rellenar(filasData, 9), { LZR22: 'Luis Rodriguez' });

  const fuentesGs = {
    onHand: {
      exacto: aObjeto(fuentesNode.onHand.exact),
      recortado: aObjeto(fuentesNode.onHand.trimmed),
    },
    gaps: {
      exacto: gapsAObjeto(fuentesNode.gaps.exact),
      recortado: gapsAObjeto(fuentesNode.gaps.trimmed),
      proveedorPorParte: aObjeto(fuentesNode.gaps.supplierByPart),
    },
    plan: {
      exacto: aObjeto(fuentesNode.supplyPlan.exact),
      recortado: aObjeto(fuentesNode.supplyPlan.trimmed),
    },
    openPO: {
      promesa: aObjeto(fuentesNode.openPO.promise),
      necesidad: aObjeto(fuentesNode.openPO.need),
    },
  };
  const encabezado = {
    semanas: fuentesNode.header.weekSerials,
    meses: fuentesNode.header.monthSerials,
    numerosSemana: fuentesNode.header.weekNumbers,
    anios: fuentesNode.header.weekYears,
    cubetas: fuentesNode.header.buckets,
  };
  const gsCalc = MOTOR.calcular(lecturaGs.partes, fuentesGs, encabezado, hoy);

  // --- comparacion ---------------------------------------------------------
  console.log(`\nPartes: Node ${nodeCalc.records.length}, Apps Script ${gsCalc.registros.length}`);
  assert.strictEqual(gsCalc.registros.length, nodeCalc.records.length,
    'las dos versiones no leyeron el mismo numero de partes');

  let iguales = 0;
  const difs = [];
  for (let i = 0; i < nodeCalc.records.length; i++) {
    const n = nodeCalc.records[i];
    const g = gsCalc.registros[i];
    const problemas = [];

    comparar(problemas, 'concat', n.concat, g.concat);
    comparar(problemas, 'part', n.part, g.part);
    comparar(problemas, 'supplier', n.supplier, g.supplier);
    comparar(problemas, 'buyer', n.buyer, g.buyer);
    comparar(problemas, 'acuityOH', n.acuityOH, g.acuityOH);
    comparar(problemas, 'supplierOH', n.supplierOH, g.supplierOH);
    comparar(problemas, 'totalInv', n.totalInv, g.totalInv);
    comparar(problemas, 'coldLT', n.coldLT, g.coldLT);
    comparar(problemas, 'estatus', n.status, g.estatus);
    comparar(problemas, 'fechaFaltante', n.shortageDate, g.fechaFaltante);
    for (let w = 0; w < 13; w++) {
      comparar(problemas, `proyeccion[${w}]`, n.projection[w], g.proyeccion[w]);
      comparar(problemas, `arribos[${w}]`, n.arrivals[w], g.arribos[w]);
      comparar(problemas, `demanda[${w}]`, n.demand[w], g.demanda[w]);
      comparar(problemas, `poPromesa[${w}]`, n.poPromise[w], g.poPromesa[w]);
      comparar(problemas, `poNecesidad[${w}]`, n.poNeed[w], g.poNecesidad[w]);
    }
    for (let m = 0; m < 3; m++) comparar(problemas, `meses[${m}]`, n.months[m], g.meses[m]);

    if (problemas.length === 0) iguales++;
    else if (difs.length < 8) difs.push({ id: n.id, concat: n.concat, problemas });
  }

  console.log(`Registros identicos: ${iguales} de ${nodeCalc.records.length}`);
  for (const d of difs) {
    console.log(`  DIFERENCIA en ${d.concat} (id ${d.id}):`);
    for (const p of d.problemas.slice(0, 6)) console.log('    ' + p);
  }

  // El filtro y la ventana tambien deben coincidir.
  const ventana = MOTOR.resolverVentana(encabezado.semanas,
    { modo: 'semana', columna: 'W' });
  const filtradosGs = MOTOR.filtrar(gsCalc.registros, ['SHORTAGE'], ventana.indices);
  const filtradosNode = E.applyFilter(nodeCalc, { statuses: ['SHORTAGE'], redWeeks: [7] });
  console.log(`\nFiltro L=SHORTAGE + rojo en W: Node ${filtradosNode.length}, Apps Script ${filtradosGs.length}`);
  assert.strictEqual(filtradosGs.length, filtradosNode.length, 'el filtro no coincide');

  const D = require(path.join(RAIZ_NODE, 'lib', 'dates'));
  const desde = hoy;
  const hasta = D.endOfMonthSerial(D.startOfNextMonthSerial(hoy));
  const ventana2 = MOTOR.resolverVentana(encabezado.semanas, { modo: 'rango', desde, hasta });
  const rangoGs = MOTOR.filtrar(gsCalc.registros, ['SHORTAGE'], ventana2.indices);
  const rangoNode = E.applyFilter(nodeCalc, {
    statuses: ['SHORTAGE'], redWeeks: E.weeksInRange(encabezado.semanas, desde, hasta),
  });
  console.log(`Filtro por rango ${FECHAS.aIso(desde)} a ${FECHAS.aIso(hasta)}: `
    + `Node ${rangoNode.length}, Apps Script ${rangoGs.length}`);
  assert.strictEqual(rangoGs.length, rangoNode.length, 'el filtro por rango no coincide');
  assert.strictEqual(ventana2.columnas.join(','),
    E.weeksInRange(encabezado.semanas, desde, hasta)
      .map((w) => require(path.join(RAIZ_NODE, 'lib', 'formula')).numToCol(16 + w)).join(','),
    'las columnas de la ventana no coinciden');

  if (iguales !== nodeCalc.records.length) {
    console.log('\nLa paridad FALLO.');
    process.exit(1);
  }
  console.log('\nParidad correcta: el motor de Apps Script calcula lo mismo que el de Node.');
}

function comparar(problemas, campo, esperado, obtenido) {
  const a = normalizarValor(esperado);
  const b = normalizarValor(obtenido);
  if (typeof a === 'number' && typeof b === 'number') {
    if (Math.abs(a - b) > 1e-9) problemas.push(`${campo}: Node ${a}, Apps Script ${b}`);
    return;
  }
  if (a !== b) problemas.push(`${campo}: Node ${JSON.stringify(a)}, Apps Script ${JSON.stringify(b)}`);
}

function normalizarValor(v) {
  if (v === undefined || v === null) return null;
  return v;
}

/** Convierte un Map de Node en el objeto plano que usa la version de Apps Script. */
function aObjeto(mapa) {
  const o = {};
  for (const [k, v] of mapa) o[k] = v;
  return o;
}

function gapsAObjeto(mapa) {
  const o = {};
  for (const [k, v] of mapa) o[k] = { oh: v.oh, arr: v.arrivals };
  return o;
}

/** Las filas que entrega el lector de xlsx vienen ralas; Sheets las da completas. */
function normalizar(fila, ancho) {
  const f = [];
  for (let i = 0; i < ancho; i++) f.push(fila[i] === undefined ? '' : fila[i]);
  return f;
}

function rellenar(filas, ancho) {
  const salida = [];
  for (let i = 0; i < filas.length; i++) {
    salida.push(filas[i] || normalizar([], ancho));
  }
  return salida;
}

main().catch((e) => { console.error(e); process.exit(1); });
