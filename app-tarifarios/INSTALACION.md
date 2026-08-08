# TLTERMINALS · Tarifarios de transportistas — Instalación

Sistema para tener en un solo lugar lo que cobra cada transportista por cada
ruta, y saber al instante quién conviene. Corre sobre Google Apps Script con
Google Sheets como base de datos: no hay servidor que pagar ni programa que
instalar.

Tiempo estimado: 15 minutos.

---

## Qué vas a tener

- **Alta de partners** (transportistas) con contacto, RFC y calificación.
- **Rutas** origen–destino, con kilómetros para calcular costo por kilómetro.
- **Tarifas** por ruta, **tipo de carga**, **tipo de unidad** —full, sencillo,
  FTL 53', torton, rabón, plataforma, low boy…— y **tipo de movimiento**
  —redondo u one way—, en pesos o en dólares, con vigencia.
- **Tipo de cambio del día** traído solo desde Google, para que las tarifas en
  dólares y las de pesos se comparen de verdad.
- **Campos propios**: las columnas que tu tarifario tiene y este sistema no
  traía —cuenta, revisión de tarifa, número de contrato—, con la opción de que
  separen la comparación.
- **Comparador**: por cada ruta y características, las opciones acomodadas de la
  mejor a la peor combinando precio y tiempo de entrega.
- **Apartado de mejores opciones**: una línea por ruta con quién gana, quién
  quedó en segundo y cuánto cuesta la diferencia.
- **Editar, duplicar, activar y eliminar** cualquier tarifa ya capturada.
- **Importar** tarifarios en CSV o pegados desde Excel, con revisión previa.
- **Exportar** a CSV o a una hoja de cálculo en Drive con el comparativo armado.

---

## Requisitos

- Una cuenta de Google (personal o de Workspace de TLTERMINALS).
- Los archivos de la carpeta `app-tarifarios/`, o el ZIP ya armado.

### El ZIP, si prefieres no andar buscando archivos

```bash
python3 armar_paquete.py
```

Deja `TARIFARIOS-appscript.zip` con todo lo que se pega en Apps Script, en dos
presentaciones —eliges una— más las plantillas de importación:

| Dentro del ZIP | Qué es |
|---|---|
| `opcion-A-diez-archivos/` | Los 14 archivos tal como están en el proyecto. Recomendada si alguien va a darle mantenimiento |
| `opcion-B-un-archivo/` | Lo mismo con todo el código junto en `Codigo.gs`: 5 archivos en vez de 14. Se instala más rápido |
| `plantillas/` | CSV de ejemplo para pedirle su tarifario a un transportista |

Las dos opciones son el mismo sistema y pasan las mismas pruebas. **Usa una
sola**: cargar las dos duplicaría cada función.

Si eliges la opción B, en el Paso 2 pegas un solo archivo en vez de diez; los
pasos 3 en adelante son iguales.

### Qué archivo va dónde

Es el error más común de esta instalación. Cada tipo de archivo va en un tipo
distinto dentro de Apps Script y **no son intercambiables**:

| Archivos | Su primera línea | Dónde van |
|---|---|---|
| `Code.gs`, `Db.gs`, `Sesion.gs`, `TipoCambio.gs`, `Campos.gs`, `Catalogos.gs`, `Tarifas.gs`, `Comparador.gs`, `Importar.gs`, `Exportar.gs` | `/**` | Archivos de **código** (ícono `<>`). Solo aceptan JavaScript |
| `Index.html`, `Estilos.html`, `Cliente.html` | `<!DOCTYPE html>` o `<style>` o `<script>` | Archivos **HTML**, con exactamente esos nombres |

Si al pegar ves `SyntaxError: Unexpected token '<'`, es que un HTML se pegó en un
archivo de código. Bórralo de ahí y ponlo donde va.

> **La carpeta `pruebas/` no se sube a Apps Script.** Corre en tu computadora y
> sirve para verificar la lógica sin desplegar. Ver *Anexo · Pruebas*.

---

## Paso 1 · Crear el proyecto

