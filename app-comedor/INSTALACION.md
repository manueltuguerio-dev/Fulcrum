# TLTERMINALS · Comedor — instalación de la aplicación

Aplicación web funcional para pedir y controlar las comidas del comedor, sobre
Google Apps Script con Google Sheets como base de datos.

Tiempo estimado: 20 minutos.

---

## Antes de empezar: dos cosas que debes saber

### 1. La identificación es con cuenta de Google, no con contraseña

No hay registro con correo y contraseña. Cada quien entra con su cuenta de
Google y la aplicación lo reconoce por su correo. Guardar contraseñas en una
hoja de cálculo sería inseguro, y Apps Script ya trae identificación integrada.

En la práctica: **el Admin da de alta el correo, la persona entra con Google.**

### 2. Necesitas Google Workspace con dominio propio

Esta es la limitación importante. Apps Script solo revela el correo de quien
entra si esa persona pertenece **al mismo dominio de Workspace** que la cuenta
que publicó la aplicación.

| Situación | ¿Funciona? |
|---|---|
| Todos con correo `@tlterminals.com` en Workspace | Sí, sin nada extra |
| Cuentas personales de Gmail | No: la app no puede saber quién entró |

Si el personal usa Gmail personal, la aplicación mostrará "no pude identificar
tu cuenta". No es un error de instalación: es cómo funciona Apps Script. En ese
caso hay dos caminos: contratar Workspace, o construir el sistema sobre la
arquitectura con PostgreSQL del documento de diseño, que sí maneja contraseñas
propias.

---

## Archivos que se suben

Ocho archivos, en `app-comedor/`:

| Archivo | Tipo en Apps Script | Qué es |
|---|---|---|
| `Code.gs` | Secuencia de comandos | Entrada, instalación y verificación |
| `Db.gs` | Secuencia de comandos | La hoja de cálculo como base de datos |
| `Api.gs` | Secuencia de comandos | Menú, pedidos y reglas de negocio |
| `Admin.gs` | Secuencia de comandos | Empleados, platillos, menús, cobros |
| `Reportes.gs` | Secuencia de comandos | Producción del día y cobros |
| `Jobs.gs` | Secuencia de comandos | Recordatorio y cierre automático |
| `Index.html` | HTML | Estructura de la página |
| `Estilos.html` | HTML | Apariencia |
| `Cliente.html` | HTML | La interfaz y su lógica |

Los `.gs` van en archivos de tipo **Secuencia de comandos**; los `.html` en
archivos de tipo **HTML**. Nómbralos exactamente igual, **sin escribir la
extensión** — Apps Script la agrega sola.

---

## Paso 1 · Crear el proyecto

1. Entra a <https://script.google.com> con la cuenta de Google que va a ser
   dueña del sistema. Esa cuenta queda como administradora.
2. **Nuevo proyecto**. Ponle nombre: `Comedor TLTERMINALS`.

## Paso 2 · Pegar los archivos

1. En `Código.gs`, borra todo y pega el contenido de `Code.gs`.
2. Para cada uno de los otros cinco `.gs`: **+** junto a *Archivos* →
   **Secuencia de comandos** → nómbralo (`Db`, `Api`, `Admin`, `Reportes`,
   `Jobs`) → pega su contenido.
3. Para los tres `.html`: **+** → **HTML** → nómbralo (`Index`, `Estilos`,
   `Cliente`) → pega su contenido.
4. Guarda con `Ctrl+S`.

> Si al pegar sale `SyntaxError: Unexpected token '<'`, pegaste un archivo HTML
> dentro de uno de secuencia de comandos. Los `.gs` empiezan con `/**`; los
> `.html` empiezan con `<`.

## Paso 3 · Manifiesto

1. ⚙️ **Configuración del proyecto** → activa *Mostrar el archivo de manifiesto
   "appsscript.json"*.
2. Regresa al editor, abre `appsscript.json` y pega el contenido del archivo del
   mismo nombre. Ahí van la zona horaria y los permisos que la app necesita.

## Paso 4 · Crear la base de datos

1. En la barra de funciones elige **`instalar`** y presiona **▷ Ejecutar**.
2. Autoriza cuando lo pida: *Configuración avanzada* → *Ir a Comedor TLTERMINALS
   (no seguro)* → *Permitir*. Es tu propio script; la advertencia es normal.
3. En el registro aparece la liga de la hoja de cálculo que se creó. Ábrela y
   guárdala: ahí vive toda la información.

Esto crea nueve pestañas y **te deja registrado como administrador**.

Opcional, para probar de inmediato: ejecuta **`cargarEjemplo`**, que carga diez
platillos de muestra. Solo funciona si el catálogo está vacío.

## Paso 5 · Publicar

1. **Implementar** → **Nueva implementación** → ⚙️ → **Aplicación web**.
2. Configura así, y esto importa:
   - **Ejecutar como:** *Yo*
   - **Quién tiene acceso:** *Usuarios de TLTERMINALS* (tu dominio de Workspace)

   Con *Cualquier usuario* la aplicación **no puede saber quién entró** y nadie
   podrá pedir. Tiene que ser la opción del dominio.
