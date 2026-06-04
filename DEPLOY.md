# Deploy a producción — Reservalo

Dos caminos. El **A (VPS con Docker)** es el más directo y barato; el **B (PaaS)** evita
administrar servidor.

---

## Antes de empezar (cualquier camino)

1. **Dominio.** Necesitás un dominio y poder crear dos subdominios apuntando al servidor:
   - `app.midominio.com` → frontend (panel + reservas públicas)
   - `api.midominio.com` → backend (API)
2. **Generá un SECRET_KEY** fuerte:
   ```bash
   openssl rand -hex 32
   ```
3. **SMTP** (opcional pero recomendado para que salgan los emails reales de confirmación
   y recordatorio): datos de tu proveedor (Gmail/SendGrid/Mailgun/Zoho, etc.).

---

## Camino A — VPS con Docker Compose + Caddy (HTTPS automático)

Pensado para un VPS Ubuntu (DigitalOcean, Hetzner, Contabo, etc.) con Docker instalado.

### 1. Configurar variables

**Raíz del proyecto** → copiá `.env.prod.example` a `.env` y completá:
```bash
cp .env.prod.example .env
# editá POSTGRES_PASSWORD y PUBLIC_API_URL=https://api.midominio.com
```

**Backend** → editá `backend/.env` (basado en `backend/.env.example`):
```ini
ENVIRONMENT=production
DEBUG=false
DATABASE_URL=postgresql+psycopg2://reservalo:LA_MISMA_CLAVE@db:5432/reservalo
SECRET_KEY=<openssl rand -hex 32>
CORS_ORIGINS=["https://app.midominio.com"]
PUBLIC_BASE_URL=https://app.midominio.com
# SMTP (si lo dejás vacío, los emails se loguean en vez de enviarse)
SMTP_HOST=smtp.tu-proveedor.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASSWORD=...
SMTP_FROM=Reservalo <reservas@midominio.com>
```

### 2. Apuntar el dominio

Editá el `Caddyfile` y reemplazá `app.midominio.com` / `api.midominio.com` por los tuyos.
Creá los registros **DNS A** de ambos subdominios apuntando a la IP del servidor.

### 3. Levantar

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Caddy obtiene los certificados HTTPS automáticamente (Let's Encrypt). Listo:
- Panel: `https://app.midominio.com`
- API/Swagger: `https://api.midominio.com/docs`

Las migraciones de Alembic se aplican solas al iniciar el backend.

### 4. Actualizaciones

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

---

## Camino B — PaaS (sin servidor)

- **Base de datos:** PostgreSQL administrado (Neon, Supabase, Railway, Render).
- **Backend:** Render / Railway / Fly.io a partir de `backend/Dockerfile`. Variables:
  `DATABASE_URL`, `SECRET_KEY`, `CORS_ORIGINS`, `PUBLIC_BASE_URL`, `SMTP_*`.
  Comando ya incluido en el contenedor (migra + uvicorn).
- **Frontend:** Vercel (detecta Next.js). Configurá la variable
  `NEXT_PUBLIC_API_URL=https://<tu-backend>` y deploy.

> Nota: `NEXT_PUBLIC_API_URL` se "hornea" al compilar el frontend. Si cambiás la URL de
> la API, hay que reconstruir el frontend.

---

## Checklist de producción

- [ ] `SECRET_KEY` único y secreto (no el de ejemplo).
- [ ] `DEBUG=false` y `ENVIRONMENT=production`.
- [ ] `CORS_ORIGINS` con el dominio real del frontend (sin `*`).
- [ ] Contraseña fuerte de PostgreSQL.
- [ ] HTTPS activo (Caddy lo hace solo; en PaaS viene incluido).
- [ ] Backups de la base de datos (en PaaS suelen ser automáticos; en VPS, programá
      `pg_dump`).
- [ ] SMTP configurado si querés emails reales (si no, se loguean).
- [ ] Recordatorios: `REMINDER_ENABLED=true` (por defecto). El scheduler corre dentro del
      backend; con **una sola instancia** alcanza. Si escalás a varias, mové los
      recordatorios a un worker único para no duplicar envíos.

---

## Pendientes conocidos (no bloquean el deploy)

- **Verificación de email** en el registro (hoy no se valida el email).
- **Revocación de tokens / logout server-side** (hoy el logout es del lado del cliente).
- **WhatsApp** (en pausa hasta tener cuenta de Meta).
