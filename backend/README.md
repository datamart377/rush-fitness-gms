# Rush Fitness GMS — Backend (Node.js + Express + PostgreSQL)

REST API that powers the Rush Fitness GMS React app. PostgreSQL is the system of record. JWT for auth, bcrypt for password and PIN hashing, role-based access control (admin / manager / receptionist / trainer).

The frontend (the existing React app in the parent folder) talks to this API via the CRA proxy in dev (`/api/*` → `http://localhost:4000`). In production, set `REACT_APP_API_URL` on the frontend.

---

## 1. Prerequisites (one-time, on a Mac)

```bash
# Install Homebrew if you don't have it
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Node.js 18+ and PostgreSQL 14+
brew install node postgresql@16

# Start Postgres (and have it run on login)
brew services start postgresql@16
```

Verify Postgres is running:

```bash
psql postgres -c "SELECT version();"
```

If `psql` isn't found, add `/opt/homebrew/opt/postgresql@16/bin` (Apple Silicon) or `/usr/local/opt/postgresql@16/bin` (Intel) to your `PATH`.

> **Note on the default user:** Homebrew's Postgres uses your macOS username as the superuser, with no password. The defaults in `.env.example` assume `postgres` — adjust them to your username if needed (or create a `postgres` user with `createuser -s postgres`).

---

## 2. Configure environment

```bash
cd ~/Desktop/rush-fitness-gms/backend
cp .env.example .env
```

Open `.env` and:

- Set `DB_USER` to the user that owns your Postgres (often your macOS username, e.g. `oracle`).
- Set `DB_PASSWORD` if you set one.
- **Replace `JWT_SECRET`** with a long random string. Generate one with:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
  ```
- Optionally change `SEED_ADMIN_PASSWORD` (the seed script uses this for the default `admin` login).

---

## 3. Install, create DB, run migrations, seed

From `~/Desktop/rush-fitness-gms/backend`:

```bash
npm install
npm run db:create     # creates the rush_fitness_gms database
npm run db:migrate    # applies all SQL files in /migrations
npm run db:seed       # creates admin user, plans, activities, lockers, sample data
```

You should see:

```
✓ Seed complete

  Admin login:    admin / Admin@12345
  Reception:      joy / Joy@12345
```

---

## 4. Start the API

```bash
# from ~/Desktop/rush-fitness-gms/backend
npm run dev      # uses nodemon for auto-reload on file changes
# or
npm start
```

The API listens on `http://localhost:4000`. Health check:

```bash
curl http://localhost:4000/api/health
# → {"ok":true,"db":"up","uptime":1.23}
```

Smoke-test login:

```bash
curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"Admin@12345"}'
```

---

## 5. Run the React frontend

In a **second** terminal, from `~/Desktop/rush-fitness-gms`:

```bash
npm install            # if you haven't already
npm start              # serves the React app on http://localhost:3003
```

The CRA proxy (`"proxy": "http://localhost:4000"` in `package.json`) forwards every `/api/*` request to the backend, so no CORS headaches in dev.

> **Run both at once:** from the project root, `npm install --save-dev concurrently` once, then `npm run dev` will boot the React app and the API together.

---

## API quick reference

All routes are under `/api`. All routes other than `POST /api/auth/login` and `GET /api/health` require `Authorization: Bearer <jwt>`.

| Resource | Endpoints |
|---|---|
| Auth | `POST /auth/login`, `GET /auth/me`, `POST /auth/change-password`, `POST /auth/register` (admin) |
| Users | `GET/PATCH/DELETE /users[/id]` (admin) |
| Members | `GET/POST /members`, `GET/PATCH/DELETE /members/:id`, `POST /members/:id/verify-pin` |
| Trainers | `GET/POST /trainers`, `GET/PATCH/DELETE /trainers/:id` |
| Plans | `GET/POST /plans`, `GET/PATCH/DELETE /plans/:id` |
| Memberships | `GET/POST /memberships`, `GET/PATCH/DELETE /memberships/:id`, `POST .../freeze`, `.../unfreeze`, `.../cancel` |
| Payments | `GET/POST /payments`, `GET /payments/:id`, `POST /payments/:id/refund` |
| Lockers | `GET/POST /lockers`, `GET/PATCH/DELETE /lockers/:id`, `POST .../assign`, `.../release` |
| Products | `GET/POST /products`, `GET/PATCH/DELETE /products/:id`, `POST /products/:id/sell` |
| Activities | `GET/POST /activities`, `GET/PATCH/DELETE /activities/:id` |
| Timetable | `GET/POST /timetable`, `GET/PATCH/DELETE /timetable/:id` |
| Attendance | `GET /attendance`, `POST /attendance/check-in`, `POST /attendance/:id/check-out` |
| Walk-ins | `GET/POST /walk-ins`, `GET/PATCH/DELETE /walk-ins/:id`, `POST /walk-ins/:id/check-in` |
| Equipment | `GET/POST /equipment`, `GET/PATCH/DELETE /equipment/:id` |
| Discounts | `GET/POST /discounts`, `GET/PATCH/DELETE /discounts/:id` |
| Expenses | `GET/POST /expenses`, `GET/DELETE /expenses/:id` |
| Audit logs | `GET /audit-logs` (admin) |
| Dashboard | `GET /dashboard` |

All list endpoints support `?limit=` (max 200) and `?offset=`. Many also support `?search=`, `?from=`, `?to=`, etc. — see the route files for specifics.

---

## Useful commands

```bash
npm run db:reset        # ⚠ drops all tables, re-runs migrations and seed
npm run db:migrate      # apply only un-applied migrations
psql rush_fitness_gms   # open a SQL shell
```

---

## Project layout

```
backend/
├── migrations/           Plain SQL migrations (run in alphabetical order)
│   └── 001_initial_schema.sql
├── seeds/
│   └── seed.js           Idempotent seed script
├── scripts/
│   ├── create-db.js
│   ├── migrate.js
│   └── reset.js
├── src/
│   ├── server.js         Express entry point
│   ├── db/pool.js        Single Postgres pool
│   ├── middleware/       auth, validate, errorHandler
│   ├── routes/           One file per resource
│   └── utils/            asyncHandler, ApiError, audit, crud helpers
├── package.json
└── .env.example
```

---

## Security notes

- Passwords hashed with bcrypt (configurable rounds, default 10).
- JWT signed with `JWT_SECRET`; default expiry 8 hours.
- Login endpoint rate-limited to 20 attempts per 10 minutes per IP.
- Helmet sets sensible HTTP headers.
- All inputs validated with `express-validator`; central error handler maps Postgres errors (unique violation, FK violation, …) to clean 4xx responses.
- Every mutation is recorded in `audit_logs`.

---

## Production checklist

- Set `NODE_ENV=production`.
- Use a managed Postgres (RDS, Supabase, Neon, etc.) and put the URL in `DATABASE_URL`.
- Use a strong `JWT_SECRET` from a secrets manager.
- Put the API behind HTTPS (Caddy / Nginx / Cloudflare).
- Set `CORS_ORIGIN` to the deployed frontend URL.
- Build the React app with `REACT_APP_API_URL=https://api.your-domain.com npm run build` and serve the resulting `build/` from any static host.
