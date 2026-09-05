# NutriApp · Aplicación web de seguimiento nutricional

Aplicación web completa para Google Apps Script: el paciente registra lo que
come, se pesa y sube fotos de sus estudios; el nutriólogo ve el expediente,
grafica la evolución y ajusta la meta calórica. La base de datos es una hoja de
cálculo de Google, las imágenes viven en Drive y las alertas salen por WhatsApp
y correo.

Es un proyecto **independiente** del resto de la carpeta `apps-script/`, que
publica el documento de arquitectura del comedor. Cada uno se despliega por
separado, con su propio `appsscript.json`.

## Qué hace

**Paciente** · cinco pestañas: Hoy, Comer, Perfil, Ciencia y Asistente

*Hoy*
- Anillo de progreso del día contra su meta calórica, con barras de proteína,
  carbohidratos, grasas y fibra.
- Las cuatro metas de hábito del día, evaluadas contra lo que registró.
- Lo que lleva comido y su actividad física.

*Comer*
- **¿Qué comí hoy?**: describe la comida con sus palabras y la IA calcula
  calorías, macros y fibra. Sin llave de API, un analizador local reconoce los
  alimentos del catálogo por su nombre.
- **Menús**: 10 opciones de desayuno, 10 de comida y 10 de cena, más colaciones.
  Las sugerencias destacadas rotan cada tres días.
- **La Milpa**: el Plato del Buen Comer adaptado a la Dieta de la Milpa, con la
  tabla nutricional de cada grupo y la lista de lo que conviene limitar.
- Buscador de más de 110 alimentos con su composición por 100 g, y un armador
  donde se ajustan los gramos antes de guardar.

*Perfil*
- Datos personales y físicos: edad, estatura, peso, IMC con su clasificación y
  porcentaje de grasa corporal.
- Nivel de actividad (Baja, Moderada, Alta, Muy Alta), tipo de ejercicio
  (aeróbico o anaeróbico) y patologías.
- **Mi progreso**: gráfica filtrable por métrica para comparar mes con mes.
- Escaneo con la cámara: la foto de la báscula o del estudio de sangre se lee
  con Tesseract.js **en el propio teléfono**, prellena el formulario y se
  guarda en Drive.

*Ciencia*
- Pirámide de la evidencia y fichas ilustradas con enlaces a PubMed, editables
  desde la hoja de cálculo.

*Asistente*
- Chatbot disponible a cualquier hora para dudas rápidas.
- Botón para escalar al nutriólogo, que dispara una alerta al momento.

**Nutriólogo**

- Lista de pacientes con su último peso, su meta y los mensajes sin leer.
- Expediente con gráficas históricas de peso, masa muscular, agua, grasa
  visceral y corporal, triglicéridos, colesterol y glucosa.
- Ajuste manual de la meta calórica y del factor de actividad.
- Acceso directo a las imágenes que subió el paciente y respuesta en el chat.

## Las cuatro metas de hábito

Además de las calorías, la app revisa todos los días cuatro cosas que mueven
más la aguja que contar energía:

| Meta | Cómo se evalúa |
|---|---|
| **Fibra** | Entre 25 y 30 g al día. Pasarse no cuenta como falla. |
| **Fruta** | Al menos una porción (80 g) al día. |
| **Origen vegetal** | Que al menos el 60 % de la energía del día venga de plantas. |
| **Grasas saturadas** | Señala manteca, mantequilla, aceite de coco, aceite de palma y carne roja cuando aparecen. |

El tono es deliberado: son recordatorios, no reproches. Quien está registrando
su comida ya está haciendo el trabajo, y una app que regaña se desinstala. Por
eso el aviso de grasas saturadas dice "no es prohibido, conviene que sea la
excepción" en lugar de marcar el día en rojo.

La clasificación compara **palabras completas**, no subcadenas. Suena a detalle
de implementación y no lo es: buscar "res" dentro del texto marcaba "Salsa
mexicana fresca" y "Fresa" como grasa saturada, y la app terminaba regañando a
alguien por comerse una fruta.

## Cómo se calcula la meta calórica