1. Entra a **<https://script.google.com>** con tu cuenta de Google.
2. Clic en **Nuevo proyecto**.
3. Arriba, donde dice *Proyecto sin título*, ponle nombre:
   `TLTERMINALS Tarifarios`.

---

## Paso 2 · Pegar los archivos de código

1. En el panel izquierdo, bajo **Archivos**, verás `Código.gs`. Haz clic en él,
   selecciona todo lo que tiene dentro y bórralo.
2. Abre `Code.gs` de esta carpeta, copia **todo** su contenido y pégalo ahí.
3. Para cada uno de los otros nueve archivos `.gs` —`Db`, `Sesion`, `TipoCambio`,
   `Campos`, `Catalogos`, `Tarifas`, `Comparador`, `Importar`, `Exportar`—: clic
   en el **+** junto a *Archivos*, elige **Secuencia de comandos**, ponle el
   nombre **sin la extensión** (`Db`, no `Db.gs`) y pega su contenido.
4. Guarda con `Ctrl+S` / `Cmd+S`.

---

## Paso 3 · Agregar las tres páginas

Para cada uno de `Index`, `Estilos` y `Cliente`:

1. Clic en el **+** junto a *Archivos* y elige **HTML**.
2. Ponle el nombre exacto: `Index`, `Estilos` o `Cliente` (sin `.html`).
3. Borra lo que traiga y pega el contenido del archivo correspondiente.
4. Guarda.

Los nombres tienen que ser esos: el código los busca por nombre.

---

## Paso 4 · Ajustar el manifiesto

1. Clic en el engrane (**Configuración del proyecto**), a la izquierda.
2. Marca **Mostrar el archivo de manifiesto "appsscript.json" en el editor**.
3. Vuelve a **Editor**, abre `appsscript.json` y reemplaza todo su contenido con
   el del archivo `appsscript.json` de esta carpeta.
4. Guarda.

---

## Paso 5 · Instalar

1. Arriba, en la lista de funciones, elige **`instalar`**.
2. Clic en **Ejecutar**.
3. Google va a pedirte permisos: **Revisar permisos** → tu cuenta → *Configuración
   avanzada* → *Ir a TLTERMINALS Tarifarios (no seguro)* → **Permitir**.
   Ese aviso sale porque el proyecto es tuyo y no está verificado por Google; es
   normal.
4. En el registro de ejecución verás la liga de la hoja de cálculo que se creó.
   Ahí viven todos los datos, en la carpeta *Tarifarios TLTERMINALS* de tu Drive.

Quien ejecuta `instalar()` queda como **administrador**.

### Datos de ejemplo (opcional pero recomendado)

Elige la función **`cargarEjemplo`** y ejecútala: carga cuatro transportistas,
tres rutas y quince tarifas para ver el comparador funcionando de inmediato.
Después puedes borrar esos renglones desde la aplicación o desde la hoja.

---

## Paso 6 · Publicar

1. Arriba a la derecha: **Implementar** → **Nueva implementación**.
2. En el engrane, elige **Aplicación web**.
3. Configura:
   - *Ejecutar como*: **Yo**.
   - *Quién tiene acceso*: **Cualquier persona**.
     Suena abierto, pero no lo es: la aplicación solo deja entrar a los correos
     dados de alta o a quien traiga su liga personal. Este ajuste es lo que
     permite que entren correos externos.
4. Clic en **Implementar** y copia la **URL de la aplicación web**.

Abre esa liga: ya deberías ver los tarifarios.

---

## Paso 7 · Sacar tu liga personal

**Este paso no se puede saltar.** La aplicación está publicada para "cualquier
persona", y en ese modo Google no le dice al script quién entró: por eso cada
quien entra con una liga personal que termina en `?t=` y una clave.

1. En la lista de funciones elige **`miLiga`**.
2. Clic en **Ejecutar**.
3. En el registro aparece tu liga. Ábrela y guárdala en favoritos.

Si abres la liga de la aplicación sin el `?t=…`, verás la pantalla *Necesitas tu
liga personal*: es correcto, no está roto.

