# Comedor empresarial — Arquitectura y diseño técnico (v1)

Aplicación web responsive para registrar, controlar y cobrar los pedidos del
comedor de una sola sede. Alcance: dos roles (Empleado, Administrador), un menú
por día, una hora corte diaria, pedidos para hoy y mañana.

Zona horaria de operación: `America/Mexico_City`.

---

## 0. Decisiones que gobiernan todo lo demás

1. **La hora corte vive en el menú del día, no en la configuración global.**
   Cada día guarda su propio `cutoff_at` ya resuelto a UTC. Cambiar el default
   nunca reescribe días pasados ni reabre pedidos cerrados.
2. **El precio se congela al confirmar.** El pedido guarda `charged_amount` y el
   desglose que lo produjo. Ajustar una tarifa hoy no altera cobros anteriores.
3. **Baja = desactivación, nunca borrado.** El empleado inactivo no entra ni
   aparece en el menú del día, pero su historial y sus cobros siguen íntegros.
4. **"No comerá" es un registro, no un vacío.** Al cerrar el día se crea el
   pedido en estado `no_meal`. El reporte distingue "no comió" de "no existía".
5. **Se cobra lo confirmado, y el Admin puede condonar.** El importe se devenga
   al cerrar el corte, haya o no pasado la persona por su comida. Condonar es una
   excepción explícita, con motivo, que el reporte muestra marcada.
6. **El Admin rompe reglas, pero deja rastro.** Pedido expreso, edición fuera de
   tiempo, condonación y borrado exigen motivo y quedan en `audit_log`.

---

## 1. Arquitectura recomendada

Monolito modular en TypeScript + PostgreSQL, empaquetado como PWA. El volumen de
una sola sede no justifica microservicios.

| Capa | Elección | Por qué |
|---|---|---|
| Frontend | React + Vite + TypeScript, Tailwind, PWA instalable | Empleados y cocina usan celular, el Admin usa PC. La PWA habilita push sin publicar en tiendas. |
| Backend | Node 20 + NestJS (o Express), REST | Módulos por dominio: auth, users, catalog, menus, orders, billing, notifications. Tipos compartidos con el front. |
| Base de datos | PostgreSQL 15+ | Restricciones reales (un pedido vigente por persona por día) y agregaciones para reportes. |
| Auth | JWT access 15 min + refresh rotativo en cookie httpOnly, Argon2id | Sin registro abierto: solo invitación. |
| Imágenes | Storage S3-compatible (R2 / Supabase) + CDN, subida por URL firmada, WebP en 3 tamaños | Las fotos se ven en red móvil. |
| Email | Resend o SendGrid con plantillas | Invitación, reactivación, recordatorio, confirmación. |
| Push | Web Push (VAPID) desde el Service Worker | El recordatorio llega con la app cerrada. |
| Tareas programadas | Cron → endpoints internos protegidos por secreto | Recordatorio T-60 min, cierre del corte, aviso de menú faltante. |
| Reportes | ExcelJS (XLSX/CSV), Puppeteer o pdfmake (PDF) | Generación asíncrona + descarga por URL firmada en rangos amplios. |
| WhatsApp | Fase 1: texto generado + `wa.me`. Fase 2 opcional: Cloud API | Ver nota abajo. |
| Infra | Front en Vercel · API en Railway/Fly · Postgres gestionado · Sentry | Backups diarios, retención 30 días. |

### Nota sobre WhatsApp

No existe forma legítima de publicar automáticamente en un **grupo** de WhatsApp.
La API oficial (Cloud API) envía a números individuales con plantillas aprobadas.
Por eso la Fase 1 es la correcta: el Admin toca "Generar mensaje", el sistema
arma el texto con el menú y la liga, lo copia al portapapeles o abre WhatsApp con
el mensaje precargado, y el Admin lo pega en el grupo. Un toque manual, cero
riesgo de bloqueo de cuenta. Las imágenes van como liga a una página pública del
menú del día con vista previa Open Graph.

### Reglas transversales

- **Tiempo:** instantes en `timestamptz` UTC; el día de servicio en `DATE` local.
  La conversión ocurre una sola vez, al publicar el menú.
- **Autorización:** guard por rol + verificación de propiedad. Un empleado nunca
  resuelve un id de pedido ajeno, ni para leerlo.
- **Idempotencia:** crear pedido acepta clave de idempotencia; un doble tap no
  genera dos pedidos.
