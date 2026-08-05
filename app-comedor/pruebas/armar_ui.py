"""Arma una copia de la app con el servidor simulado, para probar la interfaz."""
import datetime
import json
import pathlib

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SALIDA = pathlib.Path(__file__).resolve().parent

hoy = datetime.date.today().isoformat()
manana = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()

platillos = [
    {"platilloId": "p1", "nombre": "Milanesa de res", "descripcion": "Empanizada, con limón",
     "imagen": "", "tipo": "principal", "permiteComplementos": True, "disponible": True,
     "precio": 65, "orden": 1, "itemId": "i1"},
    {"platilloId": "p2", "nombre": "Pollo en mole", "descripcion": "Con ajonjolí",
     "imagen": "", "tipo": "principal", "permiteComplementos": True, "disponible": False,
     "precio": 65, "orden": 2, "itemId": "i2"},
    {"platilloId": "p3", "nombre": "Sándwich de pavo", "descripcion": "Siempre disponible",
     "imagen": "", "tipo": "base", "permiteComplementos": False, "disponible": True,
     "precio": 45, "orden": 3, "itemId": "i3"},
    {"platilloId": "c1", "nombre": "Arroz", "descripcion": "", "imagen": "",
     "tipo": "complemento", "permiteComplementos": False, "disponible": True,
     "precio": 0, "orden": 4, "itemId": "i4"},
    {"platilloId": "c2", "nombre": "Frijoles", "descripcion": "", "imagen": "",
     "tipo": "complemento", "permiteComplementos": False, "disponible": True,
     "precio": 0, "orden": 5, "itemId": "i5"},
    {"platilloId": "s1", "nombre": "Salsa verde", "descripcion": "", "imagen": "",
     "tipo": "salsa", "permiteComplementos": False, "disponible": True,
     "precio": 0, "orden": 6, "itemId": "i6"},
]

