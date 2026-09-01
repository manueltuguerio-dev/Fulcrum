'use strict';
/**
 * Conversión entre fechas y el número de serie de Excel (base 1900).
 * El libro usa fechas seriales en toda la fila 9 de "KB Supply" y en los
 * encabezados de SupplyPlan y GAPs files, así que todo el motor trabaja en
 * seriales y solo convierte para mostrar.
 */

const MS_PER_DAY = 86400000;
// Excel cuenta 1900 como bisiesto; el ancla que corrige ese desfase es
// 1899-12-30 = serial 0.
const EPOCH_UTC = Date.UTC(1899, 11, 30);

function serialToDate(serial) {
  return new Date(EPOCH_UTC + Math.round(serial) * MS_PER_DAY);
}

function dateToSerial(date) {
  return Math.round((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - EPOCH_UTC) / MS_PER_DAY);
}

/** "2026-09-01" -> serial */
function isoToSerial(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if (!m) return null;
  return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - EPOCH_UTC) / MS_PER_DAY);
}

/** serial -> "2026-09-01" */
function serialToIso(serial) {
  const d = serialToDate(serial);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

/** serial -> "01-sep-2026", para encabezados y correos */
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function serialToEs(serial) {
  const d = serialToDate(serial);
  return `${String(d.getUTCDate()).padStart(2, '0')}-${MESES[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
}

/** Último día del mes que contiene el serial dado. */
function endOfMonthSerial(serial) {
  const d = serialToDate(serial);
  return dateToSerial(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

/** Primer día del mes siguiente al que contiene el serial dado. */
function startOfNextMonthSerial(serial) {
  const d = serialToDate(serial);
  return dateToSerial(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)));
}

/** Serial de hoy en hora local del equipo. */
function todaySerial() {
  const now = new Date();
  return dateToSerial(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

module.exports = {
  serialToDate, dateToSerial, isoToSerial, serialToIso, serialToEs,
  endOfMonthSerial, startOfNextMonthSerial, todaySerial,
};
