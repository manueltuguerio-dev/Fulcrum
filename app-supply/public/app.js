'use strict';
/* Interfaz de la aplicacion MX Supply Assurance. Sin dependencias externas:
   la computadora donde corre esto puede no tener salida a internet. */

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

let corridaId = null;
let proveedores = [];
let contactos = {};

// --- pestanas ---------------------------------------------------------------
$$('nav button').forEach((b) => b.addEventListener('click', () => mostrar(b.dataset.tab)));

function mostrar(tab) {
  $$('nav button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  $$('main section').forEach((s) => { s.hidden = s.id !== 'tab-' + tab; });
}

// --- utilidades -------------------------------------------------------------
function aviso(destino, clase, texto) {
  $(destino).innerHTML = `<div class="aviso ${clase}">${escapar(texto)}</div>`;
}
function limpiar(destino) { $(destino).innerHTML = ''; }

function escapar(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function nf(n) {
  if (n === null || n === undefined || n === '') return '';
  return Number(n).toLocaleString('es-MX', { maximumFractionDigits: 2 });
}
function fechaEs(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.split('-');
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${d}-${meses[+m - 1]}-${a}`;
}
function hoyIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function finMesSiguiente(iso) {
  const [a, m] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(a, m + 1, 0));
  return d.toISOString().slice(0, 10);
}

async function pedir(url, opciones) {
  const r = await fetch(url, opciones);
  const texto = await r.text();
  let cuerpo;
  try { cuerpo = JSON.parse(texto); } catch (e) { cuerpo = { error: texto.slice(0, 400) }; }
  if (!r.ok) throw new Error(cuerpo.error || `Error ${r.status}`);
  return cuerpo;
}

// --- sustituciones de comprador --------------------------------------------
function filaSustitucion(de = '', a = '') {
  const div = document.createElement('div');
  div.className = 'rejilla';
  div.style.marginBottom = '10px';
  div.innerHTML = `
    <div><label>Valor en DEFAULT_BUYER</label><input type="text" class="sDe" value="${escapar(de)}"></div>
    <div><label>Se escribe como</label><input type="text" class="sA" value="${escapar(a)}"></div>
    <div style="display:flex;align-items:flex-end"><button type="button" class="btn claro chico quitar">Quitar</button></div>`;
  div.querySelector('.quitar').addEventListener('click', () => div.remove());
  return div;
}
$('#sust').appendChild(filaSustitucion('LZR22', 'Luis Rodriguez'));
$('#addSust').addEventListener('click', () => $('#sust').appendChild(filaSustitucion()));

// --- ventana ----------------------------------------------------------------
const COLUMNAS_SEMANA = ['P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'AA', 'AB'];
$('#columna').innerHTML = COLUMNAS_SEMANA
  .map((c) => `<option value="${c}"${c === 'W' ? ' selected' : ''}>${c}</option>`).join('');

$$('input[name=modo]').forEach((r) => r.addEventListener('change', () => {
  const rango = $('input[name=modo]:checked').value === 'rango';
  $('#camposRango').hidden = !rango;
  $('#camposSemana').hidden = rango;
}));

$('#hoy').value = hoyIso();
$('#desde').value = hoyIso();
$('#hasta').value = finMesSiguiente(hoyIso());
$('#hoy').addEventListener('change', () => {
  if ($('#hoy').value) {
    $('#desde').value = $('#hoy').value;
    $('#hasta').value = finMesSiguiente($('#hoy').value);
  }
});

// --- procesar ---------------------------------------------------------------
$('#procesar').addEventListener('click', async () => {
  limpiar('#errProceso');
  const mx = $('#fMx').files[0];
  const data = $('#fData').files[0];
  if (!mx || !data) return aviso('#errProceso', 'err', 'Selecciona los dos archivos antes de procesar.');

  const modo = $('input[name=modo]:checked').value;
  const opciones = {
    hoy: $('#hoy').value || undefined,
    modo,
    columna: $('#columna').value,
    desde: modo === 'rango' ? $('#desde').value : undefined,
    hasta: modo === 'rango' ? $('#hasta').value : undefined,
    estatus: [...$('#estatus').selectedOptions].map((o) => o.value),
    incluirOpenPO: $('#incluirOpenPO').checked,
    sustituciones: $$('#sust .rejilla').map((f) => ({
      de: f.querySelector('.sDe').value.trim(),
      a: f.querySelector('.sA').value.trim(),
    })).filter((s) => s.de),
  };

  const cuerpo = new FormData();
  cuerpo.append('mx', mx);
  cuerpo.append('data', data);
  cuerpo.append('opciones', JSON.stringify(opciones));

  const boton = $('#procesar');
  boton.disabled = true;
  boton.innerHTML = '<span class="cargando"></span>Procesando';
  $('#estado').textContent = `Leyendo ${(mx.size / 1048576).toFixed(1)} MB. Puede tardar unos segundos.`;

  try {
    const r = await pedir('/api/procesar', { method: 'POST', body: cuerpo });
    corridaId = r.id;
    proveedores = r.proveedores;
    pintarResultado(r);
    pintarEnvio();
    mostrar('resultado');
    $('#estado').textContent = 'Listo.';
  } catch (e) {
    aviso('#errProceso', 'err', e.message);
    $('#estado').textContent = '';
  } finally {
    boton.disabled = false;
    boton.textContent = 'Procesar';
  }
});

function pintarResultado(r) {
  $('#sinResultado').hidden = true;
  $('#conResultado').hidden = false;

  const s = r.resumen;
  $('#cifras').innerHTML = [
    ['Partes analizadas', s.totalPartes, ''],
    ['Renglones en riesgo', s.renglonesEnRiesgo, 'alerta'],
    ['Numeros de parte unicos', s.partesUnicas, 'alerta'],
    ['Proveedores', s.proveedores, ''],
    ['SHORTAGE en total', s.porEstatus.SHORTAGE || 0, ''],
    ['OK PER LT', s.porEstatus['OK PER LT'] || 0, ''],
  ].map(([t, v, c]) => `<div class="cifra ${c}"><small>${t}</small><b>${nf(v)}</b></div>`).join('');

  const avisos = [`<div class="aviso info">Ventana evaluada: <b>${escapar(s.rango.descripcion)}</b>.
    Estatus conservado: <b>${escapar(s.estatusFiltrado.join(', '))}</b>. TODAY usado: <b>${fechaEs(s.hoy)}</b>.</div>`];
  for (const a of r.avisos) avisos.push(`<div class="aviso adv">${escapar(a)}</div>`);
  if (r.sinCorreo.length) {
    avisos.push(`<div class="aviso adv"><b>${r.sinCorreo.length} proveedor(es) sin correo registrado:</b>
      ${escapar(r.sinCorreo.join(', '))}. Cargalos en la pestana Contactos para poderles enviar.</div>`);
  }
  $('#avisos').innerHTML = avisos.join('');

  $('#pasos').innerHTML = r.pasos
    .map((p) => `<li><b>${escapar(p.titulo)}</b>${escapar(p.detalle)}</li>`).join('');

  $('#tblProv').innerHTML = r.proveedores.map((p) => `
    <tr>
      <td><b>${escapar(p.nombre)}</b></td>
      <td class="num">${nf(p.partes)}</td>
      <td class="num">${nf(p.renglones)}</td>
      <td class="num" style="color:var(--rojo);font-weight:600">${nf(p.faltante)}</td>
      <td>${fechaEs(p.fecha)}</td>
      <td>${p.correos.length
        ? escapar(p.correos.join(', '))
        : '<span class="marca rojo">sin correo</span>'}</td>
    </tr>`).join('');
}

$('#dlLibro').addEventListener('click', () => { if (corridaId) location.href = `/api/descargar/${corridaId}/libro`; });
$('#dlCons').addEventListener('click', () => { if (corridaId) location.href = `/api/descargar/${corridaId}/consolidado`; });

// --- contactos --------------------------------------------------------------
async function cargarContactos() {
  const r = await pedir('/api/contactos');
  contactos = r.contactos;
  $('#totalContactos').textContent = `(${r.total} proveedor${r.total === 1 ? '' : 'es'})`;
  const nombres = Object.keys(contactos).sort();
  $('#tblContactos').innerHTML = nombres.length ? nombres.map((n) => `
    <tr>
      <td>${escapar(n)}</td>
      <td>${escapar((contactos[n] || []).join(', '))}</td>
      <td><button class="btn claro chico borrar" data-p="${escapar(n)}">Borrar</button></td>
    </tr>`).join('') : '<tr><td colspan="3" class="vacio">Todavia no hay contactos cargados.</td></tr>';
  $$('#tblContactos .borrar').forEach((b) => b.addEventListener('click', async () => {
    await pedir('/api/contactos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proveedor: b.dataset.p, eliminar: true }),
    });
    await cargarContactos();
    pintarEnvio();
  }));
  $('#listaProv').innerHTML = proveedores.map((p) => `<option value="${escapar(p.nombre)}">`).join('');
}

$('#importar').addEventListener('click', async () => {
  const f = $('#fContactos').files[0];
  if (!f) return aviso('#msgContactos', 'err', 'Selecciona un archivo.');
  const cuerpo = new FormData();
  cuerpo.append('archivo', f);
  cuerpo.append('reemplazar', $('#modoImport').value);
  try {
    const r = await pedir('/api/contactos/importar', { method: 'POST', body: cuerpo });
    let msg = `Se importaron ${r.importados} proveedor(es). El catalogo tiene ${r.total}.`;
    if (r.invalidos.length) {
      msg += ` Se descartaron valores que no son correo en ${r.invalidos.length} renglon(es): `
        + r.invalidos.slice(0, 5).map((i) => `fila ${i.fila} (${i.valores.join(', ')})`).join('; ');
    }
    aviso('#msgContactos', r.invalidos.length ? 'adv' : 'ok', msg);
    await cargarContactos();
    pintarEnvio();
  } catch (e) { aviso('#msgContactos', 'err', e.message); }
});

$('#guardarContacto').addEventListener('click', async () => {
  const proveedor = $('#nuevoProv').value.trim();
  const correos = $('#nuevoMail').value.trim();
  if (!proveedor || !correos) return aviso('#msgContactos', 'err', 'Escribe el proveedor y al menos un correo.');
  try {
    const r = await pedir('/api/contactos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proveedor, correos }),
    });
    aviso('#msgContactos', r.aviso ? 'adv' : 'ok', r.aviso || `Guardado: ${proveedor}.`);
    $('#nuevoProv').value = ''; $('#nuevoMail').value = '';
    await cargarContactos();
    pintarEnvio();
  } catch (e) { aviso('#msgContactos', 'err', e.message); }
});

// --- correo -----------------------------------------------------------------
async function cargarSmtp() {
  const c = await pedir('/api/smtp');
  $('#smtpHost').value = c.host || 'smtp.office365.com';
  $('#smtpPort').value = c.port || 587;
  $('#smtpUser').value = c.user || '';
  $('#smtpFrom').value = c.from || '';
  $('#guardarPass').checked = !!c.guardarPass;
  $('#smtpPass').placeholder = c.tienePass ? '(guardada, dejar en blanco para conservarla)' : '';
}

function smtpDeFormulario() {
  return {
    host: $('#smtpHost').value.trim(),
    port: Number($('#smtpPort').value) || 587,
    secure: Number($('#smtpPort').value) === 465,
    user: $('#smtpUser').value.trim(),
    pass: $('#smtpPass').value || undefined,
    from: $('#smtpFrom').value.trim() || $('#smtpUser').value.trim(),
    guardarPass: $('#guardarPass').checked,
  };
}

function cuerpoDeFormulario() {
  return {
    asunto: $('#asunto').value,
    saludo: $('#saludo').value,
    intro: $('#intro').value,
    cierre: $('#cierre').value,
    firma: $('#firma').value,
    cc: $('#cc').value,
    adjuntar: $('#adjuntar').checked,
  };
}

$('#probarSmtp').addEventListener('click', async () => {
  aviso('#msgSmtp', 'info', 'Probando conexion...');
  try {
    const r = await pedir('/api/smtp/probar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(smtpDeFormulario()),
    });
    aviso('#msgSmtp', r.ok ? 'ok' : 'err', r.mensaje);
  } catch (e) { aviso('#msgSmtp', 'err', e.message); }
});

$('#guardarSmtp').addEventListener('click', async () => {
  try {
    const r = await pedir('/api/smtp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(smtpDeFormulario()),
    });
    $('#smtpPass').value = '';
    aviso('#msgSmtp', 'ok', `Configuracion guardada en ${r.guardado}.`);
    await cargarSmtp();
  } catch (e) { aviso('#msgSmtp', 'err', e.message); }
});

function pintarEnvio() {
  if (!proveedores.length) return;
  $('#listaEnvio').innerHTML = `<table>
    <thead><tr>
      <th style="width:34px"><input type="checkbox" id="todos" checked></th>
      <th>Proveedor</th><th class="num">Partes</th><th>Destinatarios</th>
    </tr></thead>
    <tbody>${proveedores.map((p) => {
      const correos = contactos[Object.keys(contactos).find((k) => k.toUpperCase().trim() === p.nombre.toUpperCase().trim())] || p.correos || [];
      const sin = !correos.length;
      return `<tr>
        <td><input type="checkbox" class="pick" data-p="${escapar(p.nombre)}" ${sin ? 'disabled' : 'checked'}></td>
        <td>${escapar(p.nombre)}</td>
        <td class="num">${nf(p.partes)}</td>
        <td>${sin ? '<span class="marca rojo">sin correo</span>' : escapar(correos.join(', '))}</td>
      </tr>`;
    }).join('')}</tbody></table>`;
  $('#todos').addEventListener('change', (e) => {
    $$('#listaEnvio .pick').forEach((c) => { if (!c.disabled) c.checked = e.target.checked; });
  });
}

function seleccionados() {
  return $$('#listaEnvio .pick').filter((c) => c.checked && !c.disabled).map((c) => c.dataset.p);
}

$('#verPrevia').addEventListener('click', async () => {
  if (!corridaId) return aviso('#msgCorreo', 'err', 'Procesa los archivos primero.');
  try {
    const r = await pedir('/api/correos/preview', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: corridaId, proveedores: seleccionados(), cuerpo: cuerpoDeFormulario() }),
    });
    aviso('#msgCorreo', 'info', `${r.conCorreo} correo(s) listos para enviar de ${r.total} seleccionados.`
      + (r.sinCorreo.length ? ` Sin correo: ${r.sinCorreo.join(', ')}.` : ''));
    $('#previa').innerHTML = r.correos.filter((c) => !c.sinCorreo).map((c) => `
      <details style="margin-top:10px">
        <summary>${escapar(c.proveedor)} &rarr; ${escapar(c.para.join(', '))} &middot; ${c.partes} parte(s)</summary>
        <p style="font-size:12px;color:var(--tenue);margin:8px 0"><b>Asunto:</b> ${escapar(c.asunto)}
          ${c.adjunto ? `<br><b>Adjunto:</b> ${escapar(c.adjunto)}` : ''}</p>
        <div class="previa">${c.html}</div>
      </details>`).join('');
  } catch (e) { aviso('#msgCorreo', 'err', e.message); }
});

$('#dlBorradores').addEventListener('click', async () => {
  if (!corridaId) return aviso('#msgCorreo', 'err', 'Procesa los archivos primero.');
  const r = await fetch('/api/correos/borradores', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: corridaId, proveedores: seleccionados(), cuerpo: cuerpoDeFormulario(), smtp: smtpDeFormulario() }),
  });
  if (!r.ok) return aviso('#msgCorreo', 'err', (await r.json()).error);
  const blob = await r.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'borradores.zip';
  a.click();
  URL.revokeObjectURL(a.href);
  aviso('#msgCorreo', 'ok', 'Borradores descargados. Abrelos con Outlook y presiona Enviar en cada uno.');
});

$('#enviar').addEventListener('click', async () => {
  if (!corridaId) return aviso('#msgCorreo', 'err', 'Procesa los archivos primero.');
  const lista = seleccionados();
  if (!lista.length) return aviso('#msgCorreo', 'err', 'No hay proveedores marcados con correo.');
  if (!confirm(`Se enviaran ${lista.length} correo(s). Esta accion no se puede deshacer. Continuar?`)) return;

  const boton = $('#enviar');
  boton.disabled = true;
  boton.innerHTML = '<span class="cargando"></span>Enviando';
  try {
    const r = await pedir('/api/correos/enviar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: corridaId, proveedores: lista, cuerpo: cuerpoDeFormulario(), smtp: smtpDeFormulario() }),
    });
    const clase = r.fallidos ? 'adv' : 'ok';
    aviso('#msgCorreo', clase, `Enviados ${r.enviados}. Fallidos ${r.fallidos}. Omitidos ${r.omitidos}.`);
    $('#previa').innerHTML = `<div class="desplaza" style="margin-top:12px"><table>
      <thead><tr><th>Proveedor</th><th>Resultado</th></tr></thead><tbody>
      ${r.resultados.map((x) => `<tr><td>${escapar(x.proveedor)}</td>
        <td>${x.ok ? '<span class="marca verde">enviado</span> ' + escapar((x.para || []).join(', '))
          : `<span class="marca ${x.omitido ? 'ambar' : 'rojo'}">${x.omitido ? 'omitido' : 'error'}</span> ${escapar(x.mensaje || '')}`}</td>
      </tr>`).join('')}</tbody></table></div>`;
  } catch (e) { aviso('#msgCorreo', 'err', e.message); }
  finally { boton.disabled = false; boton.textContent = 'Enviar correos'; }
});

// --- arranque ---------------------------------------------------------------
cargarContactos().catch((e) => aviso('#msgContactos', 'err', e.message));
cargarSmtp().catch(() => {});
