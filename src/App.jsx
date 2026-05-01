import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Search, UserPlus, LogIn, Users, CreditCard, BarChart3, Dumbbell, Calendar, Settings, ChevronRight, Check, X, AlertTriangle, Clock, Activity, Shield, UserCheck, DollarSign, Layers, Tag, ClipboardList, Wrench, ChevronDown, ChevronUp, Plus, Edit2, Trash2, Eye, EyeOff, Pause, Play, Hash, Receipt, TrendingUp, ArrowLeft, Camera, RefreshCw, Star, Zap, Award, Upload } from "lucide-react";
import {
  authApi, membersApi, plansApi, membershipsApi, paymentsApi, trainersApi,
  lockersApi, productsApi, equipmentApi, walkInsApi, attendanceApi,
  discountsApi, expensesApi, usersApi, activitiesApi, auth as authStore,
} from "./api/client";

// Map backend user shape ({fullName}) to the shape the rest of App.jsx expects ({name})
const adaptUser = (u) => u ? { ...u, name: u.fullName || u.username } : null;

// ─── Reusable PasswordInput with show/hide toggle ──────────────
function PasswordInput({ value, onChange, placeholder, autoComplete, onKeyDown, ...rest }) {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete || "current-password"}
        onKeyDown={onKeyDown}
        style={{ paddingRight: 38, width: "100%" }}
        {...rest}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        title={visible ? "Hide password" : "Show password"}
        aria-label={visible ? "Hide password" : "Show password"}
        style={{
          position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
          background: "transparent", border: "none", cursor: "pointer",
          padding: 6, color: visible ? "var(--accent)" : "var(--text-muted)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

// ── Backend ↔ frontend adapters for memberships & payments ──
// Frontend uses string `plan` codes (e.g. "gym_monthly"), API uses UUID planId.
// Frontend uses `isActive` boolean, API uses `status` enum.
const adaptMembership = (ms) => ms ? ({
  ...ms,
  plan: ms.planCode || ms.plan,                         // back-compat with in-memory rows
  isActive: ms.status === "active" || ms.status === "frozen",
}) : null;

const adaptPayment = (p) => p ? ({
  ...p,
  paidAt: p.paidAt || p.createdAt,
  // Map backend "mpesa" → frontend "mobile_money" so existing UI badges keep working.
  method: p.method === "mpesa" ? "mobile_money" : p.method,
  note: p.notes || p.note || "",
}) : null;

// Frontend → API: the form uses "mobile_money", API expects "mpesa".
const paymentMethodToApi = (m) => m === "mobile_money" ? "mpesa" : m;

// ── Locker adapter (backend status enum → frontend isOccupied bool) ──
const adaptLocker = (l) => l ? ({
  ...l,
  number: Number(l.number),
  isOccupied: l.status === "occupied",
}) : null;

// ── Product (Shop) adapter — frontend uses name/price/stock directly ──
const adaptProduct = (p) => p ? ({
  ...p,
  price: Number(p.price),
  stock: Number(p.stock),
}) : null;

// ── Equipment adapter — backend.status is operational/maintenance/retired ──
const adaptEquipment = (e) => e ? ({
  ...e,
  // Map backend "operational" → "good" for backwards-compat with existing UI
  status: e.status === "operational" ? "good" : e.status,
}) : null;
const equipmentStatusToApi = (s) => s === "good" ? "operational" : s;

// ── Walk-in adapter — backend uses fullName, frontend has firstName/lastName/name ──
const adaptWalkIn = (w) => w ? ({
  ...w,
  name: w.fullName || w.name || "",
  visitDate: w.visitDate,
  paymentStatus: w.paymentStatus || "pending",
  checkedIn: !!w.checkedIn,
}) : null;

// ── Attendance adapter — backend uses checkInAt, frontend uses checkIn ──
//   Also resolves guest name for walk-in attendance rows (no member_id).
const adaptAttendance = (a) => a ? ({
  ...a,
  checkIn: a.checkInAt || a.checkIn,
  checkOut: a.checkOutAt || a.checkOut,
  date: a.visitDate || a.date,
  // For walk-ins: prefer the joined walk_ins.full_name, fall back to attendance.guest_name.
  guestName: a.walkInName || a.guestName || null,
  source: a.walkInId && !a.source ? "walkin" : (a.source || "staff"),
}) : null;

// ── Discount adapter — backend uses type:percent|flat, frontend used percentage|fixed ──
const adaptDiscount = (d) => d ? ({
  ...d,
  type: d.type === "percent" ? "percentage" : d.type === "flat" ? "fixed" : d.type,
  usesCount: d.usesCount || 0,
  maxUses: d.maxUses || 0,
  name: d.code || d.name,
}) : null;
const discountTypeToApi = (t) => t === "percentage" ? "percent" : t === "fixed" ? "flat" : t;

// ── Expense adapter — backend uses spentOn, frontend uses date ──
const adaptExpense = (e) => e ? ({
  ...e,
  date: e.spentOn || e.date,
  amount: Number(e.amount),
  approvedBy: e.recordedBy ? "Staff" : (e.approvedBy || "Staff"),
  method: e.paidBy || e.method || "cash",
}) : null;

// ── Staff/User adapter ──
const adaptStaff = (u) => u ? ({
  ...u,
  name: u.fullName || u.username,
}) : null;

// ── Activity adapter — backend gives standalonePrice/addonPrice, the rest of
//     App.jsx expects "standalone" and "addon" (matching the seed const).
const adaptActivity = (a) => a ? ({
  ...a,
  standalone: Number(a.standalonePrice ?? a.standalone ?? 0),
  addon: Number(a.addonPrice ?? a.addon ?? 0),
  id: a.code || a.id,           // legacy code uses id="aerobics" etc.
  uuid: a.id,                   // keep DB UUID for updates
}) : null;

// ── Trainer adapters ────────────────────────────────────────
const adaptTrainer = (t) => t ? ({
  ...t,
  emergency: t.emergencyPhone || "",
  emergency2: t.emergencyPhone2 || "",
  photo: t.photoUrl || null,
}) : null;
const trainerFormToApi = (f) => ({
  firstName: f.firstName?.trim(),
  lastName: f.lastName?.trim(),
  phone: f.phone?.trim(),
  email: f.email || undefined,
  gender: f.gender,
  dob: f.dob || undefined,
  nationalId: f.nationalId || undefined,
  emergencyPhone: f.emergency || undefined,
  emergencyPhone2: f.emergency2 || undefined,
  photoUrl: f.photo || undefined,
  specialisation: f.specialisation || undefined,
});

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
  prepaid: { name: "Pre-Paid Balance", price: 0, days: 365, category: "prepaid", dailyRate: 20000, isPrepaid: true },
};

const GROUP_PLANS = {
  group_2: { name: "Group of 2", price: 500000, perPerson: 250000, size: 2, days: 30 },
  group_3: { name: "Group of 3", price: 700000, perPerson: 233333, size: 3, days: 30 },
  group_5: { name: "Group of 5", price: 1150000, perPerson: 230000, size: 5, days: 30 },
};

const getPlanName = (planKey) => PLANS[planKey]?.name || GROUP_PLANS[planKey]?.name || planKey;

const fullName = (m) => m ? `${m.firstName || ""} ${m.lastName || ""}`.trim() || m.name || "" : "";
const memberInitials = (m) => {
  if (!m) return "?";
  const f = m.firstName || "";
  const l = m.lastName || "";
  if (f && l) return (f[0] + l[0]).toUpperCase();
  if (f) return f[0].toUpperCase();
  if (m.name) return m.name.charAt(0).toUpperCase();
  return "?";
};

// Seed data — used as initial state until activities load from /api/activities.
// After login the live list comes from `data.activities` (managed via the
// Activities admin tab).
const ACTIVITIES_SEED = [
  { id: "gym_daily_activity", code: "gym_daily_activity", name: "Daily Gym Access", standalone: 20000, addon: 10000 },
  { id: "aerobics",   code: "aerobics",   name: "Aerobics",        standalone: 20000, addon: 10000 },
  { id: "spinning",   code: "spinning",   name: "Spinning",        standalone: 25000, addon: 10000 },
  { id: "bantu_vibes",code: "bantu_vibes",name: "Bantu Vibes",     standalone: 20000, addon: 10000 },
  { id: "kona",       code: "kona",       name: "Kona Dance",      standalone: 20000, addon: 10000 },
  { id: "fimbo",      code: "fimbo",      name: "Fimbo Dance",     standalone: 20000, addon: 10000 },
  { id: "boxing",     code: "boxing",     name: "Boxing",          standalone: 20000, addon: 10000 },
  { id: "bootcamp",   code: "bootcamp",   name: "Bootcamp",        standalone: 20000, addon: 10000 },
  { id: "abs",        code: "abs",        name: "ABS Class",       standalone: 20000, addon: 10000 },
  { id: "steam",      code: "steam",      name: "Steam Bath",      standalone: 20000, addon: 10000 },
  { id: "massage",    code: "massage",    name: "Massage",         standalone: 20000, addon: 10000 },
  { id: "ballet",     code: "ballet",     name: "Ballet Dance",    standalone:  7000, addon:  7000 },
].sort((a, b) => a.name.localeCompare(b.name));

// Back-compat alias — many sites in the file still reference ACTIVITIES.
// Treat the seed list as a fallback when data.activities isn't loaded yet.
const ACTIVITIES = ACTIVITIES_SEED;

const MAX_ACTIVITIES = 2;

const TIMETABLE = [
  { day: "Mon", class: "Spinning", time: "6:30pm – 7:30pm" },
  { day: "Mon", class: "Bantu Vibes", time: "7:30pm – 8:30pm" },
  { day: "Tue", class: "Aerobics", time: "6:20pm – 7:20pm" },
  { day: "Tue", class: "Kona Dance", time: "7:30pm – 8:30pm" },
  { day: "Wed", class: "Spinning", time: "6:20pm – 7:20pm" },
  { day: "Wed", class: "Fimbo Dance", time: "7:25pm – 8:25pm" },
  { day: "Thu", class: "Kona Dance", time: "7:15pm – 8:15pm" },
  { day: "Fri", class: "Spinning", time: "6:30pm – 7:30pm" },
  { day: "Fri", class: "Aerobics", time: "7:30pm – 8:30pm" },
  { day: "Sat", class: "Kona Dance", time: "9:30am – 11:30am" },
  { day: "Sat", class: "Bantu Vibes", time: "7:00pm – 8:00pm" },
];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const initData = () => {
  const members = [
    { id: "m1", firstName: "Sarah", lastName: "Nakamya", phone: "0771234567", email: "sarah@email.com", gender: "Female", dob: "1995-03-15", emergency: "0701111222", emergency2: "0709999888", photo: null, nationalId: "CM95015003ABCD", pin: "1234", isActive: true, createdAt: "2025-01-10" },
    { id: "m2", firstName: "James", lastName: "Okello", phone: "0782345678", email: "james@email.com", gender: "Male", dob: "1990-07-22", emergency: "0702222333", emergency2: "", photo: null, nationalId: "CM90072200EFGH", pin: "5678", isActive: true, createdAt: "2025-02-05" },
    { id: "m3", firstName: "Grace", lastName: "Auma", phone: "0753456789", email: "", gender: "Female", dob: "1988-11-30", emergency: "0703333444", emergency2: "0708877665", photo: null, nationalId: "CF88113000IJKL", pin: "9012", isActive: true, createdAt: "2025-03-01" },
    { id: "m4", firstName: "Peter", lastName: "Mukasa", phone: "0764567890", email: "peter@mail.com", gender: "Male", dob: "1992-05-18", emergency: "0704444555", emergency2: "", photo: null, nationalId: "CM92051800MNOP", pin: "3456", isActive: true, createdAt: "2025-01-20" },
    { id: "m5", firstName: "Diana", lastName: "Tendo", phone: "0775678901", email: "", gender: "Female", dob: "1997-09-05", emergency: "0705555666", emergency2: "", photo: null, nationalId: "", pin: "7890", isActive: false, createdAt: "2025-02-15" },
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
    { id: "t1", firstName: "Mike", lastName: "Ssemakula", phone: "0781112233", email: "mike@rush.ug", gender: "Male", dob: "1988-04-12", nationalId: "CM88041200QRST", emergency: "0781110000", emergency2: "", specialisation: "Spinning, Boxing", photo: null, isActive: true },
    { id: "t2", firstName: "Aisha", lastName: "Nakato", phone: "0792223344", email: "aisha@rush.ug", gender: "Female", dob: "1992-08-25", nationalId: "CF92082500UVWX", emergency: "0792220000", emergency2: "", specialisation: "Aerobics, Dance", photo: null, isActive: true },
    { id: "t3", firstName: "Brian", lastName: "Kizza", phone: "0703334455", email: "", gender: "Male", dob: "1990-01-15", nationalId: "CM90011500YZAB", emergency: "0703330000", emergency2: "0701234567", specialisation: "Bootcamp, Full Body", photo: null, isActive: true },
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

  const lockers = [
    ...Array.from({ length: 20 }, (_, i) => ({
      id: `lg${i + 1}`, number: i + 1, section: "gents", isOccupied: i === 4 || i === 11, memberId: i === 4 ? "m2" : i === 11 ? "m4" : null,
    })),
    ...Array.from({ length: 20 }, (_, i) => ({
      id: `ll${i + 1}`, number: i + 1, section: "ladies", isOccupied: i === 2 || i === 7, memberId: i === 2 ? "m1" : i === 7 ? "m3" : null,
    })),
  ];

  const discounts = [
    { id: "d1", name: "New Year Promo", type: "percentage", value: 10, startDate: "2025-01-01", endDate: "2025-12-31", maxUses: 100, usesCount: 1, isActive: true },
    { id: "d2", name: "Refer a Friend", type: "fixed", value: 50000, startDate: "2025-01-01", endDate: "2025-06-30", maxUses: 50, usesCount: 0, isActive: true },
  ];

  const walkIns = [
    { id: "w1", name: "John Visitor", phone: "0711223344", activityId: "steam", amountPaid: 20000, visitDate: today() },
  ];

  const reconciliations = [];
  const freezes = [];

  const products = [
    { id: "pr1", name: "Creatine Monohydrate", category: "Supplements", price: 200000, stock: 10, isActive: true },
    { id: "pr2", name: "Thorne Creatine", category: "Supplements", price: 280000, stock: 8, isActive: true },
    { id: "pr3", name: "Fish Oil", category: "Supplements", price: 200000, stock: 12, isActive: true },
    { id: "pr4", name: "Omega-3 Fish Oil", category: "Supplements", price: 200000, stock: 15, isActive: true },
    { id: "pr5", name: "Whey Protein", category: "Supplements", price: 300000, stock: 6, isActive: true },
    { id: "pr6", name: "Resveratol Ultra Complex", category: "Supplements", price: 150000, stock: 10, isActive: true },
    { id: "pr7", name: "Magnesium Glycinate Gummies", category: "Supplements", price: 100000, stock: 20, isActive: true },
    { id: "pr8", name: "No Explode", category: "Supplements", price: 250000, stock: 5, isActive: true },
    { id: "pr9", name: "Collagen Bio-Peptides", category: "Supplements", price: 150000, stock: 8, isActive: true },
    { id: "pr10", name: "Multi Collagen", category: "Supplements", price: 200000, stock: 7, isActive: true },
    { id: "pr11", name: "Nicotinamide", category: "Supplements", price: 100000, stock: 14, isActive: true },
    { id: "pr12", name: "Move Free", category: "Supplements", price: 200000, stock: 9, isActive: true },
    { id: "pr13", name: "Lit", category: "Supplements", price: 200000, stock: 6, isActive: true },
    { id: "pr14", name: "Hyde", category: "Supplements", price: 200000, stock: 5, isActive: true },
    { id: "pr15", name: "Ginkgo Biloba", category: "Supplements", price: 200000, stock: 11, isActive: true },
    { id: "pr16", name: "C4", category: "Supplements", price: 200000, stock: 8, isActive: true },
    { id: "pr17", name: "Apple Cider Vinegar", category: "Supplements", price: 200000, stock: 10, isActive: true },
    { id: "pr18", name: "Turmeric Curcumin", category: "Supplements", price: 100000, stock: 12, isActive: true },
    { id: "pr19", name: "Deodorant (Small)", category: "Accessories", price: 35000, stock: 25, isActive: true },
    { id: "pr20", name: "Deodorant (Big)", category: "Accessories", price: 50000, stock: 20, isActive: true },
    { id: "pr21", name: "Gloves", category: "Accessories", price: 90000, stock: 15, isActive: true },
    { id: "pr22", name: "Redbull", category: "Drinks", price: 8000, stock: 50, isActive: true },
  ];

  const productSales = [];

  const expenses = [
    { id: "ex1", category: "Utilities", description: "Electricity bill - March", amount: 450000, date: "2025-03-28", method: "mobile_money", approvedBy: "Admin User", receipt: "", createdAt: "2025-03-28" },
    { id: "ex2", category: "Maintenance", description: "Treadmill belt replacement", amount: 350000, date: "2025-03-15", method: "cash", approvedBy: "Admin User", receipt: "", createdAt: "2025-03-15" },
    { id: "ex3", category: "Supplies", description: "Cleaning supplies and detergents", amount: 120000, date: "2025-04-01", method: "cash", approvedBy: "Admin User", receipt: "", createdAt: "2025-04-01" },
  ];

  return { members, memberships, payments, attendance, trainers, staff, equipment, lockers, discounts, walkIns, reconciliations, freezes, products, productSales, expenses, activities: ACTIVITIES, timetable: TIMETABLE.map((t, i) => ({ ...t, id: `tt${i + 1}` })) };
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
  const todayRevenue = data.payments.filter((p) => p.paidAt.startsWith(today()) && p.type !== "prepaid_visit").reduce((s, p) => s + p.amount, 0);
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
        <StatCard icon={Layers} label="Lockers Available" value={`${availableLockers}/40`} color="var(--info)" bg="var(--info-dim)" />
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
                  <span style={{ color: "var(--text)" }}>{fullName(member)}</span>
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
const CheckIn = ({ data, setData, currentUser }) => {
  // Use live activities list from backend; fall back to seed before login.
  const ACTIVITIES = (data?.activities && data.activities.length) ? data.activities : ACTIVITIES_SEED;
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [checkedIn, setCheckedIn] = useState(false);
  const [addons, setAddons] = useState([]);
  const [selectedLocker, setSelectedLocker] = useState(null);
  const [mode, setMode] = useState("member"); // member | walkin | history
  const isAdmin = currentUser?.role === "admin";

  // Walk-in quick form
  const [walkinForm, setWalkinForm] = useState({ firstName: "", lastName: "", phone: "", emergency: "", selectedActivities: [], paymentMethod: "cash", paymentStatus: "paid", gender: "Male", locker: null });
  const [editWalkin, setEditWalkin] = useState(null);

  const results = search.length >= 2 ? data.members.filter((m) => {
    const q = search.toLowerCase();
    return (m.firstName || "").toLowerCase().includes(q) ||
      (m.lastName || "").toLowerCase().includes(q) ||
      fullName(m).toLowerCase().includes(q) ||
      m.phone.includes(search) ||
      (m.nationalId || "").toLowerCase().includes(q);
  }) : [];

  const membership = selected ? data.memberships.find((ms) => ms.memberId === selected.id && (ms.isActive || ms.status === "pending_payment")) : null;
  const isExpired = membership ? (new Date(membership.endDate) < new Date() && membership.status !== "pending_payment") : true;
  const isFrozen = membership?.status === "frozen";
  const isPendingPayment = membership?.status === "pending_payment";
  const alreadyCheckedIn = selected ? data.attendance.some((a) => a.memberId === selected.id && a.date === today()) : false;
  const isDailyPlan = membership?.plan === "gym_daily" || membership?.plan === "combo_session";
  const isPrepaid = membership?.plan === "prepaid";
  const prepaidBalance = membership?.prepaidBalance || 0;

  // ── Pricing helpers (Option C — prepaid uses actual activity prices) ──
  // Base gym access fee (used when no add-ons are selected)
  const PREPAID_BASE_FEE = ACTIVITIES.find((a) => a.id === "gym_daily_activity")?.standalone || PLANS.prepaid.dailyRate;
  // Sum of standalone prices for currently selected add-ons.
  const addonsStandaloneTotal = (selectedIds = addons) =>
    selectedIds.reduce((sum, actId) => sum + (ACTIVITIES.find((a) => a.id === actId)?.standalone || 0), 0);
  const PREPAID_BUNDLE_DISCOUNT = 10000;  // 2-activity bundle discount
  // Today's prepaid cost for this check-in given current addon selection.
  const prepaidVisitCost = (() => {
    if (!isPrepaid) return 0;
    if (!addons.length) return PREPAID_BASE_FEE;                         // basic gym access
    const total = addonsStandaloneTotal();
    return addons.length > 1 ? total - PREPAID_BUNDLE_DISCOUNT : total;  // bundle discount on >=2
  })();
  const insufficientPrepaid = isPrepaid && prepaidBalance < prepaidVisitCost;

  const memberBalance = membership ? getMembershipBalance(membership, data.payments) : null;

  const memberGender = selected?.gender;
  const lockerSection = memberGender === "Female" ? "ladies" : "gents";
  const availableLockers = data.lockers.filter((l) => l.section === lockerSection && !l.isOccupied);

  // Today's walk-ins not yet checked in
  const todayUncheckedWalkIns = data.walkIns.filter((w) => w.visitDate === today() && !w.checkedIn && (w.paymentStatus === "paid" || !w.paymentStatus));

  const handleCheckIn = async () => {
    if (isExpired || isFrozen || alreadyCheckedIn || isPendingPayment || insufficientPrepaid) return;

    // Call backend first — it atomically creates the attendance row and occupies the locker.
    // If multiple activities were selected, record the first one's UUID
    // (the backend's attendance.activity_id is a single FK).
    let activityUuid;
    if (addons.length > 0) {
      const firstAct = ACTIVITIES.find((a) => a.id === addons[0]);
      activityUuid = firstAct?.uuid || undefined;   // adaptActivity stores DB UUID under .uuid
    }
    try {
      await attendanceApi.checkIn({
        memberId: selected.id,
        lockerId: selectedLocker ? selectedLocker.id : undefined,
        activityId: activityUuid,
        source: "staff",
      });
      // Refresh attendance + lockers from backend so all browsers see the change.
      const [attRes, lockRes] = await Promise.all([
        attendanceApi.list({ limit: 500 }),
        lockersApi.list({ limit: 200 }),
      ]);
      setData((d) => ({
        ...d,
        attendance: (attRes?.data || []).map(adaptAttendance),
        lockers: (lockRes?.data || []).map(adaptLocker),
      }));
    } catch (err) {
      alert(err?.message || "Check-in failed");
      return;
    }

    const newAttendance = {
      id: generateId(), memberId: selected.id,
      checkIn: new Date().toISOString(), checkOut: null,
      date: today(), source: "staff",
      locker: selectedLocker ? selectedLocker.number : null,
      lockerSection: selectedLocker ? selectedLocker.section : null,
      lockerId: selectedLocker ? selectedLocker.id : null,
    };

    // ── PREPAID: deduct the ACTUAL cost of this visit (gym base + selected addons,
    //    minus 10k bundle discount if 2+ activities). One single deduction record.
    let prepaidDeduction = null;
    if (isPrepaid) {
      const deductAmount = prepaidVisitCost;
      const breakdown = !addons.length
        ? "gym access"
        : addons.map((a) => ACTIVITIES.find((x) => x.id === a)?.name).join(" + ") +
          (addons.length > 1 ? ` (-${formatUGX(PREPAID_BUNDLE_DISCOUNT)} bundle)` : "");
      prepaidDeduction = {
        id: generateId(), memberId: selected.id, membershipId: membership.id,
        amount: deductAmount, method: "prepaid", paidAt: new Date().toISOString(),
        type: "prepaid_visit", discountId: null,
        discountAmount: addons.length > 1 ? PREPAID_BUNDLE_DISCOUNT : 0,
        note: `Pre-paid visit: ${breakdown} = ${formatUGX(deductAmount)} (balance before: ${formatUGX(prepaidBalance)})`,
      };
    }

    // ── NON-PREPAID: charge add-ons separately (cash payment).
    //    Daily plans pay standalone prices, monthly memberships pay addon prices.
    let newPayments = [];
    if (!isPrepaid) {
      const bundleDiscount = addons.length > 1 ? PREPAID_BUNDLE_DISCOUNT : 0;
      const activityPrices = addons.map((actId) => {
        const act = ACTIVITIES.find((a) => a.id === actId);
        return isDailyPlan ? act.standalone : act.addon;
      });
      const totalBeforeDiscount = activityPrices.reduce((s, p) => s + p, 0);
      const totalAfterDiscount = totalBeforeDiscount - bundleDiscount;
      newPayments = bundleDiscount > 0
        ? [{ id: generateId(), memberId: selected.id, membershipId: null, amount: totalAfterDiscount, method: "cash", paidAt: new Date().toISOString(), type: "addon", activityId: addons.join("+"), discountId: null, discountAmount: bundleDiscount, note: `Bundle: ${addons.map((a) => ACTIVITIES.find((x) => x.id === a)?.name).join(" + ")} (${formatUGX(bundleDiscount)} discount)` }]
        : addons.map((actId) => {
            const act = ACTIVITIES.find((a) => a.id === actId);
            const price = isDailyPlan ? act.standalone : act.addon;
            return { id: generateId(), memberId: selected.id, membershipId: null, amount: price, method: "cash", paidAt: new Date().toISOString(), type: "addon", activityId: actId, discountId: null, discountAmount: 0 };
          });
    }

    // Backend already created the attendance row & occupied the locker (above).
    // Locally append non-persisted bits: prepaid balance change, addon payments.
    setData((d) => ({
      ...d,
      payments: [...d.payments, ...newPayments, ...(prepaidDeduction ? [prepaidDeduction] : [])],
      memberships: isPrepaid
        ? d.memberships.map((ms) => ms.id === membership.id ? { ...ms, prepaidBalance: prepaidBalance - prepaidVisitCost } : ms)
        : d.memberships,
    }));
    setCheckedIn(true);

    // Persist non-prepaid add-on payments to backend so they sync.
    if (!isPrepaid && newPayments.length) {
      Promise.all(newPayments.map((p) =>
        paymentsApi.create({
          memberId: p.memberId,
          amount: p.amount,
          method: paymentMethodToApi(p.method),
          type: "addon",
          discountAmount: p.discountAmount || undefined,
          notes: p.note,
        }).catch((e) => console.warn("Add-on payment persist failed:", e))
      ));
    }
  };

  const reset = () => { setSelected(null); setCheckedIn(false); setSearch(""); setAddons([]); setSelectedLocker(null); setMode("member"); setWalkinForm({ firstName: "", lastName: "", phone: "", emergency: "", selectedActivities: [], paymentMethod: "cash", paymentStatus: "paid", gender: "Male", locker: null }); };

  // Quick walk-in check-in from the walk-ins panel
  const checkInWalkInGuest = async (w) => {
    try {
      await walkInsApi.checkIn(w.id);
      const wiRes = await walkInsApi.list({ limit: 500 });
      setData((d) => ({ ...d, walkIns: (wiRes?.data || []).map(adaptWalkIn) }));
    } catch (err) {
      alert(err?.message || "Failed to check in walk-in");
    }
  };

  // Walk-in quick register + pay + check-in (all in one)
  const walkinToggleActivity = (actId) => {
    setWalkinForm((f) => {
      const current = f.selectedActivities;
      if (current.includes(actId)) return { ...f, selectedActivities: current.filter((x) => x !== actId) };
      if (current.length >= MAX_ACTIVITIES) return f;
      return { ...f, selectedActivities: [...current, actId] };
    });
  };

  const handleQuickWalkIn = async () => {
    if (!walkinForm.firstName || !walkinForm.lastName || !walkinForm.phone) { alert("Please fill in surname, other name(s), and phone."); return; }
    if (!walkinForm.emergency) { alert("Emergency contact is required."); return; }
    if (walkinForm.selectedActivities.length === 0) { alert("Select at least one activity."); return; }

    const prices = walkinForm.selectedActivities.map((id) => ACTIVITIES.find((a) => a.id === id)?.standalone || 0);
    const total = prices.reduce((s, p) => s + p, 0) - (walkinForm.selectedActivities.length > 1 ? 10000 : 0);
    const actNames = walkinForm.selectedActivities.map((id) => ACTIVITIES.find((a) => a.id === id)?.name).join(" + ");
    const isPaid = walkinForm.paymentStatus === "paid";
    const isCheckedIn = isPaid; // Check-in only if paid
    const lockerToAssign = (isCheckedIn && walkinForm.locker) ? walkinForm.locker : null;

    // Persist the walk-in to the backend.
    let savedWalkIn;
    try {
      savedWalkIn = await walkInsApi.create({
        fullName: `${walkinForm.firstName} ${walkinForm.lastName}`.trim(),
        phone: walkinForm.phone,
        visitDate: today(),
        amount: total,
        paymentStatus: walkinForm.paymentStatus,
        checkedIn: isCheckedIn,
        notes: walkinForm.selectedActivities.length > 1
          ? `Bundle: ${actNames} (UGX 10,000 discount)`
          : actNames,
      });
    } catch (err) {
      alert("Failed to save walk-in: " + (err?.message || "unknown error"));
      return;
    }

    // Persist the payment if paid.
    if (isPaid) {
      try {
        await paymentsApi.create({
          amount: total,
          method: paymentMethodToApi(walkinForm.paymentMethod),
          type: "walk_in",
          notes: `Walk-in: ${walkinForm.firstName} ${walkinForm.lastName} — ${actNames}`,
        });
      } catch (err) {
        console.warn("Walk-in saved but payment record failed:", err);
      }
    }

    // Refresh the lists from the backend so other browsers see it too.
    try {
      const [wiRes, payRes, attRes, lockRes] = await Promise.all([
        walkInsApi.list({ limit: 500 }),
        paymentsApi.list({ limit: 500 }),
        attendanceApi.list({ limit: 500 }),
        lockersApi.list({ limit: 200 }),
      ]);
      setData((d) => ({
        ...d,
        walkIns: (wiRes?.data || []).map(adaptWalkIn),
        payments: (payRes?.data || []).map(adaptPayment),
        attendance: (attRes?.data || []).map(adaptAttendance),
        lockers: (lockRes?.data || []).map(adaptLocker),
      }));
    } catch (err) {
      console.warn("Refresh after walk-in failed:", err);
    }

    // Local UI state (success screen)
    setCheckedIn(true);
    setSelected({
      id: savedWalkIn?.id,
      firstName: walkinForm.firstName, lastName: walkinForm.lastName,
      phone: walkinForm.phone, gender: walkinForm.gender,
      _isWalkIn: true, _paymentStatus: walkinForm.paymentStatus,
    });
    setSelectedLocker(lockerToAssign);
  };

  return (
    <div>
      <div className="page-header">
        <h2>Check-In</h2>
        <p>Check in members and walk-in guests</p>
      </div>

      {/* Mode tabs */}
      {!selected && !checkedIn && (
        <div className="tabs" style={{ marginBottom: 20 }}>
          <button className={`tab ${mode === "member" ? "active" : ""}`} onClick={() => setMode("member")}>Member Check-In</button>
          <button className={`tab ${mode === "walkin" ? "active" : ""}`} onClick={() => setMode("walkin")}>Walk-In Guest</button>
          <button className={`tab ${mode === "history" ? "active" : ""}`} onClick={() => setMode("history")}>Walk-In Records ({data.walkIns.length})</button>
        </div>
      )}

      {/* TODAY'S UNCHECKED WALK-INS */}
      {!selected && !checkedIn && mode === "member" && todayUncheckedWalkIns.length > 0 && (
        <div className="card" style={{ marginBottom: 20, borderLeft: "3px solid var(--warning)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h4 style={{ fontSize: 13, color: "var(--warning)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Walk-In Guests Awaiting Check-In ({todayUncheckedWalkIns.length})</h4>
          </div>
          {todayUncheckedWalkIns.map((w) => (
            <div key={w.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
              <div>
                <span style={{ color: "var(--text)", fontWeight: 500 }}>{w.firstName} {w.lastName}</span>
                <span style={{ color: "var(--text-muted)", marginLeft: 8, fontSize: 12 }}>{w.phone}</span>
                <span style={{ color: "var(--text-muted)", marginLeft: 8, fontSize: 11 }}>
                  {w.activities?.map((id) => ACTIVITIES.find((a) => a.id === id)?.name).join(", ")}
                </span>
              </div>
              <button className="btn btn-sm btn-success" onClick={() => checkInWalkInGuest(w)}>
                <LogIn size={12} /> Check In
              </button>
            </div>
          ))}
        </div>
      )}

      {/* MEMBER SEARCH */}
      {!selected && mode === "member" && (
        <>
          <div className="search-bar" style={{ maxWidth: 500, marginBottom: 20 }}>
            <Search />
            <input placeholder="Search by name, phone, or NIN..." value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
          </div>
          {results.length > 0 && (
            <div className="table-wrapper">
              <table>
                <thead><tr><th></th><th>Name</th><th>Phone</th><th>Member</th><th>Membership</th><th></th></tr></thead>
                <tbody>
                  {results.map((m) => {
                    const ms = data.memberships.find((ms) => ms.memberId === m.id && (ms.isActive || ms.status === "pending_payment"));
                    const exp = ms ? (new Date(ms.endDate) < new Date() && ms.status !== "pending_payment") : true;
                    const isPending = ms?.status === "pending_payment";
                    return (
                      <tr key={m.id} style={!m.isActive ? { opacity: 0.5 } : {}}>
                        <td>
                          <div style={{ width: 32, height: 32, borderRadius: "50%", overflow: "hidden", background: "var(--accent-dim)", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid var(--accent)", flexShrink: 0 }}>
                            {m.photo ? <img src={m.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>{memberInitials(m)}</span>}
                          </div>
                        </td>
                        <td style={{ color: "var(--text)", fontWeight: 500 }}>{fullName(m)}</td>
                        <td>{m.phone}</td>
                        <td>{m.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="danger">Inactive</Badge>}</td>
                        <td>{ms ? (isPending ? <Badge variant="warning">Pending Payment</Badge> : exp ? <Badge variant="danger">Expired</Badge> : ms.status === "frozen" ? <Badge variant="warning">Frozen</Badge> : <Badge variant="success">{getPlanName(ms.plan)}</Badge>) : <Badge variant="neutral">No Plan</Badge>}</td>
                        <td><button className="btn btn-sm btn-primary" onClick={() => setSelected(m)}>Select</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {search.length >= 2 && results.length === 0 && (
            <div style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>
              <p>No members found matching "{search}"</p>
              <button className="btn btn-sm btn-secondary" style={{ marginTop: 8 }} onClick={() => setMode("walkin")}>Register as Walk-In Guest instead</button>
            </div>
          )}
        </>
      )}

      {/* WALK-IN QUICK FORM */}
      {!selected && !checkedIn && mode === "walkin" && (
        <div className="card" style={{ maxWidth: 700 }}>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, marginBottom: 16 }}>Quick Walk-In — Register, Pay & Check In</h3>
          <div className="form-grid">
            <div className="form-group"><label>Surname *</label><input value={walkinForm.lastName} onChange={(e) => setWalkinForm({ ...walkinForm, lastName: e.target.value })} placeholder="e.g. Kamya" /></div>
            <div className="form-group"><label>Other Name(s) *</label><input value={walkinForm.firstName} onChange={(e) => setWalkinForm({ ...walkinForm, firstName: e.target.value })} placeholder="e.g. John" /></div>
            <div className="form-group"><label>Phone *</label><input value={walkinForm.phone} onChange={(e) => setWalkinForm({ ...walkinForm, phone: e.target.value })} placeholder="e.g. 0771234567" /></div>
            <div className="form-group"><label>Gender *</label>
              <select value={walkinForm.gender} onChange={(e) => setWalkinForm({ ...walkinForm, gender: e.target.value, locker: null })}>
                <option>Male</option><option>Female</option>
              </select>
            </div>
            <div className="form-group"><label>Emergency Contact *</label><input value={walkinForm.emergency} onChange={(e) => setWalkinForm({ ...walkinForm, emergency: e.target.value })} placeholder="e.g. 0701111222" /></div>
            <div className="form-group"><label>Payment Method *</label>
              <select value={walkinForm.paymentMethod} onChange={(e) => setWalkinForm({ ...walkinForm, paymentMethod: e.target.value })}>
                <option value="cash">Cash</option><option value="mobile_money">Mobile Money</option><option value="card">Card</option>
              </select>
            </div>
            <div className="form-group full"><label>Payment Status *</label>
              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" className={`btn ${walkinForm.paymentStatus === "paid" ? "btn-success" : "btn-secondary"}`} style={{ flex: 1, padding: "10px 14px", fontWeight: 600, justifyContent: "center" }}
                  onClick={() => setWalkinForm({ ...walkinForm, paymentStatus: "paid" })}>
                  <Check size={14} /> Paid Now
                </button>
                <button type="button" className={`btn ${walkinForm.paymentStatus === "pending" ? "btn-primary" : "btn-secondary"}`} style={{ flex: 1, padding: "10px 14px", fontWeight: 600, justifyContent: "center", ...(walkinForm.paymentStatus === "pending" ? { background: "var(--warning)", borderColor: "var(--warning)", color: "#000" } : {}) }}
                  onClick={() => setWalkinForm({ ...walkinForm, paymentStatus: "pending", locker: null })}>
                  <AlertTriangle size={14} /> Pending (Pay Later)
                </button>
              </div>
              {walkinForm.paymentStatus === "pending" && <p style={{ fontSize: 11, color: "var(--warning)", marginTop: 6 }}>⚠ Guest will NOT be checked in until payment is completed.</p>}
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Activities * <span style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "none" }}>— select 1 or 2</span></label>
              <span style={{ fontSize: 11, color: walkinForm.selectedActivities.length >= MAX_ACTIVITIES ? "var(--warning)" : "var(--text-muted)" }}>
                {walkinForm.selectedActivities.length}/{MAX_ACTIVITIES}
              </span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {ACTIVITIES.map((act) => {
                const isSel = walkinForm.selectedActivities.includes(act.id);
                const isDis = !isSel && walkinForm.selectedActivities.length >= MAX_ACTIVITIES;
                return (
                  <button key={act.id} type="button" className={`btn btn-sm ${isSel ? "btn-primary" : "btn-secondary"}`}
                    style={isDis ? { opacity: 0.4, cursor: "not-allowed" } : {}}
                    onClick={() => { if (!isDis) walkinToggleActivity(act.id); }}>
                    {act.name} ({formatUGX(act.standalone)})
                  </button>
                );
              })}
            </div>
            {walkinForm.selectedActivities.length > 0 && (
              <div style={{ marginTop: 12, padding: 12, background: "var(--bg-elevated)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                {walkinForm.selectedActivities.map((actId) => {
                  const act = ACTIVITIES.find((a) => a.id === actId);
                  return (<div key={actId} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", color: "var(--text-dim)" }}><span>{act.name}</span><span>{formatUGX(act.standalone)}</span></div>);
                })}
                {walkinForm.selectedActivities.length > 1 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", color: "var(--success)", borderTop: "1px dashed var(--border)", marginTop: 4, paddingTop: 6 }}><span>Bundle Discount</span><span>-{formatUGX(10000)}</span></div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700, color: "var(--accent)", borderTop: "1px solid var(--border)", marginTop: 6, paddingTop: 6 }}><span>Total</span><span>{formatUGX(walkinForm.selectedActivities.reduce((s, id) => s + (ACTIVITIES.find((a) => a.id === id)?.standalone || 0), 0) - (walkinForm.selectedActivities.length > 1 ? 10000 : 0))}</span></div>
              </div>
            )}
          </div>

          {/* LOCKER ASSIGNMENT (only if paid) */}
          {walkinForm.paymentStatus === "paid" && (() => {
            const section = walkinForm.gender === "Female" ? "ladies" : "gents";
            const sectionColor = section === "ladies" ? "#ec4899" : "#3b82f6";
            const availLockers = data.lockers.filter((l) => l.section === section && !l.isOccupied);
            return (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Locker Key <span style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "none" }}>— optional</span>
                  </label>
                  <span style={{ fontSize: 11, color: sectionColor }}>
                    {section === "ladies" ? "Ladies ♀" : "Gents ♂"} • {availLockers.length} available
                  </span>
                </div>
                {walkinForm.locker ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "var(--success-dim)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "var(--radius-sm)" }}>
                    <div style={{ width: 36, height: 36, borderRadius: "var(--radius-xs)", background: section === "ladies" ? "rgba(236,72,153,0.15)" : "rgba(59,130,246,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, color: sectionColor }}>
                      #{walkinForm.locker.number}
                    </div>
                    <span style={{ flex: 1, fontSize: 13, color: "var(--success)" }}>Locker #{walkinForm.locker.number} ({section === "ladies" ? "Ladies" : "Gents"}) will be assigned</span>
                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => setWalkinForm({ ...walkinForm, locker: null })} style={{ padding: "4px 10px", fontSize: 11 }}>Remove</button>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {availLockers.slice(0, 10).map((l) => (
                      <button key={l.id} type="button" className="btn btn-sm btn-secondary" onClick={() => setWalkinForm({ ...walkinForm, locker: l })} style={{ padding: "6px 10px", minWidth: 44, fontSize: 13, fontWeight: 700, color: sectionColor }}>
                        #{l.number}
                      </button>
                    ))}
                    {availLockers.length > 10 && <span style={{ fontSize: 11, color: "var(--text-muted)", alignSelf: "center" }}>+{availLockers.length - 10} more</span>}
                    {availLockers.length === 0 && <p style={{ fontSize: 12, color: "var(--danger)" }}>No {section} lockers available</p>}
                  </div>
                )}
              </div>
            );
          })()}

          <button className="btn btn-success" style={{ marginTop: 20, width: "100%", padding: "14px 24px", fontSize: 15, fontWeight: 700, justifyContent: "center", ...(walkinForm.paymentStatus === "pending" ? { background: "var(--warning)", borderColor: "var(--warning)", color: "#000" } : {}) }} onClick={handleQuickWalkIn} disabled={walkinForm.selectedActivities.length === 0}>
            <Check size={18} />
            {walkinForm.paymentStatus === "paid"
              ? ` Pay & Check In Guest${walkinForm.locker ? ` + Locker #${walkinForm.locker.number}` : ""}`
              : " Register (Payment Pending)"}
          </button>
        </div>
      )}

      {/* MEMBER CHECK-IN CARD */}

      {selected && !checkedIn && (
        <div className="checkin-card">
          <button className="btn btn-sm btn-secondary" onClick={reset} style={{ position: "absolute", left: 20 }}><ArrowLeft size={14} /> Back</button>
          <div className="member-photo" style={{ overflow: "hidden" }}>{selected.photo ? <img src={selected.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : memberInitials(selected)}</div>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 24 }}>{fullName(selected)}</h3>
          <p style={{ color: "var(--text-dim)", marginTop: 4 }}>{selected.phone}</p>
          {membership && (
            <div style={{ marginTop: 12 }}>
              <Badge variant={isExpired ? "danger" : isFrozen ? "warning" : isPendingPayment ? "warning" : insufficientPrepaid ? "danger" : "success"}>
                {getPlanName(membership.plan)} • {isExpired ? "EXPIRED" : isFrozen ? "FROZEN" : isPendingPayment ? "PENDING PAYMENT" : insufficientPrepaid ? "INSUFFICIENT BALANCE" : isPrepaid ? `Balance: ${formatUGX(prepaidBalance)}` : `Expires ${formatDate(membership.endDate)}`}
              </Badge>
            </div>
          )}
          {!membership && <div style={{ marginTop: 12 }}><Badge variant="danger">No Active Membership</Badge></div>}

          {/* Prepaid balance display — cost adapts to selected activities */}
          {isPrepaid && !isExpired && !alreadyCheckedIn && (
            <div style={{ marginTop: 16, padding: 16, background: insufficientPrepaid ? "var(--danger-dim)" : "var(--accent-dim)", border: `1px solid ${insufficientPrepaid ? "var(--danger)" : "var(--accent)"}`, borderRadius: "var(--radius-sm)", textAlign: "left" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Pre-Paid Balance</span>
                <span style={{ fontSize: 20, fontWeight: 700, color: insufficientPrepaid ? "var(--danger)" : "var(--accent)", fontFamily: "var(--font-display)" }}>{formatUGX(prepaidBalance)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 12, color: "var(--text-dim)" }}>
                <span>This visit ({addons.length === 0 ? "gym only" : `${addons.length} activit${addons.length === 1 ? "y" : "ies"}`})</span>
                <span style={{ fontWeight: 600 }}>-{formatUGX(prepaidVisitCost)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2, fontSize: 12, color: "var(--text-dim)" }}>
                <span>Balance after check-in</span>
                <span style={{ fontWeight: 600, color: insufficientPrepaid ? "var(--danger)" : "var(--success)" }}>{formatUGX(Math.max(0, prepaidBalance - prepaidVisitCost))}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2, fontSize: 11, color: "var(--text-muted)" }}>
                <span>Avg. visits left (gym only)</span>
                <span>{Math.floor(prepaidBalance / PREPAID_BASE_FEE)}</span>
              </div>
              {insufficientPrepaid && (
                <p style={{ fontSize: 12, color: "var(--danger)", marginTop: 8, fontWeight: 600 }}>⚠ Insufficient balance for this visit. Please top up via Memberships before check-in.</p>
              )}
              {!insufficientPrepaid && prepaidBalance < prepaidVisitCost * 3 && (
                <p style={{ fontSize: 11, color: "var(--warning)", marginTop: 8 }}>⚠ Low balance — consider topping up soon.</p>
              )}
            </div>
          )}

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

          {!isExpired && !isFrozen && !isPendingPayment && !alreadyCheckedIn && !insufficientPrepaid && (
            <>
              <div style={{ marginTop: 20, textAlign: "left" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <p style={{ fontSize: 12, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Add-on Activities</p>
                  <span style={{ fontSize: 11, color: addons.length >= MAX_ACTIVITIES ? "var(--warning)" : "var(--text-muted)" }}>
                    {addons.length}/{MAX_ACTIVITIES} selected
                  </span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {ACTIVITIES.map((act) => {
                    const isSelected = addons.includes(act.id);
                    const isDisabled = !isSelected && addons.length >= MAX_ACTIVITIES;
                    return (
                      <button
                        key={act.id}
                        className={`btn btn-sm ${isSelected ? "btn-primary" : "btn-secondary"}`}
                        style={isDisabled ? { opacity: 0.4, cursor: "not-allowed" } : {}}
                        onClick={() => {
                          if (isDisabled) return;
                          setAddons((a) => a.includes(act.id) ? a.filter((x) => x !== act.id) : [...a, act.id]);
                        }}
                      >
                        {act.name} ({formatUGX(isDailyPlan ? act.standalone : act.addon)})
                      </button>
                    );
                  })}
                </div>
                {addons.length >= MAX_ACTIVITIES && (
                  <p style={{ fontSize: 11, color: "var(--warning)", marginTop: 6 }}>Maximum {MAX_ACTIVITIES} activities per visit. Deselect one to choose a different activity.</p>
                )}

                {/* Pricing summary */}
                {addons.length > 0 && (
                  <div style={{ marginTop: 12, padding: 12, background: "var(--bg-elevated)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                    {addons.map((actId) => {
                      const act = ACTIVITIES.find((a) => a.id === actId);
                      const price = isDailyPlan ? act.standalone : act.addon;
                      return (
                        <div key={actId} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", color: "var(--text-dim)" }}>
                          <span>{act.name}</span>
                          <span>{formatUGX(price)}</span>
                        </div>
                      );
                    })}
                    {addons.length > 1 && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", color: "var(--success)", borderTop: "1px dashed var(--border)", marginTop: 4, paddingTop: 6 }}>
                        <span>Bundle Discount</span>
                        <span>-{formatUGX(10000)}</span>
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700, color: "var(--accent)", borderTop: "1px solid var(--border)", marginTop: 6, paddingTop: 6 }}>
                      <span>Total</span>
                      <span>{formatUGX(addons.reduce((s, actId) => { const act = ACTIVITIES.find((a) => a.id === actId); return s + (isDailyPlan ? act.standalone : act.addon); }, 0) - (addons.length > 1 ? 10000 : 0))}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Locker Assignment (Optional) */}
              <div style={{ marginTop: 20, textAlign: "left" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <p style={{ fontSize: 12, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Assign Locker <span style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "none" }}>— optional</span>
                  </p>
                  <span style={{ fontSize: 11, color: lockerSection === "ladies" ? "#ec4899" : "#3b82f6" }}>
                    {lockerSection === "ladies" ? "Ladies" : "Gents"} • {availableLockers.length} free
                  </span>
                </div>
                {selectedLocker ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "var(--success-dim)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "var(--radius-sm)" }}>
                    <div style={{ width: 36, height: 36, borderRadius: "var(--radius-xs)", background: lockerSection === "ladies" ? "rgba(236,72,153,0.15)" : "rgba(59,130,246,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, color: lockerSection === "ladies" ? "#ec4899" : "#3b82f6" }}>
                      #{selectedLocker.number}
                    </div>
                    <span style={{ flex: 1, fontSize: 13, color: "var(--success)" }}>Locker #{selectedLocker.number} ({lockerSection === "ladies" ? "Ladies" : "Gents"}) assigned</span>
                    <button className="btn btn-sm btn-secondary" onClick={() => setSelectedLocker(null)} style={{ padding: "4px 10px", fontSize: 11 }}>Remove</button>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {availableLockers.slice(0, 10).map((l) => (
                      <button key={l.id} className="btn btn-sm btn-secondary" onClick={() => setSelectedLocker(l)} style={{ padding: "6px 10px", minWidth: 44, fontSize: 13, fontWeight: 700, color: lockerSection === "ladies" ? "#ec4899" : "#3b82f6" }}>
                        #{l.number}
                      </button>
                    ))}
                    {availableLockers.length > 10 && <span style={{ fontSize: 11, color: "var(--text-muted)", alignSelf: "center" }}>+{availableLockers.length - 10} more</span>}
                    {availableLockers.length === 0 && <p style={{ fontSize: 12, color: "var(--danger)" }}>No {lockerSection} lockers available</p>}
                  </div>
                )}
              </div>

              <button className="btn btn-success" style={{ marginTop: 24, width: "100%", padding: "14px 24px", fontSize: 16, fontWeight: 700 }} onClick={handleCheckIn}>
                <Check size={20} /> Check In{selectedLocker ? ` + Locker #${selectedLocker.number}` : ""}
              </button>
            </>
          )}
        </div>
      )}

      {selected && checkedIn && (
        <div className="checkin-card checkin-success">
          <div className="member-photo"><Check size={40} /></div>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--success)" }}>Check-In Confirmed!</h3>
          <p style={{ color: "var(--text)", fontSize: 18, marginTop: 8 }}>{fullName(selected)}</p>
          {selected._isWalkIn && <Badge variant="warning" style={{ marginTop: 4 }}>Walk-In Guest</Badge>}
          {!selected._isWalkIn && membership && <p style={{ color: "var(--text-dim)", marginTop: 4 }}>{getPlanName(membership.plan)}</p>}
          <p style={{ color: "var(--text-dim)", marginTop: 4 }}>{formatTime(new Date())}</p>
          {selectedLocker && (
            <div style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", background: lockerSection === "ladies" ? "rgba(236,72,153,0.12)" : "rgba(59,130,246,0.12)", borderRadius: 20, fontSize: 13 }}>
              <Hash size={14} style={{ color: lockerSection === "ladies" ? "#ec4899" : "#3b82f6" }} />
              <span style={{ color: lockerSection === "ladies" ? "#ec4899" : "#3b82f6", fontWeight: 600 }}>Locker #{selectedLocker.number} ({lockerSection === "ladies" ? "Ladies" : "Gents"})</span>
            </div>
          )}
          <p style={{ color: "var(--text-dim)", marginTop: 8 }}>Today's visits: {data.attendance.filter((a) => a.date === today()).length}</p>
          {addons.length > 0 && <p style={{ color: "var(--accent)", marginTop: 8 }}>Add-ons: {addons.map((a) => ACTIVITIES.find((x) => x.id === a)?.name).join(", ")}</p>}
          {selected._isWalkIn && walkinForm.selectedActivities.length > 0 && <p style={{ color: "var(--accent)", marginTop: 8 }}>Activities: {walkinForm.selectedActivities.map((a) => ACTIVITIES.find((x) => x.id === a)?.name).join(", ")}</p>}
          <button className="btn btn-secondary" style={{ marginTop: 24 }} onClick={reset}>New Check-In</button>
        </div>
      )}

      {/* WALK-IN HISTORY TAB */}
      {!selected && !checkedIn && mode === "history" && (
        <div>
          <div className="toolbar">
            <div><p style={{ fontSize: 13, color: "var(--text-dim)" }}>All walk-in guest records</p></div>
          </div>
          <div className="table-wrapper">
            <table>
              <thead><tr><th>Date</th><th>Surname</th><th>Other Name(s)</th><th>Phone</th><th>Activity</th><th>Amount</th><th>Payment</th><th>Check-In</th><th>Edit</th></tr></thead>
              <tbody>
                {[...data.walkIns].reverse().map((w) => (
                  <tr key={w.id}>
                    <td>{formatDate(w.visitDate)}</td>
                    <td style={{ color: "var(--text)", fontWeight: 500 }}>{w.lastName || w.name}</td>
                    <td>{w.firstName || ""}</td>
                    <td>{w.phone}</td>
                    <td style={{ fontSize: 12 }}>{w.activities ? w.activities.map((id) => ACTIVITIES.find((a) => a.id === id)?.name || id).join(", ") : ACTIVITIES.find((a) => a.id === w.activityId)?.name || w.activityId}</td>
                    <td style={{ fontWeight: 600, color: "var(--accent)" }}>{formatUGX(w.amountDue || w.amountPaid)}</td>
                    <td>
                      {(w.paymentStatus === "paid" || !w.paymentStatus) ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <Badge variant="success">Paid</Badge>
                          <button className="btn btn-sm btn-secondary" style={{ padding: "3px 8px", fontSize: 11 }} title="Mark as Pending" onClick={async () => {
                            if (!confirm("Mark this walk-in as Pending?")) return;
                            try {
                              await walkInsApi.update(w.id, { paymentStatus: "pending" });
                              const wiRes = await walkInsApi.list({ limit: 500 });
                              setData((d) => ({ ...d, walkIns: (wiRes?.data || []).map(adaptWalkIn) }));
                            } catch (err) { alert(err?.message || "Failed"); }
                          }}>Revert</button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <Badge variant="warning">Pending</Badge>
                          <button className="btn btn-sm btn-success" style={{ padding: "3px 8px", fontSize: 11 }} onClick={async () => {
                            const total = w.amountDue || w.amount || 0;
                            try {
                              await walkInsApi.update(w.id, { paymentStatus: "paid" });
                              await paymentsApi.create({
                                amount: total,
                                method: paymentMethodToApi(w.paymentMethod || "cash"),
                                type: "walk_in",
                                notes: `Walk-in payment: ${w.firstName || w.name || ""} ${w.lastName || ""}`.trim(),
                              });
                              const [wiRes, payRes] = await Promise.all([
                                walkInsApi.list({ limit: 500 }),
                                paymentsApi.list({ limit: 500 }),
                              ]);
                              setData((d) => ({
                                ...d,
                                walkIns: (wiRes?.data || []).map(adaptWalkIn),
                                payments: (payRes?.data || []).map(adaptPayment),
                              }));
                            } catch (err) { alert(err?.message || "Failed"); }
                          }}>Mark Paid</button>
                        </div>
                      )}
                    </td>
                    <td>
                      {w.checkedIn ? <Badge variant="success">In {w.checkInTime ? formatTime(w.checkInTime) : ""}</Badge> : (w.paymentStatus === "paid" || !w.paymentStatus) ? (
                        <button className="btn btn-sm btn-primary" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => checkInWalkInGuest(w)}><LogIn size={12} /> In</button>
                      ) : <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Pay first</span>}
                    </td>
                    <td><button className="btn btn-icon btn-secondary" onClick={() => setEditWalkin({ ...w, _originalAmount: w.amountDue || w.amountPaid, _originalStatus: w.paymentStatus || "paid", _originalLockerId: w.lockerAssigned || null })} title="Edit walk-in"><Edit2 size={14} /></button></td>
                  </tr>
                ))}
                {data.walkIns.length === 0 && <tr><td colSpan={9} style={{ textAlign: "center", color: "var(--text-muted)", padding: 32 }}>No walk-in records yet</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* EDIT WALK-IN MODAL — staff can edit payment/activity, admin has full access */}
      {editWalkin && (
        <Modal title={isAdmin ? "Edit Walk-In Record" : "Update Walk-In — Payment & Activities"} onClose={() => setEditWalkin(null)} footer={
          <>
            <button className="btn btn-secondary" onClick={() => setEditWalkin(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={() => {
              const newAmount = Number(editWalkin.amountDue) || 0;
              const newStatus = editWalkin.paymentStatus || "paid";
              const newMethod = editWalkin.paymentMethod || "cash";
              const origStatus = editWalkin._originalStatus;
              const origAmount = editWalkin._originalAmount;
              const nameStr = `${editWalkin.firstName || ""} ${editWalkin.lastName || ""}`.trim();
              const origLockerId = editWalkin._originalLockerId;
              const newLockerId = editWalkin.lockerAssigned;

              setData((d) => {
                // Update the walk-in record
                let updatedWalkIns = d.walkIns.map((x) => x.id === editWalkin.id ? {
                  ...editWalkin,
                  amountDue: newAmount,
                  amountPaid: newStatus === "paid" ? newAmount : 0,
                  _originalAmount: undefined, _originalStatus: undefined, _originalLockerId: undefined,
                } : x);

                // Remove the internal flags from the stored object
                updatedWalkIns = updatedWalkIns.map(w => {
                  const { _originalAmount, _originalStatus, _originalLockerId, ...clean } = w;
                  return clean;
                });

                // Manage locker occupancy when locker changes
                let updatedLockers = d.lockers;
                if (origLockerId !== newLockerId) {
                  // Release old locker if it was assigned
                  if (origLockerId) {
                    updatedLockers = updatedLockers.map((l) => l.id === origLockerId ? { ...l, isOccupied: false } : l);
                  }
                  // Occupy new locker if one is selected
                  if (newLockerId) {
                    updatedLockers = updatedLockers.map((l) => l.id === newLockerId ? { ...l, isOccupied: true } : l);
                  }
                }

                // Manage payment records based on status transition
                let updatedPayments = d.payments;

                // Case 1: WAS paid, NOW pending → remove the payment record
                if (origStatus === "paid" && newStatus === "pending") {
                  updatedPayments = updatedPayments.filter((p) => !(p.type === "walkin" && p.note?.includes(nameStr) && p.amount === origAmount));
                }
                // Case 2: WAS pending, NOW paid → add a payment record
                else if (origStatus === "pending" && newStatus === "paid") {
                  updatedPayments = [...updatedPayments, {
                    id: generateId(), memberId: null, membershipId: null,
                    amount: newAmount, method: newMethod, paidAt: new Date().toISOString(),
                    type: "walkin", discountId: null, discountAmount: 0,
                    note: `Walk-in payment: ${nameStr}`,
                  }];
                }
                // Case 3: WAS paid, STILL paid but amount/method changed → replace the payment
                else if (origStatus === "paid" && newStatus === "paid" && (origAmount !== newAmount || editWalkin.paymentMethod !== editWalkin._originalMethod)) {
                  updatedPayments = updatedPayments.filter((p) => !(p.type === "walkin" && p.note?.includes(nameStr) && p.amount === origAmount));
                  updatedPayments = [...updatedPayments, {
                    id: generateId(), memberId: null, membershipId: null,
                    amount: newAmount, method: newMethod, paidAt: new Date().toISOString(),
                    type: "walkin", discountId: null, discountAmount: 0,
                    note: `Walk-in payment: ${nameStr} (edited)`,
                  }];
                }

                return { ...d, walkIns: updatedWalkIns, payments: updatedPayments, lockers: updatedLockers };
              });
              setEditWalkin(null);
            }}><Check size={14} /> Save Changes</button>
          </>
        }>
          {!isAdmin && (
            <div style={{ padding: "10px 14px", background: "var(--info-dim)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: "var(--radius-xs)", marginBottom: 16, fontSize: 12, color: "var(--info)" }}>
              <AlertTriangle size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }} />
              Front Desk: you can update payment status, method, and activities. Contact admin to change personal details.
            </div>
          )}

          <div className="form-grid">
            {/* ADMIN-ONLY FIELDS */}
            {isAdmin && <>
              <div className="form-group"><label>Surname</label><input value={editWalkin.lastName || ""} onChange={(e) => setEditWalkin({ ...editWalkin, lastName: e.target.value })} /></div>
              <div className="form-group"><label>Other Name(s)</label><input value={editWalkin.firstName || ""} onChange={(e) => setEditWalkin({ ...editWalkin, firstName: e.target.value })} /></div>
              <div className="form-group"><label>Phone</label><input value={editWalkin.phone || ""} onChange={(e) => setEditWalkin({ ...editWalkin, phone: e.target.value })} /></div>
              <div className="form-group"><label>Emergency Contact</label><input value={editWalkin.emergency || ""} onChange={(e) => setEditWalkin({ ...editWalkin, emergency: e.target.value })} /></div>
              <div className="form-group"><label>Gender</label>
                <select value={editWalkin.gender || "Male"} onChange={(e) => setEditWalkin({ ...editWalkin, gender: e.target.value })}>
                  <option>Male</option><option>Female</option>
                </select>
              </div>
              <div className="form-group"><label>Visit Date</label><input type="date" value={editWalkin.visitDate || ""} onChange={(e) => setEditWalkin({ ...editWalkin, visitDate: e.target.value })} /></div>
            </>}

            {/* STAFF-FRIENDLY READ-ONLY GUEST INFO (when not admin) */}
            {!isAdmin && (
              <div className="form-group full" style={{ padding: "12px 14px", background: "var(--bg-elevated)", borderRadius: "var(--radius-xs)", border: "1px solid var(--border)" }}>
                <label>Guest</label>
                <p style={{ color: "var(--text)", fontSize: 14, fontWeight: 500 }}>
                  {editWalkin.lastName || ""} {editWalkin.firstName || ""} — {editWalkin.phone || "No phone"}
                </p>
              </div>
            )}

            {/* SHARED EDITABLE FIELDS */}
            <div className="form-group"><label>Payment Status *</label>
              <select value={editWalkin.paymentStatus || "paid"} onChange={(e) => setEditWalkin({ ...editWalkin, paymentStatus: e.target.value })}
                style={{
                  background: (editWalkin.paymentStatus || "paid") === "paid" ? "var(--success-dim)" : "var(--warning-dim)",
                  color: (editWalkin.paymentStatus || "paid") === "paid" ? "var(--success)" : "var(--warning)",
                  borderColor: (editWalkin.paymentStatus || "paid") === "paid" ? "rgba(34,197,94,0.3)" : "rgba(249,115,22,0.3)",
                  fontWeight: 600,
                }}>
                <option value="paid">✓ Paid</option><option value="pending">⚠ Pending</option>
              </select>
            </div>
            <div className="form-group"><label>Payment Method *</label>
              <select value={editWalkin.paymentMethod || "cash"} onChange={(e) => setEditWalkin({ ...editWalkin, paymentMethod: e.target.value })}>
                <option value="cash">Cash</option><option value="mobile_money">Mobile Money</option><option value="card">Card</option>
              </select>
            </div>
            <div className="form-group full"><label>Amount (UGX)</label>
              <input type="number" value={editWalkin.amountDue || 0} onChange={(e) => setEditWalkin({ ...editWalkin, amountDue: e.target.value })} />
              <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>Auto-calculated when you change activities below. You can also enter manually.</p>
            </div>
            <div className="form-group full"><label>Activities * <span style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "none" }}>— select 1 or 2, max 2</span></label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {ACTIVITIES.map((act) => {
                  const isSel = (editWalkin.activities || []).includes(act.id);
                  const isDis = !isSel && (editWalkin.activities || []).length >= MAX_ACTIVITIES;
                  return (
                    <button key={act.id} type="button" className={`btn btn-sm ${isSel ? "btn-primary" : "btn-secondary"}`}
                      style={isDis ? { opacity: 0.4, cursor: "not-allowed" } : {}}
                      onClick={() => {
                        if (isDis) return;
                        const current = editWalkin.activities || [];
                        const updated = current.includes(act.id) ? current.filter((x) => x !== act.id) : [...current, act.id];
                        const newTotal = updated.reduce((s, id) => s + (ACTIVITIES.find((a) => a.id === id)?.standalone || 0), 0) - (updated.length > 1 ? 10000 : 0);
                        setEditWalkin({ ...editWalkin, activities: updated, amountDue: newTotal });
                      }}>
                      {act.name} ({formatUGX(act.standalone)})
                    </button>
                  );
                })}
              </div>
              {(editWalkin.activities || []).length > 1 && (
                <p style={{ fontSize: 11, color: "var(--success)", marginTop: 6 }}>✓ Bundle discount of UGX 10,000 applied for selecting 2 activities</p>
              )}
            </div>

            {/* LOCKER SELECTION (optional, gender-filtered) */}
            <div className="form-group full"><label>Locker (Optional)</label>
              <select value={editWalkin.lockerAssigned || ""} onChange={(e) => setEditWalkin({ ...editWalkin, lockerAssigned: e.target.value })}>
                <option value="">— No locker assigned —</option>
                {data.lockers
                  .filter((l) => {
                    if (editWalkin.gender === "Male") return l.section === "gents";
                    if (editWalkin.gender === "Female") return l.section === "ladies";
                    return true;
                  })
                  .sort((a, b) => a.number - b.number)
                  .map((l) => (
                    <option key={l.id} value={l.id} disabled={l.isOccupied && l.id !== (editWalkin.lockerAssigned || "")}>
                      Locker {l.number} ({l.section}) {l.isOccupied && l.id !== (editWalkin.lockerAssigned || "") ? "— occupied" : ""}
                    </option>
                  ))}
              </select>
              <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>Gender-filtered based on guest gender. Occupied lockers are disabled unless already assigned to this guest.</p>
            </div>
          </div>
        </Modal>
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
  const fileInputRef = useRef(null);
  const [mode, setMode] = useState("idle"); // idle | streaming | captured
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState(null);
  const streamRef = useRef(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraReady(false);
  }, []);

  const startCamera = async () => {
    stopCamera();
    setError(null);

    // Check browser support first
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError("Your browser doesn't support camera access. Please use the Upload option or Auto Avatar.");
      return;
    }

    // Check HTTPS (camera requires secure context, except on localhost)
    const isSecure = window.isSecureContext || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    if (!isSecure) {
      setError("Camera requires a secure (HTTPS) connection. Please use the Upload or Auto Avatar option.");
      return;
    }

    setMode("streaming");
    setCameraReady(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;

      // Retry binding to video element (handles race condition)
      let attempts = 0;
      const bindVideo = async () => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
            setCameraReady(true);
          } catch (playErr) {
            // Autoplay blocked — user needs to interact. Show the stream anyway.
            setCameraReady(true);
            console.warn("Autoplay blocked, user can still see preview:", playErr.message);
          }
        } else if (attempts < 10) {
          attempts++;
          setTimeout(bindVideo, 50);
        } else {
          throw new Error("Video element not available");
        }
      };
      await bindVideo();
    } catch (err) {
      console.warn("Camera error:", err.name, err.message);
      stopCamera();
      setMode("idle");

      // User-friendly error messages
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setError("Camera permission denied. Please allow camera access in your browser settings, or use the Upload option.");
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        setError("No camera found on this device. Please use the Upload option or Auto Avatar.");
      } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
        setError("Camera is already in use by another app. Close other camera apps and try again.");
      } else if (err.name === "OverconstrainedError") {
        setError("Camera doesn't meet the required settings. Try the Upload option.");
      } else {
        setError(`Camera unavailable: ${err.message}. Please use the Upload option.`);
      }
    }
  };

  const takePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;

    if (w === 0 || h === 0) {
      setError("Camera not ready yet. Please wait and try again.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    // Mirror horizontally (natural selfie view)
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, w, h);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    stopCamera();

    if (dataUrl && dataUrl.length > 500) {
      onCapture(dataUrl);
    } else {
      setError("Failed to capture image. Please try again.");
      onCapture(generateAvatarPhoto(memberName));
    }
    setMode("idle");
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please select an image file (JPG, PNG, etc.)");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("Image too large. Please use an image smaller than 5MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      // Compress via canvas
      const img = new Image();
      img.onload = () => {
        const maxDim = 640;
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          const ratio = Math.min(maxDim / w, maxDim / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        onCapture(dataUrl);
        setError(null);
      };
      img.onerror = () => setError("Unable to load this image. Please try another file.");
      img.src = ev.target.result;
    };
    reader.onerror = () => setError("Failed to read file.");
    reader.readAsDataURL(file);

    // Reset input so the same file can be re-selected
    e.target.value = "";
  };

  const useAvatar = () => {
    const dataUrl = generateAvatarPhoto(memberName);
    onCapture(dataUrl);
    setError(null);
  };

  const handleRetake = () => {
    onRetake();
    setError(null);
  };

  const cancelCamera = () => {
    stopCamera();
    setMode("idle");
  };

  // Cleanup on unmount
  useEffect(() => { return () => stopCamera(); }, [stopCamera]);

  return (
    <div className="photo-capture-area">
      <label>Photo <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>Optional</span></label>

      {/* Hidden file input for uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleFileUpload}
      />

      {/* Error banner */}
      {error && (
        <div style={{ padding: "10px 14px", background: "var(--warning-dim)", border: "1px solid rgba(249,115,22,0.3)", borderRadius: "var(--radius-xs)", marginBottom: 12, display: "flex", alignItems: "flex-start", gap: 8 }}>
          <AlertTriangle size={14} style={{ color: "var(--warning)", flexShrink: 0, marginTop: 2 }} />
          <span style={{ fontSize: 12, color: "var(--warning)", lineHeight: 1.4 }}>{error}</span>
        </div>
      )}

      {/* ALWAYS render the video — just hide it when not streaming */}
      <div style={{ display: mode === "streaming" ? "block" : "none", width: "100%", maxWidth: 320, margin: "0 auto" }}>
        <div style={{ position: "relative", borderRadius: "var(--radius)", overflow: "hidden", border: "3px solid var(--accent)", background: "#000" }}>
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            style={{ width: "100%", display: "block", transform: "scaleX(-1)", minHeight: 200 }}
          />
          {!cameraReady && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)" }}>
              <div style={{ textAlign: "center" }}>
                <RefreshCw size={24} style={{ color: "var(--accent)", animation: "spin 1s linear infinite" }} />
                <p style={{ color: "var(--text-dim)", fontSize: 13, marginTop: 8 }}>Starting camera...</p>
              </div>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12 }}>
          <button type="button" className="btn btn-success" onClick={takePhoto} disabled={!cameraReady} style={{ minWidth: 150 }}>
            <Camera size={16} /> Take Photo
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={cancelCamera}>
            Cancel
          </button>
        </div>
        {cameraReady && (
          <p style={{ color: "var(--success)", fontSize: 11, textAlign: "center", marginTop: 6 }}>
            Camera ready — position the person and tap "Take Photo"
          </p>
        )}
      </div>

      {/* Idle state — no photo yet */}
      {mode !== "streaming" && !photo && (
        <>
          <div className="photo-preview-frame">
            <div className="photo-placeholder">
              <Camera size={36} />
              <span style={{ fontSize: 11 }}>No photo</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button type="button" className="btn btn-primary" onClick={startCamera} style={{ justifyContent: "center" }}>
              <Camera size={16} /> Use Camera
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => fileInputRef.current?.click()} style={{ justifyContent: "center" }}>
              <Upload size={16} /> Upload Image
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={useAvatar} style={{ justifyContent: "center", fontSize: 11 }}>
              <Users size={12} /> Use Auto Avatar (Initials)
            </button>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: 11, textAlign: "center", marginTop: 6 }}>
            Camera, upload from device, or use generated initials avatar
          </p>
        </>
      )}

      {/* Photo captured */}
      {photo && mode !== "streaming" && (
        <>
          <div className="photo-preview-frame">
            <img src={photo} alt="Captured" />
          </div>
          <div className="camera-controls" style={{ flexWrap: "wrap", gap: 6 }}>
            <button type="button" className="btn btn-sm btn-success" disabled>
              <Check size={14} /> Photo Set
            </button>
            <button type="button" className="btn btn-sm btn-secondary" onClick={handleRetake}>
              <RefreshCw size={14} /> Change
            </button>
          </div>
        </>
      )}
    </div>
  );
};

// ─── MEMBERS ────────────────────────────────────────────────
const TERMS_AND_CONDITIONS = `RUSH FITNESS CENTRE – NAALYA
TERMS & CONDITIONS OF MEMBERSHIP

By creating an account and accessing services at Rush Fitness Centre – Naalya, you agree to the following Terms and Conditions:

1. ACCEPTANCE OF TERMS
By registering for membership, you confirm that you have read, understood, and agreed to comply with these Terms and Conditions and all gym policies. Access to the facility is conditional upon acceptance of these terms.

2. MEMBER INFORMATION
You agree to provide accurate and complete personal information, including:
• Full Name
• National ID or Passport
• Phone Number
• Emergency Contact
You are responsible for keeping your information up to date.

3. HEALTH & SAFETY
• You acknowledge that participation in fitness activities involves inherent risks.
• All equipment must be used properly and in accordance with staff instructions.
• You agree to follow all safety guidelines and gym rules at all times.
• You are advised to seek medical clearance before beginning any exercise program.

4. LIABILITY WAIVER
To the fullest extent permitted by law:
• Rush Fitness Centre shall not be held liable for any injury, loss, or damage sustained while using the facility or participating in activities.
• You use all equipment and services at your own risk.

5. PERSONAL PROPERTY
• You are solely responsible for your personal belongings.
• The gym is not liable for loss, theft, or damage to personal items.
• Lockers should be used where available.

6. CODE OF CONDUCT
You agree to:
• Treat staff and other members with respect.
• Refrain from abusive, disruptive, or inappropriate behavior.

The following are strictly prohibited:
• Smoking within the premises
• Use of alcohol or illegal substances before or during workouts
• Accessing the facility while under the influence
Violation may result in suspension or termination of membership.

7. HYGIENE & FACILITY USE
• Maintain proper personal hygiene at all times.
• Wipe down equipment after use.
• Wear appropriate gym attire while in the facility.

8. MEMBERSHIP TERMS
• Membership is personal and non-transferable.
• Access may be denied for violation of these Terms.
• Management reserves the right to modify these Terms at any time without prior notice.

9. TERMS FOR ADULT MEMBERS (18 YEARS AND ABOVE)
• You accept full responsibility for your health and fitness decisions.
• You acknowledge that participation is voluntary.
• Personal training services are optional and may be requested separately.

10. TERMS FOR MINORS (UNDER 18 YEARS)

10.1 Parental/Guardian Consent
• Membership requires consent from a parent or legal guardian.

10.2 Supervision
• Minors must be supervised by a parent/guardian or authorized trainer at all times.

10.3 Restricted Access
• Certain equipment or areas may be restricted for safety reasons.
• Staff may limit access based on age, ability, or safety concerns.

10.4 Parental Liability
• The parent/guardian accepts full responsibility for the minor's participation.
• The gym shall not be liable for injuries involving minors.

11. TERMINATION OR SUSPENSION
Your membership may be suspended or terminated without refund if you:
• Violate these Terms and Conditions
• Engage in unsafe or inappropriate behavior
• Provide false or misleading information
• Abuse substances within or before accessing the facility

12. MEMBER DECLARATION
By creating an account, you confirm that:
• You have read and understood these Terms and Conditions
• You agree to abide by all gym rules and policies
• You voluntarily accept all risks associated with gym use`;

// Map a backend member (camelCase from API) to the shape App.jsx expects.
// Backend stores `emergencyPhone`/`emergencyPhone2`; frontend reads `emergency`/`emergency2`.
const adaptMember = (m) => m ? ({
  ...m,
  emergency: m.emergencyPhone || "",
  emergency2: m.emergencyPhone2 || "",
  photo: m.photoUrl || null,
  passportNumber: m.passportNumber || "",
}) : null;

// Inverse: take frontend form → API body.
// We send empty strings (not undefined) for nationalId/passportNumber so the
// backend can clear them on PATCH if the user explicitly removed one.
const memberFormToApi = (f) => ({
  firstName: f.firstName?.trim(),
  lastName: f.lastName?.trim(),
  phone: f.phone?.trim(),
  email: f.email || undefined,
  gender: f.gender,
  dob: f.dob || undefined,
  nationalId: (f.nationalId || "").trim(),
  passportNumber: (f.passportNumber || "").trim(),
  emergencyPhone: f.emergency || undefined,
  emergencyPhone2: f.emergency2 || undefined,
  photoUrl: f.photo || undefined,
  pin: f.pin || undefined,
});

const Members = ({ data, setData, currentUser }) => {
  const isAdmin = currentUser?.role === "admin";
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null); // 'add' | 'edit' | 'view' | 'terms' | null
  const [current, setCurrent] = useState(null);
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "", email: "", gender: "Male", dob: "", emergency: "", emergency2: "", nationalId: "", passportNumber: "", pin: "", photo: null });
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsScrolled, setTermsScrolled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const termsRef = useRef(null);

  // Load members from the backend on mount, and mirror into shared `data.members`
  // so other tabs that still read `data.members` keep working.
  const reload = useCallback(async () => {
    setLoading(true);
    setApiError("");
    try {
      const res = await membersApi.list({ limit: 500 });
      const adapted = (res?.data || []).map(adaptMember);
      setData((d) => ({ ...d, members: adapted }));
    } catch (err) {
      setApiError(err?.message || "Failed to load members");
    } finally {
      setLoading(false);
    }
  }, [setData]);

  useEffect(() => { reload(); }, [reload]);

  const filtered = data.members.filter((m) => {
    const q = search.toLowerCase();
    return (
      fullName(m).toLowerCase().includes(q) ||
      (m.phone || "").includes(search) ||
      (m.nationalId || "").toLowerCase().includes(q) ||
      (m.passportNumber || "").toLowerCase().includes(q)
    );
  });

  const openAdd = () => { setForm({ firstName: "", lastName: "", phone: "", email: "", gender: "Male", dob: "", emergency: "", emergency2: "", nationalId: "", passportNumber: "", pin: Math.floor(1000 + Math.random() * 9000).toString(), photo: null }); setTermsAccepted(false); setTermsScrolled(false); setApiError(""); setModal("add"); };
  const openEdit = (m) => { setCurrent(m); setForm({ ...m, emergency: m.emergency || "", emergency2: m.emergency2 || "" }); setApiError(""); setModal("edit"); };
  const openView = (m) => { setCurrent(m); setModal("view"); };

  const handleTermsScroll = () => {
    if (termsRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = termsRef.current;
      if (scrollTop + clientHeight >= scrollHeight - 20) {
        setTermsScrolled(true);
      }
    }
  };

  const validateAndShowTerms = () => {
    if (!form.firstName || !form.lastName || !form.phone) {
      alert("Please fill in Surname, Other Name(s), and Phone number.");
      return;
    }
    // Either NIN or passport is mandatory — not both, not neither.
    const ninLen = (form.nationalId || "").trim().length;
    const passportLen = (form.passportNumber || "").trim().length;
    if (ninLen === 0 && passportLen === 0) {
      alert("Either National ID (NIN) or Passport Number is required.");
      return;
    }
    if (ninLen > 0 && ninLen !== 14) {
      alert(`National ID (NIN) must be exactly 14 characters. Currently: ${ninLen} characters.\n\nIf the member has no NIN, leave it blank and use the Passport Number field instead.`);
      return;
    }
    if (passportLen > 0 && (passportLen < 5 || passportLen > 20)) {
      alert(`Passport Number must be 5–20 characters. Currently: ${passportLen} characters.`);
      return;
    }
    if (!form.dob) {
      alert("Date of Birth is required.");
      return;
    }
    if (!form.emergency) {
      alert("Emergency Contact 1 is required.");
      return;
    }
    // Validation passed — show T&C
    setTermsAccepted(false);
    setTermsScrolled(false);
    setModal("terms");
  };

  const save = async () => {
    setLoading(true);
    setApiError("");
    try {
      const payload = memberFormToApi(form);
      if (modal === "add" || modal === "terms") {
        await membersApi.create(payload);
      } else if (current) {
        await membersApi.update(current.id, payload);
      }
      await reload();
      setModal(null);
    } catch (err) {
      const detail = Array.isArray(err?.details) && err.details.length
        ? err.details.map((d) => d.msg || JSON.stringify(d)).join("; ")
        : "";
      setApiError([err?.message, detail].filter(Boolean).join(" – "));
    } finally {
      setLoading(false);
    }
  };

  const toggleActive = async (m) => {
    try {
      await membersApi.update(m.id, { isActive: !m.isActive });
      await reload();
    } catch (err) {
      alert(err?.message || "Failed to update member status");
    }
  };

  // Hard-delete a member. Admins only. Cascades on the backend (memberships
  // are deleted with the member; payments, attendance and locker assignments
  // get their member_id set to NULL so historical totals stay intact).
  const deleteMember = async (m) => {
    const name = fullName(m) || m.firstName || m.phone;
    const confirm1 = window.confirm(
      `Permanently delete member "${name}"?\n\n` +
      `• Their membership(s) will be deleted.\n` +
      `• Past payments and attendance records will be kept (but no longer linked to a member).\n` +
      `• This cannot be undone.`
    );
    if (!confirm1) return;
    // Second confirm for high-risk action — type "DELETE" to proceed.
    const typed = window.prompt(`Type DELETE to confirm permanent removal of "${name}":`);
    if (typed !== "DELETE") {
      alert("Deletion cancelled.");
      return;
    }
    setLoading(true);
    setApiError("");
    try {
      await membersApi.remove(m.id);
      await reload();
    } catch (err) {
      const msg = err?.message || "Failed to delete member";
      setApiError(msg);
      alert(msg);
    } finally {
      setLoading(false);
    }
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

      {apiError && (
        <div style={{ background: "var(--danger-dim)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "var(--radius-xs)", padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "var(--danger)", display: "flex", alignItems: "center", gap: 8 }}>
          <AlertTriangle size={14} /> {apiError}
        </div>
      )}
      {loading && (
        <div style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
          <RefreshCw size={12} style={{ animation: "spin 1s linear infinite" }} /> Syncing with database...
        </div>
      )}

      <div className="table-wrapper">
        <table>
          <thead><tr><th></th><th>Surname</th><th>Other Name(s)</th><th>Phone</th><th>ID (NIN / Passport)</th><th>Gender</th><th>Membership</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {filtered.map((m) => {
              const ms = data.memberships.find((ms) => ms.memberId === m.id && ms.isActive);
              const exp = ms ? new Date(ms.endDate) < new Date() : true;
              return (
                <tr key={m.id}>
                  <td>
                    <div style={{ width: 34, height: 34, borderRadius: "50%", overflow: "hidden", background: "var(--accent-dim)", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid var(--accent)", flexShrink: 0 }}>
                      {m.photo ? <img src={m.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)", fontFamily: "var(--font-display)" }}>{memberInitials(m)}</span>}
                    </div>
                  </td>
                  <td style={{ color: "var(--text)", fontWeight: 500 }}>{m.lastName}</td>
                  <td style={{ color: "var(--text)" }}>{m.firstName}</td>
                  <td>{m.phone}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                    {m.nationalId
                      ? <><span style={{ color: "var(--text-muted)", fontSize: 10 }}>NIN </span>{m.nationalId}</>
                      : m.passportNumber
                        ? <><span style={{ color: "var(--accent)", fontSize: 10 }}>PASS </span>{m.passportNumber}</>
                        : "—"}
                  </td>
                  <td>{m.gender}</td>
                  <td>{ms ? <Badge variant={exp ? "danger" : ms.status === "frozen" ? "warning" : "success"}>{getPlanName(ms.plan)}</Badge> : <Badge variant="neutral">None</Badge>}</td>
                  <td>{m.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="danger">Inactive</Badge>}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn btn-icon btn-secondary" onClick={() => openView(m)}><Eye size={14} /></button>
                      <button className="btn btn-icon btn-secondary" onClick={() => openEdit(m)} title="Edit member"><Edit2 size={14} /></button>
                      {isAdmin && <button className="btn btn-icon btn-danger" onClick={() => toggleActive(m)} title={m.isActive ? "Deactivate (reversible)" : "Reactivate"}>{m.isActive ? <Pause size={14} /> : <Play size={14} />}</button>}
                      {isAdmin && <button className="btn btn-icon btn-danger" onClick={() => deleteMember(m)} title="Delete member permanently" style={{ background: "rgba(239,68,68,0.15)" }}><Trash2 size={14} /></button>}
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
              {current.photo ? <img src={current.photo} alt={fullName(current)} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 36, fontFamily: "var(--font-display)", color: "var(--accent)", fontWeight: 700 }}>{memberInitials(current)}</span>}
            </div>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: 20, marginTop: 12 }}>{fullName(current)}</h3>
            <p style={{ color: "var(--text-dim)" }}>{current.phone}</p>
          </div>
          <div className="form-grid">
            {[["First Name", current.firstName || "—"], ["Last Name", current.lastName || "—"], ["National ID", current.nationalId || "—"], ["Passport No.", current.passportNumber || "—"], ["Email", current.email || "—"], ["Gender", current.gender], ["DOB", current.dob ? formatDate(current.dob) : "—"], ["Emergency 1", current.emergency || "—"], ["Emergency 2", current.emergency2 || "—"], ["PIN", current.pin], ["Joined", formatDate(current.createdAt)]].map(([l, v]) => (
              <div key={l} className="form-group"><label>{l}</label><p style={{ fontSize: 14, color: "var(--text)" }}>{v}</p></div>
            ))}
          </div>
        </Modal>
      )}

      {(modal === "add" || modal === "edit") && (
        <Modal title={modal === "add" ? "Register New Member" : "Edit Member"} onClose={() => setModal(null)} footer={<><button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>{modal === "add" ? <button className="btn btn-primary" onClick={validateAndShowTerms}><ChevronRight size={14} /> Continue to T&C</button> : <button className="btn btn-primary" onClick={save}><Check size={14} /> Save Changes</button>}</>}>
          <div className="form-grid">
            <PhotoCapture
              photo={form.photo}
              memberName={`${form.firstName} ${form.lastName}`}
              onCapture={(dataUrl) => setForm((f) => ({ ...f, photo: dataUrl }))}
              onRetake={() => setForm((f) => ({ ...f, photo: null }))}
            />
            <div className="form-group"><label>Surname *</label><input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="e.g. Nakamya" /></div>
            <div className="form-group"><label>Other Name(s) *</label><input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="e.g. Sarah" /></div>
            <div className="form-group"><label>Phone *</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="e.g. 0771234567" /></div>
            <div className="form-group"><label>Gender *</label><select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}><option>Male</option><option>Female</option></select></div>
            {/* ID — National ID (NIN) OR Passport Number. Exactly one is required. */}
            <div className="form-group full">
              <label style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span>Identification * <span style={{ fontSize: 10, color: "var(--text-muted)" }}>— provide one</span></span>
                {(form.nationalId || form.passportNumber) && (
                  <span style={{ fontSize: 11, color: "var(--success)", fontWeight: 600 }}>✓ {form.nationalId ? "NIN provided" : "Passport provided"}</span>
                )}
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 6 }}>
                <div>
                  <label style={{ fontSize: 11, color: "var(--text-muted)" }}>National ID (NIN) — 14 chars</label>
                  <input
                    value={form.nationalId}
                    onChange={(e) => setForm({ ...form, nationalId: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 14) })}
                    placeholder={form.passportNumber ? "(using passport)" : "e.g. CM95015003ABCD"}
                    maxLength={14}
                    disabled={!!form.passportNumber}
                    style={{ fontFamily: "monospace", letterSpacing: "0.08em", fontSize: 14, opacity: form.passportNumber ? 0.4 : 1 }}
                  />
                  {form.nationalId && (
                    <div style={{ fontSize: 11, marginTop: 2, color: form.nationalId.length === 14 ? "var(--success)" : "var(--warning)" }}>
                      {form.nationalId.length === 14 ? "✓ Valid length" : `${form.nationalId.length}/14`}
                    </div>
                  )}
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "var(--text-muted)" }}>Passport Number — 5–20 chars</label>
                  <input
                    value={form.passportNumber}
                    onChange={(e) => setForm({ ...form, passportNumber: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20) })}
                    placeholder={form.nationalId ? "(using NIN)" : "e.g. A12345678"}
                    maxLength={20}
                    disabled={!!form.nationalId}
                    style={{ fontFamily: "monospace", letterSpacing: "0.08em", fontSize: 14, opacity: form.nationalId ? 0.4 : 1 }}
                  />
                  {form.passportNumber && (
                    <div style={{ fontSize: 11, marginTop: 2, color: (form.passportNumber.length >= 5 && form.passportNumber.length <= 20) ? "var(--success)" : "var(--warning)" }}>
                      {form.passportNumber.length} char{form.passportNumber.length === 1 ? "" : "s"}
                    </div>
                  )}
                </div>
              </div>
              <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 6 }}>
                Fill <strong>either</strong> the National ID or the Passport — whichever the member has. The other field will lock automatically.
              </p>
            </div>
            <div className="form-group"><label>Date of Birth *</label><input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} /></div>
            <div className="form-group"><label>Email</label><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Optional" /></div>
            <div className="form-group"><label>Emergency Contact 1 *</label><input value={form.emergency} onChange={(e) => setForm({ ...form, emergency: e.target.value })} placeholder="e.g. 0701111222" /></div>
            <div className="form-group"><label>Emergency Contact 2</label><input value={form.emergency2 || ""} onChange={(e) => setForm({ ...form, emergency2: e.target.value })} placeholder="Optional" /></div>
            <div className="form-group"><label>Check-in PIN</label><input value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} maxLength={4} placeholder="4 digits" /></div>
          </div>
        </Modal>
      )}

      {/* TERMS & CONDITIONS MODAL */}
      {modal === "terms" && (
        <Modal title="Terms & Conditions" onClose={() => setModal("add")} footer={
          <>
            <button className="btn btn-secondary" onClick={() => setModal("add")}>
              <ArrowLeft size={14} /> Back to Form
            </button>
            <button className="btn btn-primary" onClick={save} disabled={!termsAccepted} style={!termsAccepted ? { opacity: 0.4, cursor: "not-allowed" } : {}}>
              <Check size={14} /> Accept & Register Member
            </button>
          </>
        }>
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 8 }}>
              Registering: <strong style={{ color: "var(--text)" }}>{form.firstName} {form.lastName}</strong> — please have the member read through and accept the terms below.
            </p>
            {!termsScrolled && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", background: "var(--warning-dim)", borderRadius: "var(--radius-xs)", fontSize: 12, color: "var(--warning)" }}>
                <AlertTriangle size={14} /> Scroll to the bottom to enable the agreement checkbox
              </div>
            )}
          </div>

          <div
            ref={termsRef}
            onScroll={handleTermsScroll}
            style={{
              maxHeight: 340,
              overflowY: "auto",
              background: "var(--bg-input)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              padding: "20px 24px",
              fontSize: 13,
              lineHeight: 1.7,
              color: "var(--text-dim)",
              whiteSpace: "pre-wrap",
              fontFamily: "var(--font-body)",
            }}
          >
            {TERMS_AND_CONDITIONS}
          </div>

          <div style={{ marginTop: 16, padding: "14px 16px", background: termsAccepted ? "var(--success-dim)" : "var(--bg-elevated)", border: `1px solid ${termsAccepted ? "rgba(34,197,94,0.3)" : "var(--border)"}`, borderRadius: "var(--radius-sm)", transition: "all 0.2s" }}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: termsScrolled ? "pointer" : "not-allowed", opacity: termsScrolled ? 1 : 0.4 }}>
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => termsScrolled && setTermsAccepted(e.target.checked)}
                disabled={!termsScrolled}
                style={{ width: 20, height: 20, marginTop: 2, accentColor: "var(--success)", cursor: termsScrolled ? "pointer" : "not-allowed" }}
              />
              <span style={{ fontSize: 14, color: termsAccepted ? "var(--success)" : "var(--text)", fontWeight: 500, lineHeight: 1.4 }}>
                I agree to the Terms & Conditions of Rush Fitness Centre – Naalya
                <br />
                <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 400 }}>
                  Member: {form.firstName} {form.lastName} • NIN: {form.nationalId} • {new Date().toLocaleDateString("en-UG")}
                </span>
              </span>
            </label>
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