1. **Masa libre de grasa** = peso × (1 − % de grasa / 100).
2. **TMB por Katch-McArdle** = 370 + (21.6 × masa libre de grasa en kg).
3. **Gasto energético total** = TMB × factor de actividad.
4. **Ajuste del déficit**, recorriendo el historial de mediciones desde la meta
   base de 1,700 kcal y aplicando un cambio por cada periodo entre pesajes:

   | Lo que pasó entre dos mediciones | Ajuste |
   |---|---|
   | Bajó más de 0.7 kg por semana | +120 kcal |
   | Perdió más de 0.3 kg de masa muscular | +150 kcal |
   | Bajó menos de 0.3 kg por semana | −100 kcal |
   | Bajó entre 0.3 y 0.7 kg por semana | sin cambio |
   | Pasaron menos de 7 días | sin cambio |

5. **Cotas de seguridad**: la meta nunca queda por debajo de la TMB, ni de
   1,200 kcal, ni implica un déficit mayor al 20 % del gasto total.
6. **Macronutrimentos**: método del plato, 60 % carbohidratos, 20 % proteínas y
   20 % grasas insaturadas, con la proteína fijada en **1.0 g por kilogramo de
   peso corporal total**. Cuando ese gramaje se aparta del 20 % del plato, la
   app lo dice en pantalla en lugar de esconder la diferencia.

El cálculo es **función pura del historial**: no parte del número guardado la
vez anterior. Importa, porque la meta se consulta en cada carga de pantalla, y
un cálculo que arrastrara su propio resultado recortaría calorías en cada
lectura hasta dejar al paciente en el piso.

## Archivos

| Archivo | Qué es |
|---|---|
| `Code.gs` | Configuración, `doGet()`, arranque de la base y ayudantes de hoja |
| `Datos.gs` | Catálogo de alimentos por 100 g y biblioteca de evidencia |
| `Auth.gs` | Contraseñas, sesiones, recuperación y alta de pacientes |
| `KatchMcArdle.gs` | TMB, gasto energético, macros y ajuste mensual del déficit |
| `Reglas.gs` | Las cuatro metas de hábito, el IMC y los niveles de actividad |
| `Menus.gs` | Los 35 platillos mexicanos prediseñados y su rotación |
| `Milpa.gs` | El Plato de la Milpa y su tabla nutricional |
| `IA.gs` | Registro por texto y chat asistente con la API de Claude |
| `Api.gs` | Todo lo que la interfaz llama con `google.script.run` |
| `MetaWhatsApp.gs` | Alertas por la Meta Cloud API y respaldo por correo |
| `Index.html` | Estructura de la interfaz de una sola página |
| `Estilos.html` | Hoja de estilos propia |
| `Scripts.html` | Lógica del cliente: OCR, armador, gráficas y chat |
| `pruebas/` | Simulador de Apps Script, pruebas y generador de vista previa |

## Base de datos

`setupDatabase()` crea la hoja de cálculo con estas pestañas:

| Pestaña | Columnas |
|---|---|
| `Usuarios` | ID, Email, PasswordHash, Rol, Nombre, FechaRegistro, Activo |
| `Metricas_Paciente` | ID_Paciente, Fecha, Peso_kg, MasaMuscular_kg, PorcentajeGrasa, Agua_Porcentaje, Trigliceridos, Colesterol, Glucosa, FotoPesa_DriveUrl, FotoEstudios_DriveUrl, GrasaVisceral, Notas |
| `Alimentos_100g` | ID, Categoria, Alimento, Proteina_g, Grasa_g, Carbohidratos_g, Fibra_g, Calorias_100g |
| `Registro_Diario` | ID, ID_Paciente, Fecha, TiempoComida, AlimentosJSON, CaloriasTotales, ProteinasTotales, GrasasTotales, CarbohidratosTotales, FibraTotal |
| `Actividad_Fisica` | ID, ID_Paciente, Fecha, TipoActividad, DuracionMinutos, CaloriasQuemadasEst |
| `Chat_Soporte` | ID, ID_Paciente, Mensaje, EnviadoPor, Fecha, Estado · guarda dos conversaciones distintas, la del nutriólogo y la del asistente, separadas por `EnviadoPor` |
| `Config_Paciente` | ID_Paciente, CaloriasObjetivo, ProteinaObjetivo_g, FactorActividad, Estatura_cm, FechaNacimiento, Sexo, AjusteManual, FechaActualizacion, ActualizadoPor, NivelActividad, TipoEjercicio, Patologias |
| `Sesiones` | Token, ID_Usuario, Rol, Tipo, Expira |
| `Evidencia_Cientifica` | ID, Tema, Titulo, Resumen, NivelEvidencia, Enlace, Emoji, Orden |