- **Bitácora:** toda escritura administrativa sobre pedidos, tarifas y cuentas.

---

## 2. Esquema de base de datos

PostgreSQL, ids `uuid`, importes `numeric(10,2)`, `created_at` / `updated_at` en
todas las tablas (omitidos abajo).

### Identidad y acceso

**users**

| Campo | Tipo | Notas |
|---|---|---|
| id (PK) | uuid | |
| email (UQ) | citext | Identificador de acceso, insensible a mayúsculas |
| password_hash | text | Argon2id. Nulo hasta aceptar la invitación |
| full_name | text | Nombre que ve la cocina |
| employee_code | text | Número de nómina, llave de cruce con RRHH |
| department_id (FK → departments) | uuid | Opcional, habilita subtotales por área |
| role | enum | `empleado` \| `admin` |
| status | enum | `invited` \| `active` \| `inactive` |
| deactivated_at | timestamptz | Se conserva al reactivar |
| last_login_at | timestamptz | Detecta invitados que nunca entraron |

**departments** — id (PK), name (UQ), cost_center.

**invitations**

| Campo | Tipo | Notas |
|---|---|---|
| id (PK) | uuid | |
| email | citext | Índice único parcial mientras `status = 'pending'` |
| role | enum | Rol con el que nacerá la cuenta |
| token_hash (UQ) | text | SHA-256. El token en claro solo viaja en el correo |
| invited_by (FK → users) | uuid | |
| expires_at | timestamptz | 72 h. Reenviar revoca el token anterior |
| status | enum | `pending` \| `accepted` \| `expired` \| `revoked` |

Complementan **refresh_tokens** (id, user_id FK, token_hash UQ, expires_at,
revoked_at, user_agent) y **password_resets**, con la misma forma.

### Catálogo y menú

**dishes**

| Campo | Tipo | Notas |
|---|---|---|
| id (PK) | uuid | |
| name | text | |
| description | text | Se muestra bajo la foto |
| image_url | text | Original; variantes WebP por convención de nombre |
| type | enum | `principal` \| `base` \| `complemento` \| `salsa` — define el bloque de pantalla |
| allows_complements | boolean | Definido al dar de alta; si es falso la UI oculta el paso |
| base_price | numeric(10,2) | Tarifa por default antes de subsidios |
| is_active | boolean | Baja lógica |
| is_default_base | boolean | Los `base` marcados se agregan solos a cada menú nuevo |

**menus** — un registro por día de servicio

| Campo | Tipo | Notas |
|---|---|---|
| id (PK) | uuid | |
| service_date (UQ) | date | Día local de consumo. Un menú por día |
| status | enum | `draft` \| `published` \| `closed`. Solo `published` acepta pedidos |
| cutoff_at | timestamptz | Congelado al publicar |
| published_at / published_by (FK) | timestamptz / uuid | |
| closed_at | timestamptz | Lo escribe el job de cierre; prueba de que ya se generaron los `no_meal` |
| notes | text | Aviso del día, visible en la app y en el mensaje de WhatsApp |

**menu_items**

| Campo | Tipo | Notas |
|---|---|---|
| id (PK) | uuid | |
| menu_id (FK → menus) | uuid | `UNIQUE (menu_id, dish_id)` |
| dish_id (FK → dishes) | uuid | |
| price_override | numeric(10,2) | Precio solo para ese día; nulo usa `base_price` |
| display_order | int | Orden de las tarjetas |
| is_available | boolean | Permite agotar sin borrar pedidos existentes |
| stock_limit | int | Fase 2; el campo se crea desde ya para no migrar después |

### Pedidos

**orders**

| Campo | Tipo | Notas |
|---|---|---|
| id (PK) | uuid | |
| user_id (FK → users) | uuid | |
| menu_id (FK → menus) | uuid | |
| service_date | date | Denormalizado para índices de reporte |
| status | enum | `confirmed` \| `cancelled` \| `delivered` \| `no_meal` |
| comments | text | Campo libre del empleado |
| source | enum | `employee` \| `admin_express` \| `admin_edit` \| `system_no_meal` |
| charged_amount | numeric(10,2) | Importe congelado al confirmar; es lo que suma Nómina |
| price_breakdown | jsonb | Tarifa base, override del día, subsidio aplicado |
| is_waived | boolean | Condonado por el Admin: el pedido sigue contando para producción pero no suma al corte |
| waive_reason / waived_by (FK) / waived_at | text / uuid / timestamptz | Motivo obligatorio; va marcado en el reporte de Nómina |
| placed_at / cancelled_at / delivered_at | timestamptz | |
| created_by / updated_by (FK → users) | uuid | Distinto de `user_id` en capturas del Admin |

