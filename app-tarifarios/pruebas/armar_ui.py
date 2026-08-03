"""Arma una copia de la app con el servidor simulado, para probar la interfaz."""
import datetime
import json
import pathlib

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SALIDA = pathlib.Path(__file__).resolve().parent

hoy = datetime.date.today().isoformat()
fin = (datetime.date.today() + datetime.timedelta(days=300)).isoformat()

CATALOGOS = {
    "mercancia": [
        {"id": "m1", "clave": "general", "nombre": "Carga general", "orden": 1, "estado": "activo"},
        {"id": "m2", "clave": "refrigerada", "nombre": "Refrigerada", "orden": 2, "estado": "activo"},
        {"id": "m3", "clave": "peligrosa", "nombre": "Materiales peligrosos", "orden": 3,
         "estado": "inactivo"},
    ],
    "equipo": [
        {"id": "e1", "clave": "full", "nombre": "Full (doble remolque)", "orden": 1,
         "estado": "activo"},
        {"id": "e2", "clave": "sencillo", "nombre": "Sencillo (48/53 ft)", "orden": 2,
         "estado": "activo"},
        {"id": "e3", "clave": "torton", "nombre": "Torton", "orden": 3, "estado": "activo"},
    ],
}

PROVEEDORES = [
    {"id": "p1", "nombre": "Transportes del Norte", "rfc": "TNO950101AB1",
     "contacto": "Laura Méndez", "telefono": "81 1234 5678", "correo": "ventas@tnorte.mx",
     "ciudad": "Monterrey", "calificacion": 4.5, "estado": "activo", "notas": "", "tarifas": 6},
    {"id": "p2", "nombre": "Fletes Bajío", "rfc": "", "contacto": "Jorge Ruiz",
     "telefono": "477 890 1234", "correo": "jruiz@fletesbajio.mx", "ciudad": "León",
     "calificacion": 4, "estado": "activo", "notas": "", "tarifas": 4},
    {"id": "p3", "nombre": "Autolíneas del Golfo", "rfc": "", "contacto": "", "telefono": "",
     "correo": "", "ciudad": "Veracruz", "calificacion": 0, "estado": "inactivo",
     "notas": "Suspendido", "tarifas": 0},
]

RUTAS = [
    {"id": "r1", "origen": "Monterrey", "destino": "Guadalajara",
     "nombre": "Monterrey → Guadalajara", "km": 780, "notas": "", "estado": "activo",
     "tarifas": 5},
    {"id": "r2", "origen": "Manzanillo", "destino": "CDMX", "nombre": "Manzanillo → CDMX",
     "km": 810, "notas": "Corredor de importación", "estado": "activo", "tarifas": 3},
]


def opcion(posicion, proveedor, costo, horas, puntaje, mejor=False, rapida=False):
    return {
        "id": "t" + str(posicion) + proveedor[:2], "posicion": posicion,
        "proveedorId": "p1", "proveedor": proveedor, "proveedorActivo": True,
        "calificacion": 4.5, "rutaId": "r1", "ruta": "Monterrey → Guadalajara",
        "origen": "Monterrey", "destino": "Guadalajara", "km": 780,
        "mercancia": "general", "mercanciaNombre": "Carga general",
        "equipo": "full", "equipoNombre": "Full (doble remolque)", "moneda": "MXN",
        "tarifa": costo * 0.85, "combustiblePct": 12, "combustible": costo * 0.1,
        "casetas": costo * 0.05, "maniobras": 0, "otros": 0, "subtotal": costo,
        "costoTotal": costo, "costoPorKm": round(costo / 780, 2), "tiempoHoras": horas,
        "tiempoTexto": str(horas) + " h", "capacidadTon": 48, "vigenciaDesde": hoy,
        "vigenciaHasta": fin, "estado": "activo", "vencida": False, "notas": "",
        "actualizado": hoy, "puntaje": puntaje, "esMasBarata": mejor, "esMasRapida": rapida,
        "sobreprecio": 0 if mejor else 1600, "sobreprecioPct": 0 if mejor else 4.2,
        "horasDeMas": 0 if rapida else 4,
        "motivo": "La más barata y la más rápida." if mejor and rapida
                  else "Cuesta 4.2 % más que la más barata.",
    }


