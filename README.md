# Rush Fitness Center — Gym Management System

A web-based gym management system built for **Rush Fitness Center**, Naalya Quality Shopping Mall, Kampala.

## Features

- **Member Registration** — with photo capture, National ID, and PIN
- **Check-In System** — staff-assisted and self-service kiosk mode
- **Membership Plans** — Daily, Weekly, Monthly, Half Year, Annual + Group + Gym+Steam combos
- **Partial Payments** — installment tracking with progress bars and auto-activation on full payment
- **Class Timetable** — weekly schedule display
- **Trainer Management** — profiles and assignments
- **Equipment Tracking** — maintenance schedules and status
- **Locker Management** — visual availability grid
- **Walk-In Guests** — one-off visit recording
- **Discounts & Promos** — percentage and fixed-amount offers
- **Daily Reconciliation** — cash declaration vs system records
- **Revenue Reports** — by method, plan, and period
- **Role-Based Access** — Admin (full) vs Staff (front-desk only)
- **Security** — SHA-256 password hashing, session timeout, brute-force protection, audit logging

## Default Login Credentials

| Role  | Username | Password   |
|-------|----------|------------|
| Admin | admin    | admin123   |
| Staff | joy      | joy123     |

## Tech Stack

- **React 18** + Vite
- **Lucide React** icons
- No backend required — runs entirely in-browser (state resets on refresh)

## Run Locally

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/rush-fitness-gms.git
cd rush-fitness-gms

# 2. Install dependencies
npm install

# 3. Start dev server
npm run dev
```

Opens at `http://localhost:5173`

## Deploy to GitHub Pages

This repo includes a GitHub Actions workflow that auto-deploys on every push to `main`. See the deployment guide below or the `.github/workflows/deploy.yml` file.

## License

Private — Rush Fitness Center © 2025
