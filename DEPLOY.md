# Deploying Rush Fitness GMS to Render

Estimated time: **15 minutes** (mostly waiting for the first build).

## What you'll get

After this, Rush Fitness GMS will be live at:
- Frontend: `https://rush-fitness-gms.onrender.com`
- API:      `https://rush-fitness-api.onrender.com`
- Postgres: managed by Render, with daily backups + 7-day point-in-time recovery

Anyone you give the URL to (staff, you on your phone, etc.) can log in and they'll all see the same data in real time.

**Cost:** $14/month total ($7 backend + $7 Postgres + free static site).

## Prerequisites

- Code is pushed to `https://github.com/datamart377/rush-fitness-gms`
- The `render.yaml` file at the repo root is committed and pushed
- A free [Render account](https://dashboard.render.com/register) (sign in with your GitHub)

## Step 1 — Push the deploy config

Make sure `render.yaml` is in `main`:

```
cd ~/Desktop/rush-fitness-gms
git add render.yaml DEPLOY.md .gitignore
git commit -m "Add Render deployment config"
git push origin main
```

## Step 2 — Create the Blueprint in Render

1. Go to https://dashboard.render.com
2. Click **New** (top-right) → **Blueprint**
3. Click **Connect a repository** and authorise Render to read your GitHub repos
4. Find and select **`datamart377/rush-fitness-gms`**
5. Render reads `render.yaml` and shows you 3 services to be created:
   - `rush-fitness-db` (PostgreSQL — $7/mo)
   - `rush-fitness-api` (Web Service — $7/mo)
   - `rush-fitness-gms` (Static Site — Free)
6. Give the blueprint a name (e.g. `rush-fitness-prod`) and click **Apply**

Render will:
- Create the database (~30 seconds)
- Build the backend (~2 minutes — installs deps, runs migrations + seed)
- Build the React app (~3 minutes — installs deps, runs `npm run build`)

You can watch each build in real time from the Render dashboard.

## Step 3 — Verify

Once both services say **Live**, in your browser:

1. Visit `https://rush-fitness-api.onrender.com/api/health`
   → should return `{"ok":true,"db":"up","uptime":...}`
2. Visit `https://rush-fitness-gms.onrender.com`
   → should show the login page
   → the status banner at the bottom should be **green**: `✓ Backend OK at https://rush-fitness-api.onrender.com (db: up)`
3. Log in with the seeded admin:
   - Username: `admin`
   - Password: `Admin@12345`
4. Click around — Members, Memberships, Lockers, Activities, etc. — everything should work the same as it did locally

## Step 4 — IMPORTANT: change the admin password immediately

The seeded `admin/Admin@12345` is public knowledge (it's in this repo). Change it before letting anyone else log in:

1. Log in as admin
2. Go to **Admin → Staff** in the sidebar
3. Click the password reset icon next to **System Administrator**
4. Set a strong new password (12+ chars, mixed case, digits, symbols)
5. Do the same for the seeded `joy / Joy@12345` manager account

## Step 5 — Add your real staff

1. **Admin → Staff → Add Staff**
2. For each receptionist / manager / trainer, create an account with a strong password
3. Send them their credentials securely (don't email passwords — share via Signal/in person)
4. Once everyone is set up, deactivate or delete the seeded accounts you don't need

## Step 6 — Cross-browser sanity test

1. Log in from your phone, your laptop, and the gym tablet (different browsers, different networks)
2. Add a member on one device → refresh on another → it should appear
3. Confirms the app is doing what you wanted: one shared source of truth across all devices

---

## Useful operations after deploy

### View logs
Render Dashboard → `rush-fitness-api` → **Logs** tab. Live tail of backend logs (request lines, errors, etc.).

### Connect to the production database
Render Dashboard → `rush-fitness-db` → **Connect** → copy the External Database URL → run:
```
psql 'postgresql://...'
```
Then any `SELECT` works just like your local Postgres.

### Trigger a manual deploy
Push to `main`, or in Render Dashboard → service → **Manual Deploy** → **Deploy latest commit**.

### Rollback
Render Dashboard → service → **Events** tab → click any past deploy → **Roll Back**.

### Restore the database
Render Dashboard → `rush-fitness-db` → **Recovery** → pick a point in time within the last 7 days → restores into a new DB you can promote.

---

## Things to know

### Free Postgres expires after 90 days
The starter ($7/mo) Postgres in `render.yaml` is paid and persistent. If you ever switch to free Postgres, **back up first** because it will be deleted at 90 days. Use `pg_dump` or Render's export.

### CORS_ORIGIN is hardcoded
`render.yaml` sets `CORS_ORIGIN=https://rush-fitness-gms.onrender.com`. If you move to a custom domain (e.g. `gms.rushfitness.ug`), update this env var on the API service in Render's dashboard.

### Custom domain
Render dashboard → service → **Settings** → **Custom Domains** → add `gms.rushfitness.ug` → Render gives you the DNS records to point your domain at it. SSL is automatic via Let's Encrypt.

### Member photos
Currently stored as base64 data URLs in the `members.photo_url` TEXT column. ~200 KB per photo. With 100 members that's 20 MB — fine on the $7 Postgres plan. If you grow past 1,000 members consider moving photos to S3/Cloudflare R2 with just the URL in Postgres.

### Backup recommendation
Even with daily automatic backups, take a manual export before any major change:
```
pg_dump 'postgresql://...' > backup-$(date +%Y%m%d).sql
```

### What I'd watch in month 1
- The `audit_logs` table grows fast — if it's >100k rows, archive everything older than 90 days
- Watch your Render usage dashboard for bandwidth (1 GB/mo free, then $0.10/GB)

---

## Troubleshooting

**Backend deploy fails: "ENOTFOUND postgres-..."**
The DB hasn't finished creating. Wait 1 minute and click **Manual Deploy** on the API service.

**Frontend loads but login hangs**
The backend is sleeping (free tier) or down. Check the API's **Logs** tab. If the API is on Starter ($7/mo) it should never sleep.

**"Backend unreachable" red banner**
Backend is down or CORS is blocking the browser. Check that `CORS_ORIGIN` on the API matches the actual frontend URL exactly (https, not http; no trailing slash).

**Login returns 401 when credentials are correct**
The DB seed didn't run. Connect via psql and check `SELECT count(*) FROM users;` — should be 2. If 0, run `npm run db:seed` from the API service's **Shell** tab.

**Need to start fresh on the database**
Don't delete the DB — instead, connect via psql and `TRUNCATE` the tables you want cleared, then run `npm run db:seed` from the API service's Shell tab.