RESPUESTAS = {
    "apiEstadoInicial": {
        "sesion": True, "registrado": True, "activo": True,
        "usuario": {"id": "u1", "nombre": "Manuel Tuguerio", "rol": "admin",
                    "email": "manuel@tlterminals.com", "estado": "activo"},
        "config": {"empresa": "TLTERMINALS", "maxComplementos": "2", "horaCorte": "11:00",
                   "minutosRecordatorio": "60"},
        "dias": [
            {"fecha": hoy, "existe": True, "estado": "publicado", "horaCorte": "11:00",
             "aviso": "Hoy hay postre", "abierto": True, "minutosRestantes": 42,
             "platillos": platillos, "miPedido": None},
            {"fecha": manana, "existe": True, "estado": "publicado", "horaCorte": "11:00",
             "aviso": "", "abierto": True, "minutosRestantes": 1500, "platillos": platillos,
             "miPedido": {"id": "o1", "fecha": manana, "estado": "confirmado",
                          "principalId": "p1", "complementos": ["c1"], "salsas": ["s1"],
                          "comentarios": "Sin cebolla", "importe": 65,
                          "origen": "empleado", "condonado": False}},
        ],
        "ultimoPedido": {"id": "o0", "principalId": "p1", "complementos": ["c1"],
                         "salsas": ["s1"], "comentarios": "Sin cebolla", "importe": 65},
    },
    "apiMisPedidos": {
        "filas": [
            {"fecha": hoy, "estado": "entregado", "platillo": "Milanesa de res",
             "importe": 65, "cobrado": True, "condonado": False},
            {"fecha": manana, "estado": "no_come", "platillo": "", "importe": 0,
             "cobrado": False, "condonado": False},
        ], "total": 65, "desde": hoy, "hasta": hoy},
    "apiAdminEstado": {
        "empleados": [
            {"id": "u1", "email": "manuel@tlterminals.com", "nombre": "Manuel Tuguerio",
             "numeroNomina": "1001", "area": "Dirección", "rol": "admin", "estado": "activo",
             "liga": "https://script.google.com/macros/s/EJEMPLO/exec?t=abc123"},
            {"id": "u2", "email": "ana@tlterminals.com", "nombre": "Ana Ruiz",
             "numeroNomina": "1024", "area": "Operación", "rol": "empleado", "estado": "activo",
             "liga": "https://script.google.com/macros/s/EJEMPLO/exec?t=def456"},
            {"id": "u3", "email": "beto@tlterminals.com", "nombre": "Beto Lara",
             "numeroNomina": "1025", "area": "Patio", "rol": "empleado", "estado": "inactivo",
             "liga": ""},
        ],
        "platillos": [
            {"id": "p1", "nombre": "Milanesa de res", "descripcion": "Empanizada",
             "imagen": "", "tipo": "principal", "permiteComplementos": True,
             "precio": 65, "activo": True, "fijo": False},
            {"id": "c1", "nombre": "Arroz", "descripcion": "", "imagen": "",
             "tipo": "complemento", "permiteComplementos": False, "precio": 0,
             "activo": True, "fijo": True},
        ],
        "config": {"empresa": "TLTERMINALS", "horaCorte": "11:00",
                   "minutosRecordatorio": "60", "maxComplementos": "2"},
        "ligaApp": "https://script.google.com/macros/s/EJEMPLO/exec"},
    "apiPedidosDelDia": {
        "fecha": hoy,
        "menu": {"fecha": hoy, "estado": "publicado", "platillos": platillos},
        "pedidos": [
            {"id": "o1", "nombre": "Ana Ruiz", "email": "ana@tlterminals.com",
             "estado": "confirmado", "platillo": "Milanesa de res", "complementos": ["Arroz"],
             "salsas": ["Salsa verde"], "comentarios": "Sin cebolla", "importe": 65,
             "origen": "empleado", "condonado": False},
            {"id": "o2", "nombre": "Beto Lara", "email": "beto@tlterminals.com",
             "estado": "entregado", "platillo": "Sándwich de pavo", "complementos": [],
             "salsas": [], "comentarios": "", "importe": 22.5,
             "origen": "admin_expreso", "condonado": True},
        ],
        "faltantes": [{"id": "u1", "nombre": "Manuel Tuguerio",
                       "email": "manuel@tlterminals.com"}]},
    "apiResumenProduccion": {
        "fecha": hoy, "totalComidas": 2,
        "principales": [{"nombre": "Milanesa de res", "cantidad": 1},
                        {"nombre": "Sándwich de pavo", "cantidad": 1}],
        "complementos": [{"nombre": "Arroz", "cantidad": 1}], "salsas": [], "detalle": []},
    "apiMenuAdmin": {"fecha": hoy, "existe": True, "estado": "publicado", "horaCorte": "11:00",
                     "aviso": "Hoy hay postre", "abierto": True, "minutosRestantes": 42,
                     "platillos": platillos},
    "apiReporteCobros": {
        "desde": hoy, "hasta": hoy,
        "resumen": [{"nombre": "Ana Ruiz", "email": "ana@tlterminals.com",
                     "numeroNomina": "1024", "area": "Operación", "comidas": 1,
                     "importe": 65, "excepciones": 0},
                    {"nombre": "Beto Lara", "email": "beto@tlterminals.com",
                     "numeroNomina": "1025", "area": "Patio", "comidas": 0,
                     "importe": 0, "excepciones": 1}],
        "detalle": [], "total": 65, "empleados": 2, "excepciones": 1},
    "apiTarifasDe": [{"id": "t1", "platilloId": "", "modo": "descuento_pct",
                      "valor": 50, "desde": hoy, "hasta": ""}],
    "apiMensajeWhatsApp": {"texto": "*Comedor TLTERMINALS*\nMilanesa de res",
                           "ligaWhatsApp": "https://wa.me/?text=hola"},
    "apiExportarCobros": {"url": "https://docs.google.com/spreadsheets/d/X",
                          "nombre": "Cobros de prueba"},
}

NOMBRES = [
    "apiEstadoInicial", "apiGuardarPedido", "apiCancelarPedido", "apiMisPedidos",
    "apiPedidosDelDia", "apiResumenProduccion", "apiMarcarEntregados", "apiMensajeWhatsApp",
    "apiCondonar", "apiEliminarPedido", "apiPedidoExpreso", "apiMenuAdmin", "apiAdminEstado",
    "apiCrearMenu", "apiDuplicarMenu", "apiActualizarMenu", "apiPublicarMenu",
    "apiAgregarAlMenu", "apiQuitarDelMenu", "apiCambiarDisponible", "apiGuardarPlatillo",
    "apiGuardarEmpleado", "apiCambiarEstadoEmpleado", "apiInvitar", "apiTarifasDe",
    "apiGuardarTarifa", "apiBorrarTarifa", "apiReporteCobros", "apiExportarCobros",
    "apiGuardarConfig", "apiRegenerarLiga", "apiSubirFoto",
]

