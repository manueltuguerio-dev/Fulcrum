# TLTERMINALS · Tarifarios de transportistas — Instalación

Sistema para tener en un solo lugar lo que cobra cada transportista por cada
ruta, y saber al instante quién conviene. Corre sobre Google Apps Script con
Google Sheets como base de datos: no hay servidor que pagar ni programa que
instalar.

Tiempo estimado: 15 minutos.

---

## Qué vas a tener

- **Alta de proveedores** (transportistas) con contacto, RFC y calificación.
- **Rutas** origen–destino, con kilómetros para calcular costo por kilómetro.
- **Tarifas** por ruta, tipo de mercancía y tipo de equipo —full, sencillo,
  torton, rabón, plataforma, refrigerado o los que tú agregues—, con vigencia.
- **Comparador**: por cada ruta y características, las opciones acomodadas de la
  mejor a la peor combinando precio y tiempo de entrega.
- **Apartado de mejores opciones**: una línea por ruta con quién gana, quién
  quedó en segundo y cuánto cuesta la diferencia.
- **Importar** tarifarios en CSV o pegados desde Excel, con revisión previa.
- **Exportar** a CSV o a una hoja de cálculo en Drive con el comparativo armado.

---

## Requisitos

- Una cuenta de Google (personal o de Workspace de TLTERMINALS).
- Los archivos de la carpeta `app-tarifarios/`.

### Qué archivo va dónde

Es el error más común de esta instalación. Cada tipo de archivo va en un tipo
distinto dentro de Apps Script y **no son intercambiables**:

| Archivos | Su primera línea | Dónde van |
|---|---|---|
| `Code.gs`, `Db.gs`, `Sesion.gs`, `Catalogos.gs`, `Tarifas.gs`, `Comparador.gs`, `Importar.gs`, `Exportar.gs` | `/**` | Archivos de **código** (ícono `<>`). Solo aceptan JavaScript |
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
3. Para cada uno de los otros siete archivos `.gs` —`Db`, `Sesion`, `Catalogos`,
   `Tarifas`, `Comparador`, `Importar`, `Exportar`—: clic en el **+** junto a
   *Archivos*, elige **Secuencia de comandos**, ponle el nombre **sin la
   extensión** (`Db`, no `Db.gs`) y pega su contenido.
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

## Paso 7 · Comprobar

Con la función **`verificar`** desde el editor. En el registro te dice si algo
falta y te repite la liga de la aplicación.

---

## Cómo se usa

### Dar de alta un transportista

Pestaña **Proveedores** → *Dar de alta proveedor*. Solo el nombre es
obligatorio. La calificación (0 a 5) se usa para desempatar cuando dos
proveedores quedan iguales en precio y en tiempo.

### Capturar una tarifa

Pestaña **Tarifas** → *Nueva tarifa*. Se captura:

| Campo | Para qué |
|---|---|
| Tarifa base | El flete pelón |
| Combustible % | Sobrecargo sobre la tarifa base |
| Casetas, maniobras, otros | Cargos fijos que se suman |
| Tiempo de entrega (horas) | Lo que tarda; sin esto no hay cómo ordenar por tiempo |
| Vigencia | Fuera de esas fechas la tarifa no entra al comparador |

El **costo total** que se compara es:
`tarifa + (tarifa × combustible %) + casetas + maniobras + otros`, convertido a
la moneda base con el tipo de cambio de *Ajustes*.

### Comparar

Pestaña **Comparar**: eliges ruta, tipo de mercancía y tipo de equipo, y salen
las opciones de la mejor a la peor. La barra *Qué pesa más* mueve el criterio
entre precio y tiempo sin guardar nada: es para tantear en una negociación.

El **puntaje** va de 0 a 100 y es relativo a lo que hay en esa ruta: la opción
más barata y más rápida saca 100, la más cara y más lenta saca 0. No compares
puntajes entre rutas distintas.

### Importar un tarifario

Pestaña **Importar y exportar**. Sube el CSV o pega el contenido copiado de
Excel. Reconoce comas, punto y coma y tabuladores, y los nombres de columna más
comunes aunque vengan con acentos y mayúsculas —`Tipo de Mercancía`,
`Tiempo de entrega (horas)`, `Flete`, `FSC`—. También entiende `$12,500.00` y
fechas `31/12/2026`.

Primero **Revisa**: te dice cuántos renglones son altas, cuántos
actualizaciones, cuáles traen problemas y qué proveedores o rutas se darían de
alta. Nada se escribe hasta que le das **Importar**.

Si vuelves a importar el mismo tarifario con precios nuevos, **actualiza** en
vez de duplicar: identifica la tarifa por proveedor + ruta + mercancía + equipo
+ inicio de vigencia. Las columnas que el archivo no traiga se quedan como
estaban.

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
| Peso del precio | 70 % | Qué tanto pesa el precio contra el tiempo en el puntaje |
| Días de aviso | 30 | Con cuánta anticipación se marcan las tarifas por vencer |

El tipo de cambio no se actualiza solo: cámbialo cuando se mueva, o captura las
tarifas en pesos.

---

## Anexo · Pruebas

En tu computadora, con Node y Python instalados:

```bash
node pruebas/prueba.js      # 101 comprobaciones de la lógica del servidor
python3 pruebas/armar_ui.py # genera pruebas/ui.html para revisar la interfaz
```

No tocan Google: simulan el entorno de Apps Script. Sirven para verificar que un
cambio no rompió nada antes de volver a pegar el código.

---

## Preguntas frecuentes

**¿Dónde quedan los datos?**
En una hoja de cálculo en tu Drive, carpeta *Tarifarios TLTERMINALS*. Puedes
abrirla y editarla a mano; la aplicación lee de ahí. Respeta los encabezados.

**¿Se pueden comparar tarifas en dólares y en pesos?**
Sí. Todo se convierte a la moneda base con el tipo de cambio de *Ajustes*.

**¿Por qué mi tarifa no aparece en el comparador?**
Por alguna de estas: está inactiva, está fuera de vigencia para la fecha
consultada, o el proveedor está inactivo. Debajo del comparativo se dice cuántas
se dejaron fuera y por qué. Marca *Incluir tarifas fuera de vigencia* para verlas.

**¿Qué pasa si borro un proveedor con tarifas?**
No se borra: se desactiva. Así no quedan tarifas huérfanas y no se pierde el
histórico de precios.

**¿Cómo actualizo el código después de un cambio?**
Pega los archivos que cambiaron y crea una **implementación nueva**
(*Implementar* → *Administrar implementaciones* → editar → *Nueva versión*). Si
no creas versión nueva, la liga sigue sirviendo la anterior.
