'use strict';
/**
 * Envio de correos por SMTP (Outlook / Microsoft 365).
 *
 * Un correo por proveedor, con el listado consolidado de sus partes faltantes
 * en el cuerpo y su hoja de detalle adjunta en Excel. El envio es explicito:
 * primero se arma la lista y se revisa en pantalla, y solo despues se manda.
 */

const nodemailer = require('nodemailer');
const ExcelJS = require('exceljs');
const D = require('./dates');

const PRESETS = {
  'office365': { host: 'smtp.office365.com', port: 587, secure: false },
  'gmail': { host: 'smtp.gmail.com', port: 587, secure: false },
};

function crearTransporte(cfg) {
  if (!cfg || !cfg.host) throw new Error('Falta configurar el servidor SMTP.');
  return nodemailer.createTransport({
    host: cfg.host,
    port: Number(cfg.port) || 587,
    secure: !!cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    requireTLS: !cfg.secure,
    tls: { minVersion: 'TLSv1.2' },
    connectionTimeout: 20000,
    greetingTimeout: 20000,
  });
}

async function probarConexion(cfg) {
  const t = crearTransporte(cfg);
  try {
    await t.verify();
    return { ok: true, mensaje: `Conexion correcta con ${cfg.host}:${cfg.port || 587} como ${cfg.user || '(sin autenticacion)'}.` };
  } catch (e) {
    return { ok: false, mensaje: explicarError(e) };
  } finally {
    t.close();
  }
}

/** Traduce los errores tipicos de SMTP corporativo a algo accionable. */
function explicarError(e) {
  const m = String(e && e.message || e);
  if (/535|5\.7\.139|SmtpClientAuthentication/i.test(m)) {
    return 'El servidor rechazo las credenciales. En Microsoft 365 suele ser que SMTP AUTH esta deshabilitado'
      + ' para el buzon: pidele a TI que lo habilite, o usa una contrasena de aplicacion. Detalle: ' + m;
  }
  if (/ETIMEDOUT|ECONNREFUSED|ENOTFOUND/i.test(m)) {
    return 'No se pudo alcanzar el servidor. Revisa el nombre del host, el puerto y si la red de la planta'
      + ' permite salir por ese puerto. Detalle: ' + m;
  }
  if (/self.signed|unable to verify|CERT/i.test(m)) {
    return 'El certificado del servidor no pudo validarse. Si es un relay interno, pide a TI el nombre'
      + ' correcto del host. Detalle: ' + m;
  }
  return m;
}

// ---------------------------------------------------------------------------
// Contenido
// ---------------------------------------------------------------------------

function fmt(n) {
  if (n === null || n === undefined || n === '') return '';
  const v = Math.round(Number(n) * 100) / 100;
  return Number.isFinite(v) ? v.toLocaleString('es-MX') : String(n);
}

function asuntoDe(prov, ventana, plantilla) {
  const base = plantilla || 'Material en riesgo de faltante - {proveedor} - {partes} parte(s)';
  return base
    .replace(/\{proveedor\}/g, prov.nombre)
    .replace(/\{partes\}/g, prov.totalPartes)
    .replace(/\{ventana\}/g, ventana);
}