GRUPO = {
    "clave": "r1|general|full", "rutaId": "r1", "ruta": "Monterrey → Guadalajara",
    "origen": "Monterrey", "destino": "Guadalajara", "km": 780,
    "mercancia": "general", "mercanciaNombre": "Carga general",
    "equipo": "full", "equipoNombre": "Full (doble remolque)",
    "opciones": [
        opcion(1, "Fletes Bajío", 38000, 16, 92.4, mejor=True, rapida=True),
        opcion(2, "Transportes del Norte", 39600, 18, 81.0),
        opcion(3, "Autolíneas del Golfo", 44200, 26, 42.5),
    ],
    "total": 3, "proveedores": 3, "costoMin": 38000, "costoMax": 44200,
    "costoPromedio": 40600, "tiempoMin": 16, "tiempoMax": 26,
    "ahorro": 6200, "ahorroPct": 14.0, "ventaja": 1600,
}
GRUPO["mejor"] = GRUPO["opciones"][0]
GRUPO["segunda"] = GRUPO["opciones"][1]

DESCARTADAS = {"inactivas": 1, "vencidas": 2, "sinVigencia": 0, "capacidad": 0,
               "proveedorInactivo": 1}

TARIFAS = [
    {"id": "t1", "proveedorId": "p1", "proveedor": "Transportes del Norte",
     "proveedorActivo": True, "calificacion": 4.5, "rutaId": "r1",
     "ruta": "Monterrey → Guadalajara", "origen": "Monterrey", "destino": "Guadalajara",
     "km": 780, "mercancia": "general", "mercanciaNombre": "Carga general",
     "equipo": "full", "equipoNombre": "Full (doble remolque)", "moneda": "MXN",
     "tarifa": 38500, "combustiblePct": 12, "combustible": 4620, "casetas": 2450,
     "maniobras": 0, "otros": 0, "subtotal": 45570, "costoTotal": 45570,
     "costoPorKm": 58.42, "tiempoHoras": 18, "capacidadTon": 48, "vigenciaDesde": hoy,
     "vigenciaHasta": fin, "estado": "activo", "vencida": False, "notas": "Incluye seguro",
     "actualizado": hoy},
    {"id": "t2", "proveedorId": "p2", "proveedor": "Fletes Bajío", "proveedorActivo": True,
     "calificacion": 4, "rutaId": "r1", "ruta": "Monterrey → Guadalajara",
     "origen": "Monterrey", "destino": "Guadalajara", "km": 780, "mercancia": "general",
     "mercanciaNombre": "Carga general", "equipo": "sencillo",
     "equipoNombre": "Sencillo (48/53 ft)", "moneda": "USD", "tarifa": 1400,
     "combustiblePct": 10, "combustible": 140, "casetas": 0, "maniobras": 0, "otros": 0,
     "subtotal": 1540, "costoTotal": 26950, "costoPorKm": 34.55, "tiempoHoras": 30,
     "capacidadTon": 24, "vigenciaDesde": hoy, "vigenciaHasta": "", "estado": "inactivo",
     "vencida": True, "notas": "", "actualizado": hoy},
]

MEJOR = {
    "clave": "r1|general|full", "rutaId": "r1", "ruta": "Monterrey → Guadalajara",
    "origen": "Monterrey", "destino": "Guadalajara", "km": 780, "mercancia": "general",
    "mercanciaNombre": "Carga general", "equipo": "full",
    "equipoNombre": "Full (doble remolque)", "opciones": 3, "proveedores": 3,
    "proveedor": "Fletes Bajío", "proveedorId": "p2", "tarifaId": "t2",
    "costoTotal": 38000, "costoPorKm": 48.72, "tiempoHoras": 16, "tiempoTexto": "16 h",
    "puntaje": 92.4, "motivo": "La más barata y la más rápida.", "vigenciaHasta": fin,
    "segundo": "Transportes del Norte", "segundoCosto": 39600, "segundoTiempo": 18,
    "ventaja": 1600, "costoPromedio": 40600, "costoMax": 44200, "ahorro": 6200,
    "ahorroPct": 14.0,
}
MEJOR_SOLO = dict(MEJOR, clave="r2|general|sencillo", rutaId="r2",
                  ruta="Manzanillo → CDMX", origen="Manzanillo", destino="CDMX",
                  opciones=1, proveedores=1, segundo="", segundoCosto=0, ventaja=0,
                  ahorro=0, ahorroPct=0)