Restricción clave:

```sql
CREATE UNIQUE INDEX orders_one_per_day
  ON orders (user_id, service_date)
  WHERE status <> 'cancelled';
```

**order_items**

| Campo | Tipo | Notas |
|---|---|---|
| id (PK) | uuid | |
| order_id (FK → orders) | uuid | `ON DELETE CASCADE` |
| menu_item_id (FK → menu_items) | uuid | |
| dish_id (FK → dishes) | uuid | Redundante a propósito: el reporte sobrevive a ediciones del menú |
| dish_name_snapshot | text | El nombre tal como se llamaba ese día |
| item_role | enum | `main` \| `complemento` \| `salsa` |
| unit_price | numeric(10,2) | En v1 siempre cero para complementos y salsas: van incluidos en la tarifa del principal. El campo existe para poder cobrarlos después sin migrar |

Garantizado en base de datos: exactamente **un** renglón `main` por pedido
(índice único parcial) y **máximo dos** `complemento` (trigger de conteo). Las
salsas no tienen tope. No existen bebidas en el catálogo.

**Qué se cobra:** el importe es el del platillo principal o base; complementos y
salsas van incluidos. Un pedido suma al corte si su estado es `confirmed` o
`delivered` y no está condonado. `cancelled` y `no_meal` nunca suman. Quien
confirma y no pasa por su comida paga, salvo condonación del Admin.

### Dinero

**employee_prices** — tarifas personalizadas y subsidios

| Campo | Tipo | Notas |
|---|---|---|
| id (PK) | uuid | |
| user_id (FK → users) | uuid | |
| dish_id (FK → dishes) | uuid | **Nulo = aplica a todos los platillos** de esa persona |
| mode | enum | `fixed` \| `discount_pct` \| `discount_amount` |
| value | numeric(10,2) | Se interpreta según `mode` |
| effective_from / effective_to | date | Vigencia; un cambio no toca el pasado |

Resolución de precio, en orden: regla del empleado para ese platillo → regla
general del empleado → `price_override` del día → `base_price`. El resultado se
escribe en `orders.charged_amount` y no vuelve a calcularse.

**payroll_periods** — id (PK), period_start, period_end, status (`draft` |
`closed`), totals jsonb, file_url, closed_by (FK), closed_at. Se valida que un
periodo cerrado no se traslape con otro.

**payroll_lines** — id (PK), period_id (FK, `UNIQUE (period_id, user_id)`),
user_id (FK), meals_count, total_amount. Copia congelada: aunque después se
corrija un pedido, el corte enviado no cambia.

### Notificaciones y bitácora

| Tabla | Campos | Propósito |
|---|---|---|
| push_subscriptions | id PK, user_id FK, endpoint UQ, p256dh, auth, user_agent, last_seen_at | Un registro por dispositivo; se purga al fallar con 410 |
| notifications | id PK, user_id FK, type, channel, payload jsonb, status, sent_at, error, dedupe_key UQ | Historial de envíos; `dedupe_key` evita duplicados |
| audit_log | id PK, actor_id FK, entity_type, entity_id, action, before jsonb, after jsonb, ip, created_at | Toda escritura administrativa |
| settings | key PK, value jsonb, updated_by FK, updated_at | Hora corte default, anticipación del recordatorio, máximo de complementos, plantilla de WhatsApp, días hábiles |

### Índices que importan

- `orders (service_date, status)` — pantalla de producción del día.
- `orders (user_id, service_date DESC)` — "mis pedidos".
- `orders (service_date) INCLUDE (user_id, charged_amount)` — corte de nómina.
- `menu_items (menu_id, display_order)` — carga de la pantalla principal.

---

## 3. Endpoints REST

Base `/api/v1`. Autenticación por `Authorization: Bearer`.

### Autenticación e invitaciones

| Método | Ruta | Qué hace | Rol |
|---|---|---|---|
| POST | `/auth/login` | Access token + refresh en cookie. Rechaza cuentas `inactive` | público |
| POST | `/auth/refresh` | Rota el refresh token | público |
| POST | `/auth/logout` | Revoca la sesión actual | todos |
| POST | `/auth/forgot-password` | Responde 204 siempre | público |
| POST | `/auth/reset-password` | Consume el token y revoca todas las sesiones | público |
| GET | `/invitations/:token` | Valida y devuelve correo precargado | público |
| POST | `/invitations/:token/accept` | Fija contraseña, activa la cuenta e inicia sesión | público |

