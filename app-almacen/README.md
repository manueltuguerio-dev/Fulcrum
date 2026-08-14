# Almacén TLTERMINALS — registro de tiempos de maniobra (WMS-Lite)

Aplicación web sobre **Google Apps Script** para cronometrar maniobras de patio
y almacén: arranque, pausas con causa de demora, reanudación y cierre, con
cálculo automático de tiempo total, demora, tiempo efectivo y minutos por pieza,
más semáforo de SLA. Los datos viven en Google Sheets y las fotos en Drive.

Sigue la misma arquitectura que `app-comedor`: HTML servido por `HtmlService`,
JavaScript puro sin dependencias externas (nada de CDNs), y la hoja de cálculo
como base de datos. Todas las llamadas del navegador pasan por un único
enrutador (`ejecutar`) con lista blanca de funciones.

## Estructura

| Archivo | Qué hace |
|---|---|
| `Code.gs` | Punto de entrada (`doGet`), enrutador `ejecutar`, `verificar`. |
| `Db.gs` | Hoja de cálculo como base de datos, CRUD y utilidades. |
| `Auth.gs` | Acceso por PIN / contraseña, sesiones con token y bitácora. |
| `Registro.gs` | Maniobras y cronómetro multietapa (el corazón). |
| `Catalogos.gs` | Listas desplegables y lectura de campos dinámicos. |
| `Master.gs` | Usuarios, roles, campos dinámicos, auditoría y ajustes. |
| `Fotos.gs` | Fotos de carga y daño, guardadas en Drive por folio. |
| `Index.html` | Cascarón de la página. |
| `Estilos.html` | Tema oscuro industrial, mobile-first. |
| `Cliente.html` | La aplicación de una sola página (SPA). |

## Roles

- **OPERATIVO** — entra con PIN de 4 dígitos. Solo ve el patio: inicia, pausa
  (con causa obligatoria), reanuda, cierra maniobras y sube fotos.
- **ADMINISTRADOR** — entra con correo y contraseña. Todo lo anterior más
  historial, edición de cualquier maniobra y gestión de catálogos.
- **MASTER** — además: usuarios y roles, reseteo de PIN, campos dinámicos del
  acta, bitácora de auditoría y ajustes (umbrales de SLA).

## Semáforo de SLA

Sobre el **tiempo total** de la maniobra, configurable en Ajustes:

- 🟢 Verde: ≤ 45 min
- 🟡 Ámbar: ≤ 90 min
- 🔴 Rojo: más de 90 min

## Instalación

1. Crea un proyecto en [script.google.com](https://script.google.com) y sube
   estos archivos (con [clasp](https://github.com/google/clasp) o pegándolos a
   mano; los `.html` se crean como archivos HTML con ese mismo nombre).
2. En el editor, ejecuta **`instalar()`**. Crea la hoja de cálculo, la carpeta
   en Drive y te deja como **MASTER** con la contraseña temporal `almacen`.
3. (Opcional) Ejecuta **`cargarEjemplo()`** para llenar los catálogos y probar
   de inmediato.
4. Ejecuta **`verificar()`** y revisa el registro (Ver > Registros).
5. Publica: **Implementar > Nueva implementación > Aplicación web**, ejecutar
   como *tú mismo*, con acceso *cualquiera*.
6. Entra con tu correo y la contraseña `almacen`, y cámbiala en **Ajustes**.
   Desde **Usuarios** da de alta a operativos (con PIN) y supervisores.

## Notas técnicas

- **El cronómetro es autoritativo en el servidor:** las marcas de tiempo se
  guardan en milisegundos en la hoja, así que recargar o cerrar el navegador no
  pierde el conteo. El cliente solo dibuja el tiempo a partir de esas marcas y
  corrige el desfase de reloj contra la hora del servidor.
- **PIN y contraseñas** se guardan con hash SHA-256 y sal por usuario. Un PIN de
  4 dígitos es débil por naturaleza; la sal solo evita verlo a simple vista.
- **Campos dinámicos:** el MASTER agrega columnas al acta sin tocar las fórmulas
  de la hoja; se guardan como JSON dentro de cada maniobra.
- **Auditoría:** cada cambio relevante queda en `LOG_AUDITORIA` con usuario,
  campo, valor anterior y valor nuevo.