/** Cuerpo en HTML: saludo, tabla de partes y cierre. */
function cuerpoHtml(prov, ctx) {
  const filas = prov.partes.map((g) => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-family:monospace">${esc(g.part)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">${esc(g.description || '')}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:right">${fmt(g.totalInv)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:right;color:#9c0006;font-weight:600">${fmt(g.faltante)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;white-space:nowrap">${g.shortageDate ? D.serialToEs(g.shortageDate) : ''}</td>
      </tr>`).join('');

  return `<!-- cuerpo generado por MX Supply Assurance -->
<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1f2937;line-height:1.5">
  <p>${esc(ctx.saludo || 'Buen dia,')}</p>
  <p>${esc(ctx.intro || 'Les comparto el material que tenemos en riesgo de faltante para la ventana indicada. Agradecemos confirmar fecha de entrega para cada numero de parte.')}</p>
  <p style="margin:16px 0 8px"><strong>Proveedor:</strong> ${esc(prov.nombre)}<br>
     <strong>Ventana evaluada:</strong> ${esc(ctx.ventana)}<br>
     <strong>Partes en riesgo:</strong> ${prov.totalPartes}</p>
  <table style="border-collapse:collapse;font-size:13px;margin-top:8px">
    <thead>
      <tr style="background:#1f3864;color:#fff">
        <th style="padding:8px 10px;text-align:left">Numero de parte</th>
        <th style="padding:8px 10px;text-align:left">Descripcion</th>
        <th style="padding:8px 10px;text-align:right">Inventario total</th>
        <th style="padding:8px 10px;text-align:right">Faltante</th>
        <th style="padding:8px 10px;text-align:left">Fecha del faltante</th>
      </tr>
    </thead>
    <tbody>${filas}
    </tbody>
  </table>
  <p style="margin-top:16px">${esc(ctx.cierre || 'El detalle completo va adjunto en Excel. Quedo al pendiente de su respuesta.')}</p>
  <p style="margin-top:20px">Saludos,<br><strong>${esc(ctx.firma || ctx.remitenteNombre || '')}</strong></p>
  <p style="margin-top:24px;font-size:11px;color:#9ca3af">
    Generado el ${esc(ctx.generado)} a partir del proceso MX Supply Assurance.
    Inventario total = Acuity OH + Supplier OH. Faltante = peor proyeccion negativa dentro de la ventana.
  </p>
</div>`;
}

function cuerpoTexto(prov, ctx) {
  const lineas = prov.partes.map((g) => `  ${g.part}  |  ${g.description || ''}  |  inventario ${fmt(g.totalInv)}  |  faltante ${fmt(g.faltante)}  |  ${g.shortageDate ? D.serialToEs(g.shortageDate) : ''}`);
  return [
    ctx.saludo || 'Buen dia,', '',
    ctx.intro || 'Les comparto el material que tenemos en riesgo de faltante para la ventana indicada. Agradecemos confirmar fecha de entrega para cada numero de parte.', '',
    `Proveedor: ${prov.nombre}`,
    `Ventana evaluada: ${ctx.ventana}`,
    `Partes en riesgo: ${prov.totalPartes}`, '',
    'Numero de parte | Descripcion | Inventario total | Faltante | Fecha del faltante',
    ...lineas, '',
    ctx.cierre || 'El detalle completo va adjunto en Excel. Quedo al pendiente de su respuesta.', '',
    'Saludos,', ctx.firma || ctx.remitenteNombre || '',
  ].join('\n');
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Adjunto: una hoja con el detalle del proveedor. */
async function adjuntoDe(prov, ctx) {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Faltantes');
  hoja.columns = [
    { header: 'Numero de parte', key: 'part', width: 26 },
    { header: 'Descripcion', key: 'desc', width: 40 },
    { header: 'ORG', key: 'org', width: 12 },
    { header: 'Acuity OH', key: 'oh', width: 12 },
    { header: 'Supplier OH', key: 'soh', width: 12 },
    { header: 'Inventario total', key: 'tot', width: 16 },
    { header: 'Faltante en la ventana', key: 'falta', width: 20 },
    { header: 'Fecha del faltante', key: 'fecha', width: 18 },
    { header: 'Lead time (dias)', key: 'lt', width: 15 },
  ];
  hoja.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  hoja.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };

  for (const g of prov.partes) {
    const row = hoja.addRow({
      part: g.part,
      desc: g.description,
      org: [...new Set(g.orgs.map(String))].join(', '),
      oh: g.acuityOH,
      soh: g.supplierOH,
      tot: g.totalInv,
      falta: g.faltante,
      fecha: g.shortageDate ? D.serialToDate(g.shortageDate) : null,
      lt: g.coldLT,
    });
    row.getCell('falta').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
    row.getCell('falta').font = { color: { argb: 'FF9C0006' }, bold: true };
  }
  hoja.getColumn('fecha').numFmt = 'dd-mmm-yyyy';
  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 9 } };

  const nombre = `Faltantes_${String(prov.nombre).replace(/[^A-Za-z0-9]+/g, '_').slice(0, 40)}_${ctx.fechaArchivo}.xlsx`;
  return { filename: nombre, content: Buffer.from(await libro.xlsx.writeBuffer()) };
}

/**
 * Arma un correo por proveedor. No envia nada: sirve para la vista previa y
 * para generar los .eml cuando no se quiere enviar desde la aplicacion.
 */
async function armarCorreos(proveedores, contactos, ctx) {
  const salida = [];
  for (const prov of proveedores) {
    const para = contactos.get(prov.nombre);
    salida.push({
      proveedor: prov.nombre,
      para,
      sinCorreo: para.length === 0,
      asunto: asuntoDe(prov, ctx.ventana, ctx.asunto),
      html: cuerpoHtml(prov, ctx),
      texto: cuerpoTexto(prov, ctx),
      partes: prov.totalPartes,
      faltante: prov.totalFaltante,
      adjunto: ctx.adjuntar === false ? null : await adjuntoDe(prov, ctx),
      _prov: prov,
    });
  }
  return salida;
}

/**
 * Envia los correos ya armados que tengan destinatario.
 * Devuelve un renglon por proveedor con lo que paso, sin detener el lote
 * cuando uno falla.
 */
async function enviar(correos, cfg, ctx, onProgress) {
  const report = onProgress || function () {};
  const transporte = crearTransporte(cfg);
  const resultados = [];

  try {
    for (let i = 0; i < correos.length; i++) {
      const c = correos[i];
      if (c.sinCorreo) {
        resultados.push({ proveedor: c.proveedor, ok: false, omitido: true, mensaje: 'Sin correo registrado en el catalogo.' });
        continue;
      }
      report(`Enviando ${i + 1} de ${correos.length}: ${c.proveedor}`);
      try {
        const info = await transporte.sendMail({
          from: cfg.from || cfg.user,
          to: c.para.join(', '),
          cc: ctx.cc && ctx.cc.length ? ctx.cc.join(', ') : undefined,
          replyTo: cfg.replyTo || undefined,
          subject: c.asunto,
          text: c.texto,
          html: c.html,
          attachments: c.adjunto ? [c.adjunto] : [],
        });
        resultados.push({ proveedor: c.proveedor, ok: true, para: c.para, messageId: info.messageId });
      } catch (e) {
        resultados.push({ proveedor: c.proveedor, ok: false, para: c.para, mensaje: explicarError(e) });
      }
    }
  } finally {
    transporte.close();
  }
  return resultados;
}

/** Borrador .eml para abrir en Outlook cuando no se envia desde la aplicacion. */
function comoEml(correo, cfg, ctx) {
  const limite = '----=_MXSupply_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const remitente = cfg.from || cfg.user || '';
  const cabeceras = [
    remitente ? `From: ${remitente}` : null,   // sin remitente, Outlook pone el buzon activo
    `To: ${correo.para.join(', ')}`,
    ctx.cc && ctx.cc.length ? `Cc: ${ctx.cc.join(', ')}` : null,
    `Subject: ${cabeceraCodificada(correo.asunto)}`,
    `Date: ${new Date().toUTCString()}`,
    'X-Unsent: 1',                              // hace que Outlook lo abra como borrador
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${limite}"`,
  ].filter(Boolean).join('\r\n') + '\r\n\r\n';   // la linea en blanco cierra las cabeceras

  const partes = [
    `--${limite}`,
    'Content-Type: text/html; charset="utf-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(correo.html, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n'),
    '',
  ];

  if (correo.adjunto) {
    partes.push(
      `--${limite}`,
      'Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      `Content-Disposition: attachment; filename="${correo.adjunto.filename}"`,
      'Content-Transfer-Encoding: base64',
      '',
      correo.adjunto.content.toString('base64').replace(/(.{76})/g, '$1\r\n'),
      ''
    );
  }
  partes.push(`--${limite}--`, '');
  return cabeceras + partes.join('\r\n');
}

/** Codifica un asunto con acentos segun RFC 2047 para que no se vea roto. */
function cabeceraCodificada(texto) {
  const s = String(texto);
  if (/^[\x20-\x7E]*$/.test(s)) return s;
  return '=?UTF-8?B?' + Buffer.from(s, 'utf8').toString('base64') + '?=';
}

module.exports = { crearTransporte, probarConexion, armarCorreos, enviar, comoEml, PRESETS, explicarError };