### Cuenta propia

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/me` | Perfil, rol, preferencias de notificación |
| PATCH | `/me` | Nombre, foto, canal preferido |
| PUT | `/me/password` | Requiere contraseña actual |
| POST | `/me/push-subscriptions` | Registra el dispositivo |
| DELETE | `/me/push-subscriptions/:id` | Da de baja el dispositivo |

### Empleados (admin)

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/users?status=&q=&page=` | Listado con búsqueda y paginación |
| POST | `/users/invitations` | Invita uno o varios correos |
| POST | `/users/invitations/:id/resend` | Reenvía y renueva el token |
| GET | `/users/:id` | Ficha con tarifas vigentes y consumo del mes |
| PATCH | `/users/:id` | Nombre, número de nómina, área, rol |
| POST | `/users/:id/deactivate` | Baja lógica; cancela pedidos futuros abiertos |
| POST | `/users/:id/reactivate` | Reactiva conservando historial y tarifas |
| GET | `/users/:id/prices` | Tarifas personalizadas vigentes e históricas |
| POST | `/users/:id/prices` | Alta de subsidio o tarifa fija, con vigencia |
| DELETE | `/users/:id/prices/:priceId` | Cierra la vigencia; no borra histórico |

### Catálogo de platillos (admin)

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/dishes?type=&active=` | Catálogo filtrable |
| POST | `/dishes` | Alta con tipo, tarifa base y `allows_complements` |
| PATCH | `/dishes/:id` | Edición; no afecta pedidos confirmados |
| DELETE | `/dishes/:id` | Baja lógica |
| POST | `/uploads/dish-image` | URL firmada para subir al storage |

### Menús (admin)

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/menus?from=&to=` | Calendario de menús con su estado |
| POST | `/menus` | Crea el menú de una fecha; agrega los base fijos |
| POST | `/menus/:id/duplicate` | Copia un menú anterior a otra fecha |
| PATCH | `/menus/:id` | Hora corte del día y aviso |
| POST | `/menus/:id/items` | Agrega platillo con precio del día y orden |
| PATCH | `/menus/:id/items/:itemId` | Disponibilidad, cupo, orden |
| DELETE | `/menus/:id/items/:itemId` | Bloqueado si ya hay pedidos que lo eligieron |
| POST | `/menus/:id/publish` | Congela `cutoff_at`, abre pedidos, avisa menú nuevo |
| GET | `/menus/:id/broadcast` | Texto listo para WhatsApp, liga corta y `wa.me` |

### Pedidos — empleado

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/menu/available` | **Endpoint principal.** Hoy y mañana con platillos, mi pedido, si puedo editar y cuánto falta para el corte |
| POST | `/orders` | Crea el pedido; valida ventana, corte y reglas de armado |
| POST | `/orders/repeat` | **Repetir mi último pedido.** Copia el último pedido no cancelado a la fecha indicada; si algún platillo ya no está en el menú responde `409` con el detalle para precargar lo que sí queda |
| GET | `/orders/mine?from=&to=` | Mi historial con importes cobrados |
| GET | `/orders/mine/summary?from=&to=` | **Mi gasto del periodo.** Comidas e importe del periodo de nómina en curso y del anterior ya cerrado |
| PATCH | `/orders/:id` | Edita antes del corte; recalcula y recongela el importe |
| DELETE | `/orders/:id` | Cancela antes del corte |
| POST | `/orders/skip` | Fase 2: declarar "hoy no como" sin esperar al corte |

Pasado el corte, POST/PATCH/DELETE de empleado responden
`409 ORDER_WINDOW_CLOSED` con el `cutoff_at` en el cuerpo.

### Pedidos — administración

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/admin/orders?date=&status=&userId=` | Tablero del día |
| GET | `/admin/orders/pending?date=` | Quién no ha pedido todavía |
| GET | `/admin/orders/summary?date=` | Consolidado por platillo para cocina y proveedor |
| POST | `/admin/orders` | Pedido expreso: ignora el corte, exige `reason`, queda en bitácora |
| PATCH | `/admin/orders/:id` | Edita cualquier pedido salvo si su periodo de nómina cerró |
| DELETE | `/admin/orders/:id` | Elimina con motivo obligatorio |
| POST | `/admin/orders/bulk-deliver` | Marca entregados todos los `confirmed` de la fecha (o los `ids` enviados) |
| POST | `/admin/orders/:id/waive` | Condona el cobro con motivo obligatorio; el pedido conserva su estado y deja de sumar al corte |
| DELETE | `/admin/orders/:id/waive` | Revierte la condonación mientras el periodo de nómina siga abierto |
| POST | `/admin/menus/:id/close` | Cierre manual anticipado |