Las últimas tres no venían en la especificación original y se agregaron porque
hacían falta: `Config_Paciente` guarda la meta que el nutriólogo fija a mano,
`Sesiones` sostiene los tokens de acceso y recuperación, y
`Evidencia_Cientifica` deja que las fichas se editen desde la hoja sin tocar
código. `GrasaVisceral` se sumó a `Metricas_Paciente` porque el panel la
grafica.

Las columnas que se agregaron después de la primera versión van **al final** de
su pestaña, no en medio: `escribirEncabezados_` solo reescribe el renglón 1, así
que agregar al final deja los datos existentes alineados. Lo mismo aplica al
catálogo de alimentos, donde el ID se asigna por posición en el arreglo:
insertar en medio le daría a un alimento nuevo un ID que en una hoja ya
desplegada pertenece a otro.

Todo el catálogo es editable desde la hoja: la app lee de ahí, no del código.

## Desplegar

### Sin instalar nada

1. Entra a <https://script.google.com> y crea un proyecto nuevo.
2. Crea un archivo por cada `.gs` de esta carpeta con el mismo nombre (el
   editor añade la extensión solo) y pega su contenido.
3. Botón **+** junto a *Archivos* → **HTML**, y crea `Index`, `Estilos` y
   `Scripts` con el contenido de los `.html`. Los nombres importan: el código
   los busca así, con esas mayúsculas.
4. ⚙️ **Configuración del proyecto** → activa *Mostrar el archivo de manifiesto
   `appsscript.json`* y pega el de esta carpeta.
5. Selecciona la función **`setupDatabase`** en la barra de arriba y presiona
   **Ejecutar**. Autoriza los permisos que pida. Al terminar, abre
   **Ver → Registro**: ahí están la liga de la hoja de cálculo y **la
   contraseña temporal del nutriólogo**. Cópiala.
6. **Implementar → Nueva implementación → Aplicación web**.
   - *Ejecutar como*: **Yo**
   - *Quién tiene acceso*: **Cualquier usuario**
7. Abre la URL `/exec`, entra con tu correo de Google y la contraseña temporal,
   y cámbiala desde el ⚙️ del encabezado.

Cada cambio posterior necesita **Implementar → Administrar implementaciones →
editar → Nueva versión**. La URL `/exec` no cambia.

### Con clasp

```bash
npm install -g @google/clasp
clasp login
clasp create --type webapp --title "NutriApp" --rootDir apps-script/nutriapp
bash apps-script/nutriapp/desplegar.sh
```

Si `clasp create` genera su propio `appsscript.json`, sobrescríbelo con el de
esta carpeta antes del primer `clasp push`. Después ejecuta `setupDatabase` una
vez desde el editor.

## Por qué "Ejecutar como: Yo"

Los pacientes entran con correo y contraseña propios, sin cuenta de Google. Eso
solo funciona con *Ejecutar como: Yo* y acceso para cualquier usuario: el script
corre con tus permisos y él decide quién es quién. La consecuencia es que la
hoja de cálculo y la carpeta de Drive quedan a tu nombre, y que **toda la
seguridad depende de la validación de sesión del propio código**, no de Google.

## Si `setupDatabase` falla con "Specified permissions are not sufficient"

`appsscript.json` declara `oauthScopes` explícitamente, y en cuanto un
manifiesto lo hace, Apps Script deja de detectar permisos solo: usa
exactamente esa lista, ni uno más. Si al correr `setupDatabase` el registro
marca un error señalando `Session.getEffectiveUser` y pidiendo el permiso
`userinfo.email`, es que el manifiesto pegado en el proyecto no trae ese
permiso en la lista. Cópialo de nuevo desde `appsscript.json` en esta carpeta,
guarda, y vuelve a ejecutar `setupDatabase`; te va a pedir autorizar de nuevo.

## La IA: registro por texto y chat asistente