Para darle acceso a alguien más, desde la aplicación: **Ajustes** → *Dar de alta
usuario* → botón **Invitar**, que le manda su liga por correo. Si prefieres
pasarla por WhatsApp, usa **Ver liga**.

---

## Paso 8 · Comprobar

Con la función **`verificar`** desde el editor. En el registro te dice si algo
falta, y te repite la liga de la aplicación y la tuya.

---

## Cómo se usa

### Dar de alta un transportista

Pestaña **Proveedores** → *Dar de alta proveedor*. Solo el nombre es
obligatorio. La calificación (0 a 5) se usa para desempatar cuando dos
proveedores quedan iguales en precio y en tiempo.

### Capturar una tarifa

Pestaña **Tarifas** → *Nueva tarifa*. Lo obligatorio es poco: partner, ruta,
tipo de carga, tipo de unidad, tipo de movimiento y tarifa. Todo lo demás es
opcional.

| Campo | Para qué |
|---|---|
| Tarifa | El flete, en pesos o en dólares |
| Combustible % | Sobrecargo sobre la tarifa |
| Casetas, maniobras, otros | Cargos fijos que se suman |
| Tiempo de entrega (horas) | **Opcional.** Si no lo capturas, esa comparación se ordena solo por precio |
| Capacidad (ton) | Para filtrar por peso |
| Vigencia | Vacía significa abierta: vale hasta que alguien la cambie |

El **costo total** que se compara es:
`tarifa + (tarifa × combustible %) + casetas + maniobras + otros`, convertido a
la moneda base con el tipo de cambio del día. Mientras capturas, abajo del
formulario se ve el costo total que va quedando.

Editar, duplicar, desactivar y borrar están en cada renglón de la tabla.
**Duplicar** sirve para capturar la tarifa del año que entra sin volver a
teclear todo: la copia nace inactiva y sin vigencia, para que no compita hasta
que la revises.

### Tarifas en dólares

Captura la tarifa tal como te la dieron y marca la moneda en **USD**. El
sistema la convierte a la moneda base para comparar, y en pantalla siempre dice
con qué tipo de cambio lo hizo (`USD × 17.42`).

El tipo de cambio se trae solo de Google una vez al día —eso es lo que hace la
casilla *Traer el tipo de cambio del día solo* en **Ajustes**—. Si prefieres
fijarlo tú, desmarca la casilla y captura el número: a partir de ahí manda el
tuyo. El botón *Actualizar tipo de cambio ahora* lo consulta en el momento.

> Si Google no responde, el sistema **no deja de comparar**: sigue con el último
> tipo de cambio que consiguió y lo dice en pantalla.

### Campos propios

Pestaña **Campos propios**. Sirven para las columnas que tu tarifario tiene y
este sistema no traía. Vienen dos de fábrica: **Cuenta** y **Revisión de
tarifa**.

Cada campo tiene un tipo —texto, número, fecha, lista de opciones o sí/no— y
una casilla importante: **separa la comparación**. Si la marcas, dos tarifas con
distinto valor en ese campo dejan de competir entre sí. Ejemplo: si marcas
*Cuenta*, la tarifa de la cuenta TUNY no se compara contra la de otra cuenta,
aunque sean la misma ruta y la misma unidad.

Los campos propios se capturan en la tarifa, **se importan solos** si el archivo
trae una columna con ese nombre, y salen como columnas en las exportaciones.

### Comparar

Pestaña **Comparar**: eliges ruta, tipo de carga, tipo de unidad y tipo de
movimiento, y salen las opciones de la mejor a la peor. La barra *Qué pesa más*
mueve el criterio entre precio y tiempo sin guardar nada: es para tantear en una
negociación.

Solo compiten entre sí las tarifas que comparten **ruta + carga + unidad +
movimiento** (más los campos propios marcados como separadores). Un one way no
se compara contra un redondo, ni un full contra un sencillo.

El **puntaje** va de 0 a 100 y es relativo a lo que hay en esa ruta: la opción
más barata y más rápida saca 100, la más cara y más lenta saca 0. No compares
puntajes entre rutas distintas.