### Reportes y nómina (admin)

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/reports/charges?from=&to=&format=xlsx\|csv\|json` | Cobros para RRHH. El XLSX trae dos hojas: *Resumen* (una fila por empleado) y *Detalle* (una fila por pedido), ambas con columna de excepciones |
| GET | `/reports/production?date=&format=pdf` | Listado consolidado para producción y proveedor |
| GET | `/reports/dashboard?from=&to=` | Participación, platillo más pedido, gasto por área, cancelaciones |
| GET | `/payroll/periods` | Cortes generados y su estado |
| POST | `/payroll/periods` | Genera el corte del rango en `draft` con sus renglones |
| POST | `/payroll/periods/:id/close` | Congela renglones y bloquea edición de esos pedidos |
| GET | `/payroll/periods/:id/export` | Descarga el archivo exacto enviado a Nómina |
| GET / PATCH | `/settings` | Hora corte default, anticipación, máximo de complementos, plantilla de WhatsApp |

### Internos (solo scheduler, protegidos por secreto)

| Método | Ruta | Qué hace |
|---|---|---|
| POST | `/internal/jobs/reminders` | Cada 5 min: notifica a quien no ha pedido y falta poco para el corte |
| POST | `/internal/jobs/close-cutoff` | Cada 5 min: cierra menús vencidos y genera los `no_meal` |
| POST | `/internal/jobs/menu-watch` | Diario: avisa al Admin si mañana no tiene menú publicado |

---

## 4. Flujos principales

### A. Alta de empleado por invitación

1. El Admin captura correo, nombre y número de nómina (acepta varios de golpe).
2. Se crea la cuenta en `invited` y una invitación con token de 72 h; solo se
   guarda el hash.
3. Sale el correo con la liga. Una invitación pendiente previa se revoca.
4. El empleado abre la liga; la app valida el token y precarga su correo.
5. Fija contraseña: cuenta → `active`, invitación → `accepted`, sesión iniciada.
6. El navegador pide permiso de notificaciones y registra el dispositivo.
7. **Baja:** se revocan sesiones y se cancelan pedidos futuros abiertos;
   historial y cobros intactos. **Reactivación:** vuelve a `active` con sus
   tarifas personalizadas tal como estaban.

### B. Publicación del menú y difusión

1. El Admin crea el menú del día siguiente o duplica uno anterior; los platillos
   base se agregan solos.
2. Ajusta la hora corte si ese día es distinta y escribe el aviso.
3. Publica: se congela `cutoff_at`, el menú queda visible y sale el aviso de
   menú nuevo.
4. Toca "Generar mensaje de WhatsApp": texto con platillos, aviso, hora corte y
   liga corta.
5. Copia o abre WhatsApp con el mensaje precargado y lo pega en el grupo.
6. Quien abre la liga entra directo a la pantalla de pedido; si no tiene sesión,
   hace login y aterriza en el mismo lugar.

### C. Pedido, edición y corte

Estados: `sin pedido → confirmed → (cancelled | delivered)`, más `no_meal` por
omisión o declaración explícita. Las transiciones posteriores al corte solo las
ejecuta el Admin.

1. El empleado ve **hoy** y **mañana**: principales arriba, base abajo, con su
   estado de pedido y el tiempo restante para el corte.
2. Si ya pidió antes, **"Repetir lo de la última vez"** arma el pedido completo en
   un toque y solo queda confirmar. Si prefiere armarlo, elige un principal o un
   base; si el platillo no permite complementos, el paso no aparece.
3. Agrega hasta dos complementos, las salsas que quiera y un comentario. Sin
   bebidas.
4. Confirma. El servidor valida en una transacción: menú publicado, corte no
   vencido, cupo disponible, un principal, máximo dos complementos, un solo
   pedido vigente ese día.
5. Se resuelve la tarifa del empleado y se congela en el pedido.
6. Puede editar o cancelar hasta el corte; cada cambio recongela el importe.
7. Al llegar el corte, el job cierra el menú, bloquea la edición del empleado y
   crea `no_meal` para cada empleado activo que no pidió.
8. Después del corte solo el Admin registra expresos, edita o elimina, con
   motivo y bitácora.
9. A la entrega, el Admin marca la recepción masiva: `confirmed → delivered`.

### D. Notificaciones

- Cron cada 5 min: si hay menú publicado y faltan menos de N minutos para el
  corte (default 60), se toman los empleados activos sin pedido ni `no_meal`, se
  descartan los que ya recibieron aviso ese día (`dedupe_key` = usuario + fecha +
  tipo) y se envía push; correo como respaldo para quien no dio permiso.
- Cron de corte: cierra el menú vencido, crea los `no_meal` de los omisos y avisa
  al Admin que el resumen del día está listo.

### E. Producción y entrega

1. Cerrado el corte, el Admin abre el consolidado del día: totales por platillo,
   complemento y salsa.
2. Exporta el PDF de producción (resumen arriba, detalle por persona con sus
   comentarios abajo) y lo manda al proveedor o a la cocina.
3. Durante el servicio consulta la lista nominal para verificar entregas.
4. Al terminar, marca la recepción masiva del día en un toque.

### F. Corte de nómina

1. El Admin elige el rango (quincena o mes) y genera el corte.
2. El sistema suma `charged_amount` de los pedidos cobrables agrupados por
   empleado y crea el corte en `draft`.
3. Revisa totales por persona, número de comidas y la lista de excepciones:
   expresos, ediciones fuera de tiempo y condonaciones.
4. Si hay error, corrige o condona el pedido y regenera el borrador.
5. Cierra el corte: renglones congelados, pedidos del rango bloqueados para
   edición y para condonación.
6. Descarga el XLSX y lo envía a Nómina. Hoja **Resumen**: número de nómina,
   nombre, comidas, importe y excepciones. Hoja **Detalle**: una fila por pedido
   con fecha, platillo, importe, origen y marca de condonado.
7. El archivo queda archivado en el corte y siempre puede reimprimirse.

---

## 5. Alcance confirmado de la v1

### Reglas de negocio cerradas

| Tema | Regla | Dónde vive en el diseño |
|---|---|---|
| Cobro | Se cobra lo confirmado. Quien no pasa por su comida paga, salvo que el Admin condone con motivo | `orders.is_waived`, `POST /admin/orders/:id/waive` |
| Precio | Complementos y salsas incluidos en la tarifa del principal; un solo importe por comida | `order_items.unit_price = 0` para no-principales |
| Reporte | XLSX con resumen por empleado, detalle día por día y marca de excepciones | `GET /reports/charges`, flujo F |
| Experiencia | Repetir el último pedido y ver el gasto acumulado del periodo | `POST /orders/repeat`, `GET /orders/mine/summary` |

Como el corte de Nómina no requiere subtotales por área, `departments` queda como
campo opcional: se captura si sirve para filtrar, pero ningún reporte depende de él.

### Fuera de la v1

- **Botón "hoy no como".** La omisión sigue siendo automática: quien no pide antes
  del corte queda en `no_meal`. `POST /orders/skip` queda diseñado por si más
  adelante conviene tener el número firme antes del corte.
- **Cupo por platillo.** `stock_limit` se crea desde ya para no migrar después,
  pero la v1 no limita porciones ni muestra "quedan N".

### Detalles de experiencia incluidos sin costo extra

- **Cuenta regresiva** al corte: "faltan 42 min" mueve más que "cierra a las 11:00".
- **Duplicar menú** desde un día anterior: la captura diaria del Admin pasa a
  quince segundos.
- **Marcar agotado** sin borrar, para no afectar a quien ya pidió.
- **Vista de cocina** en pantalla grande con los totales del día.

### Orden de construcción sugerido

1. Migraciones y modelo de datos completo, con restricciones de unicidad y
   triggers de armado. Es lo que más caro sale cambiar después.
2. Auth por invitación de punta a punta.
3. Catálogo, menú y publicación, con el flujo de imágenes.
4. Pedido del empleado con corte y repetir último: aquí ya hay algo demostrable.
5. Jobs de recordatorio y cierre, tablero del Admin y recepción masiva.
6. Reportes y corte de nómina, que es lo que justifica el sistema ante RRHH.
