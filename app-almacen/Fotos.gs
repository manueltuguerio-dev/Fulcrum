/**
 * TLTERMINALS · Almacén — fotos de carga y reportes de daño en Drive.
 *
 * El navegador manda la foto como data URL (base64). Se guarda en la carpeta
 * del folio dentro de Drive y en la maniobra queda la liga a la foto.
 */

/**
 * Sube una foto a la carpeta del folio y la anota en el detalle de daño /
 * enlaces de la maniobra.
 * @param {string} registroId Maniobra.
 * @param {Object} foto {nombre, tipo, dataUrl}
 * @param {string} etiqueta Texto corto: 'carga', 'daño', etc.
 */
function apiSubirFoto(registroId, foto, etiqueta) {
  var u = exigirSesion_();
  var r = buscarPorId_('REGISTRO', registroId);
  if (!r) {
    throw new Error('No encontré esa maniobra.');
  }
  foto = foto || {};
  var dataUrl = String(foto.dataUrl || '');
  var coma = dataUrl.indexOf(',');
  if (coma === -1) {
    throw new Error('La foto llegó incompleta.');
  }
  var base64 = dataUrl.substring(coma + 1);
  var tipo = String(foto.tipo || 'image/jpeg');
  var bytes = Utilities.base64Decode(base64);
  var sello = Utilities.formatDate(new Date(), zona_(), 'yyyyMMdd_HHmmss');
  var nombre = (String(etiqueta || 'foto') + '_' + sello + '_'
    + String(foto.nombre || 'img')).replace(/[^\w.\-]+/g, '_');

  var blob = Utilities.newBlob(bytes, tipo, nombre);
  var archivo = carpetaDeFolio_(r.folio).createFile(blob);
  try {
    archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (err) {
    // Si la política de Drive no permite compartir, la liga interna sigue sirviendo.
  }
  var liga = archivo.getUrl();

  var previo = String(r.detalleDano || '').trim();
  var linea = '[' + (etiqueta || 'foto') + '] ' + liga;
  var nuevo = previo ? previo + '\n' + linea : linea;
  var cambios = { detalleDano: nuevo, actualizado: ahora_() };
  if (String(etiqueta || '').toLowerCase().indexOf('dañ') !== -1
      || String(etiqueta || '').toLowerCase().indexOf('dan') !== -1) {
    cambios.danoManiobra = 'SI';
  }
  actualizar_('REGISTRO', r, cambios);
  auditar_(r.folio, u.nombre, 'foto', etiqueta || 'foto', '', liga);
  return { liga: liga, detalleDano: nuevo };
}
