#!/usr/bin/env bash
# Publica NutriApp en Google Apps Script.
#
#   bash apps-script/nutriapp/desplegar.sh ["descripción de la versión"]
#
# Requiere clasp instalado y con sesión iniciada:
#   npm install -g @google/clasp && clasp login
#
# La primera vez, antes de correr esto:
#   clasp create --type webapp --title "NutriApp" --rootDir apps-script/nutriapp
# y después ejecuta setupDatabase() una vez desde el editor de Apps Script.

set -euo pipefail

CARPETA="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESCRIPCION="${1:-NutriApp $(date +%Y-%m-%d\ %H:%M)}"

cd "$CARPETA"

if [ ! -f .clasp.json ]; then
  echo "Falta .clasp.json en $CARPETA."
  echo "Créalo con:  clasp create --type webapp --title \"NutriApp\" --rootDir $CARPETA"
  echo "O copia .clasp.json.ejemplo y pon ahí el scriptId de tu proyecto."
  exit 1
fi

echo "Probando el backend antes de subir…"
node pruebas/prueba.js

echo
echo "1/3 · Subiendo el código a Apps Script"
clasp push --force

echo
echo "2/3 · Publicando la versión: $DESCRIPCION"
clasp deploy --description "$DESCRIPCION"

echo
echo "3/3 · Abriendo la aplicación en el navegador"
clasp open --webapp
