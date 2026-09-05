/**
 * Catalogo de correos por proveedor, guardado en la hoja "Contactos".
 *
 * Ni el libro MX ni el archivo Data traen una sola direccion de correo, asi
 * que el catalogo se captura aparte. El nombre se compara ignorando mayusculas
 * y espacios sobrantes, porque es el mismo texto que viene en la columna
 * SUPPLIER y ahi los espacios dobles son comunes.
 */

var CONTACTOS = (function () {

  var CORREO = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
  var cache = null;

  function normalizar(nombre) {
    return String(nombre === null || nombre === undefined ? '' : nombre)
      .trim().replace(/\s+/g, ' ').toUpperCase();
  }

  /** Separa "a@x.com; b@y.com, c@z.com" en direcciones sueltas. */
  function partir(texto) {
    if (texto === null || texto === undefined) return [];
    return String(texto).split(/[;,\s]+/).map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 0; });
  }

  function hoja() {
    return ESCRITURA.hojaDeTrabajo(HOJAS_TRABAJO.CONTACTOS);
  }

  /** Lee el catalogo de la hoja. Se cachea por ejecucion. */
  function cargar() {
    if (cache) return cache;
    var h = hoja();
    var ultima = h.getLastRow();
    var mapa = {};
    if (ultima >= 2) {
      var valores = h.getRange(2, 1, ultima - 1, 2).getValues();
      for (var i = 0; i < valores.length; i++) {
        var nombre = valores[i][0];
        if (nombre === '' || nombre === null) continue;
        var buenos = partir(valores[i][1]).filter(function (c) { return CORREO.test(c); });
        mapa[normalizar(nombre)] = { nombre: String(nombre).trim(), correos: sinRepetir(buenos) };
      }
    }
    cache = mapa;
    return mapa;
  }

  function sinRepetir(lista) {
    var visto = {}, salida = [];
    for (var i = 0; i < lista.length; i++) {
      if (!visto[lista[i]]) { visto[lista[i]] = true; salida.push(lista[i]); }
    }
    return salida;
  }

  function correosDe(proveedor) {
    var e = cargar()[normalizar(proveedor)];
    return e ? e.correos : [];
  }

  function tiene(proveedor) {
    return correosDe(proveedor).length > 0;
  }

  /** Proveedores del listado que todavia no tienen correo. */
  function faltantes(nombres) {
    var vistos = {}, salida = [];
    for (var i = 0; i < nombres.length; i++) {
      var n = nombres[i];
      if (vistos[n] || tiene(n)) continue;
      vistos[n] = true;
      salida.push(n);
    }
    return salida.sort();
  }

  /** Todo el catalogo, para la pantalla de contactos. */
  function listar() {
    var mapa = cargar();
    var salida = [];
    for (var k in mapa) salida.push({ proveedor: mapa[k].nombre, correos: mapa[k].correos });
    return salida.sort(function (a, b) { return a.proveedor.localeCompare(b.proveedor); });
  }

  /**
   * Guarda o borra un proveedor.
   * Devuelve los correos que se descartaron por no tener forma de correo, para
   * que la pantalla lo diga en vez de fallar en silencio.
   */
  function guardar(proveedor, correos, eliminar) {
    var h = hoja();
    asegurarEncabezado(h);
    var clave = normalizar(proveedor);
    if (!clave) throw new Error('Falta el nombre del proveedor.');

    var ultima = h.getLastRow();
    var valores = ultima >= 2 ? h.getRange(2, 1, ultima - 1, 2).getValues() : [];
    var fila = -1;
    for (var i = 0; i < valores.length; i++) {
      if (normalizar(valores[i][0]) === clave) { fila = i + 2; break; }
    }

    if (eliminar) {
      if (fila > 0) h.deleteRow(fila);
      cache = null;
      return { ok: true, invalidos: [] };
    }

    var lista = partir(correos);
    var buenos = [], malos = [];
    for (var j = 0; j < lista.length; j++) {
      (CORREO.test(lista[j]) ? buenos : malos).push(lista[j]);
    }
    if (!buenos.length) {
      throw new Error('Ninguno de los valores capturados tiene forma de correo: ' + lista.join(', '));
    }

    var renglon = [String(proveedor).trim(), sinRepetir(buenos).join('; ')];
    if (fila > 0) h.getRange(fila, 1, 1, 2).setValues([renglon]);
    else h.appendRow(renglon);

    cache = null;
    return { ok: true, invalidos: malos };
  }

  /**
   * Importa un catalogo desde una hoja de calculo de Drive.
   * Busca encabezados que hablen de proveedor y de correo; si no los encuentra
   * toma la columna A y la B y no descarta la primera fila.
   */
  function importarDe(idArchivo, reemplazar) {
    var libro = SpreadsheetApp.openById(idArchivo);
    var origen = libro.getSheets()[0];
    var ultima = origen.getLastRow();
    if (ultima < 1) throw new Error('El archivo de contactos esta vacio.');

    var valores = origen.getRange(1, 1, ultima, Math.min(8, origen.getLastColumn())).getValues();
    var encabezado = valores[0].map(function (c) { return String(c).trim().toLowerCase(); });
    var colProv = indiceQueCoincide(encabezado, /proveedor|supplier|vendor/);
    var colMail = indiceQueCoincide(encabezado, /correo|mail|email|e-mail/);
    var desde = 1;
    if (colProv === -1 || colMail === -1) { colProv = 0; colMail = 1; desde = 0; }

    if (reemplazar) {
      var h = hoja();
      h.clear();
      asegurarEncabezado(h);
      cache = null;
    }

    var importados = 0;
    var invalidos = [];
    for (var i = desde; i < valores.length; i++) {
      var nombre = valores[i][colProv];
      if (nombre === '' || nombre === null || nombre === undefined) continue;
      try {
        var r = guardar(nombre, valores[i][colMail], false);
        importados++;
        if (r.invalidos.length) {
          invalidos.push({ fila: i + 1, proveedor: String(nombre).trim(), valores: r.invalidos });
        }
      } catch (e) {
        invalidos.push({ fila: i + 1, proveedor: String(nombre).trim(), valores: [e.message] });
      }
    }
    cache = null;
    return { importados: importados, invalidos: invalidos, total: listar().length };
  }

  function indiceQueCoincide(lista, patron) {
    for (var i = 0; i < lista.length; i++) if (patron.test(lista[i])) return i;
    return -1;
  }

  function asegurarEncabezado(h) {
    if (h.getLastRow() === 0 || String(h.getRange(1, 1).getValue()).trim() === '') {
      h.getRange(1, 1, 1, 2).setValues([['Proveedor', 'Correos']])
        .setFontWeight('bold').setFontColor('#ffffff').setBackground(CFG.MARCA);
      h.setColumnWidth(1, 260);
      h.setColumnWidth(2, 380);
      h.setFrozenRows(1);
    }
  }

  return {
    correosDe: correosDe, tiene: tiene, faltantes: faltantes, listar: listar,
    guardar: guardar, importarDe: importarDe, normalizar: normalizar,
    asegurarEncabezado: asegurarEncabezado,
  };
})();