const Memberships = ({ data, setData, currentUser }) => {
  const isAdmin = currentUser?.role === "admin";
  const [modal, setModal] = useState(null); // 'assign' | 'pay' | null
  const [form, setForm] = useState({ memberId: "", plan: "gym_monthly", method: "cash", discountId: "", paymentAmount: "", paymentType: "full", depositAmount: "" });
  const [payTarget, setPayTarget] = useState(null); // membership for additional payment
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState("");

  // Pull memberships + payments from backend; mirror into shared `data` state.
  const reloadMemberships = useCallback(async () => {
    setBusy(true);
    setApiError("");
    try {
      const [msRes, payRes] = await Promise.all([
        membershipsApi.list({ limit: 500 }),
        paymentsApi.list({ limit: 500 }),
      ]);
      setData((d) => ({
        ...d,
        memberships: (msRes?.data || []).map(adaptMembership),
        payments: (payRes?.data || []).map(adaptPayment),
      }));
    } catch (err) {
      setApiError(err?.message || "Failed to load memberships");
    } finally {
      setBusy(false);
    }
  }, [setData]);

  useEffect(() => { reloadMemberships(); }, [reloadMemberships]);

  // Resolve a frontend plan code (e.g. "gym_monthly") to a backend plan UUID.
  const resolvePlanId = (planCode) => {
    const p = (data.plans || []).find((x) => x.code === planCode);
    return p ? p.id : null;
  };

  const assign = async () => {
    if (!form.memberId || !form.plan) return;
    setApiError("");

    // PREPAID — backend has no prepaid_balance column yet, so keep this in-memory.
    // (The user can still assign prepaid plans, but they won't sync to other browsers.)
    if (form.plan === "prepaid") {
      const deposit = Number(form.depositAmount) || 0;
      if (deposit < PLANS.prepaid.dailyRate) {
        alert(`Deposit must be at least UGX ${PLANS.prepaid.dailyRate.toLocaleString()} (one day's worth).`);
        return;
      }
      console.warn("[memberships] prepaid plans are not yet persisted to the backend");
      const start = new Date();
      const end = new Date(start.getTime() + PLANS.prepaid.days * 86400000);
      const newMs = {
        id: generateId(), memberId: form.memberId, plan: "prepaid",
        startDate: start.toISOString().split("T")[0], endDate: end.toISOString().split("T")[0],
        isActive: true, frozenDays: 0, status: "active",
        totalDue: deposit, prepaidBalance: deposit,
        prepaidDeposits: [{ amount: deposit, date: new Date().toISOString(), method: form.method }],
      };
      const newPay = {
        id: generateId(), memberId: form.memberId, membershipId: newMs.id,
        amount: deposit, method: form.method, paidAt: new Date().toISOString(),
        type: "prepaid_deposit", discountId: null, discountAmount: 0,
        note: `Pre-paid deposit: ${formatUGX(deposit)} (LOCAL ONLY)`,
      };
      setData((d) => ({
        ...d,
        memberships: [...d.memberships.map((ms) => ms.memberId === form.memberId && ms.isActive ? { ...ms, isActive: false, status: "replaced" } : ms), newMs],
        payments: [...d.payments, newPay],
      }));
      setModal(null);
      return;
    }

    // Group plans aren't in the backend plans table yet either — warn and skip persistence
    if (form.plan.startsWith("group_")) {
      alert("Group plans are not yet persisted to the backend. Use individual plans for now.");
      return;
    }

    const planInfo = PLANS[form.plan];
    if (!planInfo) { setApiError(`Unknown plan: ${form.plan}`); return; }
    const planId = resolvePlanId(form.plan);
    if (!planId) {
      setApiError(`Plan "${form.plan}" not found in backend. Has the seed run?`);
      return;
    }

    const price = planInfo.price;
    const discount = form.discountId ? data.discounts.find((d) => d.id === form.discountId) : null;
    const discountAmt = discount
      ? (discount.type === "percentage" ? Math.round(price * discount.value / 100) : discount.value)
      : 0;
    const totalDue = price - discountAmt;
    const payAmount = form.paymentType === "full" ? totalDue : Math.min(Number(form.paymentAmount) || 0, totalDue);
    if (payAmount <= 0) { setApiError("Payment amount must be > 0"); return; }
    const isPaidFull = payAmount >= totalDue;

    setBusy(true);
    try {
      // 1. Create the membership
      const ms = await membershipsApi.create({
        memberId: form.memberId,
        planId,
        totalDue,
      });
      // 2. Record the payment (backend auto-bumps membership.total_paid)
      await paymentsApi.create({
        memberId: form.memberId,
        membershipId: ms.id,
        amount: payAmount,
        method: paymentMethodToApi(form.method),
        type: "membership",
        discountAmount: discountAmt || undefined,
        notes: isPaidFull ? "Full payment" : `Partial payment (${Math.round(payAmount / totalDue * 100)}%)`,
      });
      // 3. Refresh local cache from backend so all browsers see the change
      await reloadMemberships();
      setModal(null);
    } catch (err) {
      const detail = Array.isArray(err?.details) && err.details.length
        ? err.details.map((d) => d.msg || JSON.stringify(d)).join("; ")
        : "";
      setApiError([err?.message, detail].filter(Boolean).join(" – "));
    } finally {
      setBusy(false);
    }
  };

  const openPayBalance = (ms) => {
    const bal = getMembershipBalance(ms, data.payments);
    setPayTarget(ms);
    setForm((f) => ({ ...f, method: "cash", paymentAmount: String(bal.balance) }));
    setModal("pay");
  };

  const openTopUp = (ms) => {
    setPayTarget(ms);
    setForm((f) => ({ ...f, method: "cash", paymentAmount: "" }));
    setModal("topup");
  };

  const topUp = () => {
    if (!payTarget) return;
    const amount = Number(form.paymentAmount) || 0;
    if (amount <= 0) { alert("Enter a valid top-up amount."); return; }

    const newPay = {
      id: generateId(), memberId: payTarget.memberId, membershipId: payTarget.id,
      amount, method: form.method, paidAt: new Date().toISOString(),
      type: "prepaid_deposit", discountId: null, discountAmount: 0,
      note: `Pre-paid top-up: ${formatUGX(amount)} (new balance: ${formatUGX((payTarget.prepaidBalance || 0) + amount)})`,
    };

    setData((d) => ({
      ...d,
      payments: [...d.payments, newPay],
      memberships: d.memberships.map((ms) => ms.id === payTarget.id ? {
        ...ms,
        prepaidBalance: (ms.prepaidBalance || 0) + amount,
        totalDue: (ms.totalDue || 0) + amount,
        prepaidDeposits: [...(ms.prepaidDeposits || []), { amount, date: new Date().toISOString(), method: form.method }],
      } : ms),
    }));
    setModal(null);
    setPayTarget(null);
  };

  const recordPayment = async () => {
    if (!payTarget) return;
    const bal = getMembershipBalance(payTarget, data.payments);
    const payAmount = Math.min(Number(form.paymentAmount) || 0, bal.balance);
    if (payAmount <= 0) return;
    const willBeFullyPaid = payAmount >= bal.balance;
    setBusy(true);
    setApiError("");
    try {
      await paymentsApi.create({
        memberId: payTarget.memberId,
        membershipId: payTarget.id,
        amount: payAmount,
        method: paymentMethodToApi(form.method),
        type: "membership",
        notes: willBeFullyPaid
          ? "Balance cleared — fully paid"
          : `Installment payment (${formatUGX(bal.totalPaid + payAmount)} of ${formatUGX(bal.totalDue)})`,
      });
      await reloadMemberships();
      setModal(null);
      setPayTarget(null);
    } catch (err) {
      setApiError(err?.message || "Payment failed");
    } finally {
      setBusy(false);
    }
  };

  const freeze = async (ms) => {
    const daysStr = window.prompt("Freeze for how many days?", "7");
    const days = Number(daysStr);
    if (!days || days < 1 || days > 365) return;
    setApiError("");
    try {
      await membershipsApi.freeze(ms.id, days);
      await reloadMemberships();
    } catch (err) {
      alert(err?.message || "Freeze failed");
    }
  };

  const unfreeze = async (ms) => {
    setApiError("");
    try {
      await membershipsApi.unfreeze(ms.id);
      await reloadMemberships();
    } catch (err) {
      alert(err?.message || "Unfreeze failed");
    }
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
        <button className="btn btn-primary" onClick={() => { setForm({ memberId: "", plan: "gym_monthly", method: "cash", discountId: "", paymentAmount: "", paymentType: "full", depositAmount: "" }); setApiError(""); setModal("assign"); }}><Plus size={16} /> Assign Plan</button>
      </div>

      {apiError && (
        <div style={{ background: "var(--danger-dim)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "var(--radius-xs)", padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "var(--danger)", display: "flex", alignItems: "center", gap: 8 }}>
          <AlertTriangle size={14} /> {apiError}
        </div>
      )}
      {busy && (
        <div style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
          <RefreshCw size={12} style={{ animation: "spin 1s linear infinite" }} /> Syncing with database...
        </div>
      )}
      <div className="table-wrapper">
        <table>
          <thead><tr><th>Member</th><th>Plan</th><th>Start</th><th>End</th><th>Payment</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {data.memberships.filter((ms) => ms.isActive || ms.status === "frozen" || ms.status === "pending_payment").map((ms) => {
              const member = data.members.find((m) => m.id === ms.memberId);
              const exp = new Date(ms.endDate) < new Date() && ms.status !== "frozen" && ms.status !== "pending_payment";
              const bal = getMembershipBalance(ms, data.payments);
              const isPending = ms.status === "pending_payment";
              const isPrepaidMs = ms.plan === "prepaid";
              const prepaidBal = ms.prepaidBalance || 0;
              return (
                <tr key={ms.id} style={isPending ? { background: "rgba(249,115,22,0.04)" } : undefined}>
                  <td style={{ color: "var(--text)", fontWeight: 500 }}>{fullName(member)}</td>
                  <td>{getPlanName(ms.plan)}{isPrepaidMs && <span style={{ fontSize: 10, color: "var(--accent)", marginLeft: 4 }}>(Pre-Paid)</span>}</td>
                  <td>{formatDate(ms.startDate)}</td>
                  <td>{formatDate(ms.endDate)}</td>
                  <td>
                    {isPrepaidMs ? (
                      <div style={{ minWidth: 150 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                          <span style={{ color: "var(--text-dim)" }}>Balance</span>
                          <span style={{ fontWeight: 700, color: prepaidBal < PLANS.prepaid.dailyRate ? "var(--danger)" : prepaidBal < PLANS.prepaid.dailyRate * 3 ? "var(--warning)" : "var(--success)", fontSize: 13 }}>{formatUGX(prepaidBal)}</span>
                        </div>
                        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{Math.floor(prepaidBal / PLANS.prepaid.dailyRate)} visits left</div>
                      </div>
                    ) : bal.totalDue > 0 ? (
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
                    {isPending ? <Badge variant="warning">Pending Payment</Badge> : ms.status === "frozen" ? <Badge variant="warning">Frozen</Badge> : exp ? <Badge variant="danger">Expired</Badge> : isPrepaidMs && prepaidBal < PLANS.prepaid.dailyRate ? <Badge variant="danger">Low Balance</Badge> : <Badge variant="success">Active</Badge>}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {isPrepaidMs && ms.status === "active" && <button className="btn btn-sm btn-primary" onClick={() => openTopUp(ms)}><Plus size={12} /> Top Up</button>}
                      {!isPrepaidMs && isPending && <button className="btn btn-sm btn-primary" onClick={() => openPayBalance(ms)}><DollarSign size={12} /> Pay Balance</button>}
                      {!isPrepaidMs && !isPending && !bal.isPaidInFull && ms.status === "active" && <button className="btn btn-sm btn-primary" onClick={() => openPayBalance(ms)}><DollarSign size={12} /> Pay Balance</button>}
                      {isAdmin && !isPrepaidMs && ms.status === "active" && !exp && <button className="btn btn-sm btn-secondary" onClick={() => freeze(ms)}><Pause size={12} /> Freeze</button>}
                      {isAdmin && ms.status === "frozen" && <button className="btn btn-sm btn-secondary" onClick={() => unfreeze(ms)}><Play size={12} /> Unfreeze</button>}
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
                {data.members.filter((m) => m.isActive).map((m) => <option key={m.id} value={m.id}>{fullName(m)} ({m.phone})</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Plan</label>
              <select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value, paymentType: e.target.value === "prepaid" ? "full" : form.paymentType })}>
                <optgroup label="Gym Only">
                  {Object.entries(PLANS).filter(([, v]) => v.category === "gym").map(([k, v]) => <option key={k} value={k}>{v.name} — {formatUGX(v.price)}</option>)}
                </optgroup>
                <optgroup label="Gym + Steam Combined">
                  {Object.entries(PLANS).filter(([, v]) => v.category === "combo").map(([k, v]) => <option key={k} value={k}>{v.name} — {formatUGX(v.price)}</option>)}
                </optgroup>
                <optgroup label="Group Plans (per month)">
                  {Object.entries(GROUP_PLANS).map(([k, v]) => <option key={k} value={k}>{v.name} — {formatUGX(v.price)} ({formatUGX(v.perPerson)}/person)</option>)}
                </optgroup>
                <optgroup label="Pre-Paid (Pay-as-you-go)">
                  <option value="prepaid">Pre-Paid Balance — variable deposit, deducts UGX {(PLANS.prepaid.dailyRate).toLocaleString()}/visit</option>
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

            {/* PAYMENT TYPE TOGGLE — hidden for prepaid (always deposit) */}
            {form.plan !== "prepaid" && (
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
            )}

            {/* DEPOSIT AMOUNT for prepaid */}
            {form.plan === "prepaid" && (
              <div className="form-group full">
                <label>Deposit Amount (UGX) *</label>
                <input type="number" value={form.depositAmount} onChange={(e) => setForm({ ...form, depositAmount: e.target.value })} placeholder="e.g. 200000" />
                <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                  Each gym visit will deduct UGX {PLANS.prepaid.dailyRate.toLocaleString()} from this balance. Member is checked in as long as balance ≥ UGX {PLANS.prepaid.dailyRate.toLocaleString()}.
                </p>
                {form.depositAmount && Number(form.depositAmount) >= PLANS.prepaid.dailyRate && (
                  <p style={{ fontSize: 11, color: "var(--success)", marginTop: 4 }}>
                    ✓ Covers approximately {Math.floor(Number(form.depositAmount) / PLANS.prepaid.dailyRate)} visit{Math.floor(Number(form.depositAmount) / PLANS.prepaid.dailyRate) !== 1 ? "s" : ""}
                  </p>
                )}
              </div>
            )}

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
              // PREPAID SUMMARY
              if (form.plan === "prepaid") {
                const deposit = Number(form.depositAmount) || 0;
                const visits = deposit >= PLANS.prepaid.dailyRate ? Math.floor(deposit / PLANS.prepaid.dailyRate) : 0;
                return (
                  <div style={{ marginTop: 16, padding: 16, background: "var(--bg-elevated)", borderRadius: "var(--radius-sm)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 13, color: "var(--text-dim)" }}>Plan</span>
                      <strong style={{ color: "var(--text)" }}>{PLANS.prepaid.name}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 13, color: "var(--text-dim)" }}>Daily Rate</span>
                      <strong style={{ color: "var(--text)" }}>{formatUGX(PLANS.prepaid.dailyRate)}/visit</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 13, color: "var(--text-dim)" }}>Validity</span>
                      <strong style={{ color: "var(--text)" }}>{PLANS.prepaid.days} days</strong>
                    </div>
                    <div style={{ borderTop: "1px solid var(--border)", marginTop: 8, paddingTop: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Deposit</span>
                        <span style={{ fontSize: 16, fontWeight: 700, color: "var(--accent)" }}>{formatUGX(deposit)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 13, color: "var(--success)" }}>Covers</span>
                        <span style={{ fontWeight: 600, color: "var(--success)" }}>{visits} visit{visits !== 1 ? "s" : ""}</span>
                      </div>
                    </div>
                  </div>
                );
              }

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
                <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>{fullName(member)}</h3>
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

      {/* TOP-UP PRE-PAID BALANCE MODAL */}
      {modal === "topup" && payTarget && (
        (() => {
          const member = data.members.find((m) => m.id === payTarget.memberId);
          const currentBal = payTarget.prepaidBalance || 0;
          const topUpAmount = Number(form.paymentAmount) || 0;
          const newBal = currentBal + topUpAmount;
          return (
            <Modal title="Top Up Pre-Paid Balance" onClose={() => { setModal(null); setPayTarget(null); }} footer={
              <>
                <button className="btn btn-secondary" onClick={() => { setModal(null); setPayTarget(null); }}>Cancel</button>
                <button className="btn btn-primary" onClick={topUp} disabled={!topUpAmount || topUpAmount <= 0}><Plus size={14} /> Top Up {topUpAmount > 0 ? formatUGX(topUpAmount) : ""}</button>
              </>
            }>
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>{fullName(member)}</h3>
                <p style={{ color: "var(--text-dim)", marginTop: 2 }}>Pre-Paid Balance Account</p>
              </div>

              <div style={{ background: "var(--accent-dim)", border: "1px solid var(--accent)", borderRadius: "var(--radius-sm)", padding: 16, marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "var(--text-dim)", fontSize: 13 }}>Current Balance</span>
                  <span style={{ fontSize: 20, fontWeight: 700, color: "var(--accent)", fontFamily: "var(--font-display)" }}>{formatUGX(currentBal)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 12, color: "var(--text-muted)" }}>
                  <span>Visits remaining</span>
                  <span style={{ fontWeight: 600 }}>{Math.floor(currentBal / PLANS.prepaid.dailyRate)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2, fontSize: 12, color: "var(--text-muted)" }}>
                  <span>Daily rate</span>
                  <span>{formatUGX(PLANS.prepaid.dailyRate)}/visit</span>
                </div>
              </div>

              <div className="form-group">
                <label>Top-up Amount (UGX) *</label>
                <input type="number" value={form.paymentAmount} onChange={(e) => setForm({ ...form, paymentAmount: e.target.value })} placeholder="e.g. 100000" autoFocus />
              </div>

              <div className="form-group">
                <label>Payment Method</label>
                <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                  <option value="cash">Cash</option><option value="mobile_money">Mobile Money</option><option value="card">Card</option>
                </select>
              </div>

              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => setForm({ ...form, paymentAmount: "20000" })} style={{ padding: "4px 10px" }}>+20k</button>
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => setForm({ ...form, paymentAmount: "50000" })} style={{ padding: "4px 10px" }}>+50k</button>
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => setForm({ ...form, paymentAmount: "100000" })} style={{ padding: "4px 10px" }}>+100k</button>
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => setForm({ ...form, paymentAmount: "200000" })} style={{ padding: "4px 10px" }}>+200k</button>
              </div>

              {topUpAmount > 0 && (
                <div style={{ marginTop: 16, padding: 12, background: "var(--success-dim)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "var(--radius-sm)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ color: "var(--text-dim)" }}>After top-up</span>
                    <span style={{ fontWeight: 700, color: "var(--success)", fontSize: 16 }}>{formatUGX(newBal)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 4 }}>
                    <span style={{ color: "var(--text-muted)" }}>Visits covered</span>
                    <span style={{ color: "var(--success)", fontWeight: 600 }}>{Math.floor(newBal / PLANS.prepaid.dailyRate)} visits</span>
                  </div>
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
                  <td style={{ color: "var(--text)", fontWeight: 500 }}>{member ? fullName(member) : "—"}</td>
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
const WalkIns = ({ data, setData, currentUser }) => {
  const ACTIVITIES = (data?.activities && data.activities.length) ? data.activities : ACTIVITIES_SEED;
  const [modal, setModal] = useState(null); // 'add' | 'edit' | null
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "", emergency: "", emergency2: "", selectedActivities: [], paymentMethod: "cash", paymentStatus: "paid" });
  const [editTarget, setEditTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState("");
  const isAdmin = currentUser?.role === "admin";

  const reload = useCallback(async () => {
    try {
      const res = await walkInsApi.list({ limit: 500 });
      setData((d) => ({ ...d, walkIns: (res?.data || []).map(adaptWalkIn) }));
    } catch (err) {
      setApiError(err?.message || "Failed to load walk-ins");
    }
  }, [setData]);
  useEffect(() => { reload(); }, [reload]);

  const walkinTotal = (activities) => {
    const prices = activities.map((actId) => ACTIVITIES.find((a) => a.id === actId)?.standalone || 0);
    const sum = prices.reduce((s, p) => s + p, 0);
    return activities.length > 1 ? sum - 10000 : sum;
  };

  const save = async () => {
    if (!form.firstName || !form.lastName || !form.phone) { alert("Please fill in Surname, Other Name(s), and Phone."); return; }
    if (!form.emergency) { alert("Emergency Contact 1 is required."); return; }
    if (form.selectedActivities.length === 0) { alert("Please select at least one activity."); return; }
    if (!form.paymentMethod) { alert("Please select a payment method."); return; }

    const total = walkinTotal(form.selectedActivities);
    const actNames = form.selectedActivities.map((id) => ACTIVITIES.find((a) => a.id === id)?.name).join(" + ");

    setBusy(true);
    setApiError("");
    try {
      const wi = await walkInsApi.create({
        fullName: `${form.firstName} ${form.lastName}`.trim(),
        phone: form.phone,
        visitDate: today(),
        amount: total,
        paymentStatus: form.paymentStatus,
        notes: form.selectedActivities.length > 1
          ? `Bundle: ${actNames} (UGX 10,000 discount)`
          : actNames,
      });
      // Record matching payment if paid
      if (form.paymentStatus === "paid") {
        try {
          await paymentsApi.create({
            amount: total,
            method: paymentMethodToApi(form.paymentMethod),
            type: "walk_in",
            notes: `Walk-in: ${form.firstName} ${form.lastName} — ${actNames}`,
          });
        } catch (e) {
          console.warn("Walk-in saved but payment record failed:", e);
        }
      }
      await reload();
      setModal(null);
    } catch (err) {
      setApiError(err?.message || "Failed to save walk-in");
    } finally {
      setBusy(false);
    }
  };

  const updateWalkIn = async () => {
    if (!editTarget) return;
    try {
      await walkInsApi.update(editTarget.id, {
        fullName: editTarget.name || `${editTarget.firstName || ""} ${editTarget.lastName || ""}`.trim(),
        phone: editTarget.phone,
        amount: editTarget.amountDue,
        paymentStatus: editTarget.paymentStatus,
        notes: editTarget.note,
      });
      await reload();
      setEditTarget(null);
      setModal(null);
    } catch (err) {
      alert(err?.message || "Failed to update walk-in");
    }
  };

  const markPaid = async (w) => {
    const total = w.amountDue || w.amount || 0;
    try {
      await walkInsApi.update(w.id, { paymentStatus: "paid" });
      await paymentsApi.create({
        amount: total,
        method: paymentMethodToApi(w.paymentMethod || "cash"),
        type: "walk_in",
        notes: `Walk-in payment: ${w.name || w.firstName || ""}`,
      });
      await reload();
    } catch (err) {
      alert(err?.message || "Failed to mark paid");
    }
  };

  const checkInGuest = async (w) => {
    if (w.paymentStatus !== "paid") { alert("Payment must be completed before check-in."); return; }
    try {
      await walkInsApi.checkIn(w.id);
      await reload();
    } catch (err) {
      alert(err?.message || "Failed to check in walk-in");
      return;
    }
  };

  const toggleActivity = (actId) => {
    setForm((f) => {
      const current = f.selectedActivities;
      if (current.includes(actId)) return { ...f, selectedActivities: current.filter((x) => x !== actId) };
      if (current.length >= MAX_ACTIVITIES) return f;
      return { ...f, selectedActivities: [...current, actId] };
    });
  };

  return (
    <div>
      <div className="page-header"><h2>Walk-In Guests</h2><p>Record, pay, and check in one-off guest visits</p></div>
      <div className="toolbar">
        <div />
        <button className="btn btn-primary" onClick={() => { setForm({ firstName: "", lastName: "", phone: "", emergency: "", emergency2: "", selectedActivities: [], paymentMethod: "cash", paymentStatus: "paid" }); setModal("add"); }}><Plus size={16} /> Record Walk-In</button>
      </div>
      <div className="table-wrapper">
        <table>
          <thead><tr><th>Date</th><th>Surname</th><th>Other Name(s)</th><th>Phone</th><th>Activity</th><th>Amount</th><th>Payment</th><th>Check-In</th>{isAdmin && <th>Actions</th>}</tr></thead>
          <tbody>
            {[...data.walkIns].reverse().map((w) => (
              <tr key={w.id}>
                <td>{formatDate(w.visitDate)}</td>
                <td style={{ color: "var(--text)", fontWeight: 500 }}>{w.lastName || w.name}</td>
                <td style={{ color: "var(--text)" }}>{w.firstName || ""}</td>
                <td>{w.phone}</td>
                <td style={{ fontSize: 12 }}>{w.activities ? w.activities.map((id) => ACTIVITIES.find((a) => a.id === id)?.name || id).join(", ") : ACTIVITIES.find((a) => a.id === w.activityId)?.name || w.activityId}</td>
                <td style={{ fontWeight: 600, color: "var(--accent)" }}>{formatUGX(w.amountDue || w.amountPaid)}</td>
                <td>
                  {(w.paymentStatus === "paid" || !w.paymentStatus) ? (
                    <Badge variant="success">Paid</Badge>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <Badge variant="warning">Pending</Badge>
                      <button className="btn btn-sm btn-success" onClick={() => markPaid(w)} style={{ padding: "3px 8px", fontSize: 11 }}>Pay Now</button>
                    </div>
                  )}
                </td>
                <td>
                  {w.checkedIn ? (
                    <Badge variant="success">In {w.checkInTime ? formatTime(w.checkInTime) : ""}</Badge>
                  ) : (w.paymentStatus === "paid" || !w.paymentStatus) ? (
                    <button className="btn btn-sm btn-primary" onClick={() => checkInGuest(w)} style={{ padding: "4px 10px", fontSize: 11 }}><LogIn size={12} /> Check In</button>
                  ) : (
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Pay first</span>
                  )}
                </td>
                {isAdmin && (
                  <td>
                    <button className="btn btn-icon btn-secondary" onClick={() => { setEditTarget({ ...w }); setModal("edit"); }}><Edit2 size={14} /></button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ADD WALK-IN MODAL */}
      {modal === "add" && (
        <Modal title="Record Walk-In" onClose={() => setModal(null)} footer={<><button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={form.selectedActivities.length === 0}><Check size={14} /> Save</button></>}>
          <div className="form-grid">
            <div className="form-group"><label>Surname *</label><input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="e.g. Kamya" /></div>
            <div className="form-group"><label>Other Name(s) *</label><input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="e.g. John" /></div>
            <div className="form-group"><label>Phone *</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="e.g. 0771234567" /></div>
            <div className="form-group"><label>Emergency Contact 1 *</label><input value={form.emergency} onChange={(e) => setForm({ ...form, emergency: e.target.value })} placeholder="e.g. 0701111222" /></div>
            <div className="form-group"><label>Emergency Contact 2</label><input value={form.emergency2} onChange={(e) => setForm({ ...form, emergency2: e.target.value })} placeholder="Optional" /></div>
            <div className="form-group"><label>Payment Method *</label>
              <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
                <option value="cash">Cash</option><option value="mobile_money">Mobile Money</option><option value="card">Card</option>
              </select>
            </div>
            <div className="form-group"><label>Payment Status *</label>
              <select value={form.paymentStatus} onChange={(e) => setForm({ ...form, paymentStatus: e.target.value })}>
                <option value="paid">Paid Now</option><option value="pending">Pending (Pay Later)</option>
              </select>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Activities * <span style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "none" }}>— select 1 or 2</span></label>
              <span style={{ fontSize: 11, color: form.selectedActivities.length >= MAX_ACTIVITIES ? "var(--warning)" : "var(--text-muted)" }}>
                {form.selectedActivities.length}/{MAX_ACTIVITIES} selected
              </span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {ACTIVITIES.map((act) => {
                const isSelected = form.selectedActivities.includes(act.id);
                const isDisabled = !isSelected && form.selectedActivities.length >= MAX_ACTIVITIES;
                return (
                  <button key={act.id} type="button" className={`btn btn-sm ${isSelected ? "btn-primary" : "btn-secondary"}`}
                    style={isDisabled ? { opacity: 0.4, cursor: "not-allowed" } : {}}
                    onClick={() => { if (!isDisabled) toggleActivity(act.id); }}>
                    {act.name} ({formatUGX(act.standalone)})
                  </button>
                );
              })}
            </div>
            {form.selectedActivities.length > 0 && (
              <div style={{ marginTop: 12, padding: 12, background: "var(--bg-elevated)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                {form.selectedActivities.map((actId) => {
                  const act = ACTIVITIES.find((a) => a.id === actId);
                  return (<div key={actId} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", color: "var(--text-dim)" }}><span>{act.name}</span><span>{formatUGX(act.standalone)}</span></div>);
                })}
                {form.selectedActivities.length > 1 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", color: "var(--success)", borderTop: "1px dashed var(--border)", marginTop: 4, paddingTop: 6 }}><span>Bundle Discount</span><span>-{formatUGX(10000)}</span></div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700, color: "var(--accent)", borderTop: "1px solid var(--border)", marginTop: 6, paddingTop: 6 }}><span>Total</span><span>{formatUGX(walkinTotal(form.selectedActivities))}</span></div>
                {form.paymentStatus === "pending" && <p style={{ fontSize: 11, color: "var(--warning)", marginTop: 6 }}>Payment pending — guest cannot check in until paid.</p>}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* EDIT WALK-IN MODAL (Admin only) */}
      {modal === "edit" && editTarget && isAdmin && (
        <Modal title="Edit Walk-In Record" onClose={() => { setModal(null); setEditTarget(null); }} footer={<><button className="btn btn-secondary" onClick={() => { setModal(null); setEditTarget(null); }}>Cancel</button><button className="btn btn-primary" onClick={updateWalkIn}><Check size={14} /> Save Changes</button></>}>
          <div className="form-grid">
            <div className="form-group"><label>Surname</label><input value={editTarget.lastName || ""} onChange={(e) => setEditTarget({ ...editTarget, lastName: e.target.value })} /></div>
            <div className="form-group"><label>Other Name(s)</label><input value={editTarget.firstName || ""} onChange={(e) => setEditTarget({ ...editTarget, firstName: e.target.value })} /></div>
            <div className="form-group"><label>Phone</label><input value={editTarget.phone || ""} onChange={(e) => setEditTarget({ ...editTarget, phone: e.target.value })} /></div>
            <div className="form-group"><label>Payment Method</label>
              <select value={editTarget.paymentMethod || "cash"} onChange={(e) => setEditTarget({ ...editTarget, paymentMethod: e.target.value })}>
                <option value="cash">Cash</option><option value="mobile_money">Mobile Money</option><option value="card">Card</option>
              </select>
            </div>
            <div className="form-group"><label>Payment Status</label>
              <select value={editTarget.paymentStatus || "paid"} onChange={(e) => setEditTarget({ ...editTarget, paymentStatus: e.target.value })}>
                <option value="paid">Paid</option><option value="pending">Pending</option>
              </select>
            </div>
            <div className="form-group"><label>Amount</label><input type="number" value={editTarget.amountDue || editTarget.amountPaid || 0} onChange={(e) => setEditTarget({ ...editTarget, amountDue: Number(e.target.value), amountPaid: editTarget.paymentStatus === "paid" ? Number(e.target.value) : 0 })} /></div>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ─── ATTENDANCE ─────────────────────────────────────────────
const Attendance = ({ data, setData }) => {
  const ACTIVITIES = (data?.activities && data.activities.length) ? data.activities : ACTIVITIES_SEED;

  // ── Filters ──
  const [from, setFrom]         = useState("");      // ISO date string YYYY-MM-DD
  const [to, setTo]             = useState("");
  const [nameQuery, setNameQuery] = useState("");
  const [gender, setGender]     = useState("all");   // all | Male | Female | Other
  const [activityId, setActivityId] = useState("all"); // all | <activity id>
  const [planCode, setPlanCode] = useState("all");   // all | <plan code>
  const [source, setSource]     = useState("all");   // all | staff | self | walkin

  const resetFilters = () => {
    setFrom(""); setTo(""); setNameQuery("");
    setGender("all"); setActivityId("all"); setPlanCode("all"); setSource("all");
  };

  // Helpers — look up the member's currently-active membership to know their plan/code.
  const memberActivePlan = (memberId) => {
    if (!memberId) return null;
    const ms = (data.memberships || []).find(
      (m) => m.memberId === memberId && (m.isActive || m.status === "active" || m.status === "frozen")
    );
    return ms ? (ms.plan || ms.planCode) : null;
  };

  const filtered = [...(data.attendance || [])]
    .filter((a) => {
      const date = a.date || (a.checkIn ? a.checkIn.slice(0, 10) : "");
      if (from && date < from) return false;
      if (to   && date > to)   return false;
      if (source !== "all" && (a.source || "staff") !== source) return false;
      if (activityId !== "all" && a.activityId !== activityId) return false;

      const member = a.memberId ? data.members.find((m) => m.id === a.memberId) : null;

      // Name filter — matches member full name, guest name, or phone
      if (nameQuery) {
        const q = nameQuery.toLowerCase();
        const memberName = member ? fullName(member).toLowerCase() : "";
        const guest = (a.guestName || "").toLowerCase();
        const phone = (member?.phone || "").toLowerCase();
        if (!memberName.includes(q) && !guest.includes(q) && !phone.includes(q)) return false;
      }

      if (gender !== "all") {
        if (!member || (member.gender || "") !== gender) return false;
      }

      if (planCode !== "all") {
        const plan = memberActivePlan(a.memberId);
        if (plan !== planCode) return false;
      }

      return true;
    })
    .sort((a, b) => new Date(b.checkIn) - new Date(a.checkIn));

  // Build the plan dropdown from whatever's loaded (backend plans → fallback to PLANS const)
  const planOptions = (data.plans && data.plans.length)
    ? data.plans.map((p) => ({ value: p.code, label: `${p.name} (${formatUGX(Number(p.price))})` }))
    : Object.entries(PLANS).map(([k, v]) => ({ value: k, label: v.name }));

  return (
    <div>
      <div className="page-header">
        <h2>Attendance Log</h2>
        <p>{filtered.length} of {(data.attendance || []).length} records</p>
      </div>

      {/* ── Filter bar ── */}
      <div className="card" style={{ marginBottom: 16, padding: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, alignItems: "end" }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: 11 }}>From date</label>
            <div style={{ position: "relative" }}>
              <Calendar size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--accent)", pointerEvents: "none" }} />
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch {} }}
                style={{ paddingLeft: 30, cursor: "pointer" }}
                title="Click to open calendar"
              />
            </div>
            {from && (
              <button onClick={() => setFrom("")} style={{ fontSize: 10, color: "var(--text-muted)", background: "none", border: "none", padding: 0, marginTop: 2, cursor: "pointer" }}>
                ✕ clear
              </button>
            )}
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: 11 }}>To date</label>
            <div style={{ position: "relative" }}>
              <Calendar size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--accent)", pointerEvents: "none" }} />
              <input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
                onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch {} }}
                style={{ paddingLeft: 30, cursor: "pointer" }}
                title="Click to open calendar"
              />
            </div>
            {to && (
              <button onClick={() => setTo("")} style={{ fontSize: 10, color: "var(--text-muted)", background: "none", border: "none", padding: 0, marginTop: 2, cursor: "pointer" }}>
                ✕ clear
              </button>
            )}
          </div>

          {/* Quick date presets */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: 11 }}>Quick range</label>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              <button className="btn btn-sm btn-secondary" style={{ padding: "4px 8px", fontSize: 11 }}
                onClick={() => { const t = today(); setFrom(t); setTo(t); }}>Today</button>
              <button className="btn btn-sm btn-secondary" style={{ padding: "4px 8px", fontSize: 11 }}
                onClick={() => {
                  const d = new Date();
                  const day = d.getDay(); // 0 = Sun
                  const monday = new Date(d); monday.setDate(d.getDate() - ((day + 6) % 7));
                  setFrom(monday.toISOString().slice(0, 10));
                  setTo(today());
                }}>This week</button>
              <button className="btn btn-sm btn-secondary" style={{ padding: "4px 8px", fontSize: 11 }}
                onClick={() => {
                  const d = new Date();
                  const first = new Date(d.getFullYear(), d.getMonth(), 1);
                  setFrom(first.toISOString().slice(0, 10));
                  setTo(today());
                }}>This month</button>
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: 11 }}>Name / phone</label>
            <input value={nameQuery} onChange={(e) => setNameQuery(e.target.value)} placeholder="search..." />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: 11 }}>Gender</label>
            <select value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="all">All</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: 11 }}>Activity</label>
            <select value={activityId} onChange={(e) => setActivityId(e.target.value)}>
              <option value="all">All activities</option>
              {ACTIVITIES.map((a) => <option key={a.id || a.code} value={a.id || a.code}>{a.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: 11 }}>Membership plan</label>
            <select value={planCode} onChange={(e) => setPlanCode(e.target.value)}>
              <option value="all">All plans</option>
              {planOptions.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: 11 }}>Source</label>
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="all">All sources</option>
              <option value="staff">Staff check-in</option>
              <option value="self">Self check-in</option>
              <option value="walkin">Walk-In</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-secondary" onClick={resetFilters} style={{ flex: 1 }}>
              <RefreshCw size={14} /> Reset
            </button>
          </div>
        </div>
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Member</th>
              <th>Gender</th>
              <th>Plan</th>
              <th>Activity</th>
              <th>Check-In</th>
              <th>Check-Out</th>
              <th>Source</th>
              <th>Locker</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => {
              const member = a.memberId ? data.members.find((m) => m.id === a.memberId) : null;
              const planCode = memberActivePlan(a.memberId);
              const planLabel = planCode ? getPlanName(planCode) : "—";

              // Activity — backend stores UUID, our adapter exposes both .uuid and .id (code).
              const act = a.activityId
                ? ACTIVITIES.find((x) => x.uuid === a.activityId || x.id === a.activityId || x.code === a.activityId)
                : null;
              const activityLabel = act ? act.name : (a.activityId ? "Unknown" : "—");

              // Locker — look up by ID from data.lockers to get the number + section.
              const lockerObj = a.lockerId ? data.lockers.find((l) => l.id === a.lockerId) : null;
              const lockerNum = lockerObj?.number ?? a.locker;
              const lockerSection = lockerObj?.section ?? a.lockerSection;

              return (
                <tr key={a.id}>
                  <td>{formatDate(a.date)}</td>
                  <td style={{ color: "var(--text)", fontWeight: 500 }}>{member ? fullName(member) : a.guestName || "Guest"}</td>
                  <td>{member?.gender || "—"}</td>
                  <td style={{ fontSize: 12 }}>{planLabel}</td>
                  <td style={{ fontSize: 12 }}>{activityLabel}</td>
                  <td>{formatTime(a.checkIn)}</td>
                  <td>{a.checkOut ? formatTime(a.checkOut) : <button className="btn btn-sm btn-secondary" onClick={async () => {
                    try {
                      await attendanceApi.checkOut(a.id);
                      const [attRes, lockRes] = await Promise.all([
                        attendanceApi.list({ limit: 500 }),
                        lockersApi.list({ limit: 200 }),
                      ]);
                      setData((d) => ({
                        ...d,
                        attendance: (attRes?.data || []).map(adaptAttendance),
                        lockers: (lockRes?.data || []).map(adaptLocker),
                      }));
                    } catch (err) { alert(err?.message || "Failed to check out"); }
                  }}>Check Out</button>}</td>
                  <td><Badge variant={a.source === "walkin" ? "warning" : a.source === "self" ? "info" : "neutral"}>{a.source === "walkin" ? "Walk-In" : a.source === "self" ? "Self" : "Staff"}</Badge></td>
                  <td>
                    {lockerNum
                      ? <span style={{ color: lockerSection === "ladies" ? "#ec4899" : "#3b82f6", fontWeight: 600 }}>
                          #{lockerNum} {lockerSection === "ladies" ? "♀" : "♂"}
                        </span>
                      : "—"}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", color: "var(--text-muted)", padding: 32 }}>
                  No attendance records match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── TIMETABLE ──────────────────────────────────────────────
// Generate 30-minute time slots covering gym hours (6:00am – 9:30pm).
const TIME_SLOTS = (() => {
  const slots = [];
  for (let h = 6; h <= 21; h++) {
    for (const m of [0, 30]) {
      if (h === 21 && m > 30) break;
      const period = h >= 12 ? "pm" : "am";
      const hour12 = ((h + 11) % 12) + 1;
      slots.push(`${hour12}:${String(m).padStart(2, "0")}${period}`);
    }
  }
  return slots;
})();

// Convert "6:30pm" → minutes since midnight (for ordering and end > start checks)
const slotToMinutes = (s) => {
  if (!s) return -1;
  const m = s.match(/^(\d+):(\d+)(am|pm)$/i);
  if (!m) return -1;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const p = m[3].toLowerCase();
  if (p === "pm" && h !== 12) h += 12;
  if (p === "am" && h === 12) h = 0;
  return h * 60 + min;
};

// Parse "6:30pm – 7:30pm" → { start: "6:30pm", end: "7:30pm" }
const parseTimeRange = (str) => {
  if (!str) return { start: "6:30pm", end: "7:30pm" };
  // Handle both en-dash, em-dash, and hyphen
  const parts = str.split(/\s*[–—-]\s*/);
  return {
    start: (parts[0] || "6:30pm").trim().toLowerCase().replace(/\s+/g, ""),
    end:   (parts[1] || "7:30pm").trim().toLowerCase().replace(/\s+/g, ""),
  };
};

const TimetablePage = ({ data, setData, currentUser }) => {
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ day: "Mon", class: "Spinning", startTime: "6:30pm", endTime: "7:30pm" });
  const [current, setCurrent] = useState(null);
  const isAdmin = currentUser?.role === "admin";
  const colors = ["#f59e0b", "#3b82f6", "#22c55e", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4"];

  const save = () => {
    if (!form.class || !form.day || !form.startTime || !form.endTime) return;
    if (slotToMinutes(form.endTime) <= slotToMinutes(form.startTime)) {
      alert("End time must be after start time.");
      return;
    }
    const time = `${form.startTime} – ${form.endTime}`;
    const payload = { day: form.day, class: form.class, time };
    if (modal === "add") {
      setData((d) => ({ ...d, timetable: [...d.timetable, { ...payload, id: generateId() }] }));
    } else if (modal === "edit" && current) {
      setData((d) => ({ ...d, timetable: d.timetable.map((t) => t.id === current.id ? { ...t, ...payload } : t) }));
    }
    setModal(null);
  };

  const deleteClass = (id) => {
    if (confirm("Delete this class from the timetable?")) {
      setData((d) => ({ ...d, timetable: d.timetable.filter((t) => t.id !== id) }));
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>Class Timetable</h2>
        <p>Weekly schedule • Mon–Sat: 6:30am – 9:00pm | Sun: 8:00am – 9:00pm</p>
      </div>

      {isAdmin && (
        <div className="toolbar">
          <div />
          <button className="btn btn-primary" onClick={() => { setForm({ day: "Mon", class: "Spinning", startTime: "6:30pm", endTime: "7:30pm" }); setModal("add"); }}><Plus size={16} /> Add Class</button>
        </div>
      )}

      <div className="timetable-grid">
        {(data.timetable || []).map((t, i) => (
          <div key={t.id} className="timetable-slot" style={{ borderLeftColor: colors[i % colors.length], position: "relative" }}>
            <div className="slot-day" style={{ color: colors[i % colors.length] }}>{t.day}</div>
            <div className="slot-class">{t.class}</div>
            <div className="slot-time">{t.time}</div>
            {isAdmin && (
              <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 4 }}>
                <button className="btn btn-icon btn-sm" style={{ padding: 4, background: "rgba(59,130,246,0.1)", color: "var(--info)" }}
                  onClick={() => { setCurrent(t); const { start, end } = parseTimeRange(t.time); setForm({ day: t.day, class: t.class, startTime: start, endTime: end }); setModal("edit"); }} title="Edit">
                  <Edit2 size={12} />
                </button>
                <button className="btn btn-icon btn-sm" style={{ padding: 4, background: "rgba(239,68,68,0.1)", color: "var(--danger)" }}
                  onClick={() => deleteClass(t.id)} title="Delete">
                  <Trash2 size={12} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ADD/EDIT MODAL — admin only */}
      {modal && isAdmin && (
        <Modal title={modal === "add" ? "Add Class" : "Edit Class"} onClose={() => setModal(null)} footer={
          <>
            <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={save}>Save</button>
          </>
        }>
          <div className="form-grid">
            <div className="form-group"><label>Day *</label>
              <select value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })}>
                <option>Mon</option><option>Tue</option><option>Wed</option><option>Thu</option><option>Fri</option><option>Sat</option><option>Sun</option>
              </select>
            </div>
            <div className="form-group"><label>Class Name *</label>
              <select value={form.class} onChange={(e) => setForm({ ...form, class: e.target.value })}>
                {ACTIVITIES.filter((a) => !["daily", "steam", "massage"].includes(a.id)).map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Start Time *</label>
              <select value={form.startTime} onChange={(e) => {
                const newStart = e.target.value;
                // If new start is at/after end, push end forward by 1 slot.
                setForm((f) => {
                  const startMin = slotToMinutes(newStart);
                  const endMin = slotToMinutes(f.endTime);
                  if (endMin <= startMin) {
                    const idx = TIME_SLOTS.indexOf(newStart);
                    const nextEnd = TIME_SLOTS[Math.min(idx + 2, TIME_SLOTS.length - 1)];
                    return { ...f, startTime: newStart, endTime: nextEnd };
                  }
                  return { ...f, startTime: newStart };
                });
              }}>
                {TIME_SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>End Time *</label>
              <select value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })}>
                {TIME_SLOTS
                  .filter((s) => slotToMinutes(s) > slotToMinutes(form.startTime))
                  .map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group full" style={{ marginTop: -4 }}>
              <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
                Preview: <strong style={{ color: "var(--accent)" }}>{form.startTime} – {form.endTime}</strong>
              </p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ─── TRAINERS ───────────────────────────────────────────────
const TRAINER_TERMS = `GYM TRAINER TERMS & CONDITIONS (ACCOUNT CREATION)

1. ACCEPTANCE OF TERMS
By creating a trainer account on the Gym Management System, you acknowledge that you have read, understood, and agreed to comply with all operational, professional, and safety requirements outlined herein.

2. WORK SCHEDULE & ATTENDANCE
You agree to:
• Report for duty at least 15–30 minutes before your scheduled shift
• Be punctual, available, and prepared for all assigned sessions
• Notify management in advance of any schedule changes or absences

3. GYM FLOOR RESPONSIBILITIES
You are responsible for:
• Inspecting gym equipment and training areas before sessions
• Ensuring cleanliness, order, and safety of the gym floor
• Preparing workout plans and reviewing scheduled sessions in advance

4. MEMBER ENGAGEMENT & CONDUCT
You agree to:
• Treat all members with professionalism, respect, and courtesy
• Provide assistance to members, especially new clients
• Correct exercise techniques safely and respectfully
• Maintain a positive, motivating, and inclusive environment

5. TRAINING SERVICES
As a trainer, you shall:
• Conduct fitness assessments for assigned clients
• Develop personalized training programs based on client goals
• Demonstrate exercises clearly and supervise execution
• Monitor client safety, posture, and training intensity
• Track and document client progress where required

6. SAFETY & RISK MANAGEMENT
You agree to:
• Enforce proper and safe use of all gym equipment
• Immediately report any faulty or damaged equipment
• Respond promptly and appropriately to injuries or emergencies
• Adhere to all gym safety policies and procedures

7. CLEANLINESS & EQUIPMENT HANDLING
You are required to:
• Maintain cleanliness of training areas at all times
• Re-rack weights and organize equipment after use
• Promote and enforce gym hygiene standards among members

8. COMMUNICATION & REPORTING
You agree to:
• Maintain accurate records of client sessions and attendance
• Report client concerns, incidents, or progress to management
• Communicate clearly with management and other staff regarding schedules and operations

9. PROFESSIONAL CONDUCT
You agree to:
• Maintain a professional appearance and behavior at all times
• Avoid personal phone use during active duty unless necessary
• Respect confidentiality of client and gym information
• Work collaboratively with other staff to enhance member experience

10. SYSTEM USAGE & DATA INTEGRITY
By using the system, you agree to:
• Accurately record all client sessions, attendance, and notes
• Not manipulate, falsify, or misuse system data
• Protect your login credentials and prevent unauthorized access

11. COMPLIANCE & DISCIPLINARY ACTION
Failure to comply with these terms may result in:
• Account suspension or termination
• Disciplinary action in accordance with gym policies
• Revocation of trainer privileges within the system

12. TRAINER DECLARATION (MANDATORY ACCEPTANCE)
By selecting "I Agree", you confirm that:
• You have read and understood all the terms and conditions
• You agree to comply with all gym rules, policies, and procedures
• You accept responsibility for your professional conduct and duties
• You acknowledge the inherent risks associated with gym activities and training environments`;

const Trainers = ({ data, setData }) => {
  const [modal, setModal] = useState(null); // 'add' | 'edit' | 'view' | 'terms' | null
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "", email: "", gender: "Male", dob: "", nationalId: "", emergency: "", emergency2: "", specialisation: "", photo: null });
  const [current, setCurrent] = useState(null);
  const [termsAccepted1, setTermsAccepted1] = useState(false);
  const [termsAccepted2, setTermsAccepted2] = useState(false);
  const [termsScrolled, setTermsScrolled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState("");
  const trainerTermsRef = useRef(null);

  // Refresh from backend (mirror into shared `data.trainers` so other tabs see it)
  const reload = useCallback(async () => {
    setBusy(true);
    setApiError("");
    try {
      const res = await trainersApi.list({ limit: 200 });
      setData((d) => ({ ...d, trainers: (res?.data || []).map(adaptTrainer) }));
    } catch (err) {
      setApiError(err?.message || "Failed to load trainers");
    } finally {
      setBusy(false);
    }
  }, [setData]);

  useEffect(() => { reload(); }, [reload]);

  const handleTrainerTermsScroll = () => {
    if (trainerTermsRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = trainerTermsRef.current;
      if (scrollTop + clientHeight >= scrollHeight - 20) setTermsScrolled(true);
    }
  };

  const validateAndShowTerms = () => {
    if (!form.firstName || !form.lastName || !form.phone) { alert("Please fill in Surname, Other Name(s), and Phone."); return; }
    if (!form.nationalId || form.nationalId.length !== 14) { alert("National ID (NIN) is required and must be exactly 14 characters." + (form.nationalId ? " Currently: " + form.nationalId.length + " characters." : "")); return; }
    if (!form.dob) { alert("Date of Birth is required."); return; }
    if (!form.emergency) { alert("Emergency Contact 1 is required."); return; }
    if (!form.specialisation) { alert("Specialisation is required."); return; }
    setTermsAccepted1(false); setTermsAccepted2(false); setTermsScrolled(false);
    setModal("terms");
  };

  const save = async () => {
    setBusy(true);
    setApiError("");
    try {
      const payload = trainerFormToApi(form);
      if (modal === "add" || modal === "terms") {
        await trainersApi.create(payload);
      } else if (current) {
        await trainersApi.update(current.id, payload);
      }
      await reload();
      setModal(null);
    } catch (err) {
      const detail = Array.isArray(err?.details) && err.details.length
        ? err.details.map((d) => d.msg || JSON.stringify(d)).join("; ")
        : "";
      setApiError([err?.message, detail].filter(Boolean).join(" – "));
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (t) => {
    try {
      await trainersApi.update(t.id, { isActive: !t.isActive });
      await reload();
    } catch (err) {
      alert(err?.message || "Failed to update trainer status");
    }
  };

  const openAdd = () => {
    setForm({ firstName: "", lastName: "", phone: "", email: "", gender: "Male", dob: "", nationalId: "", emergency: "", emergency2: "", specialisation: "", photo: null });
    setApiError("");
    setModal("add");
  };

  const openEdit = (t) => { setCurrent(t); setForm({ ...t, emergency: t.emergency || "", emergency2: t.emergency2 || "" }); setApiError(""); setModal("edit"); };
  const openView = (t) => { setCurrent(t); setModal("view"); };

  return (
    <div>
      <div className="page-header"><h2>Trainers</h2><p>Manage trainer profiles and assignments</p></div>
      <div className="toolbar">
        <div />
        <button className="btn btn-primary" onClick={openAdd}><Plus size={16} /> Add Trainer</button>
      </div>

      {apiError && (
        <div style={{ background: "var(--danger-dim)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "var(--radius-xs)", padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "var(--danger)", display: "flex", alignItems: "center", gap: 8 }}>
          <AlertTriangle size={14} /> {apiError}
        </div>
      )}
      {busy && (
        <div style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
          <RefreshCw size={12} style={{ animation: "spin 1s linear infinite" }} /> Syncing with database...
        </div>
      )}

      <div className="table-wrapper">
        <table>
          <thead><tr><th>Surname</th><th>Other Name(s)</th><th>Phone</th><th>NIN</th><th>Specialisation</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {data.trainers.map((t) => (
              <tr key={t.id}>
                <td style={{ color: "var(--text)", fontWeight: 500 }}>{t.lastName || t.name}</td>
                <td style={{ color: "var(--text)" }}>{t.firstName || ""}</td>
                <td>{t.phone}</td>
                <td style={{ fontFamily: "monospace", fontSize: 12 }}>{t.nationalId || "—"}</td>
                <td>{t.specialisation}</td>
                <td>{t.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="danger">Inactive</Badge>}</td>
                <td>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-icon btn-secondary" onClick={() => openView(t)}><Eye size={14} /></button>
                    <button className="btn btn-icon btn-secondary" onClick={() => openEdit(t)}><Edit2 size={14} /></button>
                    <button className="btn btn-icon btn-danger" onClick={() => toggleActive(t)}>{t.isActive ? <Pause size={14} /> : <Play size={14} />}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* VIEW TRAINER PROFILE */}
      {modal === "view" && current && (
        <Modal title="Trainer Profile" onClose={() => setModal(null)}>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div style={{ width: 80, height: 80, borderRadius: "50%", overflow: "hidden", background: "var(--accent-dim)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", border: "2px solid var(--accent)" }}>
              {current.photo ? <img src={current.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 28, fontFamily: "var(--font-display)", color: "var(--accent)", fontWeight: 700 }}>{(current.firstName || current.name || "?").charAt(0)}</span>}
            </div>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: 20, marginTop: 12 }}>{current.firstName} {current.lastName}</h3>
            <p style={{ color: "var(--text-dim)" }}>{current.phone}</p>
          </div>
          <div className="form-grid">
            {[["Surname", current.lastName || "—"], ["Other Name(s)", current.firstName || "—"], ["National ID", current.nationalId || "—"], ["Email", current.email || "—"], ["Gender", current.gender || "—"], ["DOB", current.dob ? formatDate(current.dob) : "—"], ["Emergency 1", current.emergency || "—"], ["Emergency 2", current.emergency2 || "—"], ["Specialisation", current.specialisation || "—"]].map(([l, v]) => (
              <div key={l} className="form-group"><label>{l}</label><p style={{ fontSize: 14, color: "var(--text)" }}>{v}</p></div>
            ))}
          </div>
        </Modal>
      )}

      {/* ADD / EDIT TRAINER FORM */}
      {(modal === "add" || modal === "edit") && (
        <Modal title={modal === "add" ? "Add Trainer" : "Edit Trainer"} onClose={() => setModal(null)} footer={
          <>
            <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
            {modal === "add"
              ? <button className="btn btn-primary" onClick={validateAndShowTerms}><ChevronRight size={14} /> Continue to T&C</button>
              : <button className="btn btn-primary" onClick={save}><Check size={14} /> Save Changes</button>
            }
          </>
        }>
          <div className="form-grid">
            <PhotoCapture photo={form.photo} memberName={`${form.firstName} ${form.lastName}`} onCapture={(dataUrl) => setForm((f) => ({ ...f, photo: dataUrl }))} onRetake={() => setForm((f) => ({ ...f, photo: null }))} />
            <div className="form-group"><label>Surname *</label><input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="e.g. Ssemakula" /></div>
            <div className="form-group"><label>Other Name(s) *</label><input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="e.g. Mike" /></div>
            <div className="form-group"><label>Phone *</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="e.g. 0781112233" /></div>
            <div className="form-group"><label>Gender *</label><select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}><option>Male</option><option>Female</option></select></div>
            <div className="form-group full">
              <label>National ID (NIN) * <span style={{ fontSize: 10, color: "var(--text-muted)" }}>— exactly 14 characters</span></label>
              <input value={form.nationalId || ""} onChange={(e) => setForm({ ...form, nationalId: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 14) })} placeholder="e.g. CM88041200QRST" maxLength={14} style={{ fontFamily: "monospace", letterSpacing: "0.1em", fontSize: 16 }} />
              {form.nationalId && (
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                  <span style={{ fontSize: 11, color: form.nationalId.length === 14 ? "var(--success)" : "var(--warning)" }}>{form.nationalId.length === 14 ? "✓ Valid length" : `${form.nationalId.length}/14 characters`}</span>
                </div>
              )}
            </div>
            <div className="form-group"><label>Date of Birth *</label><input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} /></div>
            <div className="form-group"><label>Email</label><input value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Optional" /></div>
            <div className="form-group"><label>Emergency Contact 1 *</label><input value={form.emergency || ""} onChange={(e) => setForm({ ...form, emergency: e.target.value })} placeholder="e.g. 0781110000" /></div>
            <div className="form-group"><label>Emergency Contact 2</label><input value={form.emergency2 || ""} onChange={(e) => setForm({ ...form, emergency2: e.target.value })} placeholder="Optional" /></div>
            <div className="form-group full"><label>Specialisation *</label><input value={form.specialisation} onChange={(e) => setForm({ ...form, specialisation: e.target.value })} placeholder="e.g. Spinning, Boxing" /></div>
          </div>
        </Modal>
      )}

      {/* TRAINER TERMS & CONDITIONS MODAL */}
      {modal === "terms" && (
        <Modal title="Trainer Terms & Conditions" onClose={() => setModal("add")} footer={
          <>
            <button className="btn btn-secondary" onClick={() => setModal("add")}><ArrowLeft size={14} /> Back to Form</button>
            <button className="btn btn-primary" onClick={save} disabled={!termsAccepted1 || !termsAccepted2} style={(!termsAccepted1 || !termsAccepted2) ? { opacity: 0.4, cursor: "not-allowed" } : {}}>
              <Check size={14} /> Accept & Register Trainer
            </button>
          </>
        }>
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 8 }}>
              Registering trainer: <strong style={{ color: "var(--text)" }}>{form.firstName} {form.lastName}</strong> — please have the trainer read through and accept the terms below.
            </p>
            {!termsScrolled && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", background: "var(--warning-dim)", borderRadius: "var(--radius-xs)", fontSize: 12, color: "var(--warning)" }}>
                <AlertTriangle size={14} /> Scroll to the bottom to enable the agreement checkboxes
              </div>
            )}
          </div>

          <div ref={trainerTermsRef} onScroll={handleTrainerTermsScroll} style={{
            maxHeight: 300, overflowY: "auto", background: "var(--bg-input)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)", padding: "20px 24px", fontSize: 13, lineHeight: 1.7,
            color: "var(--text-dim)", whiteSpace: "pre-wrap", fontFamily: "var(--font-body)",
          }}>
            {TRAINER_TERMS}
          </div>

          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px",
              background: termsAccepted1 ? "var(--success-dim)" : "var(--bg-elevated)",
              border: `1px solid ${termsAccepted1 ? "rgba(34,197,94,0.3)" : "var(--border)"}`,
              borderRadius: "var(--radius-sm)", cursor: termsScrolled ? "pointer" : "not-allowed", opacity: termsScrolled ? 1 : 0.4, transition: "all 0.2s",
            }}>
              <input type="checkbox" checked={termsAccepted1} onChange={(e) => termsScrolled && setTermsAccepted1(e.target.checked)} disabled={!termsScrolled}
                style={{ width: 18, height: 18, marginTop: 2, accentColor: "var(--success)", cursor: termsScrolled ? "pointer" : "not-allowed" }} />
              <span style={{ fontSize: 13, color: termsAccepted1 ? "var(--success)" : "var(--text)", fontWeight: 500 }}>
                I have read and agree to the Trainer Terms & Conditions
              </span>
            </label>

            <label style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px",
              background: termsAccepted2 ? "var(--success-dim)" : "var(--bg-elevated)",
              border: `1px solid ${termsAccepted2 ? "rgba(34,197,94,0.3)" : "var(--border)"}`,
              borderRadius: "var(--radius-sm)", cursor: termsScrolled ? "pointer" : "not-allowed", opacity: termsScrolled ? 1 : 0.4, transition: "all 0.2s",
            }}>
              <input type="checkbox" checked={termsAccepted2} onChange={(e) => termsScrolled && setTermsAccepted2(e.target.checked)} disabled={!termsScrolled}
                style={{ width: 18, height: 18, marginTop: 2, accentColor: "var(--success)", cursor: termsScrolled ? "pointer" : "not-allowed" }} />
              <span style={{ fontSize: 13, color: termsAccepted2 ? "var(--success)" : "var(--text)", fontWeight: 500 }}>
                I understand my responsibilities and obligations as a trainer
              </span>
            </label>

            <p style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>
              Trainer: {form.firstName} {form.lastName} • NIN: {form.nationalId} • {new Date().toLocaleDateString("en-UG")}
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ─── ACTIVITIES (admin) ─────────────────────────────────────
// Manage the catalog of classes / activities (price, status). Used for
// member check-in add-ons, walk-in pricing, and prepaid deductions.
const ActivitiesAdmin = ({ data, setData, currentUser }) => {
  const [modal, setModal] = useState(null); // 'add' | 'edit' | null
  const [form, setForm] = useState({ code: "", name: "", standalone: 20000, addon: 10000, description: "" });
  const [current, setCurrent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState("");
  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "manager";

  const reload = useCallback(async () => {
    setBusy(true);
    setApiError("");
    try {
      const res = await activitiesApi.list({ limit: 200 });
      setData((d) => ({ ...d, activities: (res?.data || []).map(adaptActivity) }));
    } catch (err) {
      setApiError(err?.message || "Failed to load activities");
    } finally {
      setBusy(false);
    }
  }, [setData]);

  useEffect(() => { reload(); }, [reload]);

  const openAdd = () => {
    setForm({ code: "", name: "", standalone: 20000, addon: 10000, description: "" });
    setCurrent(null);
    setApiError("");
    setModal("add");
  };

  const openEdit = (a) => {
    setForm({
      code: a.code || a.id || "",
      name: a.name || "",
      standalone: Number(a.standalone || 0),
      addon: Number(a.addon || 0),
      description: a.description || "",
    });
    setCurrent(a);
    setApiError("");
    setModal("edit");
  };

  const save = async () => {
    if (!form.name) { setApiError("Name is required"); return; }
    setBusy(true);
    setApiError("");
    try {
      const payload = {
        name: form.name.trim(),
        standalonePrice: Number(form.standalone) || 0,
        addonPrice: Number(form.addon) || 0,
        description: form.description?.trim() || undefined,
      };
      if (modal === "add") {
        // Auto-derive code from name if user didn't supply one
        const code = form.code?.trim() || form.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
        await activitiesApi.create({ ...payload, code });
      } else if (current?.uuid || current?.id) {
        // Use the DB UUID, not the legacy code-as-id
        await activitiesApi.update(current.uuid || current.id, payload);
      }
      await reload();
      setModal(null);
    } catch (err) {
      const detail = Array.isArray(err?.details) && err.details.length
        ? err.details.map((d) => d.msg || JSON.stringify(d)).join("; ")
        : "";
      setApiError([err?.message, detail].filter(Boolean).join(" – "));
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (a) => {
    try {
      await activitiesApi.update(a.uuid || a.id, { isActive: !a.isActive });
      await reload();
    } catch (err) {
      alert(err?.message || "Failed to toggle activity");
    }
  };

  const remove = async (a) => {
    if (!confirm(`Delete activity "${a.name}"? This cannot be undone and will affect historical records.`)) return;
    try {
      await activitiesApi.remove(a.uuid || a.id);
      await reload();
    } catch (err) {
      alert(err?.message || "Failed to delete activity");
    }
  };

  const sorted = [...(data.activities || [])].sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  return (
    <div>
      <div className="page-header">
        <h2>Activities</h2>
        <p>Manage the catalog of classes — name, prices, and availability</p>
      </div>

      <div className="card-grid" style={{ marginBottom: 20 }}>
        <StatCard icon={Star} label="Total Activities" value={sorted.length} color="var(--accent)" bg="var(--accent-dim)" />
        <StatCard icon={Check} label="Active" value={sorted.filter((a) => a.isActive !== false).length} color="var(--success)" bg="var(--success-dim)" />
        <StatCard icon={Pause} label="Inactive" value={sorted.filter((a) => a.isActive === false).length} color="var(--warning)" bg="var(--warning-dim)" />
        <StatCard icon={DollarSign} label="Avg. Standalone" value={sorted.length ? formatUGX(Math.round(sorted.reduce((s, a) => s + (a.standalone || 0), 0) / sorted.length)) : "—"} color="var(--info)" bg="var(--info-dim)" />
      </div>

      <div className="toolbar">
        <div>
          {!isAdmin && (
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
              <AlertTriangle size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: 4, color: "var(--warning)" }} />
              Read-only — only admins and managers can edit activities.
            </p>
          )}
        </div>
        {isAdmin && <button className="btn btn-primary" onClick={openAdd}><Plus size={16} /> Add Activity</button>}
      </div>

      {apiError && (
        <div style={{ background: "var(--danger-dim)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "var(--radius-xs)", padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "var(--danger)", display: "flex", alignItems: "center", gap: 8 }}>
          <AlertTriangle size={14} /> {apiError}
        </div>
      )}
      {busy && (
        <div style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
          <RefreshCw size={12} style={{ animation: "spin 1s linear infinite" }} /> Syncing with database...
        </div>
      )}

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Code</th>
              <th>Standalone Price</th>
              <th>Add-on Price</th>
              <th>Description</th>
              <th>Status</th>
              {isAdmin && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {sorted.map((a) => (
              <tr key={a.uuid || a.id}>
                <td style={{ color: "var(--text)", fontWeight: 500 }}>{a.name}</td>
                <td style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text-dim)" }}>{a.code || a.id}</td>
                <td style={{ fontWeight: 600, color: "var(--accent)" }}>{formatUGX(a.standalone || 0)}</td>
                <td>{formatUGX(a.addon || 0)}</td>
                <td style={{ fontSize: 12, color: "var(--text-dim)", maxWidth: 220 }}>{a.description || "—"}</td>
                <td>{a.isActive === false ? <Badge variant="danger">Inactive</Badge> : <Badge variant="success">Active</Badge>}</td>
                {isAdmin && (
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn btn-icon btn-secondary" onClick={() => openEdit(a)} title="Edit"><Edit2 size={14} /></button>
                      <button className="btn btn-icon btn-secondary" onClick={() => toggleActive(a)} title={a.isActive === false ? "Activate" : "Deactivate"}>{a.isActive === false ? <Play size={14} /> : <Pause size={14} />}</button>
                      <button className="btn btn-icon btn-danger" onClick={() => remove(a)} title="Delete"><Trash2 size={14} /></button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 7 : 6} style={{ textAlign: "center", color: "var(--text-muted)", padding: 32 }}>
                  No activities recorded
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal
          title={modal === "add" ? "Add Activity" : `Edit: ${current?.name || ""}`}
          onClose={() => setModal(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={busy || !form.name}><Check size={14} /> {modal === "add" ? "Add Activity" : "Save Changes"}</button>
            </>
          }
        >
          <div className="form-grid">
            <div className="form-group full">
              <label>Activity Name *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Yoga, Pilates, HIIT Class" />
            </div>
            <div className="form-group">
              <label>Code <span style={{ fontSize: 10, color: "var(--text-muted)" }}>(auto if blank)</span></label>
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} placeholder="auto-generated" disabled={modal === "edit"} style={{ fontFamily: "monospace" }} />
            </div>
            <div className="form-group">
              <label>Standalone Price (UGX) — for prepaid / walk-ins</label>
              <input type="number" min="0" value={form.standalone} onChange={(e) => setForm({ ...form, standalone: e.target.value })} placeholder="20000" />
            </div>
            <div className="form-group">
              <label>Add-on Price (UGX) — for members with active membership</label>
              <input type="number" min="0" value={form.addon} onChange={(e) => setForm({ ...form, addon: e.target.value })} placeholder="10000" />
            </div>
            <div className="form-group full">
              <label>Description</label>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional notes about this activity" />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ─── EQUIPMENT ──────────────────────────────────────────────
const Equipment = ({ data, setData, currentUser }) => {
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: "", type: "Cardio", serialNumber: "", purchaseDate: "", status: "operational" });
  const [current, setCurrent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState("");
  const isAdmin = currentUser?.role === "admin";

  const reload = useCallback(async () => {
    try {
      const res = await equipmentApi.list({ limit: 200 });
      setData((d) => ({ ...d, equipment: (res?.data || []).map(adaptEquipment) }));
    } catch (err) {
      setApiError(err?.message || "Failed to load equipment");
    }
  }, [setData]);
  useEffect(() => { reload(); }, [reload]);

  const save = async () => {
    if (!form.name) return;
    setBusy(true);
    setApiError("");
    try {
      const payload = {
        name: form.name,
        category: form.type,
        serialNumber: form.serialNumber || undefined,
        purchasedOn: form.purchaseDate || undefined,
        status: equipmentStatusToApi(form.status),
      };
      if (modal === "add") await equipmentApi.create(payload);
      else if (current)    await equipmentApi.update(current.id, payload);
      await reload();
      setModal(null);
    } catch (err) {
      setApiError(err?.message || "Failed to save equipment");
    } finally {
      setBusy(false);
    }
  };

  const updateStatus = async (eqId, newStatus) => {
    try {
      await equipmentApi.update(eqId, { status: equipmentStatusToApi(newStatus) });
      await reload();
    } catch (err) {
      alert(err?.message || "Failed to update equipment status");
    }
  };

  const statusStyle = (status) => {
    if (status === "operational") return { background: "var(--success-dim)", color: "var(--success)", borderColor: "rgba(34,197,94,0.3)" };
    if (status === "maintenance") return { background: "var(--warning-dim)", color: "var(--warning)", borderColor: "rgba(249,115,22,0.3)" };
    return { background: "var(--danger-dim)", color: "var(--danger)", borderColor: "rgba(239,68,68,0.3)" };
  };

  return (
    <div>
      <div className="page-header">
        <h2>Equipment</h2>
        <p>{isAdmin ? "Track gym equipment and maintenance schedules" : "Update equipment status — flag issues to admin for follow-up"}</p>
      </div>

      {/* Stat cards */}
      <div className="card-grid" style={{ marginBottom: 20 }}>
        <StatCard icon={Check} label="Operational" value={data.equipment.filter((e) => e.status === "operational").length} color="var(--success)" bg="var(--success-dim)" />
        <StatCard icon={Wrench} label="Under Maintenance" value={data.equipment.filter((e) => e.status === "maintenance").length} color="var(--warning)" bg="var(--warning-dim)" />
        <StatCard icon={X} label="Decommissioned" value={data.equipment.filter((e) => e.status === "decommissioned").length} color="var(--danger)" bg="var(--danger-dim)" />
        <StatCard icon={Dumbbell} label="Total Equipment" value={data.equipment.length} color="var(--accent)" bg="var(--accent-dim)" />
      </div>

      <div className="toolbar">
        <div>
          {!isAdmin && (
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
              <AlertTriangle size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: 4, color: "var(--warning)" }} />
              Front Desk: You can update the status column. Admin manages equipment records.
            </p>
          )}
        </div>
        {isAdmin && <button className="btn btn-primary" onClick={() => { setForm({ name: "", type: "Cardio", serialNumber: "", purchaseDate: today(), status: "operational" }); setModal("add"); }}><Plus size={16} /> Add Equipment</button>}
      </div>

      <div className="table-wrapper">
        <table>
          <thead><tr><th>Name</th><th>Type</th><th>Serial</th><th>Purchased</th><th>Status</th>{isAdmin && <th>Actions</th>}</tr></thead>
          <tbody>
            {data.equipment.map((eq) => (
              <tr key={eq.id}>
                <td style={{ color: "var(--text)", fontWeight: 500 }}>{eq.name}</td>
                <td>{eq.type}</td>
                <td style={{ fontFamily: "monospace", fontSize: 12 }}>{eq.serialNumber}</td>
                <td>{formatDate(eq.purchaseDate)}</td>
                <td>
                  <select
                    value={eq.status}
                    onChange={(e) => updateStatus(eq.id, e.target.value)}
                    style={{
                      padding: "6px 10px",
                      fontSize: 12,
                      fontWeight: 600,
                      borderRadius: "var(--radius-xs)",
                      border: `1px solid ${statusStyle(eq.status).borderColor}`,
                      background: statusStyle(eq.status).background,
                      color: statusStyle(eq.status).color,
                      cursor: "pointer",
                      minWidth: 160,
                    }}
                  >
                    <option value="operational">✓ Operational</option>
                    <option value="maintenance">⚠ Under Maintenance</option>
                    <option value="decommissioned">✗ Decommissioned</option>
                  </select>
                  {eq.statusUpdatedBy && (
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
                      Updated by {eq.statusUpdatedBy}
                    </div>
                  )}
                </td>
                {isAdmin && (
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn btn-icon btn-secondary" onClick={() => { setCurrent(eq); setForm(eq); setModal("edit"); }} title="Edit details"><Edit2 size={14} /></button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {data.equipment.length === 0 && <tr><td colSpan={isAdmin ? 6 : 5} style={{ textAlign: "center", color: "var(--text-muted)", padding: 32 }}>No equipment recorded</td></tr>}
          </tbody>
        </table>
      </div>

      {/* ADD/EDIT modal — admin only */}
      {modal && isAdmin && (
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
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState("");

  const reload = useCallback(async () => {
    try {
      const res = await discountsApi.list({ limit: 200 });
      setData((d) => ({ ...d, discounts: (res?.data || []).map(adaptDiscount) }));
    } catch (err) {
      setApiError(err?.message || "Failed to load discounts");
    }
  }, [setData]);
  useEffect(() => { reload(); }, [reload]);

  const save = async () => {
    if (!form.name) return;
    setBusy(true);
    setApiError("");
    try {
      await discountsApi.create({
        code: form.name,
        description: form.name,
        type: discountTypeToApi(form.type),
        value: Number(form.value),
      });
      await reload();
      setModal(null);
    } catch (err) {
      setApiError(err?.message || "Failed to save discount");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (d) => {
    try {
      await discountsApi.update(d.id, { isActive: !d.isActive });
      await reload();
    } catch (err) {
      alert(err?.message || "Failed to toggle discount");
    }
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
                <td><button className="btn btn-icon btn-danger" onClick={() => toggleActive(d)}>{d.isActive ? <Pause size={14} /> : <Play size={14} />}</button></td>
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

// ─── SHOP / POS ─────────────────────────────────────────────
const Shop = ({ data, setData, currentUser }) => {
  const [tab, setTab] = useState("sell"); // sell | products | history
  const [cart, setCart] = useState([]);
  const [payMethod, setPayMethod] = useState("cash");
  const [productModal, setProductModal] = useState(null); // 'add' | 'edit' | null
  const [productForm, setProductForm] = useState({ name: "", category: "Supplements", price: "", stock: "" });
  const [editProduct, setEditProduct] = useState(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState("");
  const isAdmin = currentUser?.role === "admin";

  const reload = useCallback(async () => {
    try {
      const [pRes, payRes] = await Promise.all([
        productsApi.list({ limit: 500 }),
        paymentsApi.list({ limit: 500 }),
      ]);
      setData((d) => ({
        ...d,
        products: (pRes?.data || []).map(adaptProduct),
        payments: (payRes?.data || []).map(adaptPayment),
      }));
    } catch (err) {
      setApiError(err?.message || "Failed to load shop data");
    }
  }, [setData]);
  useEffect(() => { reload(); }, [reload]);

  const filteredProducts = data.products.filter((p) => p.isActive && p.name.toLowerCase().includes(search.toLowerCase()));
  const cartTotal = cart.reduce((s, item) => s + item.price * item.qty, 0);

  const addToCart = (product) => {
    setCart((c) => {
      const existing = c.find((x) => x.productId === product.id);
      if (existing) {
        if (existing.qty >= product.stock) return c;
        return c.map((x) => x.productId === product.id ? { ...x, qty: x.qty + 1 } : x);
      }
      if (product.stock <= 0) return c;
      return [...c, { productId: product.id, name: product.name, price: product.price, qty: 1 }];
    });
  };

  const updateQty = (productId, delta) => {
    setCart((c) => c.map((x) => x.productId === productId ? { ...x, qty: Math.max(0, x.qty + delta) } : x).filter((x) => x.qty > 0));
  };

  const completeSale = async () => {
    if (cart.length === 0) return;
    setBusy(true);
    setApiError("");
    try {
      // Backend has a per-product /sell endpoint that atomically decrements stock
      // and records a payment. Loop through the cart and call it for each line.
      for (const item of cart) {
        await productsApi.sell(item.productId, {
          quantity: item.qty,
          paymentMethod: paymentMethodToApi(payMethod),
        });
      }
      await reload();
      setCart([]);
    } catch (err) {
      setApiError(err?.message || "Sale failed");
    } finally {
      setBusy(false);
    }
  };

  const saveProduct = async () => {
    if (!productForm.name || !productForm.price) { alert("Name and Price are required."); return; }
    setBusy(true);
    setApiError("");
    try {
      const payload = {
        name: productForm.name,
        category: productForm.category,
        price: Number(productForm.price),
        stock: Number(productForm.stock) || 0,
      };
      if (productModal === "add") await productsApi.create(payload);
      else if (editProduct)        await productsApi.update(editProduct.id, payload);
      await reload();
      setProductModal(null);
      setEditProduct(null);
    } catch (err) {
      setApiError(err?.message || "Failed to save product");
    } finally {
      setBusy(false);
    }
  };

  const toggleProductActive = async (p) => {
    try {
      await productsApi.update(p.id, { isActive: !p.isActive });
      await reload();
    } catch (err) {
      alert(err?.message || "Failed to toggle product");
    }
  };

  const deleteProduct = async (p) => {
    if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    try {
      await productsApi.remove(p.id);
      await reload();
    } catch (err) {
      alert(err?.message || "Failed to delete product");
    }
  };

  const todaySales = data.productSales.filter((s) => s.date === today());
  const todayShopRevenue = todaySales.reduce((s, sale) => s + sale.total, 0);

  return (
    <div>
      <div className="page-header">
        <h2>Shop</h2>
        <p>Sell supplements, accessories & drinks — Point of Sale</p>
      </div>

      <div className="tabs" style={{ marginBottom: 20 }}>
        <button className={`tab ${tab === "sell" ? "active" : ""}`} onClick={() => setTab("sell")}>Sell</button>
        {isAdmin && <button className={`tab ${tab === "products" ? "active" : ""}`} onClick={() => setTab("products")}>Manage Products</button>}
        <button className={`tab ${tab === "history" ? "active" : ""}`} onClick={() => setTab("history")}>Sales History</button>
      </div>

      {/* ── SELL TAB ── */}
      {tab === "sell" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20 }}>
          {/* Product grid */}
          <div>
            <div className="search-bar" style={{ marginBottom: 16, maxWidth: 300 }}>
              <Search />
              <input placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
              {filteredProducts.map((p) => (
                <div key={p.id} onClick={() => addToCart(p)} style={{
                  background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                  padding: 14, cursor: p.stock > 0 ? "pointer" : "not-allowed", transition: "var(--transition)",
                  opacity: p.stock <= 0 ? 0.4 : 1,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>{p.category}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "var(--accent)" }}>{formatUGX(p.price)}</span>
                    <span style={{ fontSize: 10, color: p.stock <= 3 ? "var(--danger)" : "var(--text-muted)" }}>{p.stock} left</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Cart */}
          <div className="card" style={{ alignSelf: "start", position: "sticky", top: 80 }}>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: 16, marginBottom: 12 }}>Cart</h3>
            {cart.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: 13, textAlign: "center", padding: 20 }}>Tap a product to add it</p>
            ) : (
              <>
                {cart.map((item) => (
                  <div key={item.productId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: "var(--text)", fontWeight: 500 }}>{item.name}</div>
                      <div style={{ color: "var(--text-muted)", fontSize: 11 }}>{formatUGX(item.price)} each</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button className="btn btn-icon btn-secondary" style={{ padding: 4 }} onClick={() => updateQty(item.productId, -1)}>-</button>
                      <span style={{ fontWeight: 700, color: "var(--text)", minWidth: 20, textAlign: "center" }}>{item.qty}</span>
                      <button className="btn btn-icon btn-secondary" style={{ padding: 4 }} onClick={() => updateQty(item.productId, 1)}>+</button>
                    </div>
                    <div style={{ minWidth: 90, textAlign: "right", fontWeight: 600, color: "var(--accent)" }}>{formatUGX(item.price * item.qty)}</div>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderTop: "2px solid var(--border)", marginTop: 8, fontSize: 16, fontWeight: 700 }}>
                  <span>Total</span>
                  <span style={{ color: "var(--accent)" }}>{formatUGX(cartTotal)}</span>
                </div>
                <div className="form-group" style={{ marginTop: 8 }}>
                  <label>Payment Method</label>
                  <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                    <option value="cash">Cash</option>
                    <option value="mobile_money">Mobile Money</option>
                    <option value="card">Card</option>
                  </select>
                </div>
                <button className="btn btn-success" style={{ width: "100%", marginTop: 12, padding: "12px", fontSize: 14, fontWeight: 700, justifyContent: "center" }} onClick={completeSale}>
                  <Check size={16} /> Complete Sale — {formatUGX(cartTotal)}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── MANAGE PRODUCTS TAB (Admin only) ── */}
      {tab === "products" && isAdmin && (
        <div>
          <div className="card-grid" style={{ marginBottom: 20 }}>
            <StatCard icon={Layers} label="Total Products" value={data.products.length} color="var(--accent)" bg="var(--accent-dim)" />
            <StatCard icon={AlertTriangle} label="Low Stock (<= 3)" value={data.products.filter((p) => p.stock <= 3 && p.isActive).length} color="var(--warning)" bg="var(--warning-dim)" />
            <StatCard icon={DollarSign} label="Total Inventory Value" value={formatUGX(data.products.reduce((s, p) => s + (p.price * p.stock), 0))} color="var(--info)" bg="var(--info-dim)" />
            <StatCard icon={Check} label="Active Products" value={data.products.filter((p) => p.isActive).length} color="var(--success)" bg="var(--success-dim)" />
          </div>

          <div className="toolbar">
            <div />
            <button className="btn btn-primary" onClick={() => { setProductForm({ name: "", category: "Supplements", price: "", stock: "" }); setEditProduct(null); setProductModal("add"); }}><Plus size={16} /> Add Product</button>
          </div>
          <div className="table-wrapper">
            <table>
              <thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {data.products.map((p) => (
                  <tr key={p.id}>
                    <td style={{ color: "var(--text)", fontWeight: 500 }}>{p.name}</td>
                    <td><Badge variant="info">{p.category}</Badge></td>
                    <td style={{ fontWeight: 600, color: "var(--accent)" }}>{formatUGX(p.price)}</td>
                    <td style={{ color: p.stock <= 3 ? "var(--danger)" : "var(--text)", fontWeight: p.stock <= 3 ? 700 : 400 }}>{p.stock}{p.stock <= 3 && " ⚠"}</td>
                    <td>{p.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="danger">Hidden</Badge>}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn btn-icon btn-secondary" onClick={() => { setEditProduct(p); setProductForm({ name: p.name, category: p.category, price: String(p.price), stock: String(p.stock) }); setProductModal("edit"); }} title="Edit"><Edit2 size={14} /></button>
                        <button className="btn btn-icon btn-secondary" onClick={() => toggleProductActive(p)} title={p.isActive ? "Hide from shop" : "Show in shop"}>{p.isActive ? <Pause size={14} /> : <Play size={14} />}</button>
                        <button className="btn btn-icon btn-danger" onClick={() => deleteProduct(p)} title="Delete permanently"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {productModal && (
            <Modal title={productModal === "add" ? "Add Product" : "Edit Product"} onClose={() => setProductModal(null)} footer={
              <>
                <button className="btn btn-secondary" onClick={() => setProductModal(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={saveProduct} disabled={!productForm.name || !productForm.price}><Check size={14} /> Save Product</button>
              </>
            }>
              <div className="form-grid">
                <div className="form-group full">
                  <label>Product Name *</label>
                  <input 
                    value={productForm.name} 
                    onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} 
                    placeholder="e.g. Whey Protein, Dumbbell, Energy Drink" 
                    autoFocus
                  />
                </div>
                <div className="form-group">
                  <label>Category</label>
                  <select value={productForm.category} onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}>
                    <option>Supplements</option><option>Accessories</option><option>Drinks</option><option>Apparel</option><option>Other</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Price (UGX) *</label>
                  <input 
                    type="number" 
                    value={productForm.price} 
                    onChange={(e) => setProductForm({ ...productForm, price: e.target.value })} 
                    placeholder="0"
                    min="0"
                  />
                </div>
                <div className="form-group">
                  <label>Stock Quantity</label>
                  <input 
                    type="number" 
                    value={productForm.stock} 
                    onChange={(e) => setProductForm({ ...productForm, stock: e.target.value })} 
                    placeholder="0"
                    min="0"
                  />
                  <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>Current stock. You can update this when items are sold or restocked.</p>
                </div>
              </div>
            </Modal>
          )}
        </div>
      )}

      {/* ── SALES HISTORY TAB ── */}
      {tab === "history" && (
        <div>
          <div className="card-grid" style={{ marginBottom: 20 }}>
            <StatCard icon={DollarSign} label="Today's Shop Sales" value={formatUGX(todayShopRevenue)} color="var(--accent)" bg="var(--accent-dim)" />
            <StatCard icon={Receipt} label="Transactions Today" value={todaySales.length} color="var(--info)" bg="var(--info-dim)" />
          </div>
          <div className="table-wrapper">
            <table>
              <thead><tr><th>Date</th><th>Items</th><th>Method</th><th>Total</th><th>Sold By</th></tr></thead>
              <tbody>
                {[...data.productSales].sort((a, b) => new Date(b.soldAt) - new Date(a.soldAt)).map((sale) => (
                  <tr key={sale.id}>
                    <td>{formatDate(sale.soldAt)} {formatTime(sale.soldAt)}</td>
                    <td style={{ color: "var(--text)", fontSize: 12 }}>{sale.items.map((i) => `${i.name} x${i.qty}`).join(", ")}</td>
                    <td><Badge variant="neutral">{sale.method === "mobile_money" ? "Mobile Money" : sale.method.charAt(0).toUpperCase() + sale.method.slice(1)}</Badge></td>
                    <td style={{ fontWeight: 600, color: "var(--accent)" }}>{formatUGX(sale.total)}</td>
                    <td style={{ color: "var(--text-dim)" }}>{sale.soldBy}</td>
                  </tr>
                ))}
                {data.productSales.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)", padding: 32 }}>No sales recorded yet</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── EXPENSES ───────────────────────────────────────────────
const EXPENSE_CATEGORIES = ["Utilities", "Rent", "Salaries", "Maintenance", "Supplies", "Equipment Purchase", "Marketing", "Insurance", "Transport", "Miscellaneous"];

const Expenses = ({ data, setData, currentUser }) => {
  const [modal, setModal] = useState(null); // 'add' | 'edit' | null
  const [form, setForm] = useState({ category: "Utilities", description: "", amount: "", date: today(), method: "cash", receipt: "" });
  const [editTarget, setEditTarget] = useState(null);
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7));
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState("");
  const isAdmin = currentUser?.role === "admin";

  const reload = useCallback(async () => {
    try {
      const res = await expensesApi.list({ limit: 500 });
      setData((d) => ({ ...d, expenses: (res?.data || []).map(adaptExpense) }));
    } catch (err) {
      setApiError(err?.message || "Failed to load expenses");
    }
  }, [setData]);
  useEffect(() => { reload(); }, [reload]);

  const filteredExpenses = data.expenses.filter((e) => (e.date || "").startsWith(filterMonth));
  const totalExpenses = filteredExpenses.reduce((s, e) => s + e.amount, 0);
  const todayExpenses = data.expenses.filter((e) => e.date === today()).reduce((s, e) => s + e.amount, 0);
  const categoryTotals = {};
  filteredExpenses.forEach((e) => { categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount; });
  const topCategory = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0];

  const save = async () => {
    if (!form.description || !form.amount || !form.date) { alert("Please fill in description, amount, and date."); return; }
    setBusy(true);
    setApiError("");
    try {
      if (modal === "add") {
        await expensesApi.create({
          category: form.category,
          description: form.description,
          amount: Number(form.amount),
          spentOn: form.date,
          paidBy: form.method,
          receiptUrl: form.receipt || undefined,
        });
      }
      // Edit isn't supported in backend (no PATCH for expenses)
      await reload();
      setModal(null); setEditTarget(null);
    } catch (err) {
      setApiError(err?.message || "Failed to save expense");
    } finally {
      setBusy(false);
    }
  };

  const deleteExpense = async (id) => {
    if (!confirm("Delete this expense record?")) return;
    try {
      await expensesApi.remove(id);
      await reload();
    } catch (err) {
      alert(err?.message || "Failed to delete expense");
    }
  };

  return (
    <div>
      <div className="page-header"><h2>Expenses</h2><p>Track and manage gym operating costs</p></div>

      <div className="card-grid" style={{ marginBottom: 20 }}>
        <StatCard icon={DollarSign} label="Today's Expenses" value={formatUGX(todayExpenses)} color="var(--danger)" bg="var(--danger-dim)" />
        <StatCard icon={TrendingUp} label={`${filterMonth} Total`} value={formatUGX(totalExpenses)} color="var(--warning)" bg="var(--warning-dim)" />
        <StatCard icon={Receipt} label="Transactions" value={filteredExpenses.length} color="var(--info)" bg="var(--info-dim)" />
        <StatCard icon={AlertTriangle} label="Top Category" value={topCategory ? topCategory[0] : "—"} color="var(--accent)" bg="var(--accent-dim)" />
      </div>

      <div className="toolbar">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} style={{ padding: "8px 12px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: "var(--radius-xs)", color: "var(--text)", fontSize: 13 }} />
        </div>
        <button className="btn btn-primary" onClick={() => { setForm({ category: "Utilities", description: "", amount: "", date: today(), method: "cash", receipt: "" }); setModal("add"); }}><Plus size={16} /> Record Expense</button>
      </div>

      {/* Category breakdown */}
      {Object.keys(categoryTotals).length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 16, marginBottom: 12 }}>Category Breakdown — {filterMonth}</h3>
          <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", background: "var(--bg-input)", marginBottom: 12 }}>
            {Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).map(([cat], i) => (
              <div key={cat} style={{ width: `${categoryTotals[cat] / totalExpenses * 100}%`, background: `hsl(${i * 35 + 10}, 70%, 55%)` }} />
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
            {Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).map(([cat, amt], i) => (
              <div key={cat} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "var(--bg-elevated)", borderRadius: "var(--radius-xs)", borderLeft: `3px solid hsl(${i * 35 + 10}, 70%, 55%)` }}>
                <span style={{ fontSize: 12, color: "var(--text)" }}>{cat}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--danger)" }}>{formatUGX(amt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="table-wrapper">
        <table>
          <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Method</th><th>Amount</th><th>Approved By</th>{isAdmin && <th>Actions</th>}</tr></thead>
          <tbody>
            {[...filteredExpenses].sort((a, b) => b.date.localeCompare(a.date)).map((e) => (
              <tr key={e.id}>
                <td>{formatDate(e.date)}</td>
                <td><Badge variant="warning">{e.category}</Badge></td>
                <td style={{ color: "var(--text)", maxWidth: 250 }}>{e.description}</td>
                <td><Badge variant="neutral">{e.method === "mobile_money" ? "M-Money" : e.method.charAt(0).toUpperCase() + e.method.slice(1)}</Badge></td>
                <td style={{ fontWeight: 600, color: "var(--danger)" }}>{formatUGX(e.amount)}</td>
                <td style={{ fontSize: 12, color: "var(--text-dim)" }}>{e.approvedBy}</td>
                {isAdmin && (
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn btn-icon btn-secondary" onClick={() => { setEditTarget({ ...e }); setModal("edit"); }}><Edit2 size={14} /></button>
                      <button className="btn btn-icon btn-danger" onClick={() => deleteExpense(e.id)}><X size={14} /></button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {filteredExpenses.length === 0 && <tr><td colSpan={isAdmin ? 7 : 6} style={{ textAlign: "center", color: "var(--text-muted)", padding: 32 }}>No expenses recorded for {filterMonth}</td></tr>}
          </tbody>
        </table>
      </div>

      {/* ADD EXPENSE */}
      {modal === "add" && (
        <Modal title="Record Expense" onClose={() => setModal(null)} footer={<><button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={save}><Check size={14} /> Save</button></>}>
          <div className="form-grid">
            <div className="form-group"><label>Category *</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Date *</label><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
            <div className="form-group full"><label>Description *</label><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Electricity bill, equipment repair..." /></div>
            <div className="form-group"><label>Amount (UGX) *</label><input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="e.g. 450000" /></div>
            <div className="form-group"><label>Payment Method</label>
              <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                <option value="cash">Cash</option><option value="mobile_money">Mobile Money</option><option value="card">Card</option><option value="bank_transfer">Bank Transfer</option>
              </select>
            </div>
            <div className="form-group full"><label>Receipt / Reference</label><input value={form.receipt} onChange={(e) => setForm({ ...form, receipt: e.target.value })} placeholder="Receipt number or reference (optional)" /></div>
          </div>
        </Modal>
      )}

      {/* EDIT EXPENSE */}
      {modal === "edit" && editTarget && isAdmin && (
        <Modal title="Edit Expense" onClose={() => { setModal(null); setEditTarget(null); }} footer={<><button className="btn btn-secondary" onClick={() => { setModal(null); setEditTarget(null); }}>Cancel</button><button className="btn btn-primary" onClick={save}><Check size={14} /> Save</button></>}>
          <div className="form-grid">
            <div className="form-group"><label>Category</label>
              <select value={editTarget.category} onChange={(e) => setEditTarget({ ...editTarget, category: e.target.value })}>
                {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Date</label><input type="date" value={editTarget.date} onChange={(e) => setEditTarget({ ...editTarget, date: e.target.value })} /></div>
            <div className="form-group full"><label>Description</label><input value={editTarget.description} onChange={(e) => setEditTarget({ ...editTarget, description: e.target.value })} /></div>
            <div className="form-group"><label>Amount (UGX)</label><input type="number" value={editTarget.amount} onChange={(e) => setEditTarget({ ...editTarget, amount: e.target.value })} /></div>
            <div className="form-group"><label>Payment Method</label>
              <select value={editTarget.method} onChange={(e) => setEditTarget({ ...editTarget, method: e.target.value })}>
                <option value="cash">Cash</option><option value="mobile_money">Mobile Money</option><option value="card">Card</option><option value="bank_transfer">Bank Transfer</option>
              </select>
            </div>
            <div className="form-group full"><label>Receipt / Reference</label><input value={editTarget.receipt || ""} onChange={(e) => setEditTarget({ ...editTarget, receipt: e.target.value })} /></div>
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

  // SINGLE SOURCE OF TRUTH: all revenue flows through data.payments
  const todayPayments = data.payments.filter((p) => p.paidAt.startsWith(today()) && p.type !== "prepaid_visit");

  // Breakdown by payment method
  const systemCash = todayPayments.filter((p) => p.method === "cash").reduce((s, p) => s + p.amount, 0);
  const systemMobile = todayPayments.filter((p) => p.method === "mobile_money").reduce((s, p) => s + p.amount, 0);
  const systemCard = todayPayments.filter((p) => p.method === "card").reduce((s, p) => s + p.amount, 0);
  const totalRevenue = systemCash + systemMobile + systemCard;

  // Breakdown by source type
  const membershipRevenue = todayPayments.filter((p) => p.membershipId && p.type !== "addon").reduce((s, p) => s + p.amount, 0);
  const addonRevenue = todayPayments.filter((p) => p.type === "addon").reduce((s, p) => s + p.amount, 0);
  const walkinRevenue = todayPayments.filter((p) => p.type === "walkin").reduce((s, p) => s + p.amount, 0);
  const shopRevenue = todayPayments.filter((p) => p.type === "product_sale").reduce((s, p) => s + p.amount, 0);
  const otherRevenue = totalRevenue - membershipRevenue - addonRevenue - walkinRevenue - shopRevenue;

  // Expenses
  const todayExpenses = data.expenses ? data.expenses.filter((e) => e.date === today()) : [];
  const totalExpensesToday = todayExpenses.reduce((s, e) => s + e.amount, 0);
  const expenseByCat = {};
  todayExpenses.forEach((e) => { expenseByCat[e.category] = (expenseByCat[e.category] || 0) + e.amount; });
  const cashExpenses = todayExpenses.filter((e) => e.method === "cash").reduce((s, e) => s + e.amount, 0);
  const netProfit = totalRevenue - totalExpensesToday;

  // Pending walk-in payments
  const pendingWalkIns = data.walkIns.filter((w) => w.visitDate === today() && w.paymentStatus === "pending");
  const pendingAmount = pendingWalkIns.reduce((s, w) => s + (w.amountDue || 0), 0);

  const submit = () => {
    const declared = Number(declaredCash);
    const expectedCash = systemCash - cashExpenses;
    const variance = declared - expectedCash;
    setData((d) => ({
      ...d,
      reconciliations: [...d.reconciliations, {
        id: generateId(), staffId: "s2", shiftDate: today(), declaredCash: declared,
        systemCash, systemMobileMoney: systemMobile, systemCard,
        totalRevenue, totalExpenses: totalExpensesToday, cashExpenses, netProfit, expectedCash, variance,
        breakdown: { memberships: membershipRevenue, addons: addonRevenue, walkIns: walkinRevenue, shop: shopRevenue, other: otherRevenue },
        expenseBreakdown: expenseByCat,
        status: variance === 0 ? "balanced" : "flagged", adminNote: "",
      }],
    }));
    setModal(false);
    setDeclaredCash("");
  };

  const todayRec = data.reconciliations.find((r) => r.shiftDate === today());

  return (
    <div>
      <div className="page-header"><h2>Daily Reconciliation</h2><p>Full end-of-shift financial summary — revenue, expenses & cash verification</p></div>

      {/* Top-level summary: Revenue vs Expenses vs Net */}
      <div className="card-grid" style={{ marginBottom: 20 }}>
        <StatCard icon={TrendingUp} label="Total Revenue" value={formatUGX(totalRevenue)} color="var(--success)" bg="var(--success-dim)" />
        <StatCard icon={AlertTriangle} label="Total Expenses" value={formatUGX(totalExpensesToday)} color="var(--danger)" bg="var(--danger-dim)" />
        <StatCard icon={DollarSign} label="Net Profit" value={formatUGX(netProfit)} color={netProfit >= 0 ? "var(--success)" : "var(--danger)"} bg={netProfit >= 0 ? "var(--success-dim)" : "var(--danger-dim)"} />
        <StatCard icon={DollarSign} label="Expected Cash" value={formatUGX(systemCash - cashExpenses)} color="var(--accent)" bg="var(--accent-dim)" />
      </div>

      {/* Revenue by Payment Method */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontFamily: "var(--font-display)", fontSize: 16, marginBottom: 12 }}>Revenue by Payment Method</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          <div style={{ padding: 14, background: "var(--bg-elevated)", borderRadius: "var(--radius-sm)", borderLeft: "3px solid var(--success)" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>Cash In</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--success)", marginTop: 4 }}>{formatUGX(systemCash)}</div>
          </div>
          <div style={{ padding: 14, background: "var(--bg-elevated)", borderRadius: "var(--radius-sm)", borderLeft: "3px solid var(--info)" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>Mobile Money</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--info)", marginTop: 4 }}>{formatUGX(systemMobile)}</div>
          </div>
          <div style={{ padding: 14, background: "var(--bg-elevated)", borderRadius: "var(--radius-sm)", borderLeft: "3px solid var(--accent)" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>Card</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--accent)", marginTop: 4 }}>{formatUGX(systemCard)}</div>
          </div>
        </div>
      </div>

      {/* Revenue by Source Breakdown */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontFamily: "var(--font-display)", fontSize: 16, marginBottom: 16 }}>Today's Revenue Breakdown by Source</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
          {[
            { label: "Memberships", value: membershipRevenue, color: "var(--success)" },
            { label: "Activity Add-ons", value: addonRevenue, color: "var(--info)" },
            { label: "Walk-In Guests", value: walkinRevenue, color: "var(--warning)" },
            { label: "Shop / Products", value: shopRevenue, color: "var(--accent)" },
            ...(otherRevenue > 0 ? [{ label: "Other", value: otherRevenue, color: "var(--text-dim)" }] : []),
          ].map((item) => (
            <div key={item.label} style={{ padding: 14, background: "var(--bg-elevated)", borderRadius: "var(--radius-sm)", borderLeft: `3px solid ${item.color}` }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{item.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: item.color, marginTop: 4 }}>{formatUGX(item.value)}</div>
            </div>
          ))}
        </div>
        {totalRevenue > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", background: "var(--bg-input)" }}>
              {membershipRevenue > 0 && <div style={{ width: `${membershipRevenue / totalRevenue * 100}%`, background: "var(--success)" }} />}
              {addonRevenue > 0 && <div style={{ width: `${addonRevenue / totalRevenue * 100}%`, background: "var(--info)" }} />}
              {walkinRevenue > 0 && <div style={{ width: `${walkinRevenue / totalRevenue * 100}%`, background: "var(--warning)" }} />}
              {shopRevenue > 0 && <div style={{ width: `${shopRevenue / totalRevenue * 100}%`, background: "var(--accent)" }} />}
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 11, color: "var(--text-muted)", flexWrap: "wrap" }}>
              <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--success)", marginRight: 4 }} />Memberships</span>
              <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--info)", marginRight: 4 }} />Add-ons</span>
              <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--warning)", marginRight: 4 }} />Walk-Ins</span>
              <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--accent)", marginRight: 4 }} />Shop</span>
            </div>
          </div>
        )}
      </div>

      {/* Expenses Breakdown */}
      {todayExpenses.length > 0 && (
        <div className="card" style={{ marginBottom: 20, borderLeft: "3px solid var(--danger)" }}>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 16, marginBottom: 12 }}>Today's Expenses ({todayExpenses.length})</h3>
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            {todayExpenses.map((e) => (
              <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Badge variant="warning">{e.category}</Badge>
                  <span style={{ color: "var(--text)" }}>{e.description}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Badge variant="neutral">{e.method === "mobile_money" ? "M-Money" : e.method === "bank_transfer" ? "Bank" : e.method.charAt(0).toUpperCase() + e.method.slice(1)}</Badge>
                  <span style={{ fontWeight: 600, color: "var(--danger)", minWidth: 80, textAlign: "right" }}>-{formatUGX(e.amount)}</span>
                </div>
              </div>
            ))}
          </div>
          {Object.keys(expenseByCat).length > 0 && (
            <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
              {Object.entries(expenseByCat).map(([cat, amt]) => (
                <div key={cat} style={{ padding: "4px 10px", background: "var(--bg-elevated)", borderRadius: "var(--radius-xs)", fontSize: 11 }}>
                  <span style={{ color: "var(--text-muted)" }}>{cat}: </span>
                  <span style={{ color: "var(--danger)", fontWeight: 600 }}>{formatUGX(amt)}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 12, padding: "10px 14px", background: "var(--bg-elevated)", borderRadius: "var(--radius-sm)", display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Cash expenses (deducted from expected cash):</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--danger)" }}>{formatUGX(cashExpenses)}</span>
          </div>
        </div>
      )}

      {/* Pending Payments Warning */}
      {pendingWalkIns.length > 0 && (
        <div style={{ background: "var(--warning-dim)", border: "1px solid rgba(249,115,22,0.3)", borderRadius: "var(--radius)", padding: "14px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
          <AlertTriangle size={18} style={{ color: "var(--warning)", flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: "var(--warning)" }}>
            <strong>{pendingWalkIns.length}</strong> walk-in payment{pendingWalkIns.length > 1 ? "s" : ""} still pending ({formatUGX(pendingAmount)}) — not included in totals until paid.
          </span>
        </div>
      )}

      {/* Today's Transactions Detail */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontFamily: "var(--font-display)", fontSize: 16, marginBottom: 12 }}>Today's Transactions ({todayPayments.length})</h3>
        {todayPayments.length > 0 ? (
          <div style={{ maxHeight: 250, overflowY: "auto" }}>
            {[...todayPayments].sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt)).map((p) => {
              const member = p.memberId ? data.members.find((m) => m.id === p.memberId) : null;
              const typeLabel = p.type === "product_sale" ? "Shop" : p.type === "walkin" ? "Walk-In" : p.type === "addon" ? "Add-on" : "Membership";
              const typeColor = p.type === "product_sale" ? "var(--accent)" : p.type === "walkin" ? "var(--warning)" : p.type === "addon" ? "var(--info)" : "var(--success)";
              return (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Badge variant={p.type === "product_sale" ? "warning" : p.type === "walkin" ? "warning" : p.type === "addon" ? "info" : "success"}>{typeLabel}</Badge>
                    <span style={{ color: "var(--text)" }}>{member ? fullName(member) : p.note?.slice(0, 40) || "—"}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <Badge variant="neutral">{p.method === "mobile_money" ? "M-Money" : p.method?.charAt(0).toUpperCase() + p.method?.slice(1)}</Badge>
                    <span style={{ fontWeight: 600, color: "var(--accent)", minWidth: 80, textAlign: "right" }}>{formatUGX(p.amount)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No transactions recorded today.</p>
        )}
      </div>

      {/* Reconciliation Submission */}
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
            <thead><tr><th>Date</th><th>Declared</th><th>System Cash</th><th>Total Revenue</th><th>Variance</th><th>Status</th></tr></thead>
            <tbody>
              {[...data.reconciliations].sort((a, b) => b.shiftDate.localeCompare(a.shiftDate)).map((r) => (
                <tr key={r.id}>
                  <td>{formatDate(r.shiftDate)}</td>
                  <td>{formatUGX(r.declaredCash)}</td>
                  <td>{formatUGX(r.systemCash)}</td>
                  <td style={{ fontWeight: 600, color: "var(--accent)" }}>{formatUGX(r.totalRevenue || (r.systemCash + (r.systemMobileMoney || 0) + (r.systemCard || 0)))}</td>
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
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13 }}>
              <span style={{ color: "var(--text-dim)" }}>Cash revenue (in):</span>
              <span style={{ color: "var(--success)", fontWeight: 600 }}>{formatUGX(systemCash)}</span>
            </div>
            {cashExpenses > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13 }}>
                <span style={{ color: "var(--text-dim)" }}>Cash expenses (out):</span>
                <span style={{ color: "var(--danger)", fontWeight: 600 }}>-{formatUGX(cashExpenses)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: 14, fontWeight: 700, borderTop: "1px solid var(--border)", marginTop: 4 }}>
              <span style={{ color: "var(--text)" }}>Expected cash in drawer:</span>
              <span style={{ color: "var(--accent)" }}>{formatUGX(systemCash - cashExpenses)}</span>
            </div>
          </div>
          <div className="form-group">
            <label>Declared Physical Cash (UGX)</label>
            <input type="number" value={declaredCash} onChange={(e) => setDeclaredCash(e.target.value)} placeholder="Enter actual cash collected..." />
          </div>
          {pendingWalkIns.length > 0 && <p style={{ marginTop: 12, fontSize: 12, color: "var(--warning)" }}>Note: {pendingWalkIns.length} pending walk-in payment(s) not included.</p>}
        </Modal>
      )}
    </div>
  );
};

// ─── STAFF MANAGEMENT ───────────────────────────────────────
const StaffMgmt = ({ data, setData, currentUser }) => {
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: "", username: "", password: "", role: "receptionist" });
  const [resetTarget, setResetTarget] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState("");

  const reload = useCallback(async () => {
    try {
      const res = await usersApi.list({ limit: 200 });
      setData((d) => ({ ...d, staff: (res?.data || []).map(adaptStaff) }));
    } catch (err) {
      setApiError(err?.message || "Failed to load staff");
    }
  }, [setData]);
  useEffect(() => { reload(); }, [reload]);

  const save = async () => {
    // Mirror backend rules so the user gets immediate feedback (button disabled
    // already prevents most submits, but defend in depth).
    const name = (form.name || "").trim();
    const username = (form.username || "").trim();
    const password = form.password || "";
    const role = form.role || "receptionist";
    const validRoles = ["admin", "manager", "receptionist", "trainer"];
    const errors = [];
    if (name.length < 2) errors.push("Name must be at least 2 characters");
    if (username.length < 3 || username.length > 50) errors.push("Username must be 3–50 characters");
    if (!/^[a-z0-9_]+$/.test(username)) errors.push("Username may only contain lowercase letters, digits, and underscores");
    if (password.length < 8) errors.push("Password must be at least 8 characters");
    if (!validRoles.includes(role)) errors.push(`Role must be one of: ${validRoles.join(", ")}`);
    if (errors.length) { setApiError(errors.join("\n")); return; }

    setBusy(true);
    setApiError("");
    try {
      await authApi.register({
        username,
        password,
        fullName: name,
        role,
      });
      await reload();
      setModal(null);
    } catch (err) {
      // Translate backend errors into friendly text
      let msg;
      if (err?.status === 409) {
        msg = `Username "${username}" is already taken — pick a different one.`;
      } else if (err?.status === 403) {
        msg = "Only admins can create staff accounts. You don't have permission.";
      } else if (err?.status === 401) {
        msg = "Your session expired. Please log out and log back in.";
      } else if (Array.isArray(err?.details) && err.details.length) {
        msg = err.details.map((d) => `• ${d.field || "?"}: ${d.message || JSON.stringify(d)}`).join("\n");
      } else {
        msg = err?.message || "Failed to create account.";
      }
      setApiError(msg);
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    if (!newPassword || newPassword.length < 8) { alert("Password must be at least 8 characters"); return; }
    try {
      await usersApi.update(resetTarget.id, { newPassword });
      await reload();
      setResetTarget(null);
      setNewPassword("");
    } catch (err) {
      alert(err?.message || "Failed to reset password");
    }
  };

  const toggleActive = async (s) => {
    if (s.id === currentUser?.id) { alert("You cannot deactivate your own account"); return; }
    try {
      await usersApi.update(s.id, { isActive: !s.isActive });
      await reload();
    } catch (err) {
      alert(err?.message || "Failed to update staff");
    }
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

      {modal === "add" && (() => {
        // Inline validation — match what the backend will reject so users see it before clicking
        const nameOk = form.name.trim().length >= 2;
        const usernameOk = form.username.length >= 3 && form.username.length <= 50;
        const usernameTaken = (data.staff || []).some((s) => s.username === form.username && form.username);
        const passwordOk = form.password.length >= 8;
        const allOk = nameOk && usernameOk && !usernameTaken && passwordOk && form.role;

        return (
        <Modal title="Add Staff Account" onClose={() => setModal(null)} footer={
          <>
            <button className="btn btn-secondary" onClick={() => setModal(null)} disabled={busy}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={busy || !allOk}>
              {busy ? <RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Check size={14} />}
              {busy ? "Creating..." : "Create Account"}
            </button>
          </>
        }>
          {apiError && (
            <div style={{ background: "var(--danger-dim)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "var(--radius-xs)", padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "var(--danger)", display: "flex", alignItems: "flex-start", gap: 8 }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
              <span style={{ whiteSpace: "pre-wrap" }}>{apiError}</span>
            </div>
          )}
          <div className="form-grid">
            <div className="form-group">
              <label>Name *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Jane Doe" />
              {form.name && !nameOk && <p style={{ fontSize: 11, color: "var(--warning)", marginTop: 4 }}>Name must be at least 2 characters</p>}
            </div>
            <div className="form-group">
              <label>Username * <span style={{ fontSize: 10, color: "var(--text-muted)" }}>(3–50 chars)</span></label>
              <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })} placeholder="lowercase, letters/digits/underscore" />
              {form.username && !usernameOk && (
                <p style={{ fontSize: 11, color: "var(--warning)", marginTop: 4 }}>
                  {form.username.length < 3 ? `Too short (${form.username.length}/3)` : `Too long (${form.username.length}/50)`}
                </p>
              )}
              {form.username && usernameOk && usernameTaken && (
                <p style={{ fontSize: 11, color: "var(--danger)", marginTop: 4 }}>⚠ Username "{form.username}" is already taken</p>
              )}
              {form.username && usernameOk && !usernameTaken && (
                <p style={{ fontSize: 11, color: "var(--success)", marginTop: 4 }}>✓ Available</p>
              )}
            </div>
            <div className="form-group full">
              <label>Password * <span style={{ fontSize: 10, color: "var(--text-muted)" }}>(min 8 chars)</span></label>
              <PasswordInput value={form.password} onChange={(v) => setForm({ ...form, password: v })} placeholder="Strong password" autoComplete="new-password" />
              {form.password && !passwordOk && <p style={{ fontSize: 11, color: "var(--warning)", marginTop: 4 }}>Password too short ({form.password.length}/8)</p>}
              {form.password && passwordOk && <p style={{ fontSize: 11, color: "var(--success)", marginTop: 4 }}>✓ {form.password.length} characters</p>}
            </div>
            <div className="form-group">
              <label>Role *</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="receptionist">Receptionist</option>
                <option value="manager">Manager</option>
                <option value="trainer">Trainer</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <div style={{ marginTop: 16, padding: 12, background: "var(--bg-elevated)", borderRadius: "var(--radius-xs)", fontSize: 12, color: "var(--text-dim)" }}>
            <strong style={{ color: "var(--text)" }}>Security:</strong> Password is bcrypt-hashed (10 rounds) before being stored. Plain text is never persisted.
          </div>
        </Modal>
        );
      })()}

      {resetTarget && (
        <Modal title={`Reset Password — ${resetTarget.name}`} onClose={() => setResetTarget(null)} footer={
          <>
            <button className="btn btn-secondary" onClick={() => setResetTarget(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={resetPassword} disabled={newPassword.length < 8}>
              <Check size={14} /> Reset Password
            </button>
          </>
        }>
          <div className="form-group">
            <label>New Password (min 8 characters)</label>
            <PasswordInput value={newPassword} onChange={setNewPassword} placeholder="Enter new password" autoComplete="new-password" />
          </div>
          <p style={{ marginTop: 12, fontSize: 12, color: "var(--text-muted)" }}>This action is logged in the audit trail.</p>
        </Modal>
      )}
    </div>
  );
};

// ─── LOCKERS ────────────────────────────────────────────────
const Lockers = ({ data, setData, currentUser }) => {
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState("");
  const [modal, setModal] = useState(null); // 'add' | null
  const [form, setForm] = useState({ number: "", section: "gents", count: 1 });
  const [editMode, setEditMode] = useState(false);  // when true, click = delete
  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "manager";

  const reload = useCallback(async () => {
    try {
      const res = await lockersApi.list({ limit: 500 });
      setData((d) => ({ ...d, lockers: (res?.data || []).map(adaptLocker) }));
    } catch (err) {
      setApiError(err?.message || "Failed to load lockers");
    }
  }, [setData]);

  useEffect(() => { reload(); }, [reload]);

  // Click handler — in edit mode it deletes; otherwise toggle status.
  const handleLockerClick = async (l) => {
    if (editMode) {
      if (l.isOccupied) { alert("Release this locker before deleting it."); return; }
      if (!confirm(`Delete locker #${l.number} (${l.section})? This cannot be undone.`)) return;
      setBusy(true);
      setApiError("");
      try {
        await lockersApi.remove(l.id);
        await reload();
      } catch (err) {
        setApiError(err?.message || "Failed to delete locker");
      } finally {
        setBusy(false);
      }
      return;
    }
    // Normal mode — toggle status
    setBusy(true);
    setApiError("");
    try {
      if (l.isOccupied) {
        await lockersApi.release(l.id);
      } else {
        await lockersApi.update(l.id, { status: "maintenance" });
      }
      await reload();
    } catch (err) {
      setApiError(err?.message || "Failed to update locker");
    } finally {
      setBusy(false);
    }
  };

  // Find next free number in a given section
  const nextFreeNumber = (section) => {
    const used = new Set(data.lockers.filter((l) => l.section === section).map((l) => Number(l.number)));
    let n = 1;
    while (used.has(n)) n++;
    return n;
  };

  const openAdd = () => {
    setForm({ number: String(nextFreeNumber("gents")), section: "gents", count: 1 });
    setApiError("");
    setModal("add");
  };

  // When the section changes inside the form, suggest the next free number for it.
  const onChangeSection = (section) => {
    setForm((f) => ({ ...f, section, number: String(nextFreeNumber(section)) }));
  };

  const addLockers = async () => {
    const startNum = Math.max(1, Number(form.number) || 1);
    const count = Math.max(1, Math.min(50, Number(form.count) || 1));
    const used = new Set(data.lockers.filter((l) => l.section === form.section).map((l) => Number(l.number)));
    const toCreate = [];
    let n = startNum;
    while (toCreate.length < count) {
      if (!used.has(n)) toCreate.push(n);
      n++;
      if (n > 9999) break;
    }
    if (!toCreate.length) { setApiError("No valid numbers to create"); return; }
    setBusy(true);
    setApiError("");
    try {
      for (const num of toCreate) {
        await lockersApi.create({ number: num, section: form.section, status: "available" });
      }
      await reload();
      setModal(null);
    } catch (err) {
      const detail = Array.isArray(err?.details) && err.details.length
        ? err.details.map((d) => d.msg || JSON.stringify(d)).join("; ")
        : "";
      setApiError([err?.message, detail].filter(Boolean).join(" – "));
    } finally {
      setBusy(false);
    }
  };

  const gentsLockers  = [...data.lockers].filter((l) => l.section === "gents").sort((a, b) => a.number - b.number);
  const ladiesLockers = [...data.lockers].filter((l) => l.section === "ladies").sort((a, b) => a.number - b.number);
  const gentsAvail  = gentsLockers.filter((l) => !l.isOccupied).length;
  const ladiesAvail = ladiesLockers.filter((l) => !l.isOccupied).length;
  const totalAvail  = gentsAvail + ladiesAvail;

  const renderSection = (lockers, section, accentColor, dimColor, borderColor, label, available, total) => (
    <div style={{ flex: 1, minWidth: 280 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, padding: "10px 14px", background: dimColor, borderRadius: "var(--radius-sm)", border: `1px solid ${borderColor}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: accentColor }} />
          <span style={{ fontWeight: 600, color: accentColor, fontSize: 14 }}>{label}</span>
        </div>
        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{available}/{total} available</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: 8 }}>
        {lockers.map((l) => (
          <div key={l.id} onClick={() => handleLockerClick(l)} title={editMode ? "Click to delete" : (l.isOccupied ? "Click to release" : "Click to mark out of service")} style={{
            position: "relative",
            background: editMode ? "var(--danger-dim)" : (l.isOccupied ? "var(--danger-dim)" : dimColor),
            border: `1px solid ${editMode ? "var(--danger)" : (l.isOccupied ? "var(--danger)" : borderColor)}`,
            borderRadius: "var(--radius-xs)", padding: 12, textAlign: "center", cursor: "pointer", transition: "var(--transition)",
          }}>
            {editMode && (
              <div style={{ position: "absolute", top: 4, right: 4, color: "var(--danger)" }}>
                <Trash2 size={12} />
              </div>
            )}
            <div style={{ fontSize: 18, fontWeight: 700, color: editMode ? "var(--danger)" : (l.isOccupied ? "var(--danger)" : accentColor) }}>#{l.number}</div>
            <div style={{ fontSize: 10, marginTop: 2, color: editMode ? "var(--danger)" : (l.isOccupied ? "var(--danger)" : "var(--text-muted)") }}>
              {editMode ? "Delete" : (l.isOccupied ? "Occupied" : "Free")}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <h2>Lockers</h2>
        <p>{data.lockers.length} lockers — {totalAvail} available ({gentsAvail} gents, {ladiesAvail} ladies)</p>
      </div>

      {isAdmin && (
        <div className="toolbar">
          <div>
            {editMode && (
              <p style={{ fontSize: 12, color: "var(--danger)", display: "flex", alignItems: "center", gap: 6 }}>
                <AlertTriangle size={12} /> Edit mode active — clicking a locker will <strong>delete</strong> it.
              </p>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className={`btn ${editMode ? "btn-danger" : "btn-secondary"}`} onClick={() => setEditMode((v) => !v)}>
              {editMode ? <><X size={16} /> Exit Delete Mode</> : <><Trash2 size={16} /> Delete Lockers</>}
            </button>
            <button className="btn btn-primary" onClick={openAdd}><Plus size={16} /> Add Locker</button>
          </div>
        </div>
      )}

      {apiError && (
        <div style={{ background: "var(--danger-dim)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "var(--radius-xs)", padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "var(--danger)", display: "flex", alignItems: "center", gap: 8 }}>
          <AlertTriangle size={14} /> {apiError}
        </div>
      )}
      {busy && (
        <div style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
          <RefreshCw size={12} style={{ animation: "spin 1s linear infinite" }} /> Syncing...
        </div>
      )}
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        {renderSection(gentsLockers, "gents", "#3b82f6", "rgba(59,130,246,0.08)", "rgba(59,130,246,0.25)", "Gents Lockers", gentsAvail, gentsLockers.length)}
        {renderSection(ladiesLockers, "ladies", "#ec4899", "rgba(236,72,153,0.08)", "rgba(236,72,153,0.25)", "Ladies Lockers", ladiesAvail, ladiesLockers.length)}
      </div>
      <div style={{ marginTop: 16, display: "flex", gap: 16, fontSize: 12, color: "var(--text-muted)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 12, height: 12, borderRadius: 3, background: "rgba(59,130,246,0.2)", border: "1px solid rgba(59,130,246,0.4)" }} /> Gents — Free</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 12, height: 12, borderRadius: 3, background: "rgba(236,72,153,0.2)", border: "1px solid rgba(236,72,153,0.4)" }} /> Ladies — Free</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 12, height: 12, borderRadius: 3, background: "var(--danger-dim)", border: "1px solid var(--danger)" }} /> Occupied</div>
      </div>

      {modal === "add" && (
        <Modal
          title="Add Locker(s)"
          onClose={() => setModal(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={addLockers} disabled={busy || !form.number}><Check size={14} /> {Number(form.count) > 1 ? `Add ${form.count} Lockers` : "Add Locker"}</button>
            </>
          }
        >
          <div className="form-grid">
            <div className="form-group">
              <label>Section *</label>
              <select value={form.section} onChange={(e) => onChangeSection(e.target.value)}>
                <option value="gents">Gents</option>
                <option value="ladies">Ladies</option>
              </select>
            </div>
            <div className="form-group">
              <label>Starting Number *</label>
              <input type="number" min="1" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} placeholder="e.g. 31" />
            </div>
            <div className="form-group">
              <label>How many lockers to add?</label>
              <input type="number" min="1" max="50" value={form.count} onChange={(e) => setForm({ ...form, count: e.target.value })} placeholder="1" />
              <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                Existing numbers in this section will be skipped.
              </p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ─── SELF CHECK-IN KIOSK ────────────────────────────────────
const SelfCheckIn = ({ data, setData, onExit }) => {
  const ACTIVITIES = (data?.activities && data.activities.length) ? data.activities : ACTIVITIES_SEED;
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

  // Persist a self check-in via the backend, then refresh the in-memory cache.
  const persistSelfCheckIn = async (memberId) => {
    try {
      await attendanceApi.checkIn({ memberId, source: "self" });
      const attRes = await attendanceApi.list({ limit: 500 });
      setData((d) => ({ ...d, attendance: (attRes?.data || []).map(adaptAttendance) }));
      return true;
    } catch (err) {
      // 409 = already checked in today; treat as success for kiosk UX.
      if (err?.status === 409) return true;
      console.error("[kiosk] check-in failed:", err);
      return false;
    }
  };

  const handlePhoneKey = (k) => {
    if (k === "del") setPhone((p) => p.slice(0, -1));
    else if (k === "go") {
      const found = data.members.find((m) => m.phone === phone && m.isActive);
      if (found) {
        setMember(found);
        // Skip PIN — validate membership and check in directly
        const ms = data.memberships.find((ms) => ms.memberId === found.id && ms.isActive);
        if (!ms || new Date(ms.endDate) < new Date()) { setStep("blocked"); setTimeout(reset, 5000); return; }
        if (ms.status === "frozen") { setStep("blocked"); setTimeout(reset, 5000); return; }
        const alreadyIn = data.attendance.some((a) => a.memberId === found.id && a.date === today());
        if (alreadyIn) { setStep("success"); return; }
        persistSelfCheckIn(found.id).then((ok) => {
          if (ok) setStep("success");
          else { setStep("blocked"); setTimeout(reset, 5000); }
        });
      }
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
        persistSelfCheckIn(member.id).then((ok) => {
          if (ok) setStep("success");
          else { setStep("blocked"); setTimeout(reset, 5000); }
        });
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
          <div style={{ width: 100, height: 100, borderRadius: "50%", overflow: "hidden", background: "var(--accent-dim)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", border: "3px solid var(--accent)" }}>{member.photo ? <img src={member.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 36, fontFamily: "var(--font-display)", color: "var(--accent)", fontWeight: 700 }}>{memberInitials(member)}</span>}</div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24 }}>{fullName(member)}</h2>
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
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 28, color: "var(--success)" }}>Welcome, {fullName(member)}!</h2>
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
// ─── FINANCIAL STATEMENT ────────────────────────────────────
// Per-person statement showing all payments + check-ins for either a
// member or a walk-in guest, with a printable summary.
const FinancialStatement = ({ data }) => {
  const [type, setType] = useState("member");      // 'member' | 'walkin'
  const [personId, setPersonId] = useState("");    // member.id or walkin.id
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Build picker options
  const memberOpts = [...(data.members || [])]
    .filter((m) => m.firstName || m.lastName || m.phone)
    .sort((a, b) => fullName(a).localeCompare(fullName(b)))
    .map((m) => ({ id: m.id, label: `${fullName(m)} — ${m.phone}` }));

  const walkinOpts = [...(data.walkIns || [])]
    .sort((a, b) => (b.visitDate || "").localeCompare(a.visitDate || ""))
    .map((w) => ({ id: w.id, label: `${w.name || `${w.firstName || ""} ${w.lastName || ""}`.trim() || "Guest"} — ${w.phone || "no phone"} — ${formatDate(w.visitDate)}` }));

  const opts = type === "member" ? memberOpts : walkinOpts;
  const person = type === "member"
    ? (data.members || []).find((m) => m.id === personId)
    : (data.walkIns || []).find((w) => w.id === personId);

  // Date filter helper
  const inRange = (iso) => {
    if (!iso) return true;
    const d = (typeof iso === "string" ? iso : new Date(iso).toISOString()).slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  };

  // ── Build payment + attendance rows for the chosen person ──
  let payments = [];
  let attendance = [];
  let memberships = [];

  if (person) {
    if (type === "member") {
      payments = (data.payments || [])
        .filter((p) => p.memberId === person.id)
        .filter((p) => inRange(p.paidAt));
      attendance = (data.attendance || [])
        .filter((a) => a.memberId === person.id)
        .filter((a) => inRange(a.checkIn || a.date));
      memberships = (data.memberships || [])
        .filter((ms) => ms.memberId === person.id);
    } else {
      // Walk-in: payments referenced by note, attendance by walkInId
      const guestName = person.name || `${person.firstName || ""} ${person.lastName || ""}`.trim();
      payments = (data.payments || [])
        .filter((p) => (p.type === "walk_in" || p.type === "walkin") && (p.notes || p.note || "").includes(guestName))
        .filter((p) => inRange(p.paidAt));
      attendance = (data.attendance || [])
        .filter((a) => a.walkInId === person.id || (a.guestName && a.guestName === guestName))
        .filter((a) => inRange(a.checkIn || a.date));
    }
  }

  payments = [...payments].sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt));
  attendance = [...attendance].sort((a, b) => new Date(b.checkIn) - new Date(a.checkIn));

  const totalPaid = payments.filter((p) => p.status !== "refunded").reduce((s, p) => s + Number(p.amount || 0), 0);
  const totalRefunded = payments.filter((p) => p.status === "refunded").reduce((s, p) => s + Number(p.amount || 0), 0);
  const visitCount = attendance.length;

  // Membership balance summary (for members only)
  const memberBalances = type === "member" ? memberships.map((ms) => ({
    plan: getPlanName(ms.plan),
    startDate: ms.startDate,
    endDate: ms.endDate,
    status: ms.status,
    totalDue: Number(ms.totalDue || 0),
    totalPaid: Number(ms.totalPaid || 0),
  })) : [];

  const handlePrint = () => {
    window.print();
  };

  return (
    <div>
      {/* Print-only style — hides everything except the statement card during print */}
      <style>{`
        @media print {
          .sidebar, .session-bar, .tabs, .toolbar, .no-print, .page-header { display: none !important; }
          .app-layout { display: block !important; }
          .statement-print { box-shadow: none !important; border: none !important; padding: 0 !important; background: white !important; color: black !important; }
          .statement-print * { color: black !important; background: transparent !important; border-color: #ccc !important; }
          .statement-print .badge { background: #eee !important; border: 1px solid #ccc !important; }
          body { background: white !important; }
        }
      `}</style>

      {/* Picker — hidden when printing */}
      <div className="card no-print" style={{ marginBottom: 16, padding: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr 1fr auto", gap: 12, alignItems: "end" }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: 11 }}>Type</label>
            <select value={type} onChange={(e) => { setType(e.target.value); setPersonId(""); }}>
              <option value="member">Member</option>
              <option value="walkin">Walk-In Guest</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: 11 }}>{type === "member" ? "Member" : "Walk-In"}</label>
            <select value={personId} onChange={(e) => setPersonId(e.target.value)}>
              <option value="">Select {type === "member" ? "a member" : "a walk-in"}...</option>
              {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: 11 }}>From date</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch {} }} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: 11 }}>To date</label>
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch {} }} />
          </div>
          <button className="btn btn-primary" onClick={handlePrint} disabled={!person}>
            <Receipt size={14} /> Print / Save PDF
          </button>
        </div>
      </div>

      {!person && (
        <div className="card" style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
          <Receipt size={36} style={{ marginBottom: 12, color: "var(--text-muted)" }} />
          <p>Select a {type === "member" ? "member" : "walk-in guest"} above to generate a financial statement.</p>
        </div>
      )}

      {person && (
        <div className="card statement-print" style={{ padding: 32 }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid var(--accent)", paddingBottom: 16, marginBottom: 20 }}>
            <div>
              <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--accent)", margin: 0 }}>Rush Fitness Centre</h1>
              <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4 }}>Naalya Quality Shopping Mall, Kampala</p>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18, marginTop: 14 }}>Financial Statement</h2>
            </div>
            <div style={{ textAlign: "right", fontSize: 12 }}>
              <p style={{ color: "var(--text-muted)" }}>Generated</p>
              <p style={{ fontWeight: 600 }}>{formatDate(new Date())} {formatTime(new Date())}</p>
              {(from || to) && (
                <>
                  <p style={{ color: "var(--text-muted)", marginTop: 8 }}>Period</p>
                  <p style={{ fontWeight: 600 }}>{from ? formatDate(from) : "All time"} → {to ? formatDate(to) : "Today"}</p>
                </>
              )}
            </div>
          </div>

          {/* Person details */}
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: 14, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 8 }}>
              {type === "member" ? "Member" : "Walk-In Guest"}
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
              <div>
                <p style={{ fontSize: 11, color: "var(--text-muted)" }}>Name</p>
                <p style={{ fontSize: 16, fontWeight: 600 }}>{type === "member" ? fullName(person) : (person.name || `${person.firstName || ""} ${person.lastName || ""}`.trim() || "Guest")}</p>
              </div>
              <div>
                <p style={{ fontSize: 11, color: "var(--text-muted)" }}>Phone</p>
                <p style={{ fontSize: 14 }}>{person.phone || "—"}</p>
              </div>
              <div>
                <p style={{ fontSize: 11, color: "var(--text-muted)" }}>{type === "member" ? "ID (NIN/Passport)" : "Visit Date"}</p>
                <p style={{ fontSize: 14, fontFamily: "monospace" }}>
                  {type === "member"
                    ? (person.nationalId || person.passportNumber || "—")
                    : formatDate(person.visitDate)}
                </p>
              </div>
            </div>
          </div>

          {/* Summary stat cards */}
          <div className="card-grid" style={{ marginBottom: 24 }}>
            <StatCard icon={DollarSign} label="Total Paid" value={formatUGX(totalPaid)} color="var(--success)" bg="var(--success-dim)" />
            {totalRefunded > 0 && <StatCard icon={X} label="Refunded" value={formatUGX(totalRefunded)} color="var(--warning)" bg="var(--warning-dim)" />}
            <StatCard icon={UserCheck} label="Visits / Check-ins" value={visitCount} color="var(--info)" bg="var(--info-dim)" />
            <StatCard icon={Receipt} label="Transactions" value={payments.length} color="var(--accent)" bg="var(--accent-dim)" />
          </div>

          {/* Memberships (members only) */}
          {memberBalances.length > 0 && (
            <>
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 16, marginBottom: 8 }}>Memberships</h3>
              <div className="table-wrapper" style={{ marginBottom: 24 }}>
                <table>
                  <thead>
                    <tr><th>Plan</th><th>Start</th><th>End</th><th>Status</th><th>Total Due</th><th>Paid</th><th>Balance</th></tr>
                  </thead>
                  <tbody>
                    {memberBalances.map((ms, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 500 }}>{ms.plan}</td>
                        <td>{formatDate(ms.startDate)}</td>
                        <td>{formatDate(ms.endDate)}</td>
                        <td><Badge variant={ms.status === "active" ? "success" : ms.status === "frozen" ? "warning" : "neutral"}>{ms.status}</Badge></td>
                        <td>{formatUGX(ms.totalDue)}</td>
                        <td style={{ color: "var(--success)" }}>{formatUGX(ms.totalPaid)}</td>
                        <td style={{ color: ms.totalDue - ms.totalPaid > 0 ? "var(--danger)" : "var(--text-muted)", fontWeight: 700 }}>
                          {formatUGX(Math.max(0, ms.totalDue - ms.totalPaid))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Payment ledger */}
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 16, marginBottom: 8 }}>Payment Ledger</h3>
          <div className="table-wrapper" style={{ marginBottom: 24 }}>
            <table>
              <thead>
                <tr><th>Date</th><th>Type</th><th>Method</th><th>Reference</th><th>Notes</th><th style={{ textAlign: "right" }}>Amount</th></tr>
              </thead>
              <tbody>
                {payments.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--text-muted)", padding: 24 }}>No payment records.</td></tr>
                )}
                {payments.map((p) => (
                  <tr key={p.id} style={p.status === "refunded" ? { opacity: 0.6, textDecoration: "line-through" } : undefined}>
                    <td>{formatDate(p.paidAt)} {formatTime(p.paidAt)}</td>
                    <td><Badge variant="neutral">{p.type || "—"}</Badge></td>
                    <td>{p.method === "mobile_money" ? "M-Money" : (p.method || "—").charAt(0).toUpperCase() + (p.method || "—").slice(1)}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 11 }}>{p.reference || "—"}</td>
                    <td style={{ fontSize: 12, color: "var(--text-dim)", maxWidth: 250 }}>{p.notes || p.note || "—"}</td>
                    <td style={{ textAlign: "right", fontWeight: 600, color: p.status === "refunded" ? "var(--warning)" : "var(--accent)" }}>
                      {formatUGX(Number(p.amount || 0))}
                    </td>
                  </tr>
                ))}
                {payments.length > 0 && (
                  <tr style={{ borderTop: "2px solid var(--border)" }}>
                    <td colSpan={5} style={{ fontWeight: 700, textAlign: "right", paddingTop: 12 }}>Net Paid</td>
                    <td style={{ textAlign: "right", fontWeight: 700, fontSize: 16, color: "var(--success)", paddingTop: 12 }}>
                      {formatUGX(totalPaid - totalRefunded)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Attendance ledger */}
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 16, marginBottom: 8 }}>Check-In History</h3>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr><th>Date</th><th>Check-In</th><th>Check-Out</th><th>Source</th><th>Locker</th></tr>
              </thead>
              <tbody>
                {attendance.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)", padding: 24 }}>No check-in records.</td></tr>
                )}
                {attendance.map((a) => {
                  const lockerObj = a.lockerId ? data.lockers.find((l) => l.id === a.lockerId) : null;
                  return (
                    <tr key={a.id}>
                      <td>{formatDate(a.date)}</td>
                      <td>{formatTime(a.checkIn)}</td>
                      <td>{a.checkOut ? formatTime(a.checkOut) : "—"}</td>
                      <td><Badge variant={a.source === "walkin" ? "warning" : a.source === "self" ? "info" : "neutral"}>{a.source === "walkin" ? "Walk-In" : a.source === "self" ? "Self" : "Staff"}</Badge></td>
                      <td>{lockerObj ? `#${lockerObj.number}` : (a.locker ? `#${a.locker}` : "—")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div style={{ marginTop: 32, paddingTop: 16, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)" }}>
            <span>This statement is auto-generated by Rush Fitness GMS.</span>
            <span>Page 1 of 1</span>
          </div>
        </div>
      )}
    </div>
  );
};

const Reports = ({ data }) => {
  const totalRevenue = data.payments.filter((p) => p.type !== "prepaid_visit").reduce((s, p) => s + p.amount, 0);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthlyRevenue = data.payments.filter((p) => p.paidAt.startsWith(currentMonth) && p.type !== "prepaid_visit").reduce((s, p) => s + p.amount, 0);
  const totalDiscounts = data.payments.reduce((s, p) => s + (p.discountAmount || 0), 0);
  const planBreakdown = {};
  data.memberships.forEach((ms) => {
    const key = getPlanName(ms.plan);
    planBreakdown[key] = (planBreakdown[key] || 0) + 1;
  });

  const [tab, setTab] = useState("overview"); // overview | debtors

  // DEBTORS: members with pending_payment memberships (partial payments)
  const memberDebtors = data.memberships.filter((ms) => ms.status === "pending_payment" || (ms.isActive && ms.totalDue)).map((ms) => {
    const bal = getMembershipBalance(ms, data.payments);
    if (bal.isPaidInFull) return null;
    const member = data.members.find((m) => m.id === ms.memberId);
    if (!member) return null;
    return { type: "membership", member, membership: ms, ...bal };
  }).filter(Boolean);

  // DEBTORS: walk-ins with pending payment
  const walkinDebtors = data.walkIns.filter((w) => w.paymentStatus === "pending").map((w) => ({
    type: "walkin", name: `${w.firstName || ""} ${w.lastName || w.name || ""}`.trim(), phone: w.phone,
    totalDue: w.amountDue || w.amountPaid || 0, totalPaid: 0, balance: w.amountDue || w.amountPaid || 0,
    date: w.visitDate, activities: w.activities?.map((id) => ACTIVITIES.find((a) => a.id === id)?.name).join(", ") || "",
  }));

  const allDebtors = [...memberDebtors, ...walkinDebtors];
  const totalOutstanding = allDebtors.reduce((s, d) => s + d.balance, 0);

  return (
    <div>
      <div className="page-header"><h2>Reports</h2><p>Revenue analytics and debtor tracking</p></div>

      <div className="tabs" style={{ marginBottom: 20 }}>
        <button className={`tab ${tab === "overview" ? "active" : ""}`} onClick={() => setTab("overview")}>Revenue Overview</button>
        <button className={`tab ${tab === "debtors" ? "active" : ""}`} onClick={() => setTab("debtors")}>Debtors Report ({allDebtors.length})</button>
        <button className={`tab ${tab === "statement" ? "active" : ""}`} onClick={() => setTab("statement")}>Financial Statement</button>
      </div>

      {tab === "statement" && <FinancialStatement data={data} />}


      {tab === "overview" && (
        <>
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
                const total = data.payments.filter((p) => p.method === method && p.type !== "prepaid_visit").reduce((s, p) => s + p.amount, 0);
                return (
                  <div key={method} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                    <span style={{ color: "var(--text)" }}>{method === "mobile_money" ? "Mobile Money" : method.charAt(0).toUpperCase() + method.slice(1)}</span>
                    <span style={{ fontWeight: 600, color: "var(--accent)" }}>{formatUGX(total)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {tab === "debtors" && (
        <>
          <div className="card-grid" style={{ marginBottom: 20 }}>
            <StatCard icon={AlertTriangle} label="Total Debtors" value={allDebtors.length} color="var(--danger)" bg="var(--danger-dim)" />
            <StatCard icon={DollarSign} label="Total Outstanding" value={formatUGX(totalOutstanding)} color="var(--danger)" bg="var(--danger-dim)" />
            <StatCard icon={Users} label="Member Debtors" value={memberDebtors.length} color="var(--warning)" bg="var(--warning-dim)" />
            <StatCard icon={UserCheck} label="Walk-In Debtors" value={walkinDebtors.length} color="var(--info)" bg="var(--info-dim)" />
          </div>

          {allDebtors.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: 40 }}>
              <Check size={40} style={{ color: "var(--success)", marginBottom: 12 }} />
              <h3 style={{ fontFamily: "var(--font-display)", marginBottom: 8, color: "var(--success)" }}>No Outstanding Debts</h3>
              <p style={{ color: "var(--text-dim)" }}>All payments are up to date.</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead><tr><th>Type</th><th>Name</th><th>Phone</th><th>Details</th><th>Total Due</th><th>Paid</th><th>Balance</th><th>Progress</th></tr></thead>
                <tbody>
                  {allDebtors.map((d, i) => (
                    <tr key={i}>
                      <td><Badge variant={d.type === "membership" ? "warning" : "info"}>{d.type === "membership" ? "Member" : "Walk-In"}</Badge></td>
                      <td style={{ color: "var(--text)", fontWeight: 500 }}>{d.type === "membership" ? fullName(d.member) : d.name}</td>
                      <td>{d.type === "membership" ? d.member.phone : d.phone}</td>
                      <td style={{ fontSize: 12, color: "var(--text-dim)" }}>
                        {d.type === "membership" ? (
                          <span>{getPlanName(d.membership.plan)} • {formatDate(d.membership.startDate)}</span>
                        ) : (
                          <span>{d.activities} • {formatDate(d.date)}</span>
                        )}
                      </td>
                      <td>{formatUGX(d.totalDue)}</td>
                      <td style={{ color: "var(--success)" }}>{formatUGX(d.totalPaid)}</td>
                      <td style={{ fontWeight: 700, color: "var(--danger)" }}>{formatUGX(d.balance)}</td>
                      <td style={{ minWidth: 100 }}>
                        <div style={{ height: 6, background: "var(--bg-input)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${d.totalDue > 0 ? Math.round(d.totalPaid / d.totalDue * 100) : 0}%`, background: "var(--warning)", borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{d.totalDue > 0 ? Math.round(d.totalPaid / d.totalDue * 100) : 0}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {allDebtors.length > 0 && (
            <div className="card" style={{ marginTop: 20 }}>
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 16, marginBottom: 12 }}>Summary</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                <div>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase" }}>Total Owed</p>
                  <p style={{ fontSize: 22, fontWeight: 700, color: "var(--danger)" }}>{formatUGX(totalOutstanding)}</p>
                </div>
                <div>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase" }}>Already Collected</p>
                  <p style={{ fontSize: 22, fontWeight: 700, color: "var(--success)" }}>{formatUGX(allDebtors.reduce((s, d) => s + d.totalPaid, 0))}</p>
                </div>
                <div>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase" }}>Collection Rate</p>
                  <p style={{ fontSize: 22, fontWeight: 700, color: "var(--accent)" }}>{allDebtors.reduce((s, d) => s + d.totalDue, 0) > 0 ? Math.round(allDebtors.reduce((s, d) => s + d.totalPaid, 0) / allDebtors.reduce((s, d) => s + d.totalDue, 0) * 100) : 0}%</p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
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
    pages: ["dashboard", "checkin", "kiosk", "members", "memberships", "attendance", "timetable", "activities", "trainers", "equipment", "lockers", "payments", "shop", "expenses", "discounts", "reconciliation", "reports", "staff", "audit"],
    actions: ["create_member", "edit_member", "deactivate_member", "assign_plan", "freeze_membership", "record_payment", "manage_discounts", "manage_staff", "manage_equipment", "manage_trainers", "manage_activities", "manage_products", "manage_expenses", "view_reports", "view_payments", "reconcile", "export_data", "view_audit_log", "edit_walkin", "delete_expense"],
  },
  manager: {
    pages: ["dashboard", "checkin", "kiosk", "members", "memberships", "attendance", "timetable", "activities", "trainers", "equipment", "lockers", "payments", "shop", "expenses", "discounts", "reconciliation", "reports"],
    actions: ["create_member", "edit_member", "assign_plan", "freeze_membership", "record_payment", "manage_discounts", "manage_equipment", "manage_trainers", "manage_products", "manage_expenses", "view_reports", "view_payments", "reconcile", "export_data", "edit_walkin"],
  },
  receptionist: {
    pages: ["dashboard", "checkin", "kiosk", "members", "memberships", "attendance", "timetable", "lockers", "equipment", "shop", "payments", "expenses", "reports"],
    actions: ["create_member", "edit_member", "assign_plan", "record_payment", "checkin_member", "sell_products", "record_expense", "update_equipment_status"],
  },
  trainer: {
    pages: ["dashboard", "checkin", "members", "attendance", "timetable", "equipment"],
    actions: ["update_equipment_status"],
  },
  // Back-compat for any old in-memory rows that still say "staff"
  staff: {
    pages: ["dashboard", "checkin", "kiosk", "members", "memberships", "attendance", "timetable", "lockers", "equipment", "shop", "payments", "expenses", "reports"],
    actions: ["create_member", "edit_member", "assign_plan", "record_payment", "checkin_member", "sell_products", "record_expense", "update_equipment_status"],
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
  const [backendStatus, setBackendStatus] = useState({ state: "checking", url: window.__rfgApi?.base || "", message: "" });

  // Ping the backend health endpoint on mount so the user can see immediately
  // whether the React app can reach the API.
  useEffect(() => {
    const apiBase = window.__rfgApi?.base || "";
    let cancelled = false;
    (async () => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000);
        const res = await fetch(`${apiBase}/api/health`, { signal: ctrl.signal });
        clearTimeout(t);
        if (cancelled) return;
        if (res.ok) {
          const j = await res.json().catch(() => ({}));
          setBackendStatus({ state: "ok", url: apiBase, message: `db: ${j.db || "?"}` });
        } else {
          setBackendStatus({ state: "error", url: apiBase, message: `HTTP ${res.status}` });
        }
      } catch (err) {
        if (!cancelled) {
          setBackendStatus({
            state: "error",
            url: apiBase,
            message: err.name === "AbortError" ? "Timeout (5s) — backend unreachable" : err.message,
          });
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleLogin = async () => {
    if (lockedUntil && Date.now() < lockedUntil) {
      setError(`Account locked. Try again in ${Math.ceil((lockedUntil - Date.now()) / 1000)}s`);
      return;
    }
    if (!username || !password) { setError("Please enter both username and password"); return; }
    setLoading(true);
    setError("");

    try {
      const { user } = await authApi.login(username, password);
      setLoading(false);
      setAttempts(0);
      onLogin(adaptUser(user));
    } catch (err) {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      // Backend rate-limits after 20 attempts/10min; we still show local feedback
      if (newAttempts >= 5) {
        const lockTime = Date.now() + 60000;
        setLockedUntil(lockTime);
        setError("Too many failed attempts. Locked for 60 seconds.");
        setTimeout(() => { setLockedUntil(null); setAttempts(0); }, 60000);
      } else {
        const msg = err?.message || "Login failed";
        setError(`${msg} (${5 - newAttempts} attempts remaining)`);
      }
      setLoading(false);
    }
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
            <PasswordInput value={password} onChange={setPassword} placeholder="Enter password" autoComplete="current-password" onKeyDown={(e) => e.key === "Enter" && handleLogin()} />
          </div>
          <button className="btn btn-primary" style={{ width: "100%", padding: "12px 24px", fontSize: 15, justifyContent: "center" }} onClick={handleLogin} disabled={loading}>
            {loading ? <RefreshCw size={16} style={{ animation: "spin 1s linear infinite" }} /> : <LogIn size={16} />}
            {loading ? "Verifying..." : "Sign In"}
          </button>
        </div>

        <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 11, marginTop: 16 }}>
          Naalya Quality Shopping Mall, Kampala • All sessions are logged
        </p>

        {/* Backend status indicator — visible without DevTools */}
        <div style={{
          marginTop: 12,
          padding: "8px 12px",
          borderRadius: "var(--radius-xs)",
          fontSize: 11,
          fontFamily: "monospace",
          textAlign: "center",
          background: backendStatus.state === "ok" ? "var(--success-dim)" : backendStatus.state === "error" ? "var(--danger-dim)" : "var(--bg-elevated)",
          color: backendStatus.state === "ok" ? "var(--success)" : backendStatus.state === "error" ? "var(--danger)" : "var(--text-muted)",
          border: `1px solid ${backendStatus.state === "ok" ? "rgba(34,197,94,0.3)" : backendStatus.state === "error" ? "rgba(239,68,68,0.3)" : "var(--border)"}`,
        }}>
          {backendStatus.state === "checking" && `Checking backend at ${backendStatus.url || "(none)"}...`}
          {backendStatus.state === "ok" && `✓ Backend OK at ${backendStatus.url} (${backendStatus.message})`}
          {backendStatus.state === "error" && `✗ Backend ${backendStatus.url}: ${backendStatus.message}`}
        </div>
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
  ]},
  { section: "Operations", items: [
    { id: "timetable", label: "Timetable", icon: Calendar },
    { id: "activities", label: "Activities", icon: Star },
    { id: "trainers", label: "Trainers", icon: Activity },
    { id: "equipment", label: "Equipment", icon: Wrench },
    { id: "lockers", label: "Lockers", icon: Hash },
  ]},
  { section: "Finance", items: [
    { id: "payments", label: "Payments", icon: DollarSign },
    { id: "shop", label: "Shop / POS", icon: Award },
    { id: "expenses", label: "Expenses", icon: CreditCard },
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
  const [authReady, setAuthReady] = useState(false);

  // Restore session on mount: if we have a token, fetch the current user.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = authStore.getToken();
      if (!token) { setAuthReady(true); return; }
      try {
        const me = await authApi.me();
        if (!cancelled) {
          setCurrentUser(adaptUser(me));
          setLastActivity(Date.now());
        }
      } catch {
        // Token invalid/expired – clear it silently
        authStore.clear();
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // After the user logs in, hydrate the shared `data` state from the backend
  // for the resources we've wired up so far. Other tabs continue to use their
  // own local seed data until they're wired too.
  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    (async () => {
      try {
        const [
          plansRes, msRes, payRes, memRes, trRes,
          lockRes, prodRes, eqRes, wiRes, attRes, discRes, expRes, usrRes,
          actRes,
        ] = await Promise.all([
          plansApi.list({ limit: 100 }),
          membershipsApi.list({ limit: 500 }),
          paymentsApi.list({ limit: 500 }),
          membersApi.list({ limit: 500 }),
          trainersApi.list({ limit: 200 }),
          lockersApi.list({ limit: 200 }),
          productsApi.list({ limit: 500 }),
          equipmentApi.list({ limit: 200 }),
          walkInsApi.list({ limit: 500 }),
          attendanceApi.list({ limit: 500 }),
          discountsApi.list({ limit: 200 }),
          expensesApi.list({ limit: 500 }),
          // Users API is admin-only — swallow 403 for non-admins
          (currentUser?.role === "admin" ? usersApi.list({ limit: 200 }) : Promise.resolve({ data: [] })).catch(() => ({ data: [] })),
          activitiesApi.list({ limit: 100 }),
        ]);
        if (cancelled) return;
        const plans = (plansRes?.data || []);
        const memberships = (msRes?.data || []).map(adaptMembership);
        const payments = (payRes?.data || []).map(adaptPayment);
        const members = (memRes?.data || []).map((m) => ({
          ...m,
          emergency: m.emergencyPhone || "",
          emergency2: m.emergencyPhone2 || "",
          photo: m.photoUrl || null,
        }));
        const trainers   = (trRes?.data   || []).map(adaptTrainer);
        const lockers    = (lockRes?.data || []).map(adaptLocker);
        const products   = (prodRes?.data || []).map(adaptProduct);
        const equipment  = (eqRes?.data   || []).map(adaptEquipment);
        const walkIns    = (wiRes?.data   || []).map(adaptWalkIn);
        const attendance = (attRes?.data  || []).map(adaptAttendance);
        const discounts  = (discRes?.data || []).map(adaptDiscount);
        const expenses   = (expRes?.data  || []).map(adaptExpense);
        const staff      = (usrRes?.data  || []).map(adaptStaff);
        const activities = (actRes?.data  || []).map(adaptActivity);
        setData((d) => ({
          ...d,
          plans, members, memberships, payments, trainers,
          lockers, products, equipment, walkIns, attendance,
          discounts, expenses,
          activities: activities.length ? activities : d.activities,  // fallback to seed if API empty
          staff: staff.length ? staff : d.staff,
        }));
      } catch (err) {
        console.error("[app] failed to hydrate from API:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [currentUser]);

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
    authApi.logout();
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

  if (!authReady) {
    return <><style>{CSS}</style><div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}><p style={{ color: "var(--text-dim)" }}>Loading...</p></div></>;
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
      case "checkin": return <CheckIn data={data} setData={securedSetData} currentUser={currentUser} />;
      case "members": return <Members data={data} setData={securedSetData} currentUser={currentUser} />;
      case "memberships": return <Memberships data={data} setData={securedSetData} currentUser={currentUser} />;
      case "payments": return <Payments data={data} />;
      case "shop": return <Shop data={data} setData={securedSetData} currentUser={currentUser} />;
      case "expenses": return <Expenses data={data} setData={securedSetData} currentUser={currentUser} />;
      case "attendance": return <Attendance data={data} setData={securedSetData} />;
      case "timetable": return <TimetablePage data={data} setData={securedSetData} currentUser={currentUser} />;
      case "trainers": return <Trainers data={data} setData={securedSetData} />;
      case "activities": return <ActivitiesAdmin data={data} setData={securedSetData} currentUser={currentUser} />;
      case "equipment": return <Equipment data={data} setData={securedSetData} currentUser={currentUser} />;
      case "discounts": return <Discounts data={data} setData={securedSetData} />;
      case "reconciliation": return <Reconciliation data={data} setData={securedSetData} />;
      case "staff": return <StaffMgmt data={data} setData={securedSetData} currentUser={currentUser} />;
      case "lockers": return <Lockers data={data} setData={securedSetData} currentUser={currentUser} />;
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
                <div className="user-avatar">{currentUser.name?.charAt(0) || "U"}</div>
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
