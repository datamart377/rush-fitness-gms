# Rush Fitness GMS — Mac Setup (Frontend + Backend + PostgreSQL)

Step-by-step guide to run the full stack locally on macOS.

```
┌──────────────────┐     /api/*     ┌──────────────────┐
│  React frontend  │ ─────────────▶ │  Express API     │
│  localhost:3003  │                │  localhost:4000  │
└──────────────────┘                └────────┬─────────┘
                                             │
                                       SQL/pg│
                                             ▼
                                   ┌──────────────────┐
                                   │  PostgreSQL 16   │
                                   │  rush_fitness_gms│
                                   └──────────────────┘
```

---

## 1. Install prerequisites (one-time)

```bash
# Homebrew (skip if already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Node 18+ and Postgres 16
brew install node postgresql@16
brew services start postgresql@16

# Verify
node -v          # v18+
psql --version   # 16.x
```

If `psql` isn't on your PATH, add this to `~/.zshrc` (Apple Silicon):

```bash
echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

(Use `/usr/local/opt/...` on Intel Macs.)

---

## 2. Configure the backend

```bash
cd ~/Desktop/rush-fitness-gms/backend
cp .env.example .env
```

Edit `.env`:

- `DB_USER` — your macOS username (run `whoami` to confirm) is the simplest. Or create a `postgres` user: `createuser -s postgres`.
- `DB_PASSWORD` — leave blank if you didn't set one.
- `JWT_SECRET` — paste the output of:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
  ```

---

## 3. Create database, run migrations, seed

From `~/Desktop/rush-fitness-gms/backend`:

```bash
npm install
npm run db:create     # CREATE DATABASE rush_fitness_gms
npm run db:migrate    # applies migrations/001_initial_schema.sql
npm run db:seed       # admin user, plans, activities, lockers, sample data
```

Expected output ends with:

```
✓ Seed complete
  Admin login:    admin / Admin@12345
  Reception:      joy / Joy@12345
```

---

## 4. Start the API

```bash
# still in backend/
npm run dev
```

The API runs on **http://localhost:4000**. Sanity-check:

```bash
curl http://localhost:4000/api/health
```

---

## 5. Start the React app

In a **second terminal**:

```bash
cd ~/Desktop/rush-fitness-gms
npm install            # if not already
npm start              # opens http://localhost:3003
```

The React dev server proxies `/api/*` to `http://localhost:4000` automatically (set in `package.json` → `"proxy"`).

---

## 6. (Optional) Run frontend + backend in one command

```bash
cd ~/Desktop/rush-fitness-gms
npm install --save-dev concurrently
npm run dev            # starts both via the new "dev" script
```

---

## How the frontend uses the backend

The React app already includes a typed API client at `src/api/client.js`. Inside any component:

```jsx
import { authApi, membersApi, dashboardApi } from './api/client';

// login
const { user } = await authApi.login('admin', 'Admin@12345');

// list members
const { data, pagination } = await membersApi.list({ search: 'sarah', limit: 50 });

// create one
await membersApi.create({
  firstName: 'Sarah',
  lastName: 'Nakamya',
  phone: '0771234567',
  gender: 'Female',
  dob: '1995-03-15',
  pin: '1234',
});

// dashboard widget data
const stats = await dashboardApi.get();
```

The token is persisted in `localStorage` under `rfg_token` and is added to every request automatically. On a `401` response the client clears the token, so simply redirect to your login screen when a request throws with `err.status === 401`.

---

## Common issues

| Symptom | Fix |
|---|---|
| `psql: error: connection to server failed` | `brew services restart postgresql@16` |
| `role "postgres" does not exist` | Use your macOS username in `DB_USER`, **or** run `createuser -s postgres` |
| `database "rush_fitness_gms" does not exist` | Run `npm run db:create` first |
| `JWT_SECRET is not configured` | Paste a long random value into `backend/.env` |
| Port 4000 in use | Change `PORT` in `backend/.env`; also update the `"proxy"` field in the root `package.json` |
| Port 3003 in use | Change `PORT=3003` in the `start` script of the root `package.json` |
| CORS error | Ensure `CORS_ORIGIN=http://localhost:3003` in `backend/.env` and that you didn't bypass the CRA proxy by hard-coding `http://localhost:4000` in the frontend |

---

## What was added by this setup

```
rush-fitness-gms/
├── backend/                       ◀── NEW: Express API + PostgreSQL
│   ├── migrations/001_initial_schema.sql
│   ├── seeds/seed.js
│   ├── scripts/{create-db,migrate,reset}.js
│   ├── src/{server.js, db, middleware, routes, utils}
│   ├── README.md                  ◀── full backend docs + API reference
│   ├── package.json
│   └── .env.example
├── src/api/client.js              ◀── NEW: typed fetch client for React
├── package.json                   ◀── proxy + PORT=3003 added
├── .env.local.example             ◀── NEW
└── SETUP.md                       ◀── this file
```

---

## Default credentials (change after first login!)

| Role | Username | Password |
|---|---|---|
| Admin | `admin` | `Admin@12345` |
| Receptionist | `joy` | `Joy@12345` |

Override `SEED_ADMIN_PASSWORD` in `backend/.env` before running `npm run db:seed` if you want a different default.
