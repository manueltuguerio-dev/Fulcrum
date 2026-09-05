# MX Supply Assurance — Instalación en Google Apps Script

Instructivo para dejar el proceso corriendo en Google. No requiere instalar
nada: se hace desde el navegador, con una cuenta de Google.

**Tiempo estimado:** 25 minutos la primera vez. Después, la corrida mensual son
dos clics.

> **Antes de empezar, lee esto.** Esta versión hace el cálculo, el consolidado y
> los correos. **No** regenera el libro MX como archivo `.xlsx` con sus fórmulas
> y formato intactos; para eso se sigue usando la aplicación Node de
> `app-supply/`. El porqué está en [IMPLEMENTACION.md](IMPLEMENTACION.md).

---

## Requisitos

- Una cuenta de Google (personal o de Workspace).
- Los 15 archivos de la carpeta `apps-script-supply/`.
- El libro MX y el archivo Data del mes.

---

## Parte 1 · Crear el libro de trabajo

1. Entra a <https://sheets.google.com> y crea una **hoja de cálculo en blanco**.
2. Ponle nombre: **MX Supply Assurance**.
3. Déjala abierta.

Este libro es donde van a vivir los resultados. No es el libro MX: ese se queda
en Drive tal como lo descargas.

---

## Parte 2 · Pegar el código

1. En el libro que acabas de crear, ve a **Extensiones → Apps Script**.
2. Se abre el editor en otra pestaña. Ponle nombre al proyecto arriba a la
   izquierda: **MX Supply Assurance**.

### 2.1 Los archivos de código

Vas a crear **11 archivos de código** y **3 de HTML**. Es repetitivo pero no
tiene ciencia.

En el editor verás un archivo `Código.gs` con una función vacía.

**Para el primero:**
- Borra todo lo que trae `Código.gs`.
- Abre `Config.gs` de la carpeta con un editor de texto (Bloc de notas,
  TextEdit, VS Code — **no** con Word).
- Copia todo y pégalo.
- Renombra el archivo a `Config` (clic en los tres puntos junto al nombre →
  *Cambiar nombre*).

**Para los demás:**
- Clic en **+** junto a «Archivos» → **Secuencia de comandos**.
- Ponle el nombre **sin la extensión** `.gs`.
- Pega el contenido.

Los archivos de código, en este orden:

| # | Nombre en el editor | Archivo de la carpeta |
|---|---|---|
| 1 | `Config` | `Config.gs` |
| 2 | `Fechas` | `Fechas.gs` |
| 3 | `Motor` | `Motor.gs` |
| 4 | `Fuentes` | `Fuentes.gs` |
| 5 | `Proceso` | `Proceso.gs` |
| 6 | `Escritura` | `Escritura.gs` |
| 7 | `Reporte` | `Reporte.gs` |
| 8 | `Contactos` | `Contactos.gs` |
| 9 | `Correo` | `Correo.gs` |
| 10 | `Api` | `Api.gs` |
| 11 | `Code` | `Code.gs` |

### 2.2 Los archivos de HTML

Estos van con **+ → HTML**, no como secuencia de comandos. Es el error más
común de esta instalación: **no son intercambiables**.

| Nombre en el editor | Archivo de la carpeta |
|---|---|
| `Index` | `Index.html` |
| `Estilos` | `Estilos.html` |
| `Cliente` | `Cliente.html` |

> Cuando creas un archivo HTML, Google le pone `<!DOCTYPE html>…` de ejemplo.
> **Bórralo todo** antes de pegar.

### 2.3 El manifiesto

1. Clic en el engrane **Configuración del proyecto** (barra izquierda).
2. Marca **«Mostrar el archivo de manifiesto appsscript.json en el editor»**.
3. Vuelve al editor. Ahora aparece `appsscript.json` en la lista.
4. Borra su contenido y pega el de `appsscript.json` de la carpeta.

Este paso es obligatorio: ahí van los permisos y el servicio de Drive.

### 2.4 Activar el servicio de Drive

1. En la barra izquierda, junto a **Servicios**, clic en **+**.
2. Busca **Drive API** en la lista.
3. Deja la versión en **v2** y el identificador en **Drive**.
4. Clic en **Agregar**.