**Si las tarifas de una ruta no traen tiempo de entrega**, esa comparación se
ordena solo por precio y lo dice con un aviso. No se inventa un tiempo ni se
castiga a nadie por no tenerlo.

### Filtrar

Todo lo que clasifica una tarifa tiene su filtro, y se combinan entre sí (se
suman, no se reemplazan). Los de pocas opciones son **botones**; los de listas
largas, menús.

| Pantalla | Filtros |
|---|---|
| Comparar y Mejores opciones | Ruta · Partner · Tipo de carga · Tipo de unidad · **Movimiento** · **Moneda** · **Ordenar por** · Vigente al día · Buscar · Campos propios · Incluir fuera de vigencia · Peso precio/tiempo |
| Tarifas | Ruta · Partner · Tipo de carga · Tipo de unidad · **Movimiento** · **Moneda** · **Situación** · Buscar · Campos propios |
| Proveedores | Buscar (nombre, RFC, contacto, ciudad) · **Situación** · Campos propios |
| Rutas | Buscar (origen, destino, notas) · **Situación** |

Los botones de **Situación** en Tarifas son atajos a las preguntas de todos los
días: *Vigentes hoy*, *Por vencer*, *Vencidas*, *Inactivas* y *Sin tiempo* —esta
última para saber a qué tarifas les falta capturar el tiempo de entrega—.

Cada campo propio que agregues aparece solo como filtro: los de lista y sí/no
como menú, los de texto como caja de búsqueda.

**Lo que exportas respeta los filtros que tengas puestos**, así que se puede
sacar un CSV de "solo las tarifas en dólares de esta ruta" sin recortar nada a
mano. El botón *Limpiar filtros* los quita todos de un golpe.

### Importar un tarifario

Pestaña **Importar y exportar**. Sube el CSV o pega el contenido copiado de
Excel. Reconoce comas, punto y coma y tabuladores, y los nombres de columna del
tarifario ejecutivo tal como están —`PARTNER`, `TIPO DE CARGA`, `TIPO DE
MOVIMIENTO`, `TIPO DE UNIDAD`, `MONEDA`, `TARIFA`, `VIGENCIA HASTA`, `NOTAS`,
`REVISIÓN DE TARIFA`—, además de los alias más comunes (`Flete`, `FSC`,
`Transportista`). Entiende `$12,500.00` y fechas `31/12/2026`.

> Para subir un Excel: abre la hoja **Tarifario Ejecutivo**, *Archivo → Descargar
> → CSV*, y sube ese archivo. O selecciona el rango, cópialo y pégalo en el
> recuadro: los tabuladores se reconocen igual.

Primero **Revisa**: te dice cuántos renglones son altas, cuántos
actualizaciones, cuáles traen problemas, cuáles repiten una combinación que ya
venía en el archivo, y qué partners o rutas se darían de alta. Nada se escribe
hasta que le das **Importar**.

Si vuelves a importar el mismo tarifario con precios nuevos, **actualiza** en
vez de duplicar: identifica la tarifa por partner + ruta + carga + unidad +
movimiento + inicio de vigencia. Las columnas que el archivo no traiga se quedan
como estaban.

Un renglón sin unidad o sin tarifa se marca como problema y se salta: sin eso no
hay nada que comparar. El resto entra.

Con *Descargar plantilla* obtienes un CSV con las columnas correctas: es la
forma rápida de pedirle su tarifario a un transportista.

### Exportar

- **CSV** de cualquier tabla, con los filtros que tengas puestos.
- **Hoja de cálculo en Drive** con seis pestañas: criterio, mejores opciones,
  comparativo completo, tarifas, proveedores y rutas. Es lo que se manda a
  dirección o se lleva a una negociación.

### Dar acceso a alguien más

Pestaña **Ajustes** → *Dar de alta usuario*. Dos roles:

- **Administrador**: captura, importa y cambia ajustes.
- **Consulta**: solo compara y exporta.

Si el correo es del mismo dominio de Workspace, entra con su cuenta de Google.
Si es externo (Gmail, Hotmail), usa **Liga nueva** y mándasela: esa liga es
personal y sustituye a la contraseña, así que no se comparte.

