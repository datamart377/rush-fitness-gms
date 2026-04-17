import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Search, UserPlus, LogIn, Users, CreditCard, BarChart3, Dumbbell, Calendar, Settings, ChevronRight, Check, X, AlertTriangle, Clock, Activity, Shield, UserCheck, DollarSign, Layers, Tag, ClipboardList, Wrench, ChevronDown, ChevronUp, Plus, Edit2, Trash2, Eye, Pause, Play, Hash, Receipt, TrendingUp, ArrowLeft, Camera, RefreshCw, Star, Zap, Award } from "lucide-react";

// ─── DATA STORE ─────────────────────────────────────────────
const generateId = () => Math.random().toString(36).substr(2, 9);
const formatUGX = (n) => `UGX ${Number(n).toLocaleString()}`;
const formatDate = (d) => new Date(d).toLocaleDateString("en-UG", { year: "numeric", month: "short", day: "numeric" });
const formatTime = (d) => new Date(d).toLocaleTimeString("en-UG", { hour: "2-digit", minute: "2-digit" });
const today = () => new Date().toISOString().split("T")[0];

const PLANS = {
  gym_daily: { name: "Daily (Gym)", price: 20000, days: 1, category: "gym" },
  gym_weekly: { name: "Weekly (Gym)", price: 120000, days: 7, category: "gym" },
  gym_monthly: { name: "Monthly (Gym)", price: 300000, days: 30, category: "gym" },
  gym_half: { name: "Half Year (Gym)", price: 1500000, days: 180, category: "gym" },
  gym_annual: { name: "Annual (Gym)", price: 3000000, days: 365, category: "gym" },
  combo_session: { name: "Per Session (Gym+Steam)", price: 30000, days: 1, category: "combo" },
  combo_monthly: { name: "Monthly (Gym+Steam)", price: 400000, days: 30, category: "combo" },
  combo_3month: { name: "3 Months (Gym+Steam)", price: 1100000, days: 90, category: "combo" },
  combo_half: { name: "Half Year (Gym+Steam)", price: 2000000, days: 180, category: "combo" },
  combo_annual: { name: "Annual (Gym+Steam)", price: 3800000, days: 365, category: "combo" },
};

const GROUP_PLANS = {
  group_2: { name: "Group of 2", price: 500000, perPerson: 250000, size: 2, days: 30 },
  group_3: { name: "Group of 3", price: 700000, perPerson: 233333, size: 3, days: 30 },
  group_5: { name: "Group of 5", price: 1150000, perPerson: 230000, size: 5, days: 30 },
};

const getPlanName = (planKey) => PLANS[planKey]?.name || GROUP_PLANS[planKey]?.name || planKey;

const ACTIVITIES = [
  { id: "aerobics", name: "Aerobics", standalone: 20000, addon: 10000 },
  { id: "spinning", name: "Spinning", standalone: 20000, addon: 10000 },
  { id: "amuka", name: "Amuka Dance Workout", standalone: 20000, addon: 10000 },
  { id: "kona", name: "Kona Dance", standalone: 20000, addon: 10000 },
  { id: "fimbo", name: "Fimbo Dance", standalone: 20000, addon: 10000 },
  { id: "boxing", name: "Boxing", standalone: 20000, addon: 10000 },
  { id: "weightloss", name: "Weight Loss Class", standalone: 20000, addon: 10000 },
  { id: "steam", name: "Steam Bath", standalone: 20000, addon: 10000 },
  { id: "massage", name: "Massage", standalone: 20000, addon: 10000 },
  { id: "nutrition", name: "Nutrition Program", standalone: 20000, addon: 10000 },
];

const TIMETABLE = [
  { day: "Mon", class: "Spinning", time: "6:30pm – 7:30pm" },
  { day: "Mon", class: "Amuka Dance Workout", time: "7:30pm – 8:30pm" },
  { day: "Tue", class: "Aerobics", time: "6:20pm – 7:20pm" },
  { day: "Tue", class: "Kona Dance", time: "7:30pm – 8:30pm" },
  { day: "Wed", class: "Spinning", time: "6:20pm – 7:20pm" },
  { day: "Wed", class: "Fimbo Dance", time: "7:25pm – 8:25pm" },
  { day: "Thu", class: "Kona Dance", time: "7:15pm – 8:15pm" },
  { day: "Fri", class: "Spinning", time: "6:30pm – 7:30pm" },
  { day: "Fri", class: "Aerobics", time: "7:30pm – 8:30pm" },
  { day: "Sat", class: "Kona Dance", time: "9:30am – 11:30am" },
  { day: "Sat", class: "Amuka Dance", time: "7:00pm – 8:00pm" },
];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const initData = () => {
  const members = [
    { id: "m1", name: "Sarah Nakamya", phone: "0771234567", email: "sarah@email.com", gender: "Female", dob: "1995-03-15", emergency: "0701111222", photo: null, nationalId: "CM95015003ABCD", pin: "1234", isActive: true, createdAt: "2025-01-10" },
    { id: "m2", name: "James Okello", phone: "0782345678", email: "james@email.com", gender: "Male", dob: "1990-07-22", emergency: "0702222333", photo: null, nationalId: "CM90072200EFGH", pin: "5678", isActive: true, createdAt: "2025-02-05" },
    { id: "m3", name: "Grace Auma", phone: "0753456789", email: "", gender: "Female", dob: "1988-11-30", emergency: "0703333444", photo: null, nationalId: "CF88113000IJKL", pin: "9012", isActive: true, createdAt: "2025-03-01" },
    { id: "m4", name: "Peter Mukasa", phone: "0764567890", email: "peter@mail.com", gender: "Male", dob: "1992-05-18", emergency: "0704444555", photo: null, nationalId: "CM92051800MNOP", pin: "3456", isActive: true, createdAt: "2025-01-20" },
    { id: "m5", name: "Diana Tendo", phone: "0775678901", email: "", gender: "Female", dob: "1997-09-05", emergency: "0705555666", photo: null, nationalId: "", pin: "7890", isActive: false, createdAt: "2025-02-15" },
  ];

  const now = new Date();
  const memberships = [
    { id: "ms1", memberId: "m1", plan: "gym_monthly", startDate: new Date(now - 10 * 86400000).toISOString().split("T")[0], endDate: new Date(now.getTime() + 20 * 86400000).toISOString().split("T")[0], isActive: true, frozenDays: 0, status: "active", totalDue: 300000 },
    { id: "ms2", memberId: "m2", plan: "combo_monthly", startDate: new Date(now - 25 * 86400000).toISOString().split("T")[0], endDate: new Date(now.getTime() + 5 * 86400000).toISOString().split("T")[0], isActive: true, frozenDays: 0, status: "active", totalDue: 400000 },
    { id: "ms3", memberId: "m3", plan: "gym_weekly", startDate: new Date(now - 10 * 86400000).toISOString().split("T")[0], endDate: new Date(now.getTime() - 3 * 86400000).toISOString().split("T")[0], isActive: false, frozenDays: 0, status: "expired", totalDue: 120000 },
    { id: "ms4", memberId: "m4", plan: "gym_monthly", startDate: new Date(now - 5 * 86400000).toISOString().split("T")[0], endDate: new Date(now.getTime() + 25 * 86400000).toISOString().split("T")[0], isActive: true, frozenDays: 0, status: "active", totalDue: 300000 },
  ];

  const payments = [
    { id: "p1", memberId: "m1", membershipId: "ms1", amount: 300000, method: "mobile_money", paidAt: new Date(now - 10 * 86400000).toISOString(), discountId: null, discountAmount: 0 },
    { id: "p2", memberId: "m2", membershipId: "ms2", amount: 400000, method: "cash", paidAt: new Date(now - 25 * 86400000).toISOString(), discountId: null, discountAmount: 0 },
    { id: "p3", memberId: "m4", membershipId: "ms4", amount: 270000, method: "card", paidAt: new Date(now - 5 * 86400000).toISOString(), discountId: "d1", discountAmount: 30000 },
    { id: "p4", memberId: "m1", membershipId: null, amount: 10000, method: "cash", paidAt: now.toISOString(), discountId: null, discountAmount: 0, type: "addon", activityId: "spinning" },
  ];

  const attendance = [
    { id: "a1", memberId: "m1", checkIn: new Date(now.getTime() - 2 * 3600000).toISOString(), checkOut: null, date: today(), source: "staff", locker: 5 },
    { id: "a2", memberId: "m2", checkIn: new Date(now.getTime() - 1 * 3600000).toISOString(), checkOut: null, date: today(), source: "self", locker: 12 },
    { id: "a3", memberId: "m4", checkIn: new Date(now - 86400000).toISOString(), checkOut: new Date(now - 86400000 + 5400000).toISOString(), date: new Date(now - 86400000).toISOString().split("T")[0], source: "staff", locker: 3 },
  ];

  const trainers = [
    { id: "t1", name: "Coach Mike", phone: "0781112233", specialisation: "Spinning, Boxing", isActive: true },
    { id: "t2", name: "Trainer Aisha", phone: "0792223344", specialisation: "Aerobics, Dance", isActive: true },
    { id: "t3", name: "Coach Brian", phone: "0703334455", specialisation: "Weight Loss, Full Body", isActive: true },
  ];

  const staff = [
    { id: "s1", name: "Admin User", username: "admin", passwordHash: "admin123", role: "admin", isActive: true },
    { id: "s2", name: "Front Desk - Joy", username: "joy", passwordHash: "joy123", role: "staff", isActive: true },
  ];

  const equipment = [
    { id: "eq1", name: "Treadmill #1", type: "Cardio", serialNumber: "TM-001", purchaseDate: "2024-06-15", status: "operational" },
    { id: "eq2", name: "Spin Bike #3", type: "Cardio", serialNumber: "SB-003", purchaseDate: "2024-06-15", status: "maintenance" },
    { id: "eq3", name: "Bench Press", type: "Strength", serialNumber: "BP-001", purchaseDate: "2024-03-10", status: "operational" },
    { id: "eq4", name: "Rowing Machine", type: "Cardio", serialNumber: "RM-001", purchaseDate: "2024-08-20", status: "operational" },
    { id: "eq5", name: "Cable Machine", type: "Strength", serialNumber: "CM-001", purchaseDate: "2024-01-05", status: "decommissioned" },
  ];

  const lockers = Array.from({ length: 20 }, (_, i) => ({
    id: `l${i + 1}`, number: i + 1, isOccupied: i === 4 || i === 11, memberId: i === 4 ? "m1" : i === 11 ? "m2" : null,
  }));

  const discounts = [
    { id: "d1", name: "New Year Promo", type: "percentage", value: 10, startDate: "2025-01-01", endDate: "2025-12-31", maxUses: 100, usesCount: 1, isActive: true },
    { id: "d2", name: "Refer a Friend", type: "fixed", value: 50000, startDate: "2025-01-01", endDate: "2025-06-30", maxUses: 50, usesCount: 0, isActive: true },
  ];

  const walkIns = [
    { id: "w1", name: "John Visitor", phone: "0711223344", activityId: "steam", amountPaid: 20000, visitDate: today() },
  ];

  const reconciliations = [];
  const freezes = [];

  return { members, memberships, payments, attendance, trainers, staff, equipment, lockers, discounts, walkIns, reconciliations, freezes };
};

// ─── STYLES ─────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Playfair+Display:wght@600;700;800&display=swap');

:root {
  --bg: #0a0c10;
  --bg-card: #12151c;
  --bg-card-hover: #181c26;
  --bg-elevated: #1a1e28;
  --bg-input: #0e1117;
  --border: #1e2330;
  --border-focus: #f59e0b;
  --text: #e8e8ed;
  --text-dim: #8890a0;
  --text-muted: #555d70;
  --accent: #f59e0b;
  --accent-hover: #fbbf24;
  --accent-dim: rgba(245, 158, 11, 0.12);
  --success: #22c55e;
  --success-dim: rgba(34, 197, 94, 0.12);
  --danger: #ef4444;
  --danger-dim: rgba(239, 68, 68, 0.12);
  --warning: #f97316;
  --warning-dim: rgba(249, 115, 22, 0.12);
  --info: #3b82f6;
  --info-dim: rgba(59, 130, 246, 0.12);
  --radius: 12px;
  --radius-sm: 8px;
  --radius-xs: 6px;
  --shadow: 0 4px 24px rgba(0,0,0,0.3);
  --font-display: 'Playfair Display', Georgia, serif;
  --font-body: 'DM Sans', -apple-system, sans-serif;
  --transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body, #root {
  font-family: var(--font-body);
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
}

.app-layout {
  display: flex;
  min-height: 100vh;
}

/* SIDEBAR */
.sidebar {
  width: 260px;
  background: var(--bg-card);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: 50;
  transition: var(--transition);
}

.sidebar-brand {
  padding: 24px 20px;
  border-bottom: 1px solid var(--border);
}

.sidebar-brand h1 {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
  color: var(--accent);
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.sidebar-brand p {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 4px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.sidebar-nav {
  flex: 1;
  padding: 12px 10px;
  overflow-y: auto;
}

.nav-section {
  margin-bottom: 8px;
}

.nav-section-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-muted);
  padding: 12px 12px 6px;
  font-weight: 600;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 13.5px;
  font-weight: 450;
  color: var(--text-dim);
  transition: var(--transition);
  border: 1px solid transparent;
}

.nav-item:hover {
  background: var(--bg-card-hover);
  color: var(--text);
}

.nav-item.active {
  background: var(--accent-dim);
  color: var(--accent);
  border-color: rgba(245, 158, 11, 0.2);
  font-weight: 600;
}

.nav-item svg { width: 18px; height: 18px; flex-shrink: 0; }

.sidebar-footer {
  padding: 16px 20px;
  border-top: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-muted);
}

.sidebar-footer .user-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sidebar-footer .user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--accent-dim);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent);
  font-weight: 700;
  font-size: 13px;
}

/* MAIN CONTENT */
.main-content {
  margin-left: 260px;
  flex: 1;
  padding: 28px 32px;
  min-height: 100vh;
}

.page-header {
  margin-bottom: 28px;
}