Dos funciones usan la API de Claude por HTTP con `UrlFetchApp`, porque Apps
Script no puede instalar el SDK de Anthropic ni ningún paquete de npm:

- **Registro por texto**: el paciente escribe "dos tacos de nopal con frijol y
  una guayaba" y la IA devuelve el desglose. Se le pasa el catálogo para que
  reutilice sus IDs, de modo que el registro quede ligado a la base y las cuatro
  metas puedan clasificarlo. El resultado **no se guarda solo**: se muestra para
  confirmar o corregir los gramos, porque estimar no es medir.
- **Chat asistente**: contesta dudas rápidas con el contexto del día. Tiene dos
  límites explícitos en el prompt, y son los importantes: no diagnostica y no
  cambia el plan. Eso es del nutriólogo, y una app que lo confunde hace daño.

Modelo: `claude-opus-5`, con pensamiento adaptativo. El registro por texto pide
la respuesta como JSON con esquema, para no adivinar el formato.

### Configurar la llave

1. Consigue una llave en <https://console.anthropic.com>.
2. Abre `IA.gs`, escríbela dentro de `setupCredencialIA()`, ejecútala una vez
   desde el editor y **vuelve a dejar el marcador** antes de guardar el archivo
   en git.
3. Comprueba con `estadoIA()`.

### Sin llave la app sigue funcionando

No es un modo degradado accidental, está diseñado así: el registro por texto cae
a un analizador local que busca los alimentos del catálogo por su nombre y toma
los gramos que aparezcan junto a ellos, y el asistente responde desde un
recetario de respuestas fijas que cubre las dudas más comunes. Peor, pero nunca
una pantalla rota.

**Cuesta dinero.** Cada análisis de comida y cada respuesta del asistente es una
llamada facturada. Si vas a abrir la app a muchos pacientes, mide primero con
unos pocos.

## Alertas por WhatsApp

Las credenciales se leen de las propiedades del script, nunca del código:

1. En la [Meta Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api)
   consigue un token permanente y el *Phone Number ID* de tu número emisor.
2. Abre `MetaWhatsApp.gs`, escribe los tres valores dentro de
   `setupCredencialesWhatsApp()`, ejecútala una vez desde el editor y **vuelve a
   dejar los marcadores** antes de guardar el archivo en git.
3. Comprueba con `estadoWhatsApp()`: dice qué falta sin mostrar el token.

Mientras no estén configuradas, el chat sigue funcionando y la alerta llega por
correo. Fuera de la ventana de 24 horas de atención al cliente, Meta solo acepta
plantillas aprobadas: para eso está `notificarConPlantillaWhatsApp()`.

## Sobre las contraseñas

Apps Script no trae bcrypt ni Argon2. Las contraseñas se guardan como
`salt:hash`, donde el hash es SHA-256 aplicado 5,000 veces sobre la sal y la
contraseña. Con eso, una contraseña no queda legible en la hoja y probarlas una
por una sale caro, pero **no equivale a bcrypt**. Si vas a manejar datos de
muchos pacientes, vale la pena mover la autenticación a un proveedor de
identidad real.

Los enlaces de recuperación viven 2 horas y se invalidan al usarse. Las
sesiones duran 12 horas; `limpiarSesionesVencidas()` está lista para colgarse de
un activador diario.

## Sobre los enlaces de evidencia

Las fichas apuntan a **búsquedas de PubMed** acotadas al tema, no a un PMID
concreto: así siguen resolviendo a literatura vigente y no a una cita que no se
verificó. Si prefieres fijar estudios específicos, sustituye la columna `Enlace`
de la pestaña `Evidencia_Cientifica` por la liga del PMID que elijas. La app lee
de la hoja, no del código.

## Dependencias externas

Tailwind CSS, Tesseract.js y Chart.js llegan por CDN. La aplicación avisa en
pantalla si la red las bloquea, y sigue siendo navegable: la clase `.hidden`,
de la que depende toda la navegación, está definida en `Estilos.html` y no en
Tailwind, justamente para que una CDN caída no muestre todas las pantallas
encimadas.

## Probar sin desplegar

```bash
node apps-script/nutriapp/pruebas/prueba.js
node apps-script/nutriapp/pruebas/vista_previa.js /tmp/vista.html
```

Ver `pruebas/README.md`.
