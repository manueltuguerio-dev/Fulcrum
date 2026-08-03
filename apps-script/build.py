#!/usr/bin/env python3
"""Genera apps-script/Index.html a partir del documento fuente.

El archivo de docs/artifact/ se escribe para el visor de artifacts de
claude.ai, que aporta el esqueleto HTML, un reset de CSS y el interruptor
de tema. Apps Script no aporta nada de eso, así que este script envuelve
el mismo contenido con:

  - documento HTML completo (doctype, head, meta viewport)
  - reset mínimo
  - interruptor de tema propio, con la preferencia guardada
  - desplazamiento suave para el índice lateral

Todo el JavaScript es ES5 dentro de un <script> simple, sin módulos, sin
await de nivel superior y sin peticiones a servidores externos: HtmlService
sanea el HTML que sirve, y cualquiera de esas tres cosas puede hacer que
rechace el archivo con "Malformed HTML content".

Por la misma razón el resultado no lleva comentarios HTML: el documento
mezclaba comentarios con flechas "-->" en el texto de los diagramas, y esa
combinación es justamente la que rompe al parser.

Uso:  python3 apps-script/build.py
"""

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = ROOT / "docs" / "artifact" / "fulcrum-comedor.html"
TARGET = ROOT / "apps-script" / "Index.html"

EXTRA_CSS = """
  html { background: var(--ground); }

  *, *::before, *::after { box-sizing: border-box; }

  img, svg { max-width: 100%; height: auto; }

  #theme-toggle {
    position: fixed;
    top: 14px;
    right: 14px;
    z-index: 20;
    background: var(--surface);
    color: var(--ink-2);
    border: 1px solid var(--rule-strong);
    border-radius: 4px;
    padding: 7px 11px;
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
  }
  #theme-toggle:hover { color: var(--accent); border-color: var(--accent); }

  @media (max-width: 700px) {
    #theme-toggle { top: 10px; right: 10px; padding: 6px 9px; font-size: 10px; }
    .masthead { padding-top: 64px; }
  }

  @media print {
    #theme-toggle { display: none; }
    nav.toc { display: none; }
    .shell { max-width: none; }
    section { break-inside: avoid; }
  }
"""

EXTRA_HTML = """
<button id="theme-toggle" type="button">Modo oscuro</button>
"""

EXTRA_JS = """
<script>
(function () {
  var root = document.documentElement;
  var KEY = 'tlterminals-comedor-theme';
  var boton = document.getElementById('theme-toggle');

  function consulta(texto) {
    if (!window.matchMedia) { return false; }
    return window.matchMedia(texto).matches;
  }
  function guardado() {
    try { return window.localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function recordar(valor) {
    try { window.localStorage.setItem(KEY, valor); } catch (e) { return; }
  }
  function delSistema() {
    return consulta('(prefers-color-scheme: dark)') ? 'dark' : 'light';
  }
  function pintar(tema) {
    root.setAttribute('data-theme', tema);
    boton.textContent = tema === 'dark' ? 'Modo claro' : 'Modo oscuro';
  }

  pintar(guardado() || delSistema());

  boton.onclick = function () {
    var actual = root.getAttribute('data-theme') || delSistema();
    var siguiente = actual === 'dark' ? 'light' : 'dark';
    recordar(siguiente);
    pintar(siguiente);
  };

  var suave = consulta('(prefers-reduced-motion: reduce)') ? 'auto' : 'smooth';
  var enlaces = document.querySelectorAll('nav.toc a');
  for (var i = enlaces.length - 1; i >= 0; i--) {
    enlaces[i].onclick = function (evento) {
      var destino = document.getElementById(this.getAttribute('href').substring(1));
      if (!destino) { return; }
      evento.preventDefault();
      destino.scrollIntoView({ behavior: suave, block: 'start' });
    };
  }
})();
</script>
"""


def build() -> int:
    if not SOURCE.exists():
        print("No se encontró el documento fuente: " + str(SOURCE), file=sys.stderr)
        return 1

    raw = SOURCE.read_text(encoding="utf-8")

    title_match = re.search(r"<title>(.*?)</title>", raw, re.S)
    title = title_match.group(1).strip() if title_match else "Comedor empresarial"
    body = raw[: title_match.start()] + raw[title_match.end() :] if title_match else raw

    style_match = re.search(r"<style>.*?</style>", body, re.S)
    if not style_match:
        print("El documento fuente no trae bloque <style>.", file=sys.stderr)
        return 1
    style = style_match.group(0)
    markup = (body[: style_match.start()] + body[style_match.end() :]).strip()

    # Los comentarios HTML se eliminan: junto con flechas "-->" sueltas en el
    # texto son lo que hace que HtmlService rechace el archivo.
    markup = re.sub(r"[ \t]*<!--.*?-->\n?", "", markup, flags=re.S)

    style = style.replace("</style>", EXTRA_CSS + "</style>")

    page = "\n".join(
        [
            "<!DOCTYPE html>",
            '<html lang="es">',
            "<head>",
            '  <meta charset="utf-8" />',
            '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
            "  <title>" + title + "</title>",
            style,
            "</head>",
            "<body>",
            EXTRA_HTML.strip(),
            markup,
            EXTRA_JS.strip(),
            "</body>",
            "</html>",
            "",
        ]
    )

    problemas = []
    if "<!--" in page or "-->" in page:
        problemas.append("quedaron comentarios HTML o flechas '-->'")
    if "type=\"module\"" in page:
        problemas.append("quedó un script de tipo module")
    if re.search(r"https?://(?!www\.w3\.org)", page):
        problemas.append("quedó una referencia a un servidor externo")
    sueltos = len(re.findall(r"&(?!#?\w{1,8};)", page))
    if sueltos:
        problemas.append("quedaron %d '&' sin escapar" % sueltos)
    angulos = len(re.findall(r"<(?![/!a-zA-Z])", page))
    if angulos:
        problemas.append("quedaron %d '<' que no abren etiqueta" % angulos)
    for etiqueta in ["html", "head", "body", "style", "script", "div", "table", "section"]:
        abre = len(re.findall(r"<%s[\s>]" % etiqueta, page, re.I))
        cierra = len(re.findall(r"</%s>" % etiqueta, page, re.I))
        if abre != cierra:
            problemas.append("<%s> desbalanceada: %d abre, %d cierra" % (etiqueta, abre, cierra))

    if problemas:
        for p in problemas:
            print("ERROR: " + p, file=sys.stderr)
        return 1

    TARGET.write_text(page, encoding="utf-8")
    print("Escrito " + str(TARGET.relative_to(ROOT)))
    print("  " + str(len(page)) + " bytes, " + str(page.count("\n") + 1) + " líneas")
    print("  sin comentarios HTML, sin módulos, sin peticiones externas")
    return 0


if __name__ == "__main__":
    raise SystemExit(build())