3. **Implementar** y copia la URL que termina en `/exec`. Esa es la liga del
   comedor.

## Paso 6 · Programar los avisos

Ejecuta **`instalarDisparadores`** desde el editor. Deja dos tareas corriendo
cada 15 minutos:

- **Recordatorio:** correo a quien no ha pedido cuando faltan menos de 60
  minutos para la hora corte. Un solo aviso por persona y día.
- **Cierre:** al pasar la hora corte cierra el menú, registra "no come" a los
  omisos y manda al Admin el resumen del día.

## Paso 7 · Comprobar

Ejecuta **`verificar`**. El registro debe decir `OK — todo listo` junto con el
conteo de empleados, platillos y pedidos, y la liga de la aplicación.

---

## Primeros pasos dentro de la aplicación

1. Abre la liga `/exec`. Entras como administrador.
2. **Platillos** — da de alta lo que se sirve. En cada uno defines tipo
   (principal, base, complemento, salsa), precio, si permite complementos, y si
   se agrega solo a cada menú nuevo. La foto se pone con una liga; sirve
   cualquier imagen pública.
3. **Empleados** — registra a la gente con su correo de Google exacto. El botón
   *Invitar* les manda un correo con la liga.
4. **Menú** — elige la fecha, agrega platillos, pon la hora corte y **Publicar**.
   Hasta que no publiques, nadie puede pedir.
5. **Del día** — pásale el mensaje de WhatsApp al grupo, revisa quién no ha
   pedido, registra pedidos expreso y marca las entregas.
6. **Reportes** — elige el rango y exporta. Se genera una hoja de cálculo nueva
   con dos pestañas: *Resumen* por empleado y *Detalle* por pedido.

---

## Reglas que la aplicación hace cumplir

- Se pide solo para **hoy y mañana**, y solo si el menú está publicado.
- **Un pedido vigente por persona y día.** Editar reemplaza, no duplica.
- **Un principal o base, hasta dos complementos** (configurable), las salsas que
  quiera, y un comentario libre.
- Un platillo marcado como que **no permite complementos** no los acepta.
- Pasada la **hora corte** el empleado ya no puede pedir, editar ni cancelar.
  Solo el Admin, y todo queda en la bitácora.
- Quien no pidió queda como **no come**, que es un registro, no un vacío.
- **Se cobra lo confirmado**, incluso si no pasaron por su comida, salvo que el
  Admin condone con motivo.
- Las **tarifas personalizadas** se aplican en este orden: tarifa del empleado
  para ese platillo, tarifa general del empleado, precio del día, precio base.
- **Baja lógica:** un empleado inactivo no entra ni aparece, pero su historial y
  sus cobros se conservan y se siguen exportando.

---

## Cuotas de Google que conviene tener presentes

| Recurso | Cuenta gratuita | Workspace |
|---|---|---|
| Correos por día | 100 | 1,500 |
| Tiempo de ejecución por llamada | 6 min | 30 min |

Con una sede de hasta unos 200 empleados no hay problema. El recordatorio manda
un correo por persona y día, así que el límite práctico es el de correos.

---

## Solución de problemas

| Qué ves | Por qué | Cómo se arregla |
|---|---|---|
| "No pude identificar tu cuenta" | Se publicó con acceso *Cualquier usuario*, o la persona no es del dominio | Vuelve a implementar con acceso del dominio. Ver el punto 2 del inicio |
| "Tu correo no está dado de alta" | El correo con el que entró no coincide con el registrado | Revisa en **Empleados** que el correo esté escrito exacto |
| `SyntaxError: Unexpected token '<'` | Un archivo HTML se pegó en uno de secuencia de comandos | Los `.gs` empiezan con `/**`, los `.html` con `<` |
| `No HTML file named Index` | Falta un archivo HTML o tiene otro nombre | Deben existir `Index`, `Estilos` y `Cliente`, sin la extensión en el nombre |
| Nadie recibe recordatorios | Faltan los disparadores | Ejecuta `instalarDisparadores` |
| Los cambios no se ven | Se publicó, pero no una versión nueva | *Administrar implementaciones* → ✏️ → **Versión nueva** |
| El menú no deja pedir | Está en borrador | **Menú** → **Publicar** |

---

## Cómo se probó

La lógica del servidor corre contra un simulador del entorno de Apps Script con
**61 pruebas automáticas**, que cubren instalación, alta de empleados, armado
del menú, hora corte, reglas del pedido, tarifas con descuento, cancelación,
pedido expreso, entrega masiva, condonación, baja y reactivación, permisos por
rol, cierre automático, mensaje de WhatsApp y exportación a hoja de cálculo.

La interfaz se ejercitó en Chromium recorriendo sus ocho vistas más el
formulario de pedido, verificando que ninguna produzca errores de JavaScript.

Ninguna de las dos cosas sustituye una prueba real con gente pidiendo comida.
Corre una semana en paralelo con el método actual antes de depender solo de
esto.
