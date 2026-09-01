'use strict';
/**
 * Ajustes a nivel libro tras reescribir las hojas.
 *
 * Son los tres detalles que, si se olvidan, hacen que Excel abra el archivo con
 * datos viejos o marque el libro como danado:
 *  - los nombres definidos _FilterDatabase siguen apuntando al rango anterior;
 *  - la cadena de calculo (calcChain.xml) describe celdas que ya no existen;
 *  - sin fullCalcOnLoad, Excel confia en los valores en cache y no recalcula.
 */

/** Escapa el nombre de hoja como lo hace Excel dentro de un nombre definido. */
function sheetRef(name) {
  return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`;
}

/**
 * @param {Workbook} wb
 * @param {object} ranges  { 'Details': 'A8:J605', 'KB Supply': 'A9:AF3591' }
 */
async function finalizeWorkbook(wb, ranges = {}) {
  const notes = [];

  let xml = await wb.fileText('xl/workbook.xml');
  if (!xml) throw new Error('Falta xl/workbook.xml.');

  // 1. Nombres definidos del autofiltro.
  for (const [sheetName, ref] of Object.entries(ranges)) {
    const absolute = ref.replace(/([A-Z]+)(\d+)/g, '$$$1$$$2');
    const target = `${sheetRef(sheetName)}!${absolute}`;
    const idx = wb.sheets.findIndex((s) => s.name === sheetName);
    if (idx === -1) continue;
    const re = new RegExp(
      `(<definedName name="_xlnm\\._FilterDatabase" localSheetId="${idx}"[^>]*>)[^<]*(</definedName>)`
    );
    if (re.test(xml)) {
      xml = xml.replace(re, `$1${target}$2`);
      notes.push(`_FilterDatabase de "${sheetName}" ajustado a ${ref}`);
    }
  }

  // 2. Forzar recalculo al abrir.
  if (/<calcPr\b[^>]*\/>/.test(xml)) {
    xml = xml.replace(/<calcPr\b([^>]*)\/>/, (m, attrs) => {
      let a = attrs.replace(/\sfullCalcOnLoad="[^"]*"/, '');
      return `<calcPr${a} fullCalcOnLoad="1"/>`;
    });
  } else {
    xml = xml.replace('</workbook>', '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>');
  }
  notes.push('fullCalcOnLoad activado');

  wb.setFileText('xl/workbook.xml', xml);

  // 3. Quitar la cadena de calculo, junto con su override y su relacion.
  if (wb.file('xl/calcChain.xml')) {
    wb.removeFile('xl/calcChain.xml');
    const ct = await wb.fileText('[Content_Types].xml');
    if (ct) {
      wb.setFileText('[Content_Types].xml',
        ct.replace(/<Override[^>]*PartName="\/xl\/calcChain\.xml"[^>]*\/>/, ''));
    }
    const rels = await wb.fileText('xl/_rels/workbook.xml.rels');
    if (rels) {
      wb.setFileText('xl/_rels/workbook.xml.rels',
        rels.replace(/<Relationship[^>]*Target="calcChain\.xml"[^>]*\/>/, ''));
    }
    notes.push('calcChain.xml eliminado (Excel lo regenera)');
  }

  return notes;
}

module.exports = { finalizeWorkbook };