---

## Ajustes que conviene revisar

| Ajuste | Por omisión | Qué hace |
|---|---|---|
| Moneda base | MXN | En qué moneda se compara todo |
| Tipo de cambio USD | 17.50 | Con qué se convierten las tarifas en dólares |
| Traerlo solo | Sí | Consulta el dólar del día en Google, una vez al día |
| Peso del precio | 70 % | Qué tanto pesa el precio contra el tiempo en el puntaje |
| Días de aviso | 30 | Con cuánta anticipación se marcan las tarifas por vencer |

---

## Anexo · Pruebas

En tu computadora, con Node y Python instalados:

```bash
node pruebas/prueba.js      # 185 comprobaciones de la lógica del servidor
python3 pruebas/armar_ui.py # genera pruebas/ui.html para revisar la interfaz
```

No tocan Google: simulan el entorno de Apps Script. Sirven para verificar que un
cambio no rompió nada antes de volver a pegar el código.

---

## Preguntas frecuentes

**Instalé todo y me dice "Necesitas tu liga personal". ¿Está roto?**
No. Esa pantalla sale cuando entras sin liga, y es lo normal la primera vez.
Ejecuta **`miLiga()`** desde el editor de Apps Script: en el registro sale tu
liga, con `?t=` y tu clave. Es la dirección que tienes que guardar, no la liga
pelona de la aplicación.

Si prefieres sacarla a mano: abre la hoja **TLTERMINALS · Tarifarios — Base de
datos**, pestaña **Usuarios**, copia lo que dice la columna **token** en tu
renglón y pégalo al final de la liga de la aplicación, después de `?t=`.

**¿Por qué no me llegó ningún correo al instalar?**
Porque al instalar no se manda ninguno: el administrador saca su liga con
`miLiga()`. Los correos son para invitar a los demás, con el botón **Invitar**
de la pestaña Ajustes.

**¿Y si el correo no sale?**
Las cuentas gratuitas de Gmail tienen un límite de correos al día en Apps
Script, y a veces el envío falla. Cuando pasa, la aplicación te muestra la liga
en pantalla para que la pases por WhatsApp: nadie se queda sin acceso por eso.

**¿Dónde quedan los datos?**
En una hoja de cálculo en tu Drive, carpeta *Tarifarios TLTERMINALS*. Puedes
abrirla y editarla a mano; la aplicación lee de ahí. Respeta los encabezados.

**¿Se pueden comparar tarifas en dólares y en pesos?**
Sí. Todo se convierte a la moneda base con el tipo de cambio del día, y cada
tarifa convertida muestra con qué número se hizo la cuenta.

**¿De dónde sale el tipo de cambio?**
De `GOOGLEFINANCE`, que ya vive dentro de Google Sheets: no hay que contratar
ningún servicio ni guardar llaves. Se consulta una vez al día. Si prefieres el
de tu banco o el del DOF, apaga el automático en *Ajustes* y captúralo.

**Ya tenía el sistema instalado, ¿pierdo lo capturado al actualizar?**
No. Vuelve a ejecutar `instalar()`: agrega las columnas nuevas al final,
respeta lo que ya había y marca como **redondo** las tarifas viejas que no
tenían tipo de movimiento.

**¿Por qué mi tarifa no aparece en el comparador?**
Por alguna de estas: está inactiva, está fuera de vigencia para la fecha
consultada, o el partner está inactivo. Ojo: la copia que deja *Duplicar* nace
inactiva a propósito. Debajo del comparativo se dice cuántas
se dejaron fuera y por qué. Marca *Incluir tarifas fuera de vigencia* para verlas.

**¿Qué pasa si borro un proveedor con tarifas?**
No se borra: se desactiva. Así no quedan tarifas huérfanas y no se pierde el
histórico de precios.

**¿Cómo actualizo el código después de un cambio?**
Pega los archivos que cambiaron y crea una **implementación nueva**
(*Implementar* → *Administrar implementaciones* → editar → *Nueva versión*). Si
no creas versión nueva, la liga sigue sirviendo la anterior.