RESPUESTAS = {
    "apiEstadoInicial": {
        "sesion": True, "registrado": True, "activo": True,
        "usuario": {"id": "u1", "nombre": "Manuel Tuguerio", "rol": "admin",
                    "email": "manuel@tlterminals.com", "estado": "activo"},
        "config": {"empresa": "TLTERMINALS", "monedaBase": "MXN", "tipoCambioUSD": "17.50",
                   "pesoPrecio": "70", "pesoTiempo": "30", "diasAvisoVencimiento": "30"},
        "hoy": hoy, "catalogos": CATALOGOS, "proveedores": PROVEEDORES, "rutas": RUTAS,
        "resumen": {"proveedores": 3, "rutas": 2, "tarifas": 9, "vigentes": 7,
                    "porVencer": 2, "vencidas": 2},
    },
    "apiComparar": {"grupos": [GRUPO], "fecha": hoy, "monedaBase": "MXN", "total": 3,
                    "criterio": {"pesoPrecio": 70, "pesoTiempo": 30, "orden": "puntaje"},
                    "descartadas": DESCARTADAS},
    "apiMejoresOpciones": {
        "mejores": [MEJOR, MEJOR_SOLO], "fecha": hoy, "monedaBase": "MXN",
        "criterio": {"pesoPrecio": 70, "pesoTiempo": 30, "orden": "puntaje"},
        "descartadas": DESCARTADAS,
        "resumen": {"combinaciones": 2, "rutas": 2, "opciones": 4, "ahorroTotal": 6200,
                    "sinCompetencia": 1}},
    "apiTarifas": {"tarifas": TARIFAS, "total": 2, "hoy": hoy},
    "apiProveedores": PROVEEDORES,
    "apiRutas": RUTAS,
    "apiCatalogos": CATALOGOS,
    "apiUsuarios": [
        {"id": "u1", "email": "manuel@tlterminals.com", "nombre": "Manuel Tuguerio",
         "rol": "admin", "estado": "activo",
         "liga": "https://script.google.com/macros/s/EJEMPLO/exec?t=abc123"},
        {"id": "u2", "email": "compras@tlterminals.com", "nombre": "Compras",
         "rol": "consulta", "estado": "activo",
         "liga": "https://script.google.com/macros/s/EJEMPLO/exec?t=def456"},
    ],
    "apiHistorial": {"ruta": "Monterrey → Guadalajara", "mercanciaNombre": "Carga general",
                     "equipoNombre": "Full (doble remolque)", "historial": TARIFAS},
    "apiPlantilla": {"nombre": "plantilla-tarifas.csv", "contenido": "proveedor,origen\nA,B"},
    "apiExportarCsv": {"nombre": "tarifarios.csv", "contenido": "a,b\n1,2", "renglones": 1},
    "apiExportarLibro": {"url": "https://docs.google.com/spreadsheets/d/X",
                         "nombre": "Tarifarios de prueba"},
    "apiRespaldo": [{"nombre": "respaldo-tarifas.csv", "contenido": "a,b\n1,2"}],
    "apiImportarRevisar": {
        "tipo": "tarifas", "delimitador": ";",
        "columnas": ["Proveedor", "Origen", "Destino", "Tarifa", "Color favorito"],
        "reconocidas": ["proveedor", "origen", "destino", "tarifa"],
        "ignoradas": ["Color favorito"],
        "filas": [
            {"n": 2, "accion": "alta", "resumen": "Fletes Bajío · Monterrey → Saltillo",
             "problemas": [], "datos": {}},
            {"n": 3, "accion": "actualiza", "resumen": "Transportes del Norte · Monterrey → Saltillo",
             "problemas": [], "datos": {}},
            {"n": 4, "accion": "error", "resumen": "Sin nombre", "problemas": ["Falta el tipo de equipo."],
             "datos": {}},
        ],
        "nuevos": {"proveedores": ["Mudanzas Express"], "rutas": ["Monterrey → Saltillo"],
                   "mercancias": [], "equipos": []},
        "resumen": {"total": 3, "altas": 1, "actualizaciones": 1, "errores": 1}},
    "apiImportarAplicar": {"altas": 1, "actualizaciones": 1, "omitidas": 1, "sinReferencia": 0,
                           "errores": [], "nuevos": {"proveedores": 1, "rutas": 1, "catalogos": 0}},
}

NOMBRES = [
    "apiEstadoInicial", "apiUsuarios", "apiGuardarUsuario", "apiBorrarUsuario",
    "apiRegenerarLiga", "apiGuardarConfig", "apiProveedores", "apiGuardarProveedor",
    "apiBorrarProveedor", "apiRutas", "apiGuardarRuta", "apiBorrarRuta", "apiCatalogos",
    "apiGuardarCatalogo", "apiBorrarCatalogo", "apiTarifas", "apiGuardarTarifa",
    "apiBorrarTarifa", "apiDuplicarTarifa", "apiCambiarEstadoTarifa", "apiComparar",
    "apiMejoresOpciones", "apiHistorial", "apiImportarRevisar", "apiImportarAplicar",
    "apiPlantilla", "apiExportarCsv", "apiExportarLibro", "apiRespaldo",
]

