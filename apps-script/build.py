#!/usr/bin/env python3
"""Genera apps-script/Index.html a partir del documento fuente.

El archivo de docs/artifact/ se escribe para el visor de artifacts de
claude.ai, que aporta el esqueleto HTML, un reset de CSS, el interruptor
de tema y el renderizado nativo de Mermaid. Apps Script no aporta nada de
eso, así que este script envuelve el mismo contenido con:

  - documento HTML completo (doctype, head, meta viewport)
  - reset mínimo
  - interruptor de tema propio, con la preferencia guardada
  - Mermaid desde CDN, con el código del diagrama como respaldo legible
  - desplazamiento suave para el índice lateral

Uso:  python3 apps-script/build.py
"""

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = ROOT / "docs" / "artifact" / "fulcrum-comedor.html"
TARGET = ROOT / "apps-script" / "Index.html"

EXTRA_CSS = """
  /* --- Añadidos para Apps Script: reset y ajustes fuera del visor --- */

  html { background: var(--ground); }

  *, *::before, *::after { box-sizing: border-box; }

  img, svg { max-width: 100%; height: auto; }

  #theme-toggle {
    position: fixed;
    top: 14px;
    right: 14px;
    z-index: 20;
    display: inline-flex;
    align-items: center;
    gap: 7px;
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
    transition: color 120ms ease, border-color 120ms ease;
  }
  #theme-toggle:hover { color: var(--accent); border-color: var(--accent); }

  @media (max-width: 700px) {
    #theme-toggle { top: 10px; right: 10px; padding: 6px 9px; font-size: 10px; }
    .masthead { padding-top: 64px; }
  }

  /* Respaldo cuando Mermaid no carga: el código del diagrama queda legible. */
  pre.mermaid {
    font-family: var(--mono);
    font-size: 12px;
    line-height: 1.55;
    color: var(--ink-2);
    text-align: left;
    white-space: pre;
    margin: 0;
  }
  .diagram[data-state="pending"] pre.mermaid { visibility: hidden; }
  .diagram[data-state="ready"] pre.mermaid { text-align: center; }
  .diagram[data-state="failed"] pre.mermaid,
  .diagram[data-state="pending"] pre.mermaid {
    text-align: left;
    padding-left: 8px;
  }
  .diagram .fallback-note { display: none; }
  .diagram[data-state="failed"] .fallback-note {
    display: block;
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.05em;
    color: var(--ink-3);
    margin-bottom: 12px;
  }

  @media print {
    #theme-toggle { display: none; }
    .shell { max-width: none; }
    nav.toc { display: none; }
    section { break-inside: avoid; }
  }
"""

EXTRA_HTML = """
<button id="theme-toggle" type="button" aria-live="polite">
  <span id="theme-toggle-label">Tema</span>
</button>
"""

EXTRA_JS = r"""
<script>
  (function () {
    var root = document.documentElement;
    var KEY = 'fulcrum-comedor-theme';

    function stored() {
      try { return window.localStorage.getItem(KEY); } catch (e) { return null; }
    }
    function remember(value) {
      try { window.localStorage.setItem(KEY, value); } catch (e) { /* modo privado */ }
    }
    function systemTheme() {
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark' : 'light';
    }
    function current() {
      return root.getAttribute('data-theme') || systemTheme();
    }

    var label = document.getElementById('theme-toggle-label');
    function paint(theme) {
      root.setAttribute('data-theme', theme);
      label.textContent = theme === 'dark' ? 'Modo claro' : 'Modo oscuro';
      document.dispatchEvent(new CustomEvent('themechange', { detail: theme }));
    }

    paint(stored() || systemTheme());

    document.getElementById('theme-toggle').addEventListener('click', function () {
      var next = current() === 'dark' ? 'light' : 'dark';
      remember(next);
      paint(next);
    });

    // El índice lateral: desplazamiento suave sin tocar la URL del contenedor.
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.querySelectorAll('nav.toc a[href^="#"]').forEach(function (link) {
      link.addEventListener('click', function (event) {
        var target = document.getElementById(link.getAttribute('href').slice(1));
        if (!target) { return; }
        event.preventDefault();
        target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      });
    });
  })();
</script>

<script type="module">
  // Apps Script sí permite scripts externos. Si la red los bloquea, cada
  // diagrama muestra su propio código Mermaid, que sigue siendo legible.
  const blocks = Array.from(document.querySelectorAll('pre.mermaid'));
  blocks.forEach((block, i) => {
    block.dataset.source = block.textContent;
    block.id = block.id || 'mermaid-' + i;
    const box = block.closest('.diagram');
    if (box) {
      box.dataset.state = 'pending';
      const note = document.createElement('p');
      note.className = 'fallback-note';
      note.textContent = 'Diagrama en notación Mermaid — no se pudo cargar el visor.';
      box.insertBefore(note, block);
    }
  });

  const fail = () => blocks.forEach(b => {
    const box = b.closest('.diagram');
    if (box) { box.dataset.state = 'failed'; }
  });

  let mermaid;
  try {
    // Con timeout: si el CDN no responde ni falla, los diagramas no se
    // quedan invisibles esperando para siempre.
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 8000));
    const loaded = await Promise.race([
      import('https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs'),
      timeout
    ]);
    mermaid = loaded.default;
  } catch (error) {
    fail();
  }

  if (mermaid) {
    const draw = async () => {
      const dark = (document.documentElement.getAttribute('data-theme') ||
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';
      mermaid.initialize({
        startOnLoad: false,
        theme: dark ? 'dark' : 'neutral',
        securityLevel: 'strict',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
      });
      for (const block of blocks) {
        const box = block.closest('.diagram');
        try {
          const { svg } = await mermaid.render(block.id + '-svg', block.dataset.source);
          block.innerHTML = svg;
          if (box) { box.dataset.state = 'ready'; }
        } catch (error) {
          block.textContent = block.dataset.source;
          if (box) { box.dataset.state = 'failed'; }
        }
      }
    };

    await draw();
    document.addEventListener('themechange', draw);
  }
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

    TARGET.write_text(page, encoding="utf-8")
    print("Escrito " + str(TARGET.relative_to(ROOT)) + " (" + str(len(page)) + " bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(build())