Sin esto, la conversión del `.xlsx` falla.

5. Guarda todo con el ícono del disquete (o `Ctrl+S`).

---

## Parte 3 · Preparar el libro

1. Vuelve a la pestaña de la hoja de cálculo y **recárgala** (`F5`).
2. Aparece un menú nuevo: **MX Supply**.
3. Clic en **MX Supply → Preparar libro**.

### La primera vez pide permisos

Google va a preguntar. Es normal: el script necesita leer tu Drive, escribir en
la hoja y mandar correos.

1. **Revisar permisos** → elige tu cuenta.
2. Va a decir **«Google no ha verificado esta aplicación»**. Es esperado: la
   escribiste tú, no está publicada en ninguna tienda.
   - Clic en **Configuración avanzada**.
   - Clic en **Ir a MX Supply Assurance (no seguro)**.
3. **Permitir**.

Al terminar se crean tres hojas: **Config**, **Contactos** y **Bitacora**.

---

## Parte 4 · Configurar

### 4.1 La carpeta de Drive

1. En Drive, crea una carpeta, por ejemplo **MX Supply — entrada**.
2. Sube ahí **el libro MX** y **el archivo Data** del mes.
3. Abre la carpeta y copia la liga de la barra de direcciones. Se ve así:
   `https://drive.google.com/drive/folders/1AbC...`

### 4.2 La hoja Config

Ve a la hoja **Config** y llena:

| Parámetro | Qué poner |
|---|---|
| **Carpeta de Drive con el libro MX** | La liga que copiaste |
| **Nombre del archivo Data** | `data` — el texto que distingue ese archivo del libro MX |
| **Fecha de corrida** | Normalmente hoy. Es el `TODAY()` de la columna L |
| **Modo de ventana** | `rango` o `semana` |
| **Desde** / **Hasta** | La ventana, cuando el modo es `rango` |
| **Columna de semana** | `W`, cuando el modo es `semana` |
| **Estatus a conservar** | `SHORTAGE` |
| **DEFAULT_BUYER a sustituir** | `LZR22` |
| **Se escribe como** | `Luis Rodriguez` |
| **Leer Open_PO** | `SI`. Ponlo en `NO` si la corrida se tarda demasiado |
| **Escribir KB Supply** | `SI`. En `NO` solo genera el consolidado, mucho más rápido |

> **Sobre la ventana.** `rango` cuenta el rojo en cualquier semana que toque las
> fechas; con «hoy» y «fin del mes siguiente» obtienes el riesgo del mes actual
> y el siguiente. `semana` evalúa una sola columna, que es el paso literal del
> proceso escrito.

### 4.3 Los correos de proveedores

Ni el libro MX ni el archivo Data traen direcciones de correo. Sin este paso el
proceso corre, pero no puede enviar nada.

Ve a la hoja **Contactos** y captura, o impórtalos desde un archivo:

| Proveedor | Correos |
|---|---|
| ENDRIES INTERNATIONAL INC | compras@endries.com; ventas@endries.com |
| HEILIND ELECTRONICS INC | mexico@heilind.com |

El nombre debe coincidir con el de la columna `SUPPLIER`, ignorando mayúsculas
y espacios de más. Se aceptan varios correos separados por coma o punto y coma.

---

## Parte 5 · Correr el proceso

**Desde el menú:** `MX Supply → Correr proceso`.

**Desde el panel** (recomendado, porque muestra el avance):
`MX Supply → Abrir panel`, y ahí el botón **Correr proceso**.

### Qué esperar

La corrida tarda varios minutos y **se detiene y se reanuda sola**. Apps Script
corta toda ejecución a los 6 minutos, así que el proceso guarda dónde iba y
programa su continuación. Verás la barra de avance pasar por:

```
Convirtiendo el libro MX → Leyendo el archivo Data → On hand → GAPs files
→ SupplyPlan → Open_PO → Calculando → Details → KB Supply → Consolidado
```

**Puedes cerrar la pestaña.** El proceso sigue en los servidores de Google.
Cuando vuelvas a abrir el panel, retoma el avance donde iba.