.page-header h2 {
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text);
}

.page-header p {
  color: var(--text-dim);
  font-size: 14px;
  margin-top: 4px;
}

/* CARDS */
.card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px;
  transition: var(--transition);
}

.card:hover { border-color: #2a3040; }

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.stat-card .stat-icon {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stat-card .stat-value {
  font-size: 28px;
  font-weight: 700;
  font-family: var(--font-display);
  margin-top: 8px;
  line-height: 1;
}

.stat-card .stat-label {
  font-size: 12px;
  color: var(--text-dim);
  margin-top: 4px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* TABLE */
.table-wrapper {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-card);
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

th {
  text-align: left;
  padding: 12px 16px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  font-weight: 600;
  border-bottom: 1px solid var(--border);
  background: var(--bg-elevated);
  white-space: nowrap;
}

td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  color: var(--text-dim);
  vertical-align: middle;
}

tr:last-child td { border-bottom: none; }
tr:hover td { background: var(--bg-card-hover); }

/* FORMS */
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group.full { grid-column: 1 / -1; }

.form-group label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

input, select, textarea {
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  padding: 10px 14px;
  font-size: 14px;
  color: var(--text);
  font-family: var(--font-body);
  transition: var(--transition);
  outline: none;
  width: 100%;
}

input:focus, select:focus, textarea:focus {
  border-color: var(--border-focus);
  box-shadow: 0 0 0 3px var(--accent-dim);
}

select { cursor: pointer; }

/* BUTTONS */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 600;
  font-family: var(--font-body);
  cursor: pointer;
  border: 1px solid transparent;
  transition: var(--transition);
  white-space: nowrap;
}

.btn svg { width: 16px; height: 16px; }

.btn-primary {
  background: var(--accent);
  color: #000;
  border-color: var(--accent);
}

.btn-primary:hover {
  background: var(--accent-hover);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
}

.btn-secondary {
  background: transparent;
  color: var(--text-dim);
  border-color: var(--border);
}

.btn-secondary:hover {
  background: var(--bg-card-hover);
  color: var(--text);
}

.btn-success {
  background: var(--success);
  color: #fff;
}

.btn-success:hover { filter: brightness(1.1); }

.btn-danger {
  background: transparent;
  color: var(--danger);
  border-color: var(--danger);
}

.btn-danger:hover {
  background: var(--danger-dim);
}

.btn-sm {
  padding: 6px 12px;
  font-size: 12px;
}

.btn-icon {
  padding: 8px;
  border-radius: var(--radius-xs);
}

/* BADGES */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.badge-success { background: var(--success-dim); color: var(--success); }
.badge-danger { background: var(--danger-dim); color: var(--danger); }
.badge-warning { background: var(--warning-dim); color: var(--warning); }
.badge-info { background: var(--info-dim); color: var(--info); }
.badge-neutral { background: rgba(255,255,255,0.06); color: var(--text-dim); }

/* SEARCH BAR */
.search-bar {
  position: relative;
  max-width: 400px;
}

.search-bar svg {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  width: 16px;
  height: 16px;
}

.search-bar input {
  padding-left: 40px;
}

/* MODAL */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 20px;
  animation: fadeIn 0.2s;
}

.modal {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  width: 100%;
  max-width: 600px;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: var(--shadow);
  animation: slideUp 0.25s;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
}

.modal-header h3 {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 700;
}

.modal-body { padding: 24px; }
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid var(--border);
}

/* TOOLBAR */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

/* CHECK-IN */
.checkin-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 32px;
  text-align: center;
  max-width: 500px;
  margin: 0 auto;
  position: relative;
}

.checkin-card .member-photo {
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background: var(--accent-dim);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
  font-size: 36px;
  font-family: var(--font-display);
  color: var(--accent);
  font-weight: 700;
  border: 3px solid var(--accent);
}

.checkin-success {
  background: var(--success-dim);
  border-color: var(--success);
  animation: pulse 0.5s;
}

.checkin-success .member-photo {
  border-color: var(--success);
  background: var(--success-dim);
  color: var(--success);
}

/* TIMETABLE */
.timetable-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}

.timetable-slot {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 14px;
  border-left: 3px solid var(--accent);
}

.timetable-slot .slot-day {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--accent);
  font-weight: 600;
}

.timetable-slot .slot-class {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  margin-top: 4px;
}

.timetable-slot .slot-time {
  font-size: 12px;
  color: var(--text-dim);
  margin-top: 2px;
}

/* RECEIPT */
.receipt {
  background: #fff;
  color: #111;
  border-radius: var(--radius);
  padding: 32px;
  max-width: 400px;
  margin: 0 auto;
  font-size: 13px;
}

.receipt h3 {
  text-align: center;
  font-family: var(--font-display);
  font-size: 18px;
  margin-bottom: 4px;
}

.receipt .receipt-line {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  border-bottom: 1px dashed #ddd;
}

.receipt .receipt-total {
  font-size: 16px;
  font-weight: 700;
  border-top: 2px solid #111;
  padding-top: 8px;
  margin-top: 8px;
}

/* TABS */
.tabs {
  display: flex;
  gap: 2px;
  margin-bottom: 20px;
  background: var(--bg-elevated);
  border-radius: var(--radius-sm);
  padding: 3px;
  width: fit-content;
}

.tab {
  padding: 8px 18px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-dim);
  cursor: pointer;
  border-radius: var(--radius-xs);
  border: none;
  background: transparent;
  font-family: var(--font-body);
  transition: var(--transition);
}

.tab:hover { color: var(--text); }
.tab.active {
  background: var(--accent);
  color: #000;
  font-weight: 600;
}

/* KIOSK */
.kiosk-overlay {
  position: fixed;
  inset: 0;
  background: var(--bg);
  z-index: 200;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
}

.kiosk-keypad {
  display: grid;
  grid-template-columns: repeat(3, 80px);
  gap: 10px;
  margin-top: 20px;
}

.kiosk-key {
  width: 80px;
  height: 60px;
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text);
  font-size: 24px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-body);
  transition: var(--transition);
}

.kiosk-key:hover { background: var(--bg-card-hover); border-color: var(--accent); }
.kiosk-key:active { transform: scale(0.95); }

/* ANIMATIONS */
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
@keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.02); } }

/* PHOTO CAPTURE */
.photo-capture-area {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 20px;
  border: 2px dashed var(--border);
  border-radius: var(--radius);
  background: var(--bg-elevated);
  transition: var(--transition);
}

.photo-capture-area:hover { border-color: var(--accent); }

.photo-capture-area label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  align-self: flex-start;
}

.photo-preview-frame {
  width: 140px;
  height: 140px;
  border-radius: 50%;
  overflow: hidden;
  border: 3px solid var(--accent);
  background: var(--bg-input);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.photo-preview-frame img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.photo-preview-frame .photo-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: var(--text-muted);
}

.photo-preview-frame .photo-placeholder svg { opacity: 0.5; }

.camera-viewfinder {
  width: 320px;
  max-width: 100%;
  border-radius: var(--radius);
  overflow: hidden;
  border: 2px solid var(--accent);
  position: relative;
  background: #000;
}

.camera-viewfinder video {
  width: 100%;
  display: block;
  transform: scaleX(-1);
}

.camera-viewfinder canvas { display: none; }

.camera-controls {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.photo-required-badge {
  font-size: 10px;
  color: var(--danger);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* RESPONSIVE */
@media (max-width: 900px) {
  .sidebar { width: 60px; }
  .sidebar .nav-item span, .sidebar-brand p, .sidebar-footer, .nav-section-label { display: none; }
  .sidebar-brand h1 { font-size: 16px; }
  .sidebar-brand { padding: 16px 12px; text-align: center; }
  .nav-item { justify-content: center; padding: 10px; }
  .main-content { margin-left: 60px; padding: 20px 16px; }
  .form-grid { grid-template-columns: 1fr; }
  .card-grid { grid-template-columns: 1fr 1fr; }
}
`;

// ─── COMPONENTS ─────────────────────────────────────────────

const Modal = ({ title, onClose, children, footer }) => (
  <div className="modal-overlay" onClick={onClose}>
    <div className="modal" onClick={(e) => e.stopPropagation()}>
      <div className="modal-header">
        <h3>{title}</h3>
        <button className="btn btn-icon btn-secondary" onClick={onClose}><X size={18} /></button>
      </div>
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-footer">{footer}</div>}
    </div>
  </div>
);

const Badge = ({ variant = "neutral", children }) => <span className={`badge badge-${variant}`}>{children}</span>;

const StatCard = ({ icon: Icon, label, value, color, bg }) => (
  <div className="card stat-card">
    <div>
      <div className="stat-value" style={{ color }}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
    <div className="stat-icon" style={{ background: bg, color }}>
      <Icon size={20} />
    </div>
  </div>
);

// ─── DASHBOARD ──────────────────────────────────────────────
const Dashboard = ({ data }) => {
  const activeMembers = data.members.filter((m) => m.isActive).length;
  const todayCheckins = data.attendance.filter((a) => a.date === today()).length;
  const todayWalkIns = data.walkIns.filter((w) => w.visitDate === today()).length;
  const todayRevenue = data.payments.filter((p) => p.paidAt.startsWith(today())).reduce((s, p) => s + p.amount, 0) + data.walkIns.filter((w) => w.visitDate === today()).reduce((s, w) => s + w.amountPaid, 0);
  const availableLockers = data.lockers.filter((l) => !l.isOccupied).length;
  const frozenCount = data.memberships.filter((ms) => ms.status === "frozen").length;
  const maintenanceEquip = data.equipment.filter((eq) => eq.status === "maintenance").length;
  const expiringIn3 = data.memberships.filter((ms) => {
    if (!ms.isActive) return false;
    const diff = (new Date(ms.endDate) - new Date()) / 86400000;
    return diff >= 0 && diff <= 3;
  });

  const dayName = DAYS[new Date().getDay()];
  const todayClasses = TIMETABLE.filter((t) => t.day === dayName);

  return (
    <div>
      <div className="page-header">
        <h2>Dashboard</h2>
        <p>Rush Fitness Center • Naalya Quality Shopping Mall • {new Date().toLocaleDateString("en-UG", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
      </div>

      <div className="card-grid">
        <StatCard icon={Users} label="Active Members" value={activeMembers} color="var(--accent)" bg="var(--accent-dim)" />
        <StatCard icon={LogIn} label="Today's Check-ins" value={todayCheckins} color="var(--success)" bg="var(--success-dim)" />
        <StatCard icon={UserCheck} label="Walk-ins Today" value={todayWalkIns} color="var(--info)" bg="var(--info-dim)" />
        <StatCard icon={DollarSign} label="Today's Revenue" value={formatUGX(todayRevenue)} color="var(--accent)" bg="var(--accent-dim)" />
        <StatCard icon={Layers} label="Lockers Available" value={`${availableLockers}/20`} color="var(--info)" bg="var(--info-dim)" />
        <StatCard icon={Pause} label="Frozen Memberships" value={frozenCount} color="var(--warning)" bg="var(--warning-dim)" />
        <StatCard icon={Wrench} label="Equipment in Maintenance" value={maintenanceEquip} color="var(--danger)" bg="var(--danger-dim)" />
        <StatCard icon={AlertTriangle} label="Expiring in 3 Days" value={expiringIn3.length} color="var(--warning)" bg="var(--warning-dim)" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 8 }}>
        <div className="card">
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, marginBottom: 16 }}>Today's Classes</h3>
          {todayClasses.length === 0 ? (
            <p style={{ color: "var(--text-dim)", fontSize: 14 }}>No classes scheduled today.</p>
          ) : (
            todayClasses.map((c, i) => (
              <div key={i} className="timetable-slot" style={{ marginBottom: i < todayClasses.length - 1 ? 10 : 0 }}>
                <div className="slot-day">{c.day}</div>
                <div className="slot-class">{c.class}</div>
                <div className="slot-time">{c.time}</div>
              </div>
            ))
          )}
        </div>

        <div className="card">
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, marginBottom: 16 }}>Expiring Soon</h3>
          {expiringIn3.length === 0 ? (
            <p style={{ color: "var(--text-dim)", fontSize: 14 }}>No memberships expiring in the next 3 days.</p>
          ) : (
            expiringIn3.map((ms) => {
              const member = data.members.find((m) => m.id === ms.memberId);
              return (
                <div key={ms.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--text)" }}>{member?.name}</span>
                  <Badge variant="warning">Expires {formatDate(ms.endDate)}</Badge>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, marginBottom: 16 }}>Equipment Status</h3>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {data.equipment.filter((eq) => eq.status !== "operational").map((eq) => (
            <div key={eq.id} style={{ padding: "10px 16px", background: eq.status === "maintenance" ? "var(--warning-dim)" : "var(--danger-dim)", borderRadius: "var(--radius-sm)", fontSize: 13 }}>
              <span style={{ fontWeight: 600, color: eq.status === "maintenance" ? "var(--warning)" : "var(--danger)" }}>{eq.name}</span>
              <span style={{ color: "var(--text-dim)", marginLeft: 8 }}>{eq.status === "maintenance" ? "Under Maintenance" : "Decommissioned"}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── CHECK-IN ───────────────────────────────────────────────
const CheckIn = ({ data, setData }) => {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [checkedIn, setCheckedIn] = useState(false);
  const [addons, setAddons] = useState([]);

  const results = search.length >= 2 ? data.members.filter((m) => m.isActive && (m.name.toLowerCase().includes(search.toLowerCase()) || m.phone.includes(search))) : [];

  const membership = selected ? data.memberships.find((ms) => ms.memberId === selected.id && (ms.isActive || ms.status === "pending_payment")) : null;
  const isExpired = membership ? (new Date(membership.endDate) < new Date() && membership.status !== "pending_payment") : true;
  const isFrozen = membership?.status === "frozen";
  const isPendingPayment = membership?.status === "pending_payment";
  const alreadyCheckedIn = selected ? data.attendance.some((a) => a.memberId === selected.id && a.date === today()) : false;
  const isDailyPlan = membership?.plan === "gym_daily" || membership?.plan === "combo_session";
  const memberBalance = membership ? getMembershipBalance(membership, data.payments) : null;

  const handleCheckIn = () => {
    if (isExpired || isFrozen || alreadyCheckedIn || isPendingPayment) return;
    const newAttendance = { id: generateId(), memberId: selected.id, checkIn: new Date().toISOString(), checkOut: null, date: today(), source: "staff", locker: null };
    const newPayments = addons.map((actId) => {
      const act = ACTIVITIES.find((a) => a.id === actId);
      const price = isDailyPlan ? act.standalone : act.addon;
      return { id: generateId(), memberId: selected.id, membershipId: null, amount: price, method: "cash", paidAt: new Date().toISOString(), type: "addon", activityId: actId, discountId: null, discountAmount: 0 };
    });
    setData((d) => ({ ...d, attendance: [...d.attendance, newAttendance], payments: [...d.payments, ...newPayments] }));
    setCheckedIn(true);
  };

  const reset = () => { setSelected(null); setCheckedIn(false); setSearch(""); setAddons([]); };

  return (
    <div>
      <div className="page-header">
        <h2>Member Check-In</h2>
        <p>Search and check in gym members — the core workflow</p>
      </div>

      {!selected && (
        <>
          <div className="search-bar" style={{ maxWidth: 500, marginBottom: 20 }}>
            <Search />
            <input placeholder="Search by name or phone number..." value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
          </div>
          {results.length > 0 && (
            <div className="table-wrapper">
              <table>
                <thead><tr><th>Name</th><th>Phone</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {results.map((m) => {
                    const ms = data.memberships.find((ms) => ms.memberId === m.id && ms.isActive);
                    const exp = ms ? new Date(ms.endDate) < new Date() : true;
                    return (
                      <tr key={m.id}>
                        <td style={{ color: "var(--text)", fontWeight: 500 }}>{m.name}</td>
                        <td>{m.phone}</td>
                        <td>{ms ? (exp ? <Badge variant="danger">Expired</Badge> : ms.status === "frozen" ? <Badge variant="warning">Frozen</Badge> : <Badge variant="success">Active</Badge>) : <Badge variant="danger">No Plan</Badge>}</td>
                        <td><button className="btn btn-sm btn-primary" onClick={() => setSelected(m)}>Select</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {selected && !checkedIn && (
        <div className="checkin-card">
          <button className="btn btn-sm btn-secondary" onClick={reset} style={{ position: "absolute", left: 20 }}><ArrowLeft size={14} /> Back</button>
          <div className="member-photo" style={{ overflow: "hidden" }}>{selected.photo ? <img src={selected.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : selected.name.charAt(0)}</div>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 24 }}>{selected.name}</h3>
          <p style={{ color: "var(--text-dim)", marginTop: 4 }}>{selected.phone}</p>
          {membership && (
            <div style={{ marginTop: 12 }}>
              <Badge variant={isExpired ? "danger" : isFrozen ? "warning" : isPendingPayment ? "warning" : "success"}>
                {getPlanName(membership.plan)} • {isExpired ? "EXPIRED" : isFrozen ? "FROZEN" : isPendingPayment ? "PENDING PAYMENT" : `Expires ${formatDate(membership.endDate)}`}
              </Badge>
            </div>
          )}
          {!membership && <div style={{ marginTop: 12 }}><Badge variant="danger">No Active Membership</Badge></div>}

          {/* Pending payment warning */}
          {isPendingPayment && memberBalance && (
            <div style={{ marginTop: 16, padding: 16, background: "var(--warning-dim)", border: "1px solid rgba(249,115,22,0.3)", borderRadius: "var(--radius-sm)", textAlign: "left" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <AlertTriangle size={16} style={{ color: "var(--warning)" }} />
                <span style={{ fontWeight: 600, color: "var(--warning)", fontSize: 14 }}>Outstanding Balance</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                <span style={{ color: "var(--text-dim)" }}>Paid so far</span>
                <span style={{ color: "var(--success)", fontWeight: 600 }}>{formatUGX(memberBalance.totalPaid)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 8 }}>
                <span style={{ color: "var(--text-dim)" }}>Remaining</span>
                <span style={{ color: "var(--danger)", fontWeight: 700 }}>{formatUGX(memberBalance.balance)}</span>
              </div>
              <div style={{ height: 6, background: "var(--bg-input)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.round(memberBalance.totalPaid / memberBalance.totalDue * 100)}%`, background: "var(--warning)", borderRadius: 3 }} />
              </div>
              <p style={{ fontSize: 12, color: "var(--warning)", marginTop: 8 }}>Check-in blocked until payment is completed. Please go to Memberships to record payment.</p>
            </div>
          )}

          {alreadyCheckedIn && <p style={{ color: "var(--warning)", marginTop: 16, fontWeight: 600 }}>Already checked in today</p>}

          {!isExpired && !isFrozen && !isPendingPayment && !alreadyCheckedIn && (
            <>
              <div style={{ marginTop: 20, textAlign: "left" }}>
                <p style={{ fontSize: 12, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Add-on Activities</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {ACTIVITIES.map((act) => (
                    <button key={act.id} className={`btn btn-sm ${addons.includes(act.id) ? "btn-primary" : "btn-secondary"}`} onClick={() => setAddons((a) => a.includes(act.id) ? a.filter((x) => x !== act.id) : [...a, act.id])}>
                      {act.name} ({formatUGX(isDailyPlan ? act.standalone : act.addon)})
                    </button>
                  ))}
                </div>
              </div>
              <button className="btn btn-success" style={{ marginTop: 24, width: "100%", padding: "14px 24px", fontSize: 16, fontWeight: 700 }} onClick={handleCheckIn}>
                <Check size={20} /> Check In
              </button>
            </>
          )}
        </div>
      )}

      {selected && checkedIn && (
        <div className="checkin-card checkin-success">
          <div className="member-photo"><Check size={40} /></div>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--success)" }}>Check-In Confirmed!</h3>
          <p style={{ color: "var(--text)", fontSize: 18, marginTop: 8 }}>{selected.name}</p>
          <p style={{ color: "var(--text-dim)", marginTop: 4 }}>{membership ? getPlanName(membership.plan) : ""}</p>
          <p style={{ color: "var(--text-dim)", marginTop: 4 }}>{formatTime(new Date())}</p>
          <p style={{ color: "var(--text-dim)", marginTop: 8 }}>Today's visits: {data.attendance.filter((a) => a.date === today()).length}</p>
          {addons.length > 0 && <p style={{ color: "var(--accent)", marginTop: 8 }}>Add-ons: {addons.map((a) => ACTIVITIES.find((x) => x.id === a)?.name).join(", ")}</p>}
          <button className="btn btn-secondary" style={{ marginTop: 24 }} onClick={reset}>New Check-In</button>
        </div>
      )}
    </div>
  );
};

