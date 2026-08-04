"""Arma el ZIP que se instala en Google Apps Script.

Junta los archivos que van al editor, genera la versión de todo-en-uno para
quien prefiera pegar una sola vez, y agrega las plantillas de importación.

    python3 armar_paquete.py

Deja `TARIFARIOS-appscript.zip` en esta carpeta. Vuelve a correrlo cada vez que
cambie el código: el ZIP no se versiona, se regenera.
"""
import json
import pathlib
import subprocess
import zipfile

RAIZ = pathlib.Path(__file__).resolve().parent
SALIDA = RAIZ / "TARIFARIOS-appscript.zip"

# Los diez archivos de código, en el orden en que Apps Script los carga.
CODIGO = ["Db.gs", "Sesion.gs", "TipoCambio.gs", "Campos.gs", "Catalogos.gs",
          "Tarifas.gs", "Comparador.gs", "Importar.gs", "Exportar.gs", "Code.gs"]
PAGINAS = ["Index.html", "Estilos.html", "Cliente.html"]

CABEZA_UNICO = """/**
 * TLTERMINALS · Tarifarios de transportistas — TODO EL CÓDIGO EN UN ARCHIVO.
 *
 * Son los diez archivos .gs del proyecto, uno tras otro, en el mismo orden en
 * que se cargan. Apps Script no distingue entre un archivo y diez —todos
 * comparten el mismo espacio—, así que funciona igual.
 *
 * Úsalo si quieres instalar rápido. Si más adelante vas a darle mantenimiento,
 * conviene más la versión de diez archivos: es la que está en el repositorio y
 * así los cambios se pueden comparar archivo por archivo.
 *
 * Para instalar, ejecuta desde el editor:
 *   1. instalar()       crea la hoja de cálculo y te deja como administrador
 *   2. cargarEjemplo()  opcional: datos de prueba para ver el comparador andando
 * y luego publica: Implementar > Nueva implementación > Aplicación web.
 */
"""

LEEME = """TLTERMINALS · TARIFARIOS DE TRANSPORTISTAS
Paquete de instalación para Google Apps Script

QUÉ HAY AQUÍ

  INSTALACION.md          El instructivo completo, paso a paso. Empieza por ahí.

  opcion-A-diez-archivos/ Los archivos tal como están en el proyecto.
                          Son 14: diez de código (.gs), tres páginas (.html) y
                          el manifiesto. Es la opción recomendada si alguien va
                          a darle mantenimiento después.

  opcion-B-un-archivo/    Lo mismo, pero todo el código junto en Codigo.gs.
                          Son 5 archivos en vez de 14. Instala más rápido y
                          hay menos manera de equivocarse al pegar.

  plantillas/             CSV de ejemplo con las columnas que el sistema
                          entiende. Sirven para pedirle su tarifario a un
                          transportista: "llénalo aquí".

ELIGE UNA SOLA OPCIÓN, A o B. No las mezcles: cargarías el mismo código dos
veces y Apps Script marcaría funciones repetidas.

LO MÍNIMO PARA ARRANCAR

  1. script.google.com > Nuevo proyecto.
  2. Pega los archivos de la opción que elegiste (cada .gs en un archivo de
     código, cada .html en un archivo HTML CON EL MISMO NOMBRE, sin extensión).
  3. Engrane > muestra appsscript.json > pega el manifiesto.
  4. Ejecuta la función  instalar()  y acepta los permisos.
  5. Ejecuta  cargarEjemplo()  si quieres ver el comparador con datos.
  6. Implementar > Nueva implementación > Aplicación web:
       Ejecutar como: Yo
       Quién tiene acceso: Cualquier persona
  7. Abre la liga que te da. Listo.

El paso 3 es el que más se olvida y sin él la aplicación no abre.

Los nombres de los archivos HTML tienen que ser exactamente Index, Estilos y
Cliente: el código los busca por nombre.
"""


def leer(nombre):
    return (RAIZ / nombre).read_text(encoding="utf-8")


def todo_en_uno():
    partes = [CABEZA_UNICO]
    for nombre in CODIGO:
        partes.append(
            "\n\n/* " + "=" * 74 + "\n"
            "   " + nombre + "\n"
            "   " + "=" * 74 + " */\n\n"
            + leer(nombre).rstrip() + "\n"
        )
    return "".join(partes)


def plantillas():
    """Los CSV de ejemplo, pedidos al propio código.

    Se generan corriendo apiPlantilla() sobre el simulador en vez de copiarlas
    aquí: una copia a mano se desviaría del código en cuanto alguien agregue una
    columna o un campo propio, y el transportista llenaría la plantilla
    equivocada.
    """
    guion = (
        "require('./pruebas/simulador.js');"
        "instalar();"
        "var salida = {};"
        "['tarifas', 'proveedores', 'rutas'].forEach(function (t) {"
        "  var p = apiPlantilla(t);"
        "  salida[p.nombre] = p.contenido;"
        "});"
        "console.log(JSON.stringify(salida));"
    )
    try:
        hecho = subprocess.run(["node", "-e", guion], cwd=RAIZ, check=True,
                               capture_output=True, text=True)
    except (OSError, subprocess.CalledProcessError) as error:
        detalle = getattr(error, "stderr", "") or str(error)
        raise SystemExit("No pude generar las plantillas con node.\n"
                         "Instala Node o corre el script desde una máquina que lo tenga.\n"
                         + detalle.strip())
    return json.loads(hecho.stdout)


def armar():
    unico = todo_en_uno()

    with zipfile.ZipFile(SALIDA, "w", zipfile.ZIP_DEFLATED) as zip_archivo:
        zip_archivo.writestr("LEEME-PRIMERO.txt", LEEME)
        zip_archivo.writestr("INSTALACION.md", leer("INSTALACION.md"))

        for nombre in CODIGO + PAGINAS + ["appsscript.json"]:
            zip_archivo.writestr("opcion-A-diez-archivos/" + nombre, leer(nombre))

        zip_archivo.writestr("opcion-B-un-archivo/Codigo.gs", unico)
        for nombre in PAGINAS + ["appsscript.json"]:
            zip_archivo.writestr("opcion-B-un-archivo/" + nombre, leer(nombre))

        for nombre, contenido in plantillas().items():
            zip_archivo.writestr("plantillas/" + nombre, contenido)

    # El de un solo archivo también queda suelto, por si alguien solo quiere ese.
    (RAIZ / "Codigo-todo-en-uno.gs").write_text(unico, encoding="utf-8")

    print("listo: " + SALIDA.name + " (" + str(SALIDA.stat().st_size // 1024) + " KB)")
    print("       Codigo-todo-en-uno.gs (" + str(unico.count(chr(10))) + " líneas)")


if __name__ == "__main__":
    armar()