Al terminar quedan las hojas:

- **Consolidado** — por proveedor, un renglón por número de parte único
- **Resumen proveedores** — conteos, totales y los parámetros de la corrida
- **Detalle por ORG** — sin consolidar, para rastrear de dónde sale cada cifra
- **Details** y **KB Supply** — el proceso completo

---

## Parte 6 · Enviar los correos

1. En el panel, pestaña **4. Correo**.
2. Ajusta asunto, saludo, introducción, cierre y firma.
3. **Ver vista previa.** Revisa uno o dos antes de mandar.
4. Desmarca los proveedores a los que no quieras escribirles.
5. **Enviar correos**, y confirma.

Los correos salen con la cuenta de Google que autorizó el script. No hay
servidor que configurar.

> Los proveedores **sin correo registrado** aparecen marcados en rojo y no se
> les envía. Aparecen en la lista para que sepas a quién falta capturar.

---

## Parte 7 (opcional) · Publicar como aplicación web

Si quieres que otras personas la usen sin abrir la hoja de cálculo:

1. En el editor de Apps Script: **Implementar → Nueva implementación**.
2. Engrane → **Aplicación web**.
3. **Ejecutar como:** Yo. **Quién tiene acceso:** según necesites.
4. **Implementar**, y comparte la liga que aparece.

> Con «Ejecutar como: Yo», los correos salen de tu cuenta y consumen **tu**
> cuota diaria, sin importar quién use la aplicación.

---

## Parte 8 (opcional) · Dejarlo programado

1. En el editor, reloj **Activadores** (barra izquierda).
2. **Añadir activador**.
3. Función: `iniciarProceso`. Origen: **Basado en tiempo**. La periodicidad que
   quieras, por ejemplo cada lunes a las 7 a.m.

El proceso corre solo y deja los resultados en las hojas. **No manda correos
por su cuenta**: eso siempre requiere que alguien lo confirme desde el panel.

---

## Si algo sale mal

Lo primero: revisa la hoja **Bitacora**. Cada corrida deja ahí su rastro.

| Mensaje | Qué significa | Qué hacer |
|---|---|---|
| `Falta la hoja "Config"` | No se preparó el libro | `MX Supply → Preparar libro` |
| `No pude abrir la carpeta de Drive` | La liga está mal o no tienes acceso | Vuelve a copiar la liga de la carpeta |
| `No encontré un archivo cuyo nombre contenga "data"` | El export tiene otro nombre | Cambia «Nombre del archivo Data» en Config |
| `El libro convertido no tiene la hoja "SupplyPlan"` | Se subió el archivo equivocado | Verifica que sea el libro MX completo |
| `Drive is not defined` | Falta el servicio de Drive | Parte 2.4 |
| `Se superó el tiempo máximo de ejecución` | Una fase no cupo en 6 min | Pon «Leer Open_PO» en `NO`; si sigue, «Escribir KB Supply» en `NO` |
| `La cuota de correo de hoy alcanza para N` | Se agotó la cuota diaria | Espera a mañana o usa una cuenta de Workspace |
| `Ya hay una ejecución en curso` | Dos corridas al mismo tiempo | Espera, o `MX Supply → Cancelar corrida` |

**Si una corrida se queda atorada:** `MX Supply → Cancelar corrida`. Borra el
estado, quita los disparadores pendientes y limpia las copias temporales.

**Si sospechas que los números están mal:** corre la aplicación Node con los
mismos archivos y compara. Las dos deben dar exactamente lo mismo; hay una
prueba que lo verifica, descrita en [IMPLEMENTACION.md](IMPLEMENTACION.md) §7.

---

## La corrida mensual, una vez instalado

1. Sube el libro MX y el archivo Data del mes a la carpeta de Drive.
2. Actualiza **Fecha de corrida** y la ventana en la hoja **Config**.
3. `MX Supply → Abrir panel` → **Correr proceso**.
4. Cuando termine, pestaña **Correo** → vista previa → **Enviar**.

Los archivos del mes anterior se pueden borrar de la carpeta; el script toma el
`.xlsx` más grande como libro MX, así que conviene dejar solo los dos del mes.
