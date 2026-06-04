# Reservalo — SaaS de reservas multiempresa

Motor de reservas online multi-tenant. Cualquier negocio que trabaje con horarios
(consultorios, peluquerías, canchas, estudios, talleres, academias…) crea una cuenta,
configura sus servicios/recursos/horarios y recibe reservas online a través de una URL
pública.

## Stack

| Capa        | Tecnología                                                        |
| ----------- | ----------------------------------------------------------------- |
| Backend     | Python 3.13, FastAPI, SQLAlchemy 2.0, PostgreSQL, Alembic, JWT    |
| Frontend    | Next.js 15, TypeScript, TailwindCSS, shadcn/ui, React Query, Axios |
| Infra       | Docker, Docker Compose                                            |

## Arquitectura multi-tenant

Cada negocio es un **Tenant**. Todos los registros (usuarios, servicios, recursos,
horarios, reservas) pertenecen a un tenant, y cada endpoint autenticado filtra por el
`tenant_id` del usuario del JWT. Un usuario nunca puede ver datos de otro tenant.

### Roles

- **owner** — administra el negocio, usuarios, servicios, recursos, horarios y reservas.
- **staff** — ve reservas y administra la agenda.
- **client** — reserva y cancela (vía la web pública).

## Puesta en marcha (Docker)

```bash
# 1. Variables de entorno (los .env de ejemplo ya están listos para desarrollo)
cp backend/.env.example backend/.env       # opcional: ya existe un .env de dev
cp frontend/.env.local.example frontend/.env.local

# 2. Levantar todo
docker compose up --build
```

- Frontend: http://localhost:3000
- API + Swagger: http://localhost:8000/docs
- PostgreSQL: localhost:5432 (reservalo / reservalo)

Las migraciones de Alembic se aplican automáticamente al iniciar el contenedor backend.

## Desarrollo local (sin Docker)

### Backend

```bash
cd backend
python3.13 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# Apuntá DATABASE_URL a tu Postgres local en backend/.env
alembic upgrade head
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Flujo de uso

1. **Registrate** en `/register` → se crea el tenant + usuario owner y se obtiene el JWT.
2. Cargá **Servicios** (duración + precio), **Recursos** (lo que se reserva) y
   **Horarios** (disponibilidad semanal por recurso).
3. Compartí tu **URL pública** `/booking/{slug}` (visible en Configuración).
4. Tus clientes reservan: servicio → recurso → fecha → hora → datos → confirmar.
5. Al confirmar, el cliente recibe un **enlace de gestión** `/booking/{slug}/r/{código}`
   con el que puede **cancelar o reprogramar** su turno solo, sin loguearse. El código es
   un token aleatorio no adivinable; solo se permite gestionar reservas futuras y activas.

## Reglas de negocio (motor de reservas)

Centralizadas en [`backend/app/services/availability.py`](backend/app/services/availability.py):

- `end_datetime = start_datetime + service.duration_minutes` (cálculo automático).
- No se permite reservar fuera del horario configurado del recurso.
- No se permite doble reserva / solapamiento sobre el mismo recurso
  (estados `pending`, `confirmed`, `completed` ocupan el slot; `cancelled` lo libera).

### Reglas de reserva (configurables por negocio)

- **Excepciones de fecha** por recurso: feriados/vacaciones (cerrado) u **horario especial**
  para una fecha puntual, que sobreescriben el horario semanal.
- **Mapeo servicio↔recurso**: qué recursos pueden realizar cada servicio (vacío = todos).
  La reserva pública solo ofrece los recursos válidos para el servicio elegido.
- **Margen entre turnos** (buffer), **anticipación mínima** y **máxima** de reserva
  (Configuración → Reglas de reserva).

### Zona horaria

Cada negocio tiene su zona horaria IANA (por defecto **`America/Asuncion`**, editable en
Configuración). Las reservas se guardan en **UTC** y los horarios se interpretan en la zona
del negocio, así un turno de las 09:00 en Asunción se almacena como `12:00Z` y se muestra
correcto sin importar dónde esté el servidor. Los precios se muestran en **Guaraníes (₲)**.

### Pagos (sin pasarela)

Pensado para Paraguay: el negocio configura en **Configuración → Pagos** si acepta
**pago en el local** y/o **transferencia/alias** (con alias/billetera, instrucciones y un
**% de seña** opcional). Al reservar, el cliente elige el método; si es transferencia se
le muestra el alias y el monto. El dueño marca la reserva como **pagada** desde el panel
de Reservas. Los precios se muestran en Guaraníes (₲).

### Marca de la página pública

Cada negocio personaliza su `/booking/{slug}`: **logo** (URL), **color de marca** y
**descripción**. El color se aplica a la página de reservas del cliente.

### Notificaciones por email

Al confirmarse una reserva se envían (en segundo plano) un **email de confirmación al
cliente** (con el enlace de gestión) y un **aviso al dueño**. Si no se configura SMTP,
los emails se **loguean por consola** — así el flujo funciona en desarrollo sin proveedor.
Configurable con `SMTP_*` y `PUBLIC_BASE_URL` (ver `backend/.env.example`).

Además, un **scheduler** (APScheduler) envía un **recordatorio "24h antes"** por email a
cada cliente (idempotente, configurable con `REMINDER_*`).

### Reportes, clientes y comprobantes

- **Reportes** (owner): ingresos estimados/cobrados, reservas por estado, servicios más
  reservados y reservas por día, con selector de período (7/30/90 días).
- **Clientes (mini-CRM)**: clientes agregados desde las reservas (por email/teléfono) con
  total de visitas e historial.
- **Comprobante de transferencia**: el cliente lo sube (imagen/PDF) desde su enlace de
  gestión; el dueño lo ve en el panel de Reservas. Se sirve bajo `/uploads` (volumen).

### Seguridad / cuentas

- **Gestión de usuarios/staff** (owner): alta/edición/desactivación, con guarda de "último
  owner activo".
- **Logout server-side** (`POST /auth/logout`): invalida todos los tokens vigentes del
  usuario vía `token_version`.
- **Verificación de email**: al registrarse se envía un enlace (`/verify-email`); banner
  para reenviar. No bloquea el login.
- **Rate limiting** en login y **candado anti-doble-reserva** a nivel base de datos
  (constraint de exclusión Postgres).

## Tests

Suite de Pytest centrada en el motor de reservas (timezone, doble reserva, horarios) y el
flujo de API (auth, aislamiento multi-tenant, reserva pública). Corre contra una base de
datos `*_test` dedicada en el mismo Postgres:

```bash
docker compose exec backend pytest
```

## API REST

`http://localhost:8000/docs` (Swagger UI). Resumen:

