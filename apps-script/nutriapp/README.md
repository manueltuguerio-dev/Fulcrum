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

**Paciente**

- Anillo de progreso del día contra su meta calórica, con barras de proteína,
  carbohidratos, grasas y fibra.
- Armador de platillos: tres opciones mexicanas por cada tiempo de comida
  (desayuno, comida, cena, colación) más un buscador de más de 80 alimentos con
  su composición por 100 g, para ajustar gramajes o crear un platillo desde cero.
- Escaneo con la cámara: la foto de la báscula o del estudio de sangre se lee
  con Tesseract.js **en el propio teléfono**, prellena el formulario y se
  guarda en Drive.
- Registro de actividad física con estimación de calorías quemadas según el
  peso vigente.
- Biblioteca de evidencia con la pirámide de niveles y enlaces a PubMed.
- Chat con el nutriólogo, que dispara una alerta al momento.

**Nutriólogo**

- Lista de pacientes con su último peso, su meta y los mensajes sin leer.
- Expediente con gráficas históricas de peso, masa muscular, agua, grasa
  visceral y corporal, triglicéridos, colesterol y glucosa.
- Ajuste manual de la meta calórica y del factor de actividad.
- Acceso directo a las imágenes que subió el paciente y respuesta en el chat.

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
| `Menus.gs` | Los doce platillos mexicanos prediseñados |
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
| `Chat_Soporte` | ID, ID_Paciente, Mensaje, EnviadoPor, Fecha, Estado |
| `Config_Paciente` | ID_Paciente, CaloriasObjetivo, ProteinaObjetivo_g, FactorActividad, Estatura_cm, FechaNacimiento, Sexo, AjusteManual, FechaActualizacion, ActualizadoPor |
| `Sesiones` | Token, ID_Usuario, Rol, Tipo, Expira |
| `Evidencia_Cientifica` | ID, Tema, Titulo, Resumen, NivelEvidencia, Enlace |

Las últimas tres no venían en la especificación original y se agregaron porque
hacían falta: `Config_Paciente` guarda la meta que el nutriólogo fija a mano,
`Sesiones` sostiene los tokens de acceso y recuperación, y
`Evidencia_Cientifica` deja que las fichas se editen desde la hoja sin tocar
código. `GrasaVisceral` se sumó a `Metricas_Paciente` porque el panel la
grafica.

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
