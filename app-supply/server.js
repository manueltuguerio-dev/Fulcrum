'use strict';
/**
 * Aplicacion web local del proceso MX Supply Assurance.
 *
 * Corre en la computadora de quien la usa y escucha solo en 127.0.0.1: los
 * archivos pesan decenas de MB y traen inventario y demanda, asi que no salen
 * del equipo salvo por los correos que se manden a proposito.
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const JSZip = require('jszip');

const { runProcess } = require('./lib/process');
const { buildReport, consolidar } = require('./lib/report');
const { Contactos, importarCatalogo } = require('./lib/contacts');
const mailer = require('./lib/mailer');
const D = require('./lib/dates');

const PUERTO = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || '127.0.0.1';
const DATOS = path.join(__dirname, 'datos');
const ARCHIVO_CONTACTOS = path.join(DATOS, 'contactos.json');
const ARCHIVO_SMTP = path.join(DATOS, 'smtp.json');
const LIMITE_ARCHIVO = 200 * 1024 * 1024;   // el libro real ronda los 26 MB

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const subida = multer({ storage: multer.memoryStorage(), limits: { fileSize: LIMITE_ARCHIVO } });

// Las corridas viven en memoria: cada una carga un libro de ~25 MB, asi que se
// conservan solo las tres mas recientes.
const corridas = new Map();
const MAX_CORRIDAS = 3;

function guardarCorrida(id, datos) {
  corridas.set(id, datos);
  while (corridas.size > MAX_CORRIDAS) corridas.delete(corridas.keys().next().value);
}

function corrida(id) {
  const c = corridas.get(id);
  if (!c) {
    const e = new Error('Esa corrida ya no esta en memoria. Vuelve a procesar los archivos.');
    e.status = 404;
    throw e;
  }
  return c;
}

let contactos = new Contactos();
Contactos.load(ARCHIVO_CONTACTOS).then((c) => { contactos = c; }).catch((e) => {
  console.error('Aviso: ' + e.message);
});

function leerSmtp() {
  try { return JSON.parse(fs.readFileSync(ARCHIVO_SMTP, 'utf8')); }
  catch (e) { return { host: 'smtp.office365.com', port: 587, secure: false, user: '', from: '', guardarPass: false }; }
}
function guardarSmtp(cfg) {
  fs.mkdirSync(DATOS, { recursive: true });
  fs.writeFileSync(ARCHIVO_SMTP, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------------------------------------------------------------------------
// Proceso
// ---------------------------------------------------------------------------

app.post('/api/procesar', subida.fields([
  { name: 'mx', maxCount: 1 }, { name: 'data', maxCount: 1 },
]), asyncH(async (req, res) => {
  const mx = req.files && req.files.mx && req.files.mx[0];
  const data = req.files && req.files.data && req.files.data[0];
  if (!mx) throw badRequest('Falta el archivo MX Supply Assurance Process.');
  if (!data) throw badRequest('Falta el archivo Data.');

  const opciones = JSON.parse(req.body.opciones || '{}');
  const buyerMap = {};
  for (const r of (opciones.sustituciones || [{ de: 'LZR22', a: 'Luis Rodriguez' }])) {
    if (r && r.de) buyerMap[String(r.de).trim()] = String(r.a == null ? '' : r.a).trim();
  }

  const bitacora = [];
  const result = await runProcess({
    mxBuffer: mx.buffer,
    dataBuffer: data.buffer,
    options: {
      today: opciones.hoy || undefined,
      buyerMap,
      statuses: opciones.estatus,
      redMode: opciones.modo === 'rango' ? 'range' : 'week',
      redColumn: opciones.columna || 'W',
      from: opciones.desde,
      to: opciones.hasta,
      includeOpenPO: opciones.incluirOpenPO !== false,
    },
    onProgress: (m) => bitacora.push(m),
  });

  const { buffer: reporte, proveedores } = await buildReport({
    ...result,
    contactos: contactos.paraProveedores(nombresProveedor(result)),
  });

  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  guardarCorrida(id, {
    id,
    creada: new Date(),
    nombreMx: mx.originalname,
    libro: result.workbookBuffer,
    reporte,
    proveedores,
    result,
  });

  res.json({
    id,
    bitacora,
    pasos: result.steps,
    avisos: result.warnings,
    resumen: result.summary,
    fuentes: result.sourceCounts,
    proveedores: proveedores.map((p) => ({
      nombre: p.nombre,
      partes: p.totalPartes,
      renglones: p.totalRenglones,
      faltante: Math.round(p.totalFaltante * 100) / 100,
      fecha: p.fechaMasProxima ? D.serialToIso(p.fechaMasProxima) : null,
      correos: contactos.get(p.nombre),
    })),
    sinCorreo: contactos.faltantes(proveedores.map((p) => p.nombre)),
    archivos: {
      libro: `MX_Supply_Assurance_Process_${D.serialToIso(result.today).replace(/-/g, '')}.xlsx`,
      consolidado: `Consolidado_por_proveedor_${D.serialToIso(result.today).replace(/-/g, '')}.xlsx`,
    },
  });
}));

function nombresProveedor(result) {
  return [...new Set(result.filtered.map((r) => String(r.supplier)))];
}

app.get('/api/descargar/:id/:que', (req, res) => {
  const c = corrida(req.params.id);
  const sello = D.serialToIso(c.result.today).replace(/-/g, '');
  const mapa = {
    libro: [c.libro, `MX_Supply_Assurance_Process_${sello}.xlsx`],
    consolidado: [c.reporte, `Consolidado_por_proveedor_${sello}.xlsx`],
  };
  const par = mapa[req.params.que];
  if (!par || !par[0]) return res.status(404).json({ error: 'Ese archivo no esta disponible en esta corrida.' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${par[1]}"`);
  res.send(par[0]);
});

// ---------------------------------------------------------------------------
// Contactos
// ---------------------------------------------------------------------------

app.get('/api/contactos', (req, res) => {
  res.json({ contactos: contactos.toJSON(), total: contactos.total });
});

app.post('/api/contactos', asyncH(async (req, res) => {
  const { proveedor, correos, eliminar } = req.body || {};
  if (!proveedor) throw badRequest('Falta el nombre del proveedor.');
  if (eliminar) contactos.remove(proveedor);
  else {
    const r = contactos.set(proveedor, correos);
    if (!r.ok) throw badRequest(r.error);
    if (r.invalidos.length) {
      contactos.save(ARCHIVO_CONTACTOS);
      return res.json({ ok: true, aviso: `No son correos validos y se descartaron: ${r.invalidos.join(', ')}`, contactos: contactos.toJSON() });
    }
  }
  contactos.save(ARCHIVO_CONTACTOS);
  res.json({ ok: true, contactos: contactos.toJSON() });
}));

app.post('/api/contactos/importar', subida.single('archivo'), asyncH(async (req, res) => {
  if (!req.file) throw badRequest('Falta el archivo de contactos.');
  const { contactos: nuevos, importados, invalidos, columnas } = await importarCatalogo(req.file.buffer, req.file.originalname);
  const reemplazar = String(req.body.reemplazar) === 'true';
  if (reemplazar) contactos = nuevos;
  else for (const [nombre, correos] of Object.entries(nuevos.toJSON())) contactos.set(nombre, correos);
  contactos.save(ARCHIVO_CONTACTOS);
  res.json({ ok: true, importados, invalidos, columnas, total: contactos.total, contactos: contactos.toJSON() });
}));

// ---------------------------------------------------------------------------
// Correo
// ---------------------------------------------------------------------------

app.get('/api/smtp', (req, res) => {
  const cfg = leerSmtp();
  res.json({ ...cfg, pass: undefined, tienePass: !!cfg.pass });
});

app.post('/api/smtp', asyncH(async (req, res) => {
  const anterior = leerSmtp();
  const cfg = { ...anterior, ...req.body };
  if (!cfg.guardarPass) delete cfg.pass;
  else if (!req.body.pass && anterior.pass) cfg.pass = anterior.pass;
  guardarSmtp(cfg);
  res.json({ ok: true, guardado: ARCHIVO_SMTP, tienePass: !!cfg.pass });
}));

app.post('/api/smtp/probar', asyncH(async (req, res) => {
  const cfg = combinarSmtp(req.body);
  res.json(await mailer.probarConexion(cfg));
}));

function combinarSmtp(entrada) {
  const guardado = leerSmtp();
  const cfg = { ...guardado, ...(entrada || {}) };
  if (!cfg.pass) cfg.pass = guardado.pass;
  if (!cfg.from) cfg.from = cfg.user;
  return cfg;
}

function contextoCorreo(c, cuerpo) {
  const { result } = c;
  return {
    ventana: `${D.serialToEs(result.filterCfg.from)} a ${D.serialToEs(result.filterCfg.to)}`,
    generado: new Date().toLocaleString('es-MX'),
    fechaArchivo: D.serialToIso(result.today).replace(/-/g, ''),
    saludo: cuerpo.saludo,
    intro: cuerpo.intro,
    cierre: cuerpo.cierre,
    firma: cuerpo.firma,
    asunto: cuerpo.asunto,
    cc: (cuerpo.cc || '').split(/[;,\s]+/).filter(Boolean),
    adjuntar: cuerpo.adjuntar !== false,
  };
}

function seleccionar(c, seleccion) {
  if (!seleccion || !seleccion.length) return c.proveedores;
  const set = new Set(seleccion);
  return c.proveedores.filter((p) => set.has(p.nombre));
}

app.post('/api/correos/preview', asyncH(async (req, res) => {
  const c = corrida(req.body.id);
  const ctx = contextoCorreo(c, req.body.cuerpo || {});
  const correos = await mailer.armarCorreos(seleccionar(c, req.body.proveedores), contactos, ctx);
  res.json({
    total: correos.length,
    conCorreo: correos.filter((x) => !x.sinCorreo).length,
    sinCorreo: correos.filter((x) => x.sinCorreo).map((x) => x.proveedor),
    correos: correos.map((x) => ({
      proveedor: x.proveedor, para: x.para, sinCorreo: x.sinCorreo,
      asunto: x.asunto, html: x.html, partes: x.partes,
      adjunto: x.adjunto ? x.adjunto.filename : null,
    })),
  });
}));

app.post('/api/correos/enviar', asyncH(async (req, res) => {
  const c = corrida(req.body.id);
  const cfg = combinarSmtp(req.body.smtp);
  if (!cfg.pass && cfg.user) throw badRequest('Falta la contrasena del buzon. Escribela en la pantalla de correo antes de enviar.');
  const ctx = contextoCorreo(c, req.body.cuerpo || {});
  const correos = await mailer.armarCorreos(seleccionar(c, req.body.proveedores), contactos, ctx);
  const pendientes = correos.filter((x) => !x.sinCorreo);
  if (!pendientes.length) throw badRequest('Ningun proveedor seleccionado tiene correo registrado.');
  const resultados = await mailer.enviar(correos, cfg, ctx);
  res.json({
    enviados: resultados.filter((r) => r.ok).length,
    fallidos: resultados.filter((r) => !r.ok && !r.omitido).length,
    omitidos: resultados.filter((r) => r.omitido).length,
    resultados,
  });
}));

app.post('/api/correos/borradores', asyncH(async (req, res) => {
  const c = corrida(req.body.id);
  const cfg = combinarSmtp(req.body.smtp);
  const ctx = contextoCorreo(c, req.body.cuerpo || {});
  const correos = await mailer.armarCorreos(seleccionar(c, req.body.proveedores), contactos, ctx);
  const zip = new JSZip();
  let n = 0;
  for (const correo of correos) {
    if (correo.sinCorreo) continue;
    const nombre = `${String(correo.proveedor).replace(/[^A-Za-z0-9]+/g, '_').slice(0, 50)}.eml`;
    zip.file(nombre, mailer.comoEml(correo, cfg, ctx));
    n++;
  }
  if (!n) throw badRequest('Ningun proveedor seleccionado tiene correo registrado.');
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="borradores_${ctx.fechaArchivo}.zip"`);
  res.send(buf);
}));

// ---------------------------------------------------------------------------

function badRequest(mensaje) {
  const e = new Error(mensaje);
  e.status = 400;
  return e;
}

app.use((err, req, res, next) => {
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `El archivo supera el limite de ${Math.round(LIMITE_ARCHIVO / 1024 / 1024)} MB.` });
  }
  if (status === 500) console.error(err);
  res.status(status).json({ error: err.message || 'Error inesperado.' });
});

app.listen(PUERTO, HOST, () => {
  console.log('');
  console.log('  MX Supply Assurance');
  console.log(`  Abre en el navegador:  http://${HOST}:${PUERTO}`);
  console.log(`  Contactos y SMTP en:   ${DATOS}`);
  console.log(`  Memoria disponible:    ${Math.round(os.totalmem() / 1e9)} GB`);
  console.log('');
  console.log('  Para detener: Ctrl+C');
  console.log('');
});