MOCK = """
<script>
window.__errores = [];
window.onerror = function (m, u, l) { window.__errores.push(m + ' @linea ' + l); };
var RESPUESTAS = __DATOS__;
var NOMBRES = __NOMBRES__;
function Corredor() { this.__ok = null; this.__mal = null; }
Corredor.prototype.withSuccessHandler = function (f) { this.__ok = f; return this; };
Corredor.prototype.withFailureHandler = function (f) { this.__mal = f; return this; };
window.__retardo = 0;
Corredor.prototype.ejecutar = function (token, nombre, args) {
  var self = this;
  if (NOMBRES.indexOf(nombre) === -1) {
    window.__errores.push('funcion no declarada en el despachador: ' + nombre);
  }
  var datos = RESPUESTAS.hasOwnProperty(nombre) ? RESPUESTAS[nombre] : true;
  setTimeout(function () { self.__ok(JSON.parse(JSON.stringify(datos))); }, window.__retardo);
};
window.__idsRepetidos = function () {
  var vistos = {};
  var repetidos = [];
  var nodos = document.querySelectorAll('[id]');
  for (var i = 0; i < nodos.length; i++) {
    var id = nodos[i].id;
    if (vistos[id]) { repetidos.push(id); } else { vistos[id] = true; }
  }
  return repetidos;
};
window.google = { script: {} };
Object.defineProperty(window.google.script, 'run', {
  get: function () { return new Corredor(); }
});
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
        sonda = """
<script>
// Los fallos del servidor no llegan como excepción: se muestran como aviso
// rojo. Sin envolver avisar(), la sonda no los ve.
var avisarOriginal = window.avisar;
window.avisar = function (mensaje, malo) {
  if (malo) { window.__errores.push('aviso de error: ' + mensaje); }
  return avisarOriginal.apply(null, arguments);
};

setTimeout(function () {
  var vistas = ['pedir', 'mios', 'hoy', 'menu', 'platillos', 'empleados', 'reportes', 'ajustes'];
  var i = 0;
  function siguiente() {
    if (i >= vistas.length) {
      try {
        abrirFormulario(estado.inicial.dias[0].fecha);
        if (!document.getElementById('guardar')) {
          window.__errores.push('el formulario de pedido no se armo');
        }
        var repetidos = window.__idsRepetidos();
        if (repetidos.length) {
          window.__errores.push('el formulario repite ids: ' + repetidos.join(', '));
        }
      } catch (e) { window.__errores.push('formulario: ' + e.message); }

      // Carrera: se pide una vista lenta y se cambia de pestaña antes de que
      // llegue la respuesta. Era lo que producía el error de innerHTML.
      window.__retardo = 400;
      try {
        estado.vista = 'menu'; pintarBarra(); pintar();
        setTimeout(function () { estado.vista = 'reportes'; pintarBarra(); pintar(); }, 40);
        setTimeout(function () { estado.vista = 'pedir'; pintarBarra(); pintar(); }, 90);
      } catch (e) { window.__errores.push('carrera: ' + e.message); }

      setTimeout(function () {
        document.body.innerHTML = '<pre id="salida">'
          + (window.__errores.length ? window.__errores.join('\\n') : 'SIN ERRORES') + '</pre>';
      }, 1200);
      return;
    }
    var v = vistas[i++];
    try {
      estado.vista = v;
      estado.borrador = null;
      pintarBarra();
      pintar();
      setTimeout(function () {
        if (document.getElementById('vista').innerHTML.length < 40) {
          window.__errores.push('la vista ' + v + ' quedo vacia');
        }
        var repetidos = window.__idsRepetidos();
        if (repetidos.length) {
          window.__errores.push('la vista ' + v + ' repite ids: ' + repetidos.join(', '));
        }
        siguiente();
      }, 160);
    } catch (e) {
      window.__errores.push('vista ' + v + ': ' + e.message);
      siguiente();
    }
  }
  siguiente();
}, 700);
</script>
"""
        pagina = pagina.replace("</body>", sonda + "</body>")
    return pagina


(SALIDA / "ui.html").write_text(armar(False), encoding="utf-8")
(SALIDA / "ui-sonda.html").write_text(armar(True), encoding="utf-8")
print("listas: ui.html y ui-sonda.html")