// ─── PHOTO CAPTURE COMPONENT ────────────────────────────────
const generateAvatarPhoto = (name) => {
  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 400;
  const ctx = canvas.getContext("2d");

  // Background gradient
  const colors = [
    ["#1a365d", "#2b6cb0"], ["#1a3a2a", "#276749"], ["#44337a", "#6b46c1"],
    ["#742a2a", "#c53030"], ["#744210", "#c05621"], ["#234e52", "#2c7a7b"],
  ];
  const pair = colors[Math.floor(Math.random() * colors.length)];
  const grad = ctx.createLinearGradient(0, 0, 400, 400);
  grad.addColorStop(0, pair[0]);
  grad.addColorStop(1, pair[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 400, 400);

  // Head silhouette
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.beginPath();
  ctx.arc(200, 155, 72, 0, Math.PI * 2);
  ctx.fill();

  // Body silhouette
  ctx.beginPath();
  ctx.ellipse(200, 370, 110, 100, 0, Math.PI, 0);
  ctx.fill();

  // Initials
  const initials = (name || "?").split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "bold 64px 'DM Sans', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(initials, 200, 155);

  // Timestamp bar
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(0, 360, 400, 40);
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "13px 'DM Sans', sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(`Captured ${new Date().toLocaleString("en-UG")}`, 200, 380);

  return canvas.toDataURL("image/jpeg", 0.9);
};

const PhotoCapture = ({ photo, onCapture, onRetake, memberName }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [streaming, setStreaming] = useState(false);
  const [showingSimulated, setShowingSimulated] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const streamRef = useRef(null);
  const cameraSupported = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  const startCamera = async () => {
    if (!cameraSupported) {
      startSimulated();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setStreaming(true);
      }
    } catch (err) {
      console.warn("Camera unavailable, using simulated capture:", err.message);
      startSimulated();
    }
  };

  const startSimulated = () => {
    capturedRef.current = false;
    setShowingSimulated(true);
    setCountdown(3);
  };

  const capturedRef = useRef(false);

  useEffect(() => {
    if (countdown > 0) {
      const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
      return () => clearTimeout(t);
    }
    if (countdown === 0 && showingSimulated && !capturedRef.current) {
      capturedRef.current = true;
      const dataUrl = generateAvatarPhoto(memberName);
      setShowingSimulated(false);
      onCapture(dataUrl);
    }
  }, [countdown, showingSimulated]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setStreaming(false);
  };

  const capture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    stopCamera();
    onCapture(dataUrl);
  };

  const handleRetake = () => {
    onRetake();
    startCamera();
  };

  useEffect(() => { return () => stopCamera(); }, []);

  return (
    <div className="photo-capture-area">
      <label>Member Photo <span className="photo-required-badge">* Required</span></label>

      {!photo && !streaming && !showingSimulated && (
        <>
          <div className="photo-preview-frame">
            <div className="photo-placeholder">
              <Camera size={36} />
              <span style={{ fontSize: 11 }}>No photo</span>
            </div>
          </div>
          <button type="button" className="btn btn-primary" onClick={startCamera}>
            <Camera size={16} /> Capture Photo
          </button>
          <p style={{ color: "var(--text-muted)", fontSize: 11, textAlign: "center" }}>
            Opens tablet camera to capture member photo
          </p>
        </>
      )}

      {showingSimulated && (
        <>
          <div className="photo-preview-frame" style={{ border: "3px solid var(--success)", position: "relative" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <div style={{ width: 60, height: 60, borderRadius: "50%", background: "var(--success-dim)", display: "flex", alignItems: "center", justifyContent: "center", animation: "pulse 1s infinite" }}>
                <Camera size={28} style={{ color: "var(--success)" }} />
              </div>
              <span style={{ fontSize: 32, fontWeight: 700, color: "var(--success)", fontFamily: "var(--font-display)" }}>{countdown > 0 ? countdown : ""}</span>
            </div>
          </div>
          <p style={{ color: "var(--success)", fontSize: 13, fontWeight: 600 }}>
            {countdown > 0 ? `Capturing in ${countdown}...` : "Processing..."}
          </p>
        </>
      )}

      {streaming && (
        <>
          <div className="camera-viewfinder">
            <video ref={videoRef} playsInline muted />
            <canvas ref={canvasRef} />
            <div style={{ position: "absolute", inset: 0, border: "3px solid var(--accent)", borderRadius: "var(--radius)", pointerEvents: "none" }} />
          </div>
          <div className="camera-controls">
            <button type="button" className="btn btn-primary" onClick={capture}>
              <Camera size={14} /> Capture Photo
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={stopCamera}>
              Cancel
            </button>
          </div>
        </>
      )}

      {photo && !streaming && !showingSimulated && (
        <>
          <div className="photo-preview-frame">
            <img src={photo} alt="Member" />
          </div>
          <div className="camera-controls">
            <button type="button" className="btn btn-sm btn-success" disabled>
              <Check size={14} /> Photo Captured
            </button>
            <button type="button" className="btn btn-sm btn-secondary" onClick={handleRetake}>
              <RefreshCw size={14} /> Retake
            </button>
          </div>
        </>
      )}
    </div>
  );
};

// ─── MEMBERS ────────────────────────────────────────────────
const Members = ({ data, setData }) => {
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null); // 'add' | 'edit' | 'view' | null
  const [current, setCurrent] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", gender: "Male", dob: "", emergency: "", nationalId: "", pin: "", photo: null });

  const filtered = data.members.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()) || m.phone.includes(search));

  const openAdd = () => { setForm({ name: "", phone: "", email: "", gender: "Male", dob: "", emergency: "", nationalId: "", pin: Math.floor(1000 + Math.random() * 9000).toString(), photo: null }); setModal("add"); };
  const openEdit = (m) => { setCurrent(m); setForm({ ...m }); setModal("edit"); };
  const openView = (m) => { setCurrent(m); setModal("view"); };

  const save = () => {
    if (!form.name || !form.phone) return;
    // Photo is required for new members
    if (modal === "add" && !form.photo) { alert("Please capture a photo of the member before saving."); return; }
    if (modal === "add") {
      const newMember = { ...form, id: generateId(), isActive: true, createdAt: today() };
      setData((d) => ({ ...d, members: [...d.members, newMember] }));
    } else {
      setData((d) => ({ ...d, members: d.members.map((m) => m.id === current.id ? { ...m, ...form } : m) }));
    }
    setModal(null);
  };

  const toggleActive = (m) => {
    setData((d) => ({ ...d, members: d.members.map((x) => x.id === m.id ? { ...x, isActive: !x.isActive } : x) }));
  };

  return (
    <div>
      <div className="page-header">
        <h2>Members</h2>
        <p>Manage gym member registration and profiles</p>
      </div>

      <div className="toolbar">
        <div className="search-bar"><Search /><input placeholder="Search members..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <button className="btn btn-primary" onClick={openAdd}><UserPlus size={16} /> Add Member</button>
      </div>

      <div className="table-wrapper">
        <table>
          <thead><tr><th></th><th>Name</th><th>Phone</th><th>National ID</th><th>Gender</th><th>Membership</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {filtered.map((m) => {
              const ms = data.memberships.find((ms) => ms.memberId === m.id && ms.isActive);
              const exp = ms ? new Date(ms.endDate) < new Date() : true;
              return (
                <tr key={m.id}>
                  <td>
                    <div style={{ width: 34, height: 34, borderRadius: "50%", overflow: "hidden", background: "var(--accent-dim)", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid var(--accent)", flexShrink: 0 }}>
                      {m.photo ? <img src={m.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)", fontFamily: "var(--font-display)" }}>{m.name.charAt(0)}</span>}
                    </div>
                  </td>
                  <td style={{ color: "var(--text)", fontWeight: 500 }}>{m.name}</td>
                  <td>{m.phone}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>{m.nationalId || "—"}</td>
                  <td>{m.gender}</td>
                  <td>{ms ? <Badge variant={exp ? "danger" : ms.status === "frozen" ? "warning" : "success"}>{getPlanName(ms.plan)}</Badge> : <Badge variant="neutral">None</Badge>}</td>
                  <td>{m.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="danger">Inactive</Badge>}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn btn-icon btn-secondary" onClick={() => openView(m)}><Eye size={14} /></button>
                      <button className="btn btn-icon btn-secondary" onClick={() => openEdit(m)}><Edit2 size={14} /></button>
                      <button className="btn btn-icon btn-danger" onClick={() => toggleActive(m)}>{m.isActive ? <Pause size={14} /> : <Play size={14} />}</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modal === "view" && current && (
        <Modal title="Member Profile" onClose={() => setModal(null)}>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div style={{ width: 100, height: 100, borderRadius: "50%", overflow: "hidden", background: "var(--accent-dim)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", border: "3px solid var(--accent)" }}>
              {current.photo ? <img src={current.photo} alt={current.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 36, fontFamily: "var(--font-display)", color: "var(--accent)", fontWeight: 700 }}>{current.name.charAt(0)}</span>}
            </div>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: 20, marginTop: 12 }}>{current.name}</h3>
            <p style={{ color: "var(--text-dim)" }}>{current.phone}</p>
          </div>
          <div className="form-grid">
            {[["National ID", current.nationalId || "—"], ["Email", current.email || "—"], ["Gender", current.gender], ["DOB", current.dob ? formatDate(current.dob) : "—"], ["Emergency", current.emergency], ["PIN", current.pin], ["Joined", formatDate(current.createdAt)]].map(([l, v]) => (
              <div key={l} className="form-group"><label>{l}</label><p style={{ fontSize: 14, color: "var(--text)" }}>{v}</p></div>
            ))}
          </div>
        </Modal>
      )}

      {(modal === "add" || modal === "edit") && (
        <Modal title={modal === "add" ? "Register New Member" : "Edit Member"} onClose={() => setModal(null)} footer={<><button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={save}><Check size={14} /> Save</button></>}>
          <div className="form-grid">
            <PhotoCapture
              photo={form.photo}
              memberName={form.name}
              onCapture={(dataUrl) => setForm((f) => ({ ...f, photo: dataUrl }))}
              onRetake={() => setForm((f) => ({ ...f, photo: null }))}
            />
            <div className="form-group"><label>Full Name *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Sarah Nakamya" /></div>
            <div className="form-group"><label>Phone *</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="e.g. 0771234567" /></div>
            <div className="form-group full"><label>National ID (NIN)</label><input value={form.nationalId} onChange={(e) => setForm({ ...form, nationalId: e.target.value })} placeholder="e.g. CM95015003ABCD" style={{ fontFamily: "monospace", letterSpacing: "0.05em" }} /></div>
            <div className="form-group"><label>Email</label><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Optional" /></div>
            <div className="form-group"><label>Gender</label><select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}><option>Male</option><option>Female</option></select></div>
            <div className="form-group"><label>Date of Birth</label><input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} /></div>
            <div className="form-group"><label>Emergency Contact</label><input value={form.emergency} onChange={(e) => setForm({ ...form, emergency: e.target.value })} placeholder="e.g. 0701111222" /></div>
            <div className="form-group"><label>Check-in PIN</label><input value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} maxLength={4} placeholder="4 digits" /></div>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ─── MEMBERSHIPS ────────────────────────────────────────────
const getMembershipBalance = (ms, payments) => {
  const paid = payments.filter((p) => p.membershipId === ms.id).reduce((s, p) => s + p.amount, 0);
  return { totalDue: ms.totalDue || 0, totalPaid: paid, balance: (ms.totalDue || 0) - paid, isPaidInFull: paid >= (ms.totalDue || 0) };
};

const Memberships = ({ data, setData }) => {
  const [modal, setModal] = useState(null); // 'assign' | 'pay' | null
  const [form, setForm] = useState({ memberId: "", plan: "gym_monthly", method: "cash", discountId: "", paymentAmount: "", paymentType: "full" });
  const [payTarget, setPayTarget] = useState(null); // membership for additional payment

  const assign = () => {
    if (!form.memberId || !form.plan) return;
    const isGroup = form.plan.startsWith("group_");
    const planInfo = isGroup ? GROUP_PLANS[form.plan] : PLANS[form.plan];
    if (!planInfo) return;
    const price = planInfo.price;
    const days = planInfo.days;
    const start = new Date();
    const end = new Date(start.getTime() + days * 86400000);
    const discount = form.discountId ? data.discounts.find((d) => d.id === form.discountId) : null;
    let discountAmt = 0;
    if (discount) {
      discountAmt = discount.type === "percentage" ? Math.round(price * discount.value / 100) : discount.value;
    }
    const totalDue = price - discountAmt;
    const payAmount = form.paymentType === "full" ? totalDue : Math.min(Number(form.paymentAmount) || 0, totalDue);
    if (payAmount <= 0) return;
    const isPaidFull = payAmount >= totalDue;

    const newMs = {
      id: generateId(), memberId: form.memberId, plan: form.plan,
      startDate: start.toISOString().split("T")[0], endDate: end.toISOString().split("T")[0],
      isActive: isPaidFull, frozenDays: 0,
      status: isPaidFull ? "active" : "pending_payment",
      totalDue,
    };
    const newPay = {
      id: generateId(), memberId: form.memberId, membershipId: newMs.id,
      amount: payAmount, method: form.method, paidAt: new Date().toISOString(),
      discountId: form.discountId || null, discountAmount: discountAmt,
      note: isPaidFull ? "Full payment" : `Partial payment (${Math.round(payAmount / totalDue * 100)}%)`,
    };

    setData((d) => ({
      ...d,
      memberships: [...d.memberships.map((ms) => ms.memberId === form.memberId && ms.isActive ? { ...ms, isActive: false, status: "replaced" } : ms), newMs],
      payments: [...d.payments, newPay],
      discounts: discount ? d.discounts.map((dd) => dd.id === discount.id ? { ...dd, usesCount: dd.usesCount + 1 } : dd) : d.discounts,
    }));
    setModal(null);
  };

  const openPayBalance = (ms) => {
    const bal = getMembershipBalance(ms, data.payments);
    setPayTarget(ms);
    setForm((f) => ({ ...f, method: "cash", paymentAmount: String(bal.balance) }));
    setModal("pay");
  };

  const recordPayment = () => {
    if (!payTarget) return;
    const bal = getMembershipBalance(payTarget, data.payments);
    const payAmount = Math.min(Number(form.paymentAmount) || 0, bal.balance);
    if (payAmount <= 0) return;
    const willBeFullyPaid = payAmount >= bal.balance;

    const newPay = {
      id: generateId(), memberId: payTarget.memberId, membershipId: payTarget.id,
      amount: payAmount, method: form.method, paidAt: new Date().toISOString(),
      discountId: null, discountAmount: 0,
      note: willBeFullyPaid ? "Balance cleared — fully paid" : `Installment payment (${formatUGX(bal.totalPaid + payAmount)} of ${formatUGX(bal.totalDue)})`,
    };

    setData((d) => ({
      ...d,
      payments: [...d.payments, newPay],
      memberships: willBeFullyPaid
        ? d.memberships.map((ms) => ms.id === payTarget.id ? { ...ms, isActive: true, status: "active" } : ms)
        : d.memberships,
    }));
    setModal(null);
    setPayTarget(null);
  };

  const freeze = (ms) => {
    setData((d) => ({ ...d, memberships: d.memberships.map((m) => m.id === ms.id ? { ...m, status: "frozen" } : m), freezes: [...d.freezes, { id: generateId(), membershipId: ms.id, freezeDate: today(), unfreezeDate: null, reason: "Member request" }] }));
  };

  const unfreeze = (ms) => {
    const fr = data.freezes.find((f) => f.membershipId === ms.id && !f.unfreezeDate);
    const frozenDays = fr ? Math.ceil((new Date() - new Date(fr.freezeDate)) / 86400000) : 0;
    const newEnd = new Date(new Date(ms.endDate).getTime() + frozenDays * 86400000).toISOString().split("T")[0];
    setData((d) => ({
      ...d,
      memberships: d.memberships.map((m) => m.id === ms.id ? { ...m, status: "active", endDate: newEnd, frozenDays: m.frozenDays + frozenDays } : m),
      freezes: d.freezes.map((f) => f.membershipId === ms.id && !f.unfreezeDate ? { ...f, unfreezeDate: today() } : f),
    }));
  };

  // Count pending payments
  const pendingCount = data.memberships.filter((ms) => ms.status === "pending_payment").length;

  return (
    <div>
      <div className="page-header">
        <h2>Memberships</h2>
        <p>Assign, renew, and manage membership plans with partial payment support</p>
      </div>

      {pendingCount > 0 && (
        <div style={{ background: "var(--warning-dim)", border: "1px solid rgba(249,115,22,0.3)", borderRadius: "var(--radius)", padding: "14px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
          <AlertTriangle size={18} style={{ color: "var(--warning)", flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: "var(--warning)" }}><strong>{pendingCount}</strong> membership{pendingCount > 1 ? "s" : ""} with outstanding balance — not yet activated. Record payment to activate.</span>
        </div>
      )}

      <div className="toolbar">
        <div />
        <button className="btn btn-primary" onClick={() => { setForm({ memberId: "", plan: "gym_monthly", method: "cash", discountId: "", paymentAmount: "", paymentType: "full" }); setModal("assign"); }}><Plus size={16} /> Assign Plan</button>
      </div>
      <div className="table-wrapper">
        <table>
          <thead><tr><th>Member</th><th>Plan</th><th>Start</th><th>End</th><th>Payment</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {data.memberships.filter((ms) => ms.isActive || ms.status === "frozen" || ms.status === "pending_payment").map((ms) => {
              const member = data.members.find((m) => m.id === ms.memberId);
              const exp = new Date(ms.endDate) < new Date() && ms.status !== "frozen" && ms.status !== "pending_payment";
              const bal = getMembershipBalance(ms, data.payments);
              const isPending = ms.status === "pending_payment";
              return (
                <tr key={ms.id} style={isPending ? { background: "rgba(249,115,22,0.04)" } : undefined}>
                  <td style={{ color: "var(--text)", fontWeight: 500 }}>{member?.name}</td>
                  <td>{getPlanName(ms.plan)}</td>
                  <td>{formatDate(ms.startDate)}</td>
                  <td>{formatDate(ms.endDate)}</td>
                  <td>
                    {bal.totalDue > 0 ? (
                      <div style={{ minWidth: 150 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                          <span style={{ color: "var(--text-dim)" }}>{formatUGX(bal.totalPaid)} / {formatUGX(bal.totalDue)}</span>
                          <span style={{ fontWeight: 600, color: bal.isPaidInFull ? "var(--success)" : "var(--warning)" }}>{Math.round(bal.totalPaid / bal.totalDue * 100)}%</span>
                        </div>
                        <div style={{ height: 6, background: "var(--bg-input)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${Math.min(100, Math.round(bal.totalPaid / bal.totalDue * 100))}%`, background: bal.isPaidInFull ? "var(--success)" : "var(--warning)", borderRadius: 3, transition: "width 0.3s" }} />
                        </div>
                        {!bal.isPaidInFull && <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 2, fontWeight: 600 }}>Balance: {formatUGX(bal.balance)}</div>}
                      </div>
                    ) : (
                      <Badge variant="success">Paid</Badge>
                    )}
                  </td>
                  <td>
                    {isPending ? <Badge variant="warning">Pending Payment</Badge> : ms.status === "frozen" ? <Badge variant="warning">Frozen</Badge> : exp ? <Badge variant="danger">Expired</Badge> : <Badge variant="success">Active</Badge>}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {isPending && <button className="btn btn-sm btn-primary" onClick={() => openPayBalance(ms)}><DollarSign size={12} /> Pay Balance</button>}
                      {!isPending && !bal.isPaidInFull && ms.status === "active" && <button className="btn btn-sm btn-primary" onClick={() => openPayBalance(ms)}><DollarSign size={12} /> Pay Balance</button>}
                      {ms.status === "active" && !exp && <button className="btn btn-sm btn-secondary" onClick={() => freeze(ms)}><Pause size={12} /> Freeze</button>}
                      {ms.status === "frozen" && <button className="btn btn-sm btn-secondary" onClick={() => unfreeze(ms)}><Play size={12} /> Unfreeze</button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ASSIGN PLAN MODAL */}
      {modal === "assign" && (
        <Modal title="Assign Membership Plan" onClose={() => setModal(null)} footer={<><button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={assign}><Check size={14} /> Assign & Record Payment</button></>}>
          <div className="form-grid">
            <div className="form-group full">
              <label>Member</label>
              <select value={form.memberId} onChange={(e) => setForm({ ...form, memberId: e.target.value })}>
                <option value="">Select member...</option>
                {data.members.filter((m) => m.isActive).map((m) => <option key={m.id} value={m.id}>{m.name} ({m.phone})</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Plan</label>
              <select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
                <optgroup label="Gym Only">
                  {Object.entries(PLANS).filter(([, v]) => v.category === "gym").map(([k, v]) => <option key={k} value={k}>{v.name} — {formatUGX(v.price)}</option>)}
                </optgroup>
                <optgroup label="Gym + Steam Combined">
                  {Object.entries(PLANS).filter(([, v]) => v.category === "combo").map(([k, v]) => <option key={k} value={k}>{v.name} — {formatUGX(v.price)}</option>)}
                </optgroup>
                <optgroup label="Group Plans (per month)">
                  {Object.entries(GROUP_PLANS).map(([k, v]) => <option key={k} value={k}>{v.name} — {formatUGX(v.price)} ({formatUGX(v.perPerson)}/person)</option>)}
                </optgroup>
              </select>
            </div>
            <div className="form-group">
              <label>Payment Method</label>
              <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                <option value="cash">Cash</option>
                <option value="mobile_money">Mobile Money</option>
                <option value="card">Card</option>
              </select>
            </div>
            <div className="form-group full">
              <label>Discount (optional)</label>
              <select value={form.discountId} onChange={(e) => setForm({ ...form, discountId: e.target.value })}>
                <option value="">No discount</option>
                {data.discounts.filter((d) => d.isActive).map((d) => <option key={d.id} value={d.id}>{d.name} ({d.type === "percentage" ? `${d.value}%` : formatUGX(d.value)})</option>)}
              </select>
            </div>

            {/* PAYMENT TYPE TOGGLE */}
            <div className="form-group full">
              <label>Payment Type</label>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button type="button" className={`btn btn-sm ${form.paymentType === "full" ? "btn-primary" : "btn-secondary"}`} onClick={() => setForm({ ...form, paymentType: "full", paymentAmount: "" })} style={{ flex: 1 }}>
                  <Check size={14} /> Full Payment
                </button>
                <button type="button" className={`btn btn-sm ${form.paymentType === "partial" ? "btn-primary" : "btn-secondary"}`} onClick={() => setForm({ ...form, paymentType: "partial", paymentAmount: "" })} style={{ flex: 1 }}>
                  <Layers size={14} /> Partial Payment
                </button>
              </div>
            </div>

            {form.paymentType === "partial" && (
              <div className="form-group full">
                <label>Amount Paying Now (UGX)</label>
                <input type="number" value={form.paymentAmount} onChange={(e) => setForm({ ...form, paymentAmount: e.target.value })} placeholder="Enter amount to pay today..." />
                <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                  Membership will remain in "Pending Payment" status until fully paid. Member cannot check in until balance is cleared.
                </p>
              </div>
            )}
          </div>

          {form.plan && (
            (() => {
              const isGroup = form.plan.startsWith("group_");
              const planInfo = isGroup ? GROUP_PLANS[form.plan] : PLANS[form.plan];
              if (!planInfo) return null;
              const discount = form.discountId ? data.discounts.find((d) => d.id === form.discountId) : null;
              let discountAmt = 0;
              if (discount) discountAmt = discount.type === "percentage" ? Math.round(planInfo.price * discount.value / 100) : discount.value;
              const totalDue = planInfo.price - discountAmt;
              const payNow = form.paymentType === "full" ? totalDue : Math.min(Number(form.paymentAmount) || 0, totalDue);
              const remaining = totalDue - payNow;

              return (
                <div style={{ marginTop: 16, padding: 16, background: "var(--bg-elevated)", borderRadius: "var(--radius-sm)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 13, color: "var(--text-dim)" }}>Plan</span>
                    <strong style={{ color: "var(--text)" }}>{planInfo.name}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 13, color: "var(--text-dim)" }}>Duration</span>
                    <strong style={{ color: "var(--text)" }}>{planInfo.days} days</strong>
                  </div>
                  {isGroup && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ fontSize: 13, color: "var(--text-dim)" }}>Per person</span><strong style={{ color: "var(--text)" }}>{formatUGX(planInfo.perPerson)}</strong></div>}
                  {discountAmt > 0 && (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 13, color: "var(--text-dim)" }}>Plan price</span>
                        <span style={{ color: "var(--text-dim)", textDecoration: "line-through" }}>{formatUGX(planInfo.price)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 13, color: "var(--success)" }}>Discount ({discount.name})</span>
                        <span style={{ color: "var(--success)" }}>-{formatUGX(discountAmt)}</span>
                      </div>
                    </>
                  )}
                  <div style={{ borderTop: "1px solid var(--border)", marginTop: 8, paddingTop: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Total Due</span>
                      <span style={{ fontSize: 16, fontWeight: 700, color: "var(--accent)" }}>{formatUGX(totalDue)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 13, color: "var(--success)" }}>Paying Now</span>
                      <span style={{ fontWeight: 600, color: "var(--success)" }}>{formatUGX(payNow)}</span>
                    </div>
                    {remaining > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px dashed var(--border)", marginTop: 4 }}>
                        <span style={{ fontSize: 13, color: "var(--danger)", fontWeight: 600 }}>Remaining Balance</span>
                        <span style={{ fontWeight: 700, color: "var(--danger)" }}>{formatUGX(remaining)}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()
          )}
        </Modal>
      )}

      {/* PAY BALANCE MODAL */}
      {modal === "pay" && payTarget && (
        (() => {
          const bal = getMembershipBalance(payTarget, data.payments);
          const member = data.members.find((m) => m.id === payTarget.memberId);
          const payAmount = Math.min(Number(form.paymentAmount) || 0, bal.balance);
          const remainingAfter = bal.balance - payAmount;
          return (
            <Modal title="Record Payment" onClose={() => { setModal(null); setPayTarget(null); }} footer={<><button className="btn btn-secondary" onClick={() => { setModal(null); setPayTarget(null); }}>Cancel</button><button className="btn btn-primary" onClick={recordPayment}><DollarSign size={14} /> Record Payment</button></>}>
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>{member?.name}</h3>
                <p style={{ color: "var(--text-dim)", marginTop: 2 }}>{getPlanName(payTarget.plan)}</p>
              </div>

              {/* Balance overview */}
              <div style={{ background: "var(--bg-elevated)", borderRadius: "var(--radius-sm)", padding: 16, marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ color: "var(--text-dim)", fontSize: 13 }}>Total Due</span>
                  <span style={{ fontWeight: 600 }}>{formatUGX(bal.totalDue)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ color: "var(--success)", fontSize: 13 }}>Already Paid</span>
                  <span style={{ fontWeight: 600, color: "var(--success)" }}>{formatUGX(bal.totalPaid)}</span>
                </div>
                <div style={{ height: 8, background: "var(--bg-input)", borderRadius: 4, overflow: "hidden", marginBottom: 8 }}>
                  <div style={{ height: "100%", width: `${Math.round(bal.totalPaid / bal.totalDue * 100)}%`, background: "var(--warning)", borderRadius: 4 }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                  <span style={{ color: "var(--danger)", fontSize: 14, fontWeight: 600 }}>Outstanding Balance</span>
                  <span style={{ fontSize: 18, fontWeight: 700, color: "var(--danger)" }}>{formatUGX(bal.balance)}</span>
                </div>
              </div>

              {/* Payment history for this membership */}
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Payment History</p>
                {data.payments.filter((p) => p.membershipId === payTarget.id).map((p, i) => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
                    <span style={{ color: "var(--text-dim)" }}>#{i + 1} — {formatDate(p.paidAt)} ({p.method === "mobile_money" ? "M-Money" : p.method})</span>
                    <span style={{ fontWeight: 600, color: "var(--success)" }}>{formatUGX(p.amount)}</span>
                  </div>
                ))}
              </div>

              {/* New payment form */}
              <div className="form-grid">
                <div className="form-group">
                  <label>Amount (UGX)</label>
                  <input type="number" value={form.paymentAmount} onChange={(e) => setForm({ ...form, paymentAmount: e.target.value })} max={bal.balance} />
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => setForm({ ...form, paymentAmount: String(bal.balance) })} style={{ fontSize: 11 }}>Full Balance</button>
                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => setForm({ ...form, paymentAmount: String(Math.round(bal.balance / 2)) })} style={{ fontSize: 11 }}>50%</button>
                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => setForm({ ...form, paymentAmount: String(Math.round(bal.balance / 4)) })} style={{ fontSize: 11 }}>25%</button>
                  </div>
                </div>
                <div className="form-group">
                  <label>Method</label>
                  <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                    <option value="cash">Cash</option>
                    <option value="mobile_money">Mobile Money</option>
                    <option value="card">Card</option>
                  </select>
                </div>
              </div>

              {payAmount > 0 && (
                <div style={{ marginTop: 16, padding: 12, borderRadius: "var(--radius-xs)", background: remainingAfter <= 0 ? "var(--success-dim)" : "var(--warning-dim)", border: `1px solid ${remainingAfter <= 0 ? "rgba(34,197,94,0.3)" : "rgba(249,115,22,0.3)"}` }}>
                  {remainingAfter <= 0 ? (
                    <p style={{ fontSize: 13, color: "var(--success)", fontWeight: 600 }}>
                      <Check size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />
                      This payment will clear the full balance. Membership will be activated immediately.
                    </p>
                  ) : (
                    <p style={{ fontSize: 13, color: "var(--warning)" }}>
                      After this payment, <strong>{formatUGX(remainingAfter)}</strong> will still be outstanding. Membership stays in pending status.
                    </p>
                  )}
                </div>
              )}
            </Modal>
          );
        })()
      )}
    </div>
  );
};

// ─── PAYMENTS ───────────────────────────────────────────────
const Payments = ({ data }) => {
  const [tab, setTab] = useState("all");
  const payments = tab === "all" ? data.payments : data.payments.filter((p) => p.method === tab);

  return (
    <div>
      <div className="page-header"><h2>Payments</h2><p>Track all payment transactions</p></div>
      <div className="tabs">
        {["all", "cash", "mobile_money", "card"].map((t) => (
          <button key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
            {t === "all" ? "All" : t === "mobile_money" ? "Mobile Money" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      <div className="table-wrapper">
        <table>
          <thead><tr><th>Date</th><th>Member</th><th>Type</th><th>Method</th><th>Amount</th><th>Note</th></tr></thead>
          <tbody>
            {[...payments].sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt)).map((p) => {
              const member = data.members.find((m) => m.id === p.memberId);
              return (
                <tr key={p.id}>
                  <td>{formatDate(p.paidAt)} {formatTime(p.paidAt)}</td>
                  <td style={{ color: "var(--text)", fontWeight: 500 }}>{member?.name || "—"}</td>
                  <td>{p.type === "addon" ? <Badge variant="info">Add-on</Badge> : <Badge variant="success">Membership</Badge>}</td>
                  <td><Badge variant="neutral">{p.method === "mobile_money" ? "Mobile Money" : p.method?.charAt(0).toUpperCase() + p.method?.slice(1)}</Badge></td>
                  <td style={{ fontWeight: 600, color: "var(--accent)" }}>{formatUGX(p.amount)}</td>
                  <td style={{ fontSize: 12, color: "var(--text-dim)", maxWidth: 200 }}>
                    {p.note || (p.discountAmount > 0 ? <span style={{ color: "var(--success)" }}>Discount: -{formatUGX(p.discountAmount)}</span> : "—")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── WALK-INS ───────────────────────────────────────────────
const WalkIns = ({ data, setData }) => {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", activityId: "steam" });

  const save = () => {
    if (!form.name || !form.phone) return;
    const act = ACTIVITIES.find((a) => a.id === form.activityId);
    setData((d) => ({ ...d, walkIns: [...d.walkIns, { id: generateId(), ...form, amountPaid: act.standalone, visitDate: today() }] }));
    setModal(false);
  };

  return (
    <div>
      <div className="page-header"><h2>Walk-In Guests</h2><p>Record one-off guest visits</p></div>
      <div className="toolbar">
        <div />
        <button className="btn btn-primary" onClick={() => { setForm({ name: "", phone: "", activityId: "steam" }); setModal(true); }}><Plus size={16} /> Record Walk-In</button>
      </div>
      <div className="table-wrapper">
        <table>
          <thead><tr><th>Date</th><th>Name</th><th>Phone</th><th>Activity</th><th>Amount</th></tr></thead>
          <tbody>
            {data.walkIns.map((w) => (
              <tr key={w.id}>
                <td>{formatDate(w.visitDate)}</td>
                <td style={{ color: "var(--text)", fontWeight: 500 }}>{w.name}</td>
                <td>{w.phone}</td>
                <td>{ACTIVITIES.find((a) => a.id === w.activityId)?.name}</td>
                <td style={{ fontWeight: 600, color: "var(--accent)" }}>{formatUGX(w.amountPaid)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal && (
        <Modal title="Record Walk-In" onClose={() => setModal(false)} footer={<><button className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
          <div className="form-grid">
            <div className="form-group"><label>Name *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="form-group"><label>Phone *</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="form-group full"><label>Activity</label>
              <select value={form.activityId} onChange={(e) => setForm({ ...form, activityId: e.target.value })}>
                {ACTIVITIES.map((a) => <option key={a.id} value={a.id}>{a.name} — {formatUGX(a.standalone)}</option>)}
              </select>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ─── ATTENDANCE ─────────────────────────────────────────────
const Attendance = ({ data, setData }) => {
  return (
    <div>
      <div className="page-header"><h2>Attendance Log</h2><p>Full attendance history</p></div>
      <div className="table-wrapper">
        <table>
          <thead><tr><th>Date</th><th>Member</th><th>Check-In</th><th>Check-Out</th><th>Source</th><th>Locker</th></tr></thead>
          <tbody>
            {[...data.attendance].sort((a, b) => new Date(b.checkIn) - new Date(a.checkIn)).map((a) => {
              const member = data.members.find((m) => m.id === a.memberId);
              return (
                <tr key={a.id}>
                  <td>{formatDate(a.date)}</td>
                  <td style={{ color: "var(--text)", fontWeight: 500 }}>{member?.name}</td>
                  <td>{formatTime(a.checkIn)}</td>
                  <td>{a.checkOut ? formatTime(a.checkOut) : <button className="btn btn-sm btn-secondary" onClick={() => setData((d) => ({ ...d, attendance: d.attendance.map((x) => x.id === a.id ? { ...x, checkOut: new Date().toISOString() } : x) }))}>Check Out</button>}</td>
                  <td><Badge variant={a.source === "self" ? "info" : "neutral"}>{a.source === "self" ? "Self" : "Staff"}</Badge></td>
                  <td>{a.locker || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── TIMETABLE ──────────────────────────────────────────────
const TimetablePage = () => {
  const colors = ["#f59e0b", "#3b82f6", "#22c55e", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4"];
  return (
    <div>
      <div className="page-header"><h2>Class Timetable</h2><p>Weekly schedule • Mon–Sat: 6:30am – 9:00pm | Sun: 8:00am – 9:00pm</p></div>
      <div className="timetable-grid">
        {TIMETABLE.map((t, i) => (
          <div key={i} className="timetable-slot" style={{ borderLeftColor: colors[i % colors.length] }}>
            <div className="slot-day" style={{ color: colors[i % colors.length] }}>{t.day}</div>
            <div className="slot-class">{t.class}</div>
            <div className="slot-time">{t.time}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── TRAINERS ───────────────────────────────────────────────
const Trainers = ({ data, setData }) => {
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "", specialisation: "" });
  const [current, setCurrent] = useState(null);

  const save = () => {
    if (!form.name) return;
    if (modal === "add") {
      setData((d) => ({ ...d, trainers: [...d.trainers, { ...form, id: generateId(), isActive: true }] }));
    } else {
      setData((d) => ({ ...d, trainers: d.trainers.map((t) => t.id === current.id ? { ...t, ...form } : t) }));
    }
    setModal(null);
  };

  return (
    <div>
      <div className="page-header"><h2>Trainers</h2><p>Manage trainer profiles and assignments</p></div>
      <div className="toolbar">
        <div />
        <button className="btn btn-primary" onClick={() => { setForm({ name: "", phone: "", specialisation: "" }); setModal("add"); }}><Plus size={16} /> Add Trainer</button>
      </div>
      <div className="table-wrapper">
        <table>
          <thead><tr><th>Name</th><th>Phone</th><th>Specialisation</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {data.trainers.map((t) => (
              <tr key={t.id}>
                <td style={{ color: "var(--text)", fontWeight: 500 }}>{t.name}</td>
                <td>{t.phone}</td>
                <td>{t.specialisation}</td>
                <td>{t.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="danger">Inactive</Badge>}</td>
                <td>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-icon btn-secondary" onClick={() => { setCurrent(t); setForm(t); setModal("edit"); }}><Edit2 size={14} /></button>
                    <button className="btn btn-icon btn-danger" onClick={() => setData((d) => ({ ...d, trainers: d.trainers.map((x) => x.id === t.id ? { ...x, isActive: !x.isActive } : x) }))}>{t.isActive ? <Pause size={14} /> : <Play size={14} />}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal && (
        <Modal title={modal === "add" ? "Add Trainer" : "Edit Trainer"} onClose={() => setModal(null)} footer={<><button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
          <div className="form-grid">
            <div className="form-group"><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="form-group"><label>Phone</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="form-group full"><label>Specialisation</label><input value={form.specialisation} onChange={(e) => setForm({ ...form, specialisation: e.target.value })} /></div>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ─── EQUIPMENT ──────────────────────────────────────────────
const Equipment = ({ data, setData }) => {
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: "", type: "Cardio", serialNumber: "", purchaseDate: "", status: "operational" });
  const [current, setCurrent] = useState(null);

  const save = () => {
    if (!form.name) return;
    if (modal === "add") {
      setData((d) => ({ ...d, equipment: [...d.equipment, { ...form, id: generateId() }] }));
    } else {
      setData((d) => ({ ...d, equipment: d.equipment.map((e) => e.id === current.id ? { ...e, ...form } : e) }));
    }
    setModal(null);
  };

  return (
    <div>
      <div className="page-header"><h2>Equipment</h2><p>Track gym equipment and maintenance schedules</p></div>
      <div className="toolbar">
        <div />
        <button className="btn btn-primary" onClick={() => { setForm({ name: "", type: "Cardio", serialNumber: "", purchaseDate: today(), status: "operational" }); setModal("add"); }}><Plus size={16} /> Add Equipment</button>
      </div>
      <div className="table-wrapper">
        <table>
          <thead><tr><th>Name</th><th>Type</th><th>Serial</th><th>Purchased</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {data.equipment.map((eq) => (
              <tr key={eq.id}>
                <td style={{ color: "var(--text)", fontWeight: 500 }}>{eq.name}</td>
                <td>{eq.type}</td>
                <td style={{ fontFamily: "monospace", fontSize: 12 }}>{eq.serialNumber}</td>
                <td>{formatDate(eq.purchaseDate)}</td>
                <td>
                  {eq.status === "operational" ? <Badge variant="success">Operational</Badge> : eq.status === "maintenance" ? <Badge variant="warning">Maintenance</Badge> : <Badge variant="danger">Decommissioned</Badge>}
                </td>
                <td>
                  <button className="btn btn-icon btn-secondary" onClick={() => { setCurrent(eq); setForm(eq); setModal("edit"); }}><Edit2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal && (
        <Modal title={modal === "add" ? "Add Equipment" : "Edit Equipment"} onClose={() => setModal(null)} footer={<><button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
          <div className="form-grid">
            <div className="form-group"><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="form-group"><label>Type</label><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option>Cardio</option><option>Strength</option><option>Flexibility</option><option>Recovery</option></select></div>
            <div className="form-group"><label>Serial Number</label><input value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} /></div>
            <div className="form-group"><label>Purchase Date</label><input type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} /></div>
            <div className="form-group full"><label>Status</label><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="operational">Operational</option><option value="maintenance">Under Maintenance</option><option value="decommissioned">Decommissioned</option></select></div>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ─── DISCOUNTS ──────────────────────────────────────────────
const Discounts = ({ data, setData }) => {
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: "", type: "percentage", value: 10, startDate: today(), endDate: "", maxUses: 100 });

  const save = () => {
    if (!form.name) return;
    setData((d) => ({ ...d, discounts: [...d.discounts, { ...form, id: generateId(), value: Number(form.value), maxUses: Number(form.maxUses), usesCount: 0, isActive: true }] }));
    setModal(null);
  };

  return (
    <div>
      <div className="page-header"><h2>Discounts & Promos</h2><p>Manage promotional offers and coupon codes</p></div>
      <div className="toolbar">
        <div />
        <button className="btn btn-primary" onClick={() => { setForm({ name: "", type: "percentage", value: 10, startDate: today(), endDate: "", maxUses: 100 }); setModal("add"); }}><Plus size={16} /> Create Discount</button>
      </div>
      <div className="table-wrapper">
        <table>
          <thead><tr><th>Name</th><th>Type</th><th>Value</th><th>Valid Until</th><th>Uses</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {data.discounts.map((d) => (
              <tr key={d.id}>
                <td style={{ color: "var(--text)", fontWeight: 500 }}>{d.name}</td>
                <td><Badge variant="info">{d.type}</Badge></td>
                <td>{d.type === "percentage" ? `${d.value}%` : formatUGX(d.value)}</td>
                <td>{d.endDate ? formatDate(d.endDate) : "No limit"}</td>
                <td>{d.usesCount}/{d.maxUses}</td>
                <td>{d.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="danger">Inactive</Badge>}</td>
                <td><button className="btn btn-icon btn-danger" onClick={() => setData((x) => ({ ...x, discounts: x.discounts.map((dd) => dd.id === d.id ? { ...dd, isActive: !dd.isActive } : dd) }))}>{d.isActive ? <Pause size={14} /> : <Play size={14} />}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal && (
        <Modal title="Create Discount" onClose={() => setModal(null)} footer={<><button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
          <div className="form-grid">
            <div className="form-group full"><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="form-group"><label>Type</label><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option value="percentage">Percentage</option><option value="fixed">Fixed Amount</option></select></div>
            <div className="form-group"><label>Value</label><input type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></div>
            <div className="form-group"><label>Start Date</label><input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
            <div className="form-group"><label>End Date</label><input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></div>
            <div className="form-group"><label>Max Uses</label><input type="number" value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} /></div>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ─── RECONCILIATION ─────────────────────────────────────────
const Reconciliation = ({ data, setData }) => {
  const [modal, setModal] = useState(false);
  const [declaredCash, setDeclaredCash] = useState("");

  const todayPayments = data.payments.filter((p) => p.paidAt.startsWith(today()));
  const systemCash = todayPayments.filter((p) => p.method === "cash").reduce((s, p) => s + p.amount, 0) + data.walkIns.filter((w) => w.visitDate === today()).reduce((s, w) => s + w.amountPaid, 0);
  const systemMobile = todayPayments.filter((p) => p.method === "mobile_money").reduce((s, p) => s + p.amount, 0);
  const systemCard = todayPayments.filter((p) => p.method === "card").reduce((s, p) => s + p.amount, 0);

  const submit = () => {
    const declared = Number(declaredCash);
    const variance = declared - systemCash;
    setData((d) => ({
      ...d,
      reconciliations: [...d.reconciliations, {
        id: generateId(), staffId: "s2", shiftDate: today(), declaredCash: declared,
        systemCash, systemMobileMoney: systemMobile, systemCard, variance,
        status: variance === 0 ? "balanced" : "flagged", adminNote: "",
      }],
    }));
    setModal(false);
    setDeclaredCash("");
  };

  const todayRec = data.reconciliations.find((r) => r.shiftDate === today());

  return (
    <div>
      <div className="page-header"><h2>Daily Reconciliation</h2><p>End-of-shift cash verification</p></div>

      <div className="card-grid" style={{ marginBottom: 24 }}>
        <StatCard icon={DollarSign} label="System Cash" value={formatUGX(systemCash)} color="var(--success)" bg="var(--success-dim)" />
        <StatCard icon={CreditCard} label="Mobile Money" value={formatUGX(systemMobile)} color="var(--info)" bg="var(--info-dim)" />
        <StatCard icon={CreditCard} label="Card" value={formatUGX(systemCard)} color="var(--accent)" bg="var(--accent-dim)" />
        <StatCard icon={TrendingUp} label="Total Revenue" value={formatUGX(systemCash + systemMobile + systemCard)} color="var(--accent)" bg="var(--accent-dim)" />
      </div>

      {!todayRec ? (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <AlertTriangle size={40} style={{ color: "var(--warning)", marginBottom: 12 }} />
          <h3 style={{ fontFamily: "var(--font-display)", marginBottom: 8 }}>Reconciliation Not Submitted</h3>
          <p style={{ color: "var(--text-dim)", marginBottom: 20 }}>Submit today's end-of-shift cash declaration.</p>
          <button className="btn btn-primary" onClick={() => setModal(true)}>Submit Reconciliation</button>
        </div>
      ) : (
        <div className="card">
          <h3 style={{ fontFamily: "var(--font-display)", marginBottom: 16 }}>Today's Reconciliation</h3>
          <div className="form-grid">
            <div><p style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase" }}>Declared Cash</p><p style={{ fontSize: 18, fontWeight: 700 }}>{formatUGX(todayRec.declaredCash)}</p></div>
            <div><p style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase" }}>System Cash</p><p style={{ fontSize: 18, fontWeight: 700 }}>{formatUGX(todayRec.systemCash)}</p></div>
            <div><p style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase" }}>Variance</p><p style={{ fontSize: 18, fontWeight: 700, color: todayRec.variance === 0 ? "var(--success)" : "var(--danger)" }}>{formatUGX(todayRec.variance)}</p></div>
            <div><p style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase" }}>Status</p>{todayRec.status === "balanced" ? <Badge variant="success">Balanced</Badge> : <Badge variant="danger">Variance Flagged</Badge>}</div>
          </div>
        </div>
      )}

      {data.reconciliations.length > 0 && (
        <div className="table-wrapper" style={{ marginTop: 20 }}>
          <table>
            <thead><tr><th>Date</th><th>Declared</th><th>System Cash</th><th>Variance</th><th>Status</th></tr></thead>
            <tbody>
              {[...data.reconciliations].sort((a, b) => b.shiftDate.localeCompare(a.shiftDate)).map((r) => (
                <tr key={r.id}>
                  <td>{formatDate(r.shiftDate)}</td>
                  <td>{formatUGX(r.declaredCash)}</td>
                  <td>{formatUGX(r.systemCash)}</td>
                  <td style={{ color: r.variance === 0 ? "var(--success)" : "var(--danger)", fontWeight: 600 }}>{formatUGX(r.variance)}</td>
                  <td>{r.status === "balanced" ? <Badge variant="success">Balanced</Badge> : <Badge variant="danger">Flagged</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <Modal title="Submit Reconciliation" onClose={() => setModal(false)} footer={<><button className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button><button className="btn btn-primary" onClick={submit}>Submit</button></>}>
          <p style={{ marginBottom: 16, color: "var(--text-dim)" }}>System-recorded cash today: <strong style={{ color: "var(--accent)" }}>{formatUGX(systemCash)}</strong></p>
          <div className="form-group">
            <label>Declared Physical Cash (UGX)</label>
            <input type="number" value={declaredCash} onChange={(e) => setDeclaredCash(e.target.value)} placeholder="Enter actual cash collected..." />
          </div>
        </Modal>
      )}
    </div>
  );
};

// ─── STAFF MANAGEMENT ───────────────────────────────────────
const StaffMgmt = ({ data, setData, currentUser }) => {
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: "", username: "", password: "", role: "staff" });
  const [resetTarget, setResetTarget] = useState(null);
  const [newPassword, setNewPassword] = useState("");

  const save = async () => {
    if (!form.name || !form.username || !form.password) return;
    if (form.password.length < 6) { alert("Password must be at least 6 characters"); return; }
    const hashed = await hashPassword(form.password);
    setData((d) => ({ ...d, staff: [...d.staff, { name: sanitize(form.name), username: sanitize(form.username), passwordHash: hashed, role: form.role, id: generateId(), isActive: true }] }));
    setModal(null);
  };

  const resetPassword = async () => {
    if (!newPassword || newPassword.length < 6) { alert("Password must be at least 6 characters"); return; }
    const hashed = await hashPassword(newPassword);
    setData((d) => ({ ...d, staff: d.staff.map((s) => s.id === resetTarget.id ? { ...s, passwordHash: hashed } : s) }));
    setResetTarget(null);
    setNewPassword("");
  };

  const toggleActive = (s) => {
    if (s.id === currentUser?.id) { alert("You cannot deactivate your own account"); return; }
    setData((d) => ({ ...d, staff: d.staff.map((x) => x.id === s.id ? { ...x, isActive: !x.isActive } : x) }));
  };

  return (
    <div>
      <div className="page-header"><h2>Staff Management</h2><p>Manage user accounts, roles, and credentials (FR-65 to FR-69)</p></div>
      <div className="toolbar">
        <div />
        <button className="btn btn-primary" onClick={() => { setForm({ name: "", username: "", password: "", role: "staff" }); setModal("add"); }}><Plus size={16} /> Add Staff</button>
      </div>
      <div className="table-wrapper">
        <table>
          <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {data.staff.map((s) => (
              <tr key={s.id}>
                <td style={{ color: "var(--text)", fontWeight: 500 }}>
                  {s.name}
                  {s.id === currentUser?.id && <span style={{ fontSize: 10, color: "var(--accent)", marginLeft: 8, fontWeight: 600 }}>YOU</span>}
                </td>
                <td style={{ fontFamily: "monospace" }}>{s.username}</td>
                <td><Badge variant={s.role === "admin" ? "warning" : "info"}>{s.role === "admin" ? "Admin" : "Front Desk"}</Badge></td>
                <td>{s.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="danger">Inactive</Badge>}</td>
                <td>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-sm btn-secondary" onClick={() => { setResetTarget(s); setNewPassword(""); }}>Reset Password</button>
                    <button className="btn btn-icon btn-danger" onClick={() => toggleActive(s)}>{s.isActive ? <Pause size={14} /> : <Play size={14} />}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal === "add" && (
        <Modal title="Add Staff Account" onClose={() => setModal(null)} footer={<><button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={save}>Create Account</button></>}>
          <div className="form-grid">
            <div className="form-group"><label>Name *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="form-group"><label>Username *</label><input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })} placeholder="Lowercase, no spaces" /></div>
            <div className="form-group"><label>Password * (min 6 chars)</label><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
            <div className="form-group"><label>Role</label><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="staff">Front Desk Staff</option><option value="admin">Admin</option></select></div>
          </div>
          <div style={{ marginTop: 16, padding: 12, background: "var(--bg-elevated)", borderRadius: "var(--radius-xs)", fontSize: 12, color: "var(--text-dim)" }}>
            <strong style={{ color: "var(--text)" }}>Security:</strong> Password will be hashed with SHA-256 + salt before storage. Plain text is never stored.
          </div>
        </Modal>
      )}

      {resetTarget && (
        <Modal title={`Reset Password — ${resetTarget.name}`} onClose={() => setResetTarget(null)} footer={<><button className="btn btn-secondary" onClick={() => setResetTarget(null)}>Cancel</button><button className="btn btn-primary" onClick={resetPassword}>Reset Password</button></>}>
          <div className="form-group">
            <label>New Password (min 6 characters)</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Enter new password" />
          </div>
          <p style={{ marginTop: 12, fontSize: 12, color: "var(--text-muted)" }}>This action is logged in the audit trail.</p>
        </Modal>
      )}
    </div>
  );
};

// ─── LOCKERS ────────────────────────────────────────────────
const Lockers = ({ data, setData }) => {
  const toggle = (l) => {
    setData((d) => ({ ...d, lockers: d.lockers.map((x) => x.id === l.id ? { ...x, isOccupied: !x.isOccupied, memberId: x.isOccupied ? null : x.memberId } : x) }));
  };

  return (
    <div>
      <div className="page-header"><h2>Lockers</h2><p>Manage locker assignments — {data.lockers.filter((l) => !l.isOccupied).length} of {data.lockers.length} available</p></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 10 }}>
        {data.lockers.map((l) => (
          <div key={l.id} onClick={() => toggle(l)} style={{
            background: l.isOccupied ? "var(--danger-dim)" : "var(--success-dim)",
            border: `1px solid ${l.isOccupied ? "var(--danger)" : "var(--success)"}`,
            borderRadius: "var(--radius-sm)", padding: 16, textAlign: "center", cursor: "pointer", transition: "var(--transition)",
          }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: l.isOccupied ? "var(--danger)" : "var(--success)" }}>#{l.number}</div>
            <div style={{ fontSize: 11, marginTop: 4, color: "var(--text-dim)" }}>{l.isOccupied ? "Occupied" : "Available"}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── SELF CHECK-IN KIOSK ────────────────────────────────────
const SelfCheckIn = ({ data, setData, onExit }) => {
  const [step, setStep] = useState("phone"); // phone | confirm | pin | success | blocked | locked
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [member, setMember] = useState(null);
  const [attempts, setAttempts] = useState(0);
  const [lockTimer, setLockTimer] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (lockTimer > 0) {
      timerRef.current = setTimeout(() => setLockTimer((t) => t - 1), 1000);
      return () => clearTimeout(timerRef.current);
    }
    if (lockTimer === 0 && step === "locked") { reset(); }
  }, [lockTimer, step]);

  // Auto-reset after success
  useEffect(() => {
    if (step === "success") {
      const t = setTimeout(reset, 10000);
      return () => clearTimeout(t);
    }
  }, [step]);

  const reset = () => { setStep("phone"); setPhone(""); setPin(""); setMember(null); setAttempts(0); };

  const handlePhoneKey = (k) => {
    if (k === "del") setPhone((p) => p.slice(0, -1));
    else if (k === "go") {
      const found = data.members.find((m) => m.phone === phone && m.isActive);
      if (found) { setMember(found); setStep("confirm"); }
      else { setStep("blocked"); setTimeout(reset, 5000); }
    }
    else if (phone.length < 10) setPhone((p) => p + k);
  };

  const handlePinKey = (k) => {
    if (k === "del") setPin((p) => p.slice(0, -1));
    else if (k === "go") {
      if (pin === member.pin) {
        const ms = data.memberships.find((ms) => ms.memberId === member.id && ms.isActive);
        if (!ms || new Date(ms.endDate) < new Date()) { setStep("blocked"); setTimeout(reset, 5000); return; }
        if (ms.status === "frozen") { setStep("blocked"); setTimeout(reset, 5000); return; }
        const alreadyIn = data.attendance.some((a) => a.memberId === member.id && a.date === today());
        if (alreadyIn) { setStep("success"); return; }
        setData((d) => ({ ...d, attendance: [...d.attendance, { id: generateId(), memberId: member.id, checkIn: new Date().toISOString(), checkOut: null, date: today(), source: "self", locker: null }] }));
        setStep("success");
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        setPin("");
        if (newAttempts >= 3) { setStep("locked"); setLockTimer(60); }
      }
    }
    else if (pin.length < 4) setPin((p) => p + k);
  };

  const Keypad = ({ onKey, showGo }) => (
    <div className="kiosk-keypad">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <button key={n} className="kiosk-key" onClick={() => onKey(String(n))}>{n}</button>)}
      <button className="kiosk-key" onClick={() => onKey("del")} style={{ fontSize: 14 }}>DEL</button>
      <button className="kiosk-key" onClick={() => onKey("0")}>0</button>
      {showGo ? <button className="kiosk-key" onClick={() => onKey("go")} style={{ background: "var(--accent)", color: "#000", borderColor: "var(--accent)" }}>GO</button> : <div />}
    </div>
  );

  return (
    <div className="kiosk-overlay">
      <button className="btn btn-sm btn-secondary" onClick={onExit} style={{ position: "absolute", top: 16, right: 16 }}>Exit Kiosk</button>

      {step === "phone" && (
        <div style={{ textAlign: "center" }}>
          <Zap size={48} style={{ color: "var(--accent)", marginBottom: 16 }} />
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, color: "var(--accent)", marginBottom: 4 }}>Rush Fitness</h1>
          <p style={{ color: "var(--text-dim)", marginBottom: 32 }}>Enter your phone number to check in</p>
          <div style={{ fontSize: 32, fontFamily: "monospace", color: "var(--text)", minHeight: 48, letterSpacing: 4, marginBottom: 16 }}>{phone || "•••••••••"}</div>
          <Keypad onKey={handlePhoneKey} showGo={phone.length >= 7} />
        </div>
      )}

      {step === "confirm" && member && (
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 100, height: 100, borderRadius: "50%", overflow: "hidden", background: "var(--accent-dim)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", border: "3px solid var(--accent)" }}>{member.photo ? <img src={member.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 36, fontFamily: "var(--font-display)", color: "var(--accent)", fontWeight: 700 }}>{member.name.charAt(0)}</span>}</div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24 }}>{member.name}</h2>
          <p style={{ color: "var(--text-dim)", marginTop: 8, marginBottom: 24 }}>Enter your 4-digit PIN</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 20 }}>
            {[0, 1, 2, 3].map((i) => <div key={i} style={{ width: 20, height: 20, borderRadius: "50%", background: pin.length > i ? "var(--accent)" : "var(--border)" }} />)}
          </div>
          {attempts > 0 && <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>Wrong PIN. {3 - attempts} attempts left.</p>}
          <Keypad onKey={handlePinKey} showGo={pin.length === 4} />
        </div>
      )}

      {step === "success" && (
        <div style={{ textAlign: "center", animation: "pulse 0.5s" }}>
          <div style={{ width: 120, height: 120, borderRadius: "50%", background: "var(--success-dim)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", border: "3px solid var(--success)" }}>
            <Check size={56} style={{ color: "var(--success)" }} />
          </div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 28, color: "var(--success)" }}>Welcome, {member?.name}!</h2>
          <p style={{ color: "var(--text-dim)", marginTop: 8 }}>Checked in at {formatTime(new Date())}</p>
          <p style={{ color: "var(--text-muted)", marginTop: 24, fontSize: 13 }}>Screen resets in 10 seconds...</p>
        </div>
      )}

      {step === "blocked" && (
        <div style={{ textAlign: "center" }}>
          <AlertTriangle size={64} style={{ color: "var(--danger)", marginBottom: 16 }} />
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--danger)" }}>Check-In Blocked</h2>
          <p style={{ color: "var(--text-dim)", marginTop: 8 }}>Your membership may be expired, frozen, or not found.</p>
          <p style={{ color: "var(--text-dim)", marginTop: 4 }}>Please see staff at the front desk.</p>
        </div>
      )}

      {step === "locked" && (
        <div style={{ textAlign: "center" }}>
          <Shield size={64} style={{ color: "var(--danger)", marginBottom: 16 }} />
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--danger)" }}>Screen Locked</h2>
          <p style={{ color: "var(--text-dim)", marginTop: 8 }}>Too many wrong PIN attempts.</p>
          <p style={{ color: "var(--text-dim)", marginTop: 4 }}>Please see staff. Unlocking in {lockTimer}s</p>
        </div>
      )}
    </div>
  );
};

// ─── REPORTS ────────────────────────────────────────────────
const Reports = ({ data }) => {
  const totalRevenue = data.payments.reduce((s, p) => s + p.amount, 0) + data.walkIns.reduce((s, w) => s + w.amountPaid, 0);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthlyRevenue = data.payments.filter((p) => p.paidAt.startsWith(currentMonth)).reduce((s, p) => s + p.amount, 0) + data.walkIns.filter((w) => w.visitDate.startsWith(currentMonth)).reduce((s, w) => s + w.amountPaid, 0);
  const totalDiscounts = data.payments.reduce((s, p) => s + (p.discountAmount || 0), 0);
  const planBreakdown = {};
  data.memberships.forEach((ms) => {
    const key = getPlanName(ms.plan);
    planBreakdown[key] = (planBreakdown[key] || 0) + 1;
  });

  return (
    <div>
      <div className="page-header"><h2>Reports</h2><p>Revenue and membership analytics</p></div>
      <div className="card-grid">
        <StatCard icon={DollarSign} label="Total Revenue" value={formatUGX(totalRevenue)} color="var(--accent)" bg="var(--accent-dim)" />
        <StatCard icon={TrendingUp} label="This Month" value={formatUGX(monthlyRevenue)} color="var(--success)" bg="var(--success-dim)" />
        <StatCard icon={Tag} label="Total Discounts Given" value={formatUGX(totalDiscounts)} color="var(--warning)" bg="var(--warning-dim)" />
        <StatCard icon={Users} label="Total Registrations" value={data.members.length} color="var(--info)" bg="var(--info-dim)" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 8 }}>
        <div className="card">
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, marginBottom: 16 }}>Membership Distribution</h3>
          {Object.entries(planBreakdown).map(([plan, count]) => (
            <div key={plan} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
              <span style={{ color: "var(--text)" }}>{plan}</span>
              <Badge variant="info">{count}</Badge>
            </div>
          ))}
        </div>

        <div className="card">
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, marginBottom: 16 }}>Payment Methods</h3>
          {["cash", "mobile_money", "card"].map((method) => {
            const total = data.payments.filter((p) => p.method === method).reduce((s, p) => s + p.amount, 0);
            return (
              <div key={method} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <span style={{ color: "var(--text)" }}>{method === "mobile_money" ? "Mobile Money" : method.charAt(0).toUpperCase() + method.slice(1)}</span>
                <span style={{ fontWeight: 600, color: "var(--accent)" }}>{formatUGX(total)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ─── SECURITY LAYER ─────────────────────────────────────────

// SHA-256 hash (browser-native, no external deps)
const hashPassword = async (password) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + "rush_fitness_salt_2025");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
};

// Input sanitisation — strips HTML/script injection
const sanitize = (str) => {
  if (typeof str !== "string") return str;
  return str.replace(/[<>"'&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "&": "&amp;" }[c]));
};

const sanitizeForm = (obj) => {
  const clean = {};
  for (const [k, v] of Object.entries(obj)) {
    clean[k] = typeof v === "string" ? sanitize(v) : v;
  }
  return clean;
};

// Phone validation (Uganda format)
const isValidPhone = (phone) => /^0[37]\d{8}$/.test(phone);

// PIN validation
const isValidPin = (pin) => /^\d{4}$/.test(pin);

// Session timeout (15 minutes of inactivity)
const SESSION_TIMEOUT = 15 * 60 * 1000;

// Role-Based Access Control definitions
const ROLE_PERMISSIONS = {
  admin: {
    pages: ["dashboard", "checkin", "kiosk", "members", "memberships", "attendance", "walkins", "timetable", "trainers", "equipment", "lockers", "payments", "discounts", "reconciliation", "reports", "staff", "audit"],
    actions: ["create_member", "edit_member", "deactivate_member", "assign_plan", "freeze_membership", "record_payment", "manage_discounts", "manage_staff", "manage_equipment", "manage_trainers", "view_reports", "view_payments", "reconcile", "export_data", "view_audit_log"],
  },
  staff: {
    pages: ["dashboard", "checkin", "kiosk", "members", "memberships", "attendance", "walkins", "timetable", "lockers"],
    actions: ["create_member", "edit_member", "assign_plan", "record_payment", "checkin_member"],
  },
};

const canAccessPage = (role, pageId) => ROLE_PERMISSIONS[role]?.pages.includes(pageId) ?? false;
const canPerformAction = (role, action) => ROLE_PERMISSIONS[role]?.actions.includes(action) ?? false;

// Audit log entry creator
const createAuditEntry = (userId, userName, action, details) => ({
  id: generateId(),
  timestamp: new Date().toISOString(),
  userId,
  userName,
  action,
  details,
  ip: "tablet-local",
});

// ─── LOGIN SCREEN ───────────────────────────────────────────
const LoginScreen = ({ staff, onLogin }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(null);

  const handleLogin = async () => {
    if (lockedUntil && Date.now() < lockedUntil) {
      setError(`Account locked. Try again in ${Math.ceil((lockedUntil - Date.now()) / 1000)}s`);
      return;
    }
    if (!username || !password) { setError("Please enter both username and password"); return; }
    setLoading(true);
    setError("");

    // Simulate network delay for brute-force deterrence
    await new Promise((r) => setTimeout(r, 500));

    const hashed = await hashPassword(password);
    const user = staff.find((s) => s.username === username && s.isActive);

    if (!user || user.passwordHash !== hashed) {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      if (newAttempts >= 5) {
        const lockTime = Date.now() + 60000;
        setLockedUntil(lockTime);
        setError("Too many failed attempts. Locked for 60 seconds.");
        setTimeout(() => { setLockedUntil(null); setAttempts(0); }, 60000);
      } else {
        setError(`Invalid credentials (${5 - newAttempts} attempts remaining)`);
      }
      setLoading(false);
      return;
    }

    setLoading(false);
    onLogin(user);
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: "var(--accent-dim)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", border: "2px solid var(--accent)" }}>
            <Zap size={32} style={{ color: "var(--accent)" }} />
          </div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, color: "var(--accent)" }}>Rush Fitness</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>Gym Management System • Secure Login</p>
        </div>

        <div className="card" style={{ padding: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
            <Shield size={18} style={{ color: "var(--accent)" }} />
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>Staff Sign In</h3>
          </div>

          {error && (
            <div style={{ background: "var(--danger-dim)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "var(--radius-xs)", padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "var(--danger)", display: "flex", alignItems: "center", gap: 8 }}>
              <AlertTriangle size={14} /> {error}
            </div>
          )}

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label>Username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} placeholder="Enter username" autoComplete="username" onKeyDown={(e) => e.key === "Enter" && handleLogin()} />
          </div>
          <div className="form-group" style={{ marginBottom: 24 }}>
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password" autoComplete="current-password" onKeyDown={(e) => e.key === "Enter" && handleLogin()} />
          </div>
          <button className="btn btn-primary" style={{ width: "100%", padding: "12px 24px", fontSize: 15, justifyContent: "center" }} onClick={handleLogin} disabled={loading}>
            {loading ? <RefreshCw size={16} style={{ animation: "spin 1s linear infinite" }} /> : <LogIn size={16} />}
            {loading ? "Verifying..." : "Sign In"}
          </button>
        </div>

        <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 11, marginTop: 16 }}>
          Naalya Quality Shopping Mall, Kampala • All sessions are logged
        </p>
      </div>
    </div>
  );
};

// ─── SESSION TIMEOUT BANNER ─────────────────────────────────
const SessionBar = ({ user, lastActivity, onLogout, sessionWarning }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 24px", background: sessionWarning ? "var(--warning-dim)" : "var(--bg-elevated)", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--success)" }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--success)" }} />
        Secure Session
      </div>
      <span style={{ color: "var(--text-muted)" }}>|</span>
      <span style={{ color: "var(--text-dim)" }}>{user.name} ({user.role === "admin" ? "Administrator" : "Front Desk"})</span>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      {sessionWarning && <span style={{ color: "var(--warning)", fontWeight: 600 }}>Session expiring soon — interact to stay logged in</span>}
      <button className="btn btn-sm btn-secondary" onClick={onLogout} style={{ padding: "4px 12px", fontSize: 11 }}>
        <LogIn size={12} /> Sign Out
      </button>
    </div>
  </div>
);

// ─── AUDIT LOG VIEWER ───────────────────────────────────────
const AuditLog = ({ data }) => {
  return (
    <div>
      <div className="page-header">
        <h2>Security Audit Log</h2>
        <p>All system actions are recorded for accountability (FR-68)</p>
      </div>
      <div className="table-wrapper">
        <table>
          <thead><tr><th>Timestamp</th><th>User</th><th>Action</th><th>Details</th></tr></thead>
          <tbody>
            {[...data.auditLog].reverse().map((entry) => (
              <tr key={entry.id}>
                <td style={{ fontFamily: "monospace", fontSize: 11 }}>{formatDate(entry.timestamp)} {formatTime(entry.timestamp)}</td>
                <td style={{ color: "var(--text)", fontWeight: 500 }}>{entry.userName}</td>
                <td><Badge variant={entry.action.includes("login") ? "info" : entry.action.includes("fail") ? "danger" : entry.action.includes("logout") ? "neutral" : "success"}>{entry.action}</Badge></td>
                <td style={{ fontSize: 12, color: "var(--text-dim)", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.details}</td>
              </tr>
            ))}
            {data.auditLog.length === 0 && <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--text-muted)", padding: 32 }}>No audit entries yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── MAIN APP ───────────────────────────────────────────────
const NAV = [
  { section: "Core", items: [
    { id: "dashboard", label: "Dashboard", icon: BarChart3 },
    { id: "checkin", label: "Check-In", icon: LogIn },
    { id: "kiosk", label: "Self Check-In", icon: Zap },
  ]},
  { section: "Members", items: [
    { id: "members", label: "Members", icon: Users },
    { id: "memberships", label: "Memberships", icon: CreditCard },
    { id: "attendance", label: "Attendance", icon: ClipboardList },
    { id: "walkins", label: "Walk-Ins", icon: UserCheck },
  ]},
  { section: "Operations", items: [
    { id: "timetable", label: "Timetable", icon: Calendar },
    { id: "trainers", label: "Trainers", icon: Activity },
    { id: "equipment", label: "Equipment", icon: Wrench },
    { id: "lockers", label: "Lockers", icon: Hash },
  ]},
  { section: "Finance", items: [
    { id: "payments", label: "Payments", icon: DollarSign },
    { id: "discounts", label: "Discounts", icon: Tag },
    { id: "reconciliation", label: "Reconciliation", icon: Receipt },
    { id: "reports", label: "Reports", icon: TrendingUp },
  ]},
  { section: "Admin", items: [
    { id: "staff", label: "Staff", icon: Shield },
    { id: "audit", label: "Audit Log", icon: ClipboardList },
  ]},
];

export default function App() {
  const [data, setData] = useState(() => {
    const d = initData();
    // Hash the default passwords on first load
    d.auditLog = [];
    return d;
  });
  const [page, setPage] = useState("dashboard");
  const [kioskMode, setKioskMode] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [lastActivity, setLastActivity] = useState(Date.now());
  const [sessionWarning, setSessionWarning] = useState(false);
  const [passwordsHashed, setPasswordsHashed] = useState(false);

  // Hash default passwords on mount
  useEffect(() => {
    if (passwordsHashed) return;
    (async () => {
      const hashedStaff = await Promise.all(
        data.staff.map(async (s) => {
          if (s.passwordHash.length < 60) {
            return { ...s, passwordHash: await hashPassword(s.passwordHash) };
          }
          return s;
        })
      );
      setData((d) => ({ ...d, staff: hashedStaff }));
      setPasswordsHashed(true);
    })();
  }, [passwordsHashed]);

  // Session timeout checker
  useEffect(() => {
    if (!currentUser) return;
    const interval = setInterval(() => {
      const elapsed = Date.now() - lastActivity;
      if (elapsed > SESSION_TIMEOUT) {
        handleLogout("timeout");
      } else if (elapsed > SESSION_TIMEOUT - 2 * 60 * 1000) {
        setSessionWarning(true);
      } else {
        setSessionWarning(false);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [currentUser, lastActivity]);

  // Track user activity for session timeout
  useEffect(() => {
    if (!currentUser) return;
    const resetTimer = () => { setLastActivity(Date.now()); setSessionWarning(false); };
    window.addEventListener("click", resetTimer);
    window.addEventListener("keydown", resetTimer);
    window.addEventListener("touchstart", resetTimer);
    return () => {
      window.removeEventListener("click", resetTimer);
      window.removeEventListener("keydown", resetTimer);
      window.removeEventListener("touchstart", resetTimer);
    };
  }, [currentUser]);

  const addAuditEntry = (action, details) => {
    if (!currentUser) return;
    setData((d) => ({ ...d, auditLog: [...d.auditLog, createAuditEntry(currentUser.id, currentUser.name, action, details)] }));
  };

  const handleLogin = (user) => {
    setCurrentUser(user);
    setLastActivity(Date.now());
    setPage("dashboard");
    setData((d) => ({ ...d, auditLog: [...d.auditLog, createAuditEntry(user.id, user.name, "login", `Logged in as ${user.role}`)] }));
  };

  const handleLogout = (reason = "manual") => {
    const logoutEntry = currentUser ? createAuditEntry(currentUser.id, currentUser.name, reason === "timeout" ? "session_timeout" : "logout", reason === "timeout" ? "Session expired due to inactivity" : "Manual logout") : null;
    if (logoutEntry) {
      setData((d) => ({ ...d, auditLog: [...d.auditLog, logoutEntry] }));
    }
    setCurrentUser(null);
    setPage("dashboard");
    setSessionWarning(false);
  };

  // Secured setData wrapper that sanitises inputs
  const securedSetData = useCallback((updater) => {
    setData((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      return next;
    });
  }, []);

  // ── Render ──

  if (!passwordsHashed) {
    return <><style>{CSS}</style><div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}><p style={{ color: "var(--text-dim)" }}>Initialising security...</p></div></>;
  }

  if (!currentUser) {
    return <><style>{CSS}</style><LoginScreen staff={data.staff} onLogin={handleLogin} /></>;
  }

  if (kioskMode) {
    return <><style>{CSS}</style><SelfCheckIn data={data} setData={securedSetData} onExit={() => { setKioskMode(false); addAuditEntry("kiosk_exit", "Exited self check-in kiosk mode"); }} /></>;
  }

  // Filter nav based on role
  const filteredNav = NAV.map((section) => ({
    ...section,
    items: section.items.filter((item) => canAccessPage(currentUser.role, item.id)),
  })).filter((section) => section.items.length > 0);

  // Enforce page access
  if (!canAccessPage(currentUser.role, page) && page !== "dashboard") {
    setPage("dashboard");
  }

  const renderPage = () => {
    if (!canAccessPage(currentUser.role, page)) return <Dashboard data={data} />;
    switch (page) {
      case "dashboard": return <Dashboard data={data} />;
      case "checkin": return <CheckIn data={data} setData={securedSetData} />;
      case "members": return <Members data={data} setData={securedSetData} />;
      case "memberships": return <Memberships data={data} setData={securedSetData} />;
      case "payments": return <Payments data={data} />;
      case "walkins": return <WalkIns data={data} setData={securedSetData} />;
      case "attendance": return <Attendance data={data} setData={securedSetData} />;
      case "timetable": return <TimetablePage />;
      case "trainers": return <Trainers data={data} setData={securedSetData} />;
      case "equipment": return <Equipment data={data} setData={securedSetData} />;
      case "discounts": return <Discounts data={data} setData={securedSetData} />;
      case "reconciliation": return <Reconciliation data={data} setData={securedSetData} />;
      case "staff": return <StaffMgmt data={data} setData={securedSetData} currentUser={currentUser} />;
      case "lockers": return <Lockers data={data} setData={securedSetData} />;
      case "reports": return <Reports data={data} />;
      case "audit": return <AuditLog data={data} />;
      default: return <Dashboard data={data} />;
    }
  };

  return (
    <>
      <style>{CSS}{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <SessionBar user={currentUser} lastActivity={lastActivity} onLogout={() => handleLogout("manual")} sessionWarning={sessionWarning} />
        <div className="app-layout" style={{ flex: 1 }}>
          <aside className="sidebar" style={{ top: 37 }}>
            <div className="sidebar-brand">
              <h1>Rush Fitness</h1>
              <p>Gym Management System</p>
            </div>
            <nav className="sidebar-nav">
              {filteredNav.map((section) => (
                <div key={section.section} className="nav-section">
                  <div className="nav-section-label">{section.section}</div>
                  {section.items.map((item) => (
                    <div key={item.id} className={`nav-item ${page === item.id ? "active" : ""}`} onClick={() => {
                      if (item.id === "kiosk") { setKioskMode(true); addAuditEntry("kiosk_enter", "Entered self check-in kiosk mode"); }
                      else setPage(item.id);
                    }}>
                      <item.icon />
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
              ))}
            </nav>
            <div className="sidebar-footer">
              <div className="user-info">
                <div className="user-avatar">{currentUser.name.charAt(0)}</div>
                <div>
                  <div style={{ color: "var(--text)", fontWeight: 500, fontSize: 13 }}>{currentUser.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{currentUser.role === "admin" ? "Administrator" : "Front Desk Staff"}</div>
                </div>
              </div>
            </div>
          </aside>
          <main className="main-content" style={{ marginTop: 0 }}>
            {renderPage()}
          </main>
        </div>
      </div>
    </>
  );
}