MOCK = """
<script>
window.__errores = [];
window.onerror = function (m, u, l) { window.__errores.push(m + ' @linea ' + l); };
// Casi todo el cliente corre dentro de promesas: sin esto, un error ahí adentro
// pasaría de noche.
window.addEventListener('unhandledrejection', function (e) {
  window.__errores.push('promesa: ' + ((e.reason && e.reason.message) || e.reason));
});
var RESPUESTAS = __DATOS__;
var NOMBRES = __NOMBRES__;
function Corredor() { this.__ok = null; this.__mal = null; }
Corredor.prototype.withSuccessHandler = function (f) { this.__ok = f; return this; };
Corredor.prototype.withFailureHandler = function (f) { this.__mal = f; return this; };
Corredor.prototype.ejecutar = function (token, nombre, args) {
  var self = this;
  if (NOMBRES.indexOf(nombre) === -1) {
    window.__errores.push('funcion no declarada en el despachador: ' + nombre);
  }
  var datos = RESPUESTAS.hasOwnProperty(nombre) ? RESPUESTAS[nombre] : true;
  setTimeout(function () { self.__ok(JSON.parse(JSON.stringify(datos))); }, 0);
};
window.google = { script: {} };
Object.defineProperty(window.google.script, 'run', {
  get: function () { return new Corredor(); }
});
</script>
"""

SONDA = """
<script>
setTimeout(function () {
  var vistas = ['comparar', 'mejores', 'tarifas', 'proveedores', 'rutas', 'catalogos',
                'datos', 'ajustes'];
  var i = 0;
  function revisarFormularios() {
    var pruebas = [
      ['nueva tarifa', function () { estado.vista = 'tarifas'; pintar(); }, null],
      ['formulario de tarifa', function () { formaTarifa(null); }, 'x-guardar'],
      ['formulario de proveedor', function () {
        estado.vista = 'proveedores'; pintar(); formaProveedor(null); }, 'p-guardar'],
      ['formulario de ruta', function () {
        estado.vista = 'rutas'; pintar(); formaRuta(null); }, 'r-guardar'],
      ['formulario de catálogo', function () {
        estado.vista = 'catalogos'; pintar(); formaCatalogo({ tipo: 'equipo' }); }, 'c-guardar'],
      ['formulario de usuario', function () {
        estado.vista = 'ajustes'; pintar(); formaUsuario(null); }, 'u-guardar'],
      ['informe de importación', function () {
        estado.vista = 'datos'; pintar();
        pintarInforme(RESPUESTAS.apiImportarRevisar); }, 'i-aplicar']
    ];
    pruebas.forEach(function (p) {
      try {
        p[1]();
        if (p[2] && !document.getElementById(p[2])) {
          window.__errores.push('no se armó: ' + p[0]);
        }
      } catch (e) { window.__errores.push(p[0] + ': ' + e.message); }
    });
  }
  function siguiente() {
    if (i >= vistas.length) {
      revisarFormularios();
      setTimeout(function () {
        document.body.innerHTML = '<pre id="salida">'
          + (window.__errores.length ? window.__errores.join('\\n') : 'SIN ERRORES') + '</pre>';
      }, 250);
      return;
    }
    var v = vistas[i++];
    try {
      estado.vista = v;
      estado.borrador = null;
      pintarBarra();
      pintar();
      setTimeout(function () {
        if (document.getElementById('vista').innerHTML.length < 60) {
          window.__errores.push('la vista ' + v + ' quedó vacía');
        }
        siguiente();
      }, 180);
    } catch (e) {
      window.__errores.push('vista ' + v + ': ' + e.message);
      siguiente();
    }
  }
  siguiente();
}, 700);
</script>
"""


def armar(con_sonda):
    pagina = (RAIZ / "Index.html").read_text(encoding="utf-8")
    pagina = pagina.replace("<?!= include('Estilos') ?>",
                            (RAIZ / "Estilos.html").read_text(encoding="utf-8"))
    pagina = pagina.replace("<?!= include('Cliente') ?>",
                            (RAIZ / "Cliente.html").read_text(encoding="utf-8"))
    mock = MOCK.replace("__DATOS__", json.dumps(RESPUESTAS, ensure_ascii=False))
    mock = mock.replace("__NOMBRES__", json.dumps(NOMBRES))
    pagina = pagina.replace("<?= tokenInicial ?>", "TOKEN-DE-PRUEBA")
    pagina = pagina.replace("<body>", "<body>" + mock, 1)
    if con_sonda:
        pagina = pagina.replace("</body>", SONDA + "</body>")
    return pagina


(SALIDA / "ui.html").write_text(armar(False), encoding="utf-8")
(SALIDA / "ui-sonda.html").write_text(armar(True), encoding="utf-8")
print("listas: ui.html y ui-sonda.html")
