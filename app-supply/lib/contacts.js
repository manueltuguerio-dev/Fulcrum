'use strict';
/**
 * Catalogo de correos por proveedor.
 *
 * Ni el libro MX ni el archivo Data traen una sola direccion de correo, asi que
 * el catalogo se carga aparte: un Excel o CSV con el nombre del proveedor y sus
 * correos. El nombre se compara ignorando mayusculas y espacios sobrantes,
 * porque es el mismo texto que viene en la columna SUPPLIER.
 */

const fs = require('fs');
const path = require('path');
const { Workbook } = require('./workbook');
const { forEachRow } = require('./xlsx-read');

const CORREO = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

function normalizar(nombre) {
  return String(nombre == null ? '' : nombre).trim().replace(/\s+/g, ' ').toUpperCase();
}

/** Separa "a@x.com; b@y.com, c@z.com" en direcciones validas. */
function partirCorreos(texto) {
  if (texto == null) return [];
  return String(texto)
    .split(/[;,\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function validar(lista) {
  const buenos = [];
  const malos = [];
  for (const c of lista) (CORREO.test(c) ? buenos : malos).push(c);
  return { buenos, malos };
}

class Contactos {
  constructor(mapa = {}) {
    this.mapa = {};           // NOMBRE NORMALIZADO -> { nombre, correos[] }
    for (const [k, v] of Object.entries(mapa)) this.set(k, v);
  }

  static async load(file) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      return new Contactos(raw);
    } catch (e) {
      if (e.code === 'ENOENT') return new Contactos();
      throw new Error(`No se pudo leer el catalogo de contactos (${file}): ${e.message}`);
    }
  }

  save(file) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(this.toJSON(), null, 2), { mode: 0o600 });
  }

  toJSON() {
    const out = {};
    for (const v of Object.values(this.mapa)) out[v.nombre] = v.correos;
    return out;
  }

  set(nombre, correos) {
    const clave = normalizar(nombre);
    if (!clave) return { ok: false, error: 'nombre vacio' };
    const lista = Array.isArray(correos) ? correos : partirCorreos(correos);
    const { buenos, malos } = validar(lista.map((c) => String(c).trim()).filter(Boolean));
    this.mapa[clave] = { nombre: String(nombre).trim(), correos: [...new Set(buenos)] };
    return { ok: true, agregados: buenos.length, invalidos: malos };
  }

  remove(nombre) { delete this.mapa[normalizar(nombre)]; }

  get(nombre) {
    const e = this.mapa[normalizar(nombre)];
    return e ? e.correos : [];
  }

  has(nombre) { return this.get(nombre).length > 0; }

  /** { "NOMBRE EXACTO DEL PROVEEDOR": ["a@x.com"] } para el reporte y la UI. */
  paraProveedores(nombres) {
    const out = {};
    for (const n of nombres) out[n] = this.get(n);
    return out;
  }

  /** Proveedores del listado que aun no tienen correo. */
  faltantes(nombres) {
    return [...new Set(nombres)].filter((n) => !this.has(n)).sort();
  }

  get total() { return Object.keys(this.mapa).length; }
}

/**
 * Importa un catalogo desde .xlsx o .csv.
 *
 * Busca en la primera fila un encabezado que hable de proveedor y otro que
 * hable de correo; si no lo encuentra, toma la columna A como proveedor y la B
 * como correos, y no descarta la primera fila.
 */
async function importarCatalogo(buffer, nombreArchivo = '') {
  const filas = nombreArchivo.toLowerCase().endsWith('.csv')
    ? leerCsv(buffer.toString('utf8'))
    : await leerXlsx(buffer);

  if (!filas.length) throw new Error('El archivo de contactos esta vacio.');

  const encabezado = filas[0].map((c) => String(c == null ? '' : c).trim().toLowerCase());
  let colProv = encabezado.findIndex((h) => /proveedor|supplier|vendor/.test(h));
  let colMail = encabezado.findIndex((h) => /correo|mail|email|e-mail/.test(h));
  let desde = 1;
  if (colProv === -1 || colMail === -1) { colProv = 0; colMail = 1; desde = 0; }

  const contactos = new Contactos();
  const invalidos = [];
  let importados = 0;

  for (let i = desde; i < filas.length; i++) {
    const fila = filas[i];
    if (!fila) continue;
    const nombre = fila[colProv];
    const correos = fila[colMail];
    if (nombre == null || String(nombre).trim() === '') continue;
    const r = contactos.set(nombre, correos);
    if (r.ok) {
      importados++;
      if (r.invalidos.length) invalidos.push({ fila: i + 1, proveedor: String(nombre).trim(), valores: r.invalidos });
    }
  }

  return { contactos, importados, invalidos, columnas: { proveedor: colProv, correo: colMail } };
}

async function leerXlsx(buffer) {
  const wb = await Workbook.open(buffer);
  const xml = await wb.sheetXml(wb.sheets[0].name);
  const filas = [];
  forEachRow(xml, wb.shared, { maxCol: 8 }, (r, v) => { filas[r - 1] = v; });
  return filas.filter(Boolean);
}

/** CSV sencillo con comillas dobles y separador coma o punto y coma. */
function leerCsv(texto) {
  const sep = (texto.split('\n')[0].match(/;/g) || []).length
    > (texto.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const filas = [];
  let campo = '';
  let fila = [];
  let enComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (enComillas) {
      if (ch === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; } else enComillas = false;
      } else campo += ch;
    } else if (ch === '"') enComillas = true;
    else if (ch === sep) { fila.push(campo); campo = ''; }
    else if (ch === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; }
    else if (ch !== '\r') campo += ch;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter((f) => f.some((c) => String(c).trim() !== ''));
}

module.exports = { Contactos, importarCatalogo, normalizar, partirCorreos, CORREO };