| Grupo      | Endpoints                                                             |
| ---------- | --------------------------------------------------------------------- |
| Auth       | `POST /auth/register` · `/login` · `/refresh` · `/forgot-password` · `/reset-password` · `GET /auth/me` |
| Tenant     | `GET /tenant` · `PUT /tenant`                                          |
| Dashboard  | `GET /dashboard`                                                      |
| Services   | `GET/POST /services` · `PUT/DELETE /services/{id}`                     |
| Resources  | `GET/POST /resources` · `PUT/DELETE /resources/{id}`                   |
| Schedules  | `GET/POST /schedules` · `DELETE /schedules/{id}`                       |
| Bookings   | `GET/POST /bookings` · `PUT/DELETE /bookings/{id}`                     |
| Public     | `GET /public/{slug}` · `GET /public/{slug}/availability` · `POST /public/{slug}/booking` |

## Estructura

```
reservaspy/
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI app + routers
│   │   ├── config.py          # settings (pydantic-settings)
│   │   ├── database.py        # engine + session + Base
│   │   ├── security.py        # hashing + JWT (access/refresh/reset)
│   │   ├── dependencies.py    # get_current_user + role guards
│   │   ├── models/            # SQLAlchemy 2.0 models (6 entidades)
│   │   ├── schemas/           # Pydantic v2 schemas
│   │   ├── services/          # motor de reservas (availability)
│   │   └── routers/           # auth, tenant, dashboard, services, resources,
│   │                          #   schedules, bookings, public
│   ├── alembic/               # migraciones
│   ├── Dockerfile · entrypoint.sh · requirements.txt
├── frontend/
│   ├── src/app/               # App Router: login, register, (app)/*, booking/[slug]
│   ├── src/components/ui/      # primitivos shadcn/ui
│   ├── src/lib/               # api (axios), types, utils
│   ├── src/hooks/             # auth
│   └── Dockerfile
└── docker-compose.yml
```

## Deploy a producción

Ver **[DEPLOY.md](DEPLOY.md)**: incluye `docker-compose.prod.yml` con **Caddy (HTTPS
automático)** para un VPS, o el camino PaaS (Render/Railway + Vercel), variables de
entorno y checklist de producción.

## Fase 2 (no implementado)

La arquitectura queda preparada para: WhatsApp, notificaciones/recordatorios, pagos y
suscripciones, multi-idioma y app móvil.
