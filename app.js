import { createBackend, errorText } from "./backend.js";
import { icon } from "./icons.js";
import { APP_NAME, APP_VERSION } from "./config.js";

// ═════════════════════════════════════════════════════════════
//  STANJE
// ═════════════════════════════════════════════════════════════
const S = {
  be: null, user: null, profile: null, isAdmin: false, config: {},
  accounts: [], categories: [], transactions: [],
  hide: false, catTab: "expense", statsMonth: null, statsType: "expense",
  txFilter: { q: "", type: "all", month: "all", account: "all", category: "all" },
  installPrompt: null, onb: null, booting: true
};
const LS = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem("cekin:" + k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem("cekin:" + k, JSON.stringify(v)); } catch {} }
};

const COLORS = ["#F5B83D", "#F97316", "#EF4444", "#EC4899", "#A855F7", "#6366F1", "#3B82F6", "#06B6D4", "#14B8A6", "#10B981", "#84CC16", "#64748B"];
const CAT_ICONS = ["shopping-cart", "utensils", "coffee", "pizza", "beer", "car", "fuel", "bus", "bike", "plane", "house", "zap", "droplet", "wifi", "smartphone", "tv", "music", "film", "gamepad2", "ticket", "dumbbell", "heart-pulse", "pill", "graduation-cap", "book-open", "shirt", "scissors", "gift", "baby", "paw-print", "wrench", "hammer", "briefcase", "laptop", "receipt", "building2", "umbrella", "shield", "heart", "palette", "cloud", "package", "badge-percent", "hand-coins", "gem", "chart-candlestick", "tree-pine", "store", "lightbulb", "flame", "award", "coins", "banknote", "piggy-bank", "landmark", "credit-card", "sparkles", "percent"];
const ACC_TYPES = {
  cash: { label: "Gotovina", icon: "banknote" },
  bank: { label: "Bančni račun", icon: "landmark" },
  card: { label: "Kartica", icon: "credit-card" },
  savings: { label: "Prihranki", icon: "piggy-bank" },
  invest: { label: "Naložbe", icon: "chart-candlestick" },
  other: { label: "Drugo", icon: "wallet" }
};
const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "BAM", "RSD", "HUF", "CZK", "PLN", "SEK", "NOK", "DKK"];
const DEFAULT_EXPENSE = [
  ["Trgovina", "shopping-cart", "#10B981"], ["Restavracije", "utensils", "#F97316"], ["Prevoz", "car", "#3B82F6"],
  ["Gorivo", "fuel", "#64748B"], ["Stanovanje", "house", "#6366F1"], ["Položnice", "zap", "#F5B83D"],
  ["Telefon in internet", "wifi", "#06B6D4"], ["Naročnine", "tv", "#A855F7"], ["Zdravje", "heart-pulse", "#EF4444"],
  ["Oblačila", "shirt", "#EC4899"], ["Zabava", "gamepad2", "#84CC16"], ["Darila", "gift", "#F43F5E"],
  ["Izobraževanje", "graduation-cap", "#14B8A6"], ["Potovanja", "plane", "#0EA5E9"], ["Šport", "dumbbell", "#22C55E"],
  ["Drugo", "package", "#94A3B8"]
];
const DEFAULT_INCOME = [
  ["Plača", "briefcase", "#10B981"], ["Honorarji", "laptop", "#3B82F6"], ["Darila", "gift", "#EC4899"],
  ["Obresti in dividende", "chart-candlestick", "#F5B83D"], ["Prodaja", "store", "#F97316"],
  ["Povračila", "hand-coins", "#14B8A6"], ["Drugo", "coins", "#94A3B8"]
];

// ═════════════════════════════════════════════════════════════
//  POMOŽNE FUNKCIJE
// ═════════════════════════════════════════════════════════════
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const pad = (n) => String(n).padStart(2, "0");
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayISO = () => isoOf(new Date());
const parseISO = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const monthKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const addMonths = (mk, n) => { const [y, m] = mk.split("-").map(Number); return monthKey(new Date(y, m - 1 + n, 1)); };
const monthLabel = (mk, opts = { month: "long", year: "numeric" }) => {
  const [y, m] = mk.split("-").map(Number);
  const s = new Intl.DateTimeFormat("sl-SI", opts).format(new Date(y, m - 1, 1));
  return s.charAt(0).toUpperCase() + s.slice(1);
};
function fmtDate(iso, long = false) {
  const t = todayISO(); const y = isoOf(new Date(Date.now() - 864e5));
  if (iso === t) return "Danes";
  if (iso === y) return "Včeraj";
  return new Intl.DateTimeFormat("sl-SI", long ? { weekday: "long", day: "numeric", month: "long" } : { day: "numeric", month: "short" }).format(parseISO(iso));
}
const currency = () => S.profile?.currency || "EUR";
// Zapis zneska: 1.500,00 € (ločilo tisočic je vedno pika, tudi pri štirimestnih številih)
const symCache = {};
function currencySymbol(cur) {
  if (!symCache[cur]) {
    try { symCache[cur] = new Intl.NumberFormat("sl-SI", { style: "currency", currency: cur }).formatToParts(0).find((p) => p.type === "currency")?.value || cur; }
    catch { symCache[cur] = cur; }
  }
  return symCache[cur];
}
function money(c, { sign = false, hide = false } = {}) {
  if (hide) return "∗∗∗∗∗";
  const abs = Math.abs(Math.round(c || 0));
  const int = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const s = `${int},${String(abs % 100).padStart(2, "0")} ${currencySymbol(currency())}`;
  if (c < 0) return "−" + s;
  if (sign && c > 0) return "+" + s;
  return s;
}
function parseAmount(v) {
  let s = String(v ?? "").replace(/\s|€/g, "");
  if (s.includes(",") || /^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ""); // pika = ločilo tisočic
  s = s.replace(",", ".");
  const n = parseFloat(s);
  return isFinite(n) ? Math.round(n * 100) : NaN;
}
// Stanje premoženja (skupno stanje, viri) – to skrije gumb z očesom; transakcije ostanejo vidne.
const wealth = (c) => money(c, { hide: S.hide });
// Prihodki se ob skritem stanju prav tako skrijejo; odhodki ostanejo vidni.
const priv = (c, o = {}) => money(c, { ...o, hide: S.hide });
const amountInput = (c) => (c ? money(c).replace(/\s\S+$/, "").replace("−", "-") : "");
const persist = (p) => Promise.resolve(p).catch((e) => toast(errorText(e), "error"));
const greeting = () => { const h = new Date().getHours(); return h < 10 ? "Dobro jutro" : h < 18 ? "Dober dan" : "Dober večer"; };

const acc = (id) => S.accounts.find((a) => a.id === id);
const cat = (id) => S.categories.find((c) => c.id === id);
const activeAccounts = () => S.accounts.filter((a) => !a.archived).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

// ── izračuni ─────────────────────────────────────────────────
function balances(upTo = todayISO()) {
  const b = {};
  S.accounts.forEach((a) => (b[a.id] = a.initial || 0));
  for (const t of S.transactions) {
    if (t.date > upTo) continue;
    const a = t.amount || 0;
    if (t.type === "income") b[t.accountId] = (b[t.accountId] || 0) + a;
    else if (t.type === "expense") b[t.accountId] = (b[t.accountId] || 0) - a;
    else if (t.type === "adjust") b[t.accountId] = (b[t.accountId] || 0) + a;
    else if (t.type === "transfer") {
      b[t.accountId] = (b[t.accountId] || 0) - a;
      b[t.toAccountId] = (b[t.toAccountId] || 0) + a;
    }
  }
  return b;
}
function totalBalance(upTo) {
  const b = balances(upTo);
  return S.accounts.filter((a) => !a.archived && a.includeInTotal !== false).reduce((s, a) => s + (b[a.id] || 0), 0);
}
function monthTotals(mk) {
  let income = 0, expense = 0;
  const today = todayISO();
  for (const t of S.transactions) {
    if (!t.date.startsWith(mk) || t.date > today) continue;
    if (t.type === "income") income += t.amount;
    else if (t.type === "expense") expense += t.amount;
  }
  return { income, expense, net: income - expense };
}
function byCategory(mk, type) {
  const m = {};
  const today = todayISO();
  for (const t of S.transactions) {
    if (t.type !== type || !t.date.startsWith(mk) || t.date > today) continue;
    m[t.categoryId || "_"] = (m[t.categoryId || "_"] || 0) + t.amount;
  }
  return m;
}
const sortedTx = (list = S.transactions) =>
  [...list].sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : (b.createdAt || 0) - (a.createdAt || 0)));

// ── ponavljajoče (naročnine / redni prihodki) ────────────────
function dueIn(y, m, day) {
  const dim = new Date(y, m + 1, 0).getDate();
  return isoOf(new Date(y, m, Math.min(day, dim)));
}
function nextDue(r, after) {
  const from = after && after > r.startDate ? after : r.startDate;
  let d = parseISO(from); let y = d.getFullYear(), m = d.getMonth();
  for (let i = 0; i < 400; i++) {
    const dd = dueIn(y, m, r.day);
    if (dd >= r.startDate && (!after || dd > after)) return dd;
    if (++m > 11) { m = 0; y++; }
  }
  return null;
}
async function processRecurring() {
  const today = todayISO(); const exists = new Set(S.transactions.map((t) => t.id));
  const newTx = []; const changed = [];
  for (const c of S.categories) {
    const r = c.recurring;
    if (!r?.enabled || !r.amount || !r.accountId || !r.startDate) continue;
    let last = r.lastRun || null; let d = nextDue(r, last); let n = 0;
    while (d && d <= today && n++ < 60) {
      const id = `rec_${c.id}_${d.slice(0, 7)}`;
      if (!exists.has(id)) {
        newTx.push({ id, type: c.type, amount: r.amount, categoryId: c.id, accountId: r.accountId, date: d, note: "", auto: true, createdAt: Date.now() });
        exists.add(id);
      }
      last = d; d = nextDue(r, d);
    }
    if (last !== (r.lastRun || null)) { c.recurring = { ...r, lastRun: last }; changed.push(c); }
  }
  if (newTx.length) { S.transactions.push(...newTx); persist(S.be.putMany("transactions", newTx)); }
  if (changed.length) persist(S.be.putMany("categories", changed));
  return newTx.length;
}
function upcoming(days = 14) {
  const today = todayISO(); const limit = isoOf(new Date(Date.now() + days * 864e5));
  return S.categories
    .filter((c) => c.recurring?.enabled && c.recurring.amount)
    .map((c) => ({ c, date: nextDue(c.recurring, c.recurring.lastRun || null) }))
    .filter((x) => x.date && x.date > today && x.date <= limit)
    .sort((a, b) => (a.date > b.date ? 1 : -1));
}

// ═════════════════════════════════════════════════════════════
//  UI: toast, sheet, potrditev
// ═════════════════════════════════════════════════════════════
function toast(msg, kind = "ok") {
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.innerHTML = `${icon(kind === "error" ? "circle-alert" : "check", 18)}<span>${esc(msg)}</span>`;
  $("#toast-root").appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 300); }, 3200);
}
function openSheet({ title, body, onMount, footer = "" }) {
  const root = $("#sheet-root");
  root.innerHTML = `<div class="backdrop" data-close></div>
    <section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="grip"></div>
      <header class="sheet-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="Zapri">${icon("x")}</button></header>
      <div class="sheet-body">${body}</div>
      ${footer ? `<footer class="sheet-foot">${footer}</footer>` : ""}
    </section>`;
  document.body.classList.add("sheet-open");
  requestAnimationFrame(() => root.classList.add("open"));
  $$("[data-close]", root).forEach((b) => b.addEventListener("click", closeSheet));
  onMount?.(root);
  const first = $("input:not([type=hidden]):not([readonly]), select, textarea", $(".sheet-body", root));
  if (first && window.matchMedia("(pointer:fine)").matches) setTimeout(() => first.focus(), 250);
}
function closeSheet() {
  const root = $("#sheet-root");
  root.classList.remove("open");
  document.body.classList.remove("sheet-open");
  setTimeout(() => { if (!root.classList.contains("open")) root.innerHTML = ""; }, 250);
}
function confirmBox(title, text, okLabel = "Potrdi", danger = true) {
  return new Promise((res) => {
    openSheet({
      title, body: `<p class="muted">${esc(text)}</p>`,
      footer: `<button class="btn ghost" data-no>Prekliči</button><button class="btn ${danger ? "danger" : "primary"}" data-yes>${esc(okLabel)}</button>`,
      onMount: (r) => {
        $("[data-yes]", r).onclick = () => { closeSheet(); res(true); };
        $("[data-no]", r).onclick = () => { closeSheet(); res(false); };
        $$("[data-close]", r).forEach((b) => b.addEventListener("click", () => res(false)));
      }
    });
  });
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("#sheet-root").classList.contains("open")) closeSheet(); });

// ═════════════════════════════════════════════════════════════
//  TEMA
// ═════════════════════════════════════════════════════════════
function applyTheme(t = LS.get("theme", "dark")) {
  const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  $('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0A0D14" : "#F6F7FB");
}
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => applyTheme());

// ═════════════════════════════════════════════════════════════
//  ZAGON
// ═════════════════════════════════════════════════════════════
async function boot() {
  applyTheme();
  S.hide = LS.get("hide", false);
  try {
    S.be = await createBackend();
  } catch (e) {
    console.error(e);
    $("#app").innerHTML = `<div class="center-screen"><div class="empty">${icon("circle-alert", 40)}<h2>Povezava ni uspela</h2><p class="muted">Ne morem naložiti Firebase knjižnic. Preveri internetno povezavo in osveži stran.</p><button class="btn primary" onclick="location.reload()">Osveži</button></div></div>`;
    return;
  }
  S.be.onAuth(async (user) => {
    S.user = user;
    if (!user) { S.profile = null; S.booting = false; return renderAuth(); }
    renderSplash();
    try {
      S.profile = await S.be.ensureProfile();
      const [data, isAdmin, config, secure] = await Promise.all([S.be.loadAll(), S.be.isAdmin(), S.be.getConfig(), S.be.getSecure()]);
      Object.assign(S, data, { isAdmin, config, secure: secure || {} });
      if (S.profile.theme) { LS.set("theme", S.profile.theme); applyTheme(S.profile.theme); }
      persist(S.be.setProfile({ lastActive: Date.now() }));
      S.booting = false;
      if (!S.profile.onboarded) return renderOnboarding();
      const n = await processRecurring();
      if (n) toast(`Samodejno knjiženih ponavljajočih transakcij: ${n}`);
      route();
    } catch (e) {
      S.booting = false;
      toast(errorText(e), "error");
      if (["no-access", "account-disabled", "pending"].includes(e.code)) { try { await S.be.signOut(); } catch {} }
      renderAuth(errorText(e));
    }
  });
  window.addEventListener("hashchange", route);
}

function renderSplash() {
  $("#app").innerHTML = `<div class="center-screen"><div class="logo-mark big pulse">${logoSvg()}</div></div>`;
}
const logoSvg = () => `<svg viewBox="0 0 48 48" width="100%" height="100%"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFD978"/><stop offset="1" stop-color="#E89B12"/></linearGradient></defs><circle cx="24" cy="24" r="22" fill="url(#lg)"/><circle cx="24" cy="24" r="16.5" fill="none" stroke="#7A4B00" stroke-opacity=".35" stroke-width="1.6"/><path d="M29.5 17.6a8.6 8.6 0 1 0 0 12.8" fill="none" stroke="#5A3700" stroke-width="3.4" stroke-linecap="round"/></svg>`;

// ═════════════════════════════════════════════════════════════
//  PRIJAVA / REGISTRACIJA
// ═════════════════════════════════════════════════════════════
function renderAuth(err = "", mode = "login") {
  const demo = S.be.mode === "local";
  $("#app").innerHTML = `
  <div class="auth">
    <div class="auth-glow"></div>
    <div class="auth-card">
      <div class="brand"><div class="logo-mark">${logoSvg()}</div><div><h1>${APP_NAME}</h1><p class="muted">Vsak cent na svojem mestu.</p></div></div>
      ${demo ? `<div class="banner info">${icon("info", 18)}<span><b>Lokalni način.</b> Podatki se shranijo samo v ta brskalnik. Za oblak vpiši Firebase nastavitve v <code>js/config.js</code>.</span></div>` : ""}
      ${demo ? `<div class="seg" role="tablist">
        <button class="${mode === "login" ? "on" : ""}" data-mode="login">Prijava</button>
        <button class="${mode === "register" ? "on" : ""}" data-mode="register">Lokalni račun</button>
      </div>` : ""}
      <form id="auth-form" novalidate>
        <label class="field"><span>E-pošta</span><div class="input-ic">${icon("mail", 18)}<input type="email" name="email" autocomplete="email" required placeholder="ime@primer.si"></div></label>
        <label class="field"><span>Geslo</span><div class="input-ic">${icon("lock", 18)}<input type="password" name="pw" autocomplete="${mode === "login" ? "current-password" : "new-password"}" required minlength="8" placeholder="••••••••"><button type="button" class="icon-btn sm" data-eye aria-label="Pokaži geslo">${icon("eye", 18)}</button></div></label>
        ${mode === "register" ? `<label class="field"><span>Ponovi geslo</span><div class="input-ic">${icon("lock", 18)}<input type="password" name="pw2" autocomplete="new-password" required placeholder="••••••••"></div></label>` : ""}
        <p class="form-err" ${err ? "" : "hidden"}>${esc(err)}</p>
        <button class="btn primary block lg" type="submit">${mode === "login" ? "Prijava" : "Ustvari račun"}</button>
        ${mode === "login" && !demo ? `<button type="button" class="link" data-forgot>Pozabljeno geslo?</button>` : ""}
      </form>
      ${!demo ? `<p class="muted tiny center auth-note">${icon("shield-check", 14)} Dostop je samo za povabljene. Račun ti ustvari skrbnik.</p>` : ""}
    </div>
    <p class="muted tiny center">${APP_NAME} v${APP_VERSION}</p>
  </div>`;
  $$("[data-mode]").forEach((b) => (b.onclick = () => renderAuth("", b.dataset.mode)));
  $("[data-eye]").onclick = (e) => {
    const i = $('input[name="pw"]'); i.type = i.type === "password" ? "text" : "password";
    e.currentTarget.innerHTML = icon(i.type === "password" ? "eye" : "eye-off", 18);
  };
  $("[data-forgot]")?.addEventListener("click", async () => {
    const email = $('input[name="email"]').value.trim();
    if (!email) return showErr("Vpiši e-poštni naslov, nato klikni »Pozabljeno geslo?«.");
    try { await S.be.resetPassword(email); toast("Povezava za ponastavitev je poslana na e-pošto."); } catch (e) { showErr(errorText(e)); }
  });
  const showErr = (m) => { const p = $(".form-err"); p.textContent = m; p.hidden = !m; };
  $("#auth-form").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target); const email = f.get("email").trim(); const pw = f.get("pw");
    if (!email || !pw) return showErr("Izpolni vsa polja.");
    if (mode === "register") {
      if (pw.length < 8) return showErr("Geslo mora imeti vsaj 8 znakov.");
      if (pw !== f.get("pw2")) return showErr("Gesli se ne ujemata.");
    }
    const btn = $('button[type="submit"]'); btn.disabled = true; btn.classList.add("loading");
    try { mode === "login" ? await S.be.signIn(email, pw) : await S.be.signUp(email, pw); }
    catch (er) { showErr(errorText(er)); btn.disabled = false; btn.classList.remove("loading"); }
  };
}

// ═════════════════════════════════════════════════════════════
//  PRVA NASTAVITEV (onboarding)
// ═════════════════════════════════════════════════════════════
function renderOnboarding() {
  if (!S.onb) S.onb = {
    step: 0, name: S.profile.name || "", currency: S.profile.currency || "EUR",
    accounts: [
      { id: uid(), name: "Gotovina", type: "cash", initial: 0 },
      { id: uid(), name: "Kartica", type: "card", initial: 0 },
      { id: uid(), name: "Prihranki", type: "savings", initial: 0 }
    ],
    exp: DEFAULT_EXPENSE.map((_, i) => i), inc: DEFAULT_INCOME.map((_, i) => i)
  };
  const o = S.onb;
  const steps = ["Profil", "Viri financ", "Kategorije"];
  let body = "";
  if (o.step === 0) body = `
    <h2>Dobrodošel v ${APP_NAME}!</h2>
    <p class="muted">Nastavimo tvoj račun v treh kratkih korakih.</p>
    <label class="field"><span>Kako ti je ime?</span><input name="name" value="${esc(o.name)}" placeholder="npr. Ana" autocomplete="given-name"></label>
    <label class="field"><span>Valuta</span><select name="currency">${CURRENCIES.map((c) => `<option ${c === o.currency ? "selected" : ""}>${c}</option>`).join("")}</select></label>`;
  if (o.step === 1) body = `
    <h2>Tvoji viri financ</h2>
    <p class="muted">Vpiši, koliko denarja imaš <b>trenutno</b> na posameznem viru. To je začetno stanje in se ne zapiše v zgodovino transakcij.</p>
    <div class="onb-accs">${o.accounts.map((a) => `
      <div class="onb-acc" data-id="${a.id}">
        <div class="type-pick">
          <span class="bubble" style="--c:var(--gold)">${icon(ACC_TYPES[a.type].icon, 18)}</span>
          <select data-k="type" aria-label="Vrsta">${Object.entries(ACC_TYPES).map(([k, v]) => `<option value="${k}" ${k === a.type ? "selected" : ""}>${v.label}</option>`).join("")}</select>
        </div>
        <input data-k="name" value="${esc(a.name)}" placeholder="Ime vira" aria-label="Ime vira">
        <div class="money-in"><input data-k="initial" inputmode="decimal" value="${amountInput(a.initial)}" placeholder="0,00" aria-label="Začetno stanje"><span>${o.currency}</span></div>
        <button class="icon-btn sm" data-rm aria-label="Odstrani">${icon("trash2", 18)}</button>
      </div>`).join("")}
    </div>
    <button class="btn ghost" data-add>${icon("plus", 18)} Dodaj vir</button>`;
  if (o.step === 2) body = `
    <h2>Kategorije</h2>
    <p class="muted">Izberi kategorije, ki jih želiš. Kasneje jih lahko urejaš, dodajaš in jim nastaviš naročnine.</p>
    <h4 class="sec-t">Odhodki</h4>
    <div class="chips">${DEFAULT_EXPENSE.map(([n, ic, c], i) => `<button class="chip ${o.exp.includes(i) ? "on" : ""}" data-exp="${i}" style="--c:${c}">${icon(ic, 16)}${n}</button>`).join("")}</div>
    <h4 class="sec-t">Prihodki</h4>
    <div class="chips">${DEFAULT_INCOME.map(([n, ic, c], i) => `<button class="chip ${o.inc.includes(i) ? "on" : ""}" data-inc="${i}" style="--c:${c}">${icon(ic, 16)}${n}</button>`).join("")}</div>`;

  $("#app").innerHTML = `
  <div class="onb">
    <div class="onb-top">
      <div class="logo-mark sm">${logoSvg()}</div>
      <div class="steps">${steps.map((s, i) => `<div class="step ${i <= o.step ? "on" : ""}"><i></i><span>${s}</span></div>`).join("")}</div>
    </div>
    <div class="onb-body">${body}</div>
    <div class="onb-foot">
      ${o.step > 0 ? `<button class="btn ghost" data-back>${icon("chevron-left", 18)} Nazaj</button>` : `<button class="btn ghost" data-logout>${icon("log-out", 18)} Odjava</button>`}
      <button class="btn primary" data-next>${o.step < 2 ? "Naprej" : "Začni"} ${icon(o.step < 2 ? "chevron-right" : "check", 18)}</button>
    </div>
  </div>`;

  const collect = () => {
    if (o.step === 0) { o.name = $('[name="name"]').value.trim(); o.currency = $('[name="currency"]').value; }
    if (o.step === 1) $$(".onb-acc").forEach((row) => {
      const a = o.accounts.find((x) => x.id === row.dataset.id);
      a.name = $('[data-k="name"]', row).value.trim();
      a.type = $('[data-k="type"]', row).value;
      const v = parseAmount($('[data-k="initial"]', row).value); a.initial = isNaN(v) ? 0 : v;
    });
  };
  $("[data-logout]")?.addEventListener("click", () => S.be.signOut());
  $("[data-back]")?.addEventListener("click", () => { collect(); o.step--; renderOnboarding(); });
  $("[data-add]")?.addEventListener("click", () => { collect(); o.accounts.push({ id: uid(), name: "", type: "bank", initial: 0 }); renderOnboarding(); });
  $$("[data-rm]").forEach((b) => b.onclick = () => { collect(); o.accounts = o.accounts.filter((a) => a.id !== b.closest(".onb-acc").dataset.id); renderOnboarding(); });
  $$(".onb-acc select").forEach((s) => s.onchange = () => { collect(); renderOnboarding(); });
  $$("[data-exp]").forEach((b) => b.onclick = () => { const i = +b.dataset.exp; o.exp = o.exp.includes(i) ? o.exp.filter((x) => x !== i) : [...o.exp, i]; b.classList.toggle("on"); });
  $$("[data-inc]").forEach((b) => b.onclick = () => { const i = +b.dataset.inc; o.inc = o.inc.includes(i) ? o.inc.filter((x) => x !== i) : [...o.inc, i]; b.classList.toggle("on"); });
  $("[data-next]").onclick = async () => {
    collect();
    if (o.step === 1) {
      o.accounts = o.accounts.filter((a) => a.name);
      if (!o.accounts.length) return toast("Dodaj vsaj en vir financ.", "error");
    }
    if (o.step < 2) { o.step++; return renderOnboarding(); }
    const btn = $("[data-next]"); btn.disabled = true; btn.classList.add("loading");
    const accounts = o.accounts.map((a, i) => ({ ...a, color: COLORS[(i * 3) % COLORS.length], includeInTotal: true, archived: false, order: i, createdAt: Date.now() }));
    const cats = [
      ...o.exp.map((i) => DEFAULT_EXPENSE[i]).map(([name, ic, color], i) => ({ id: uid(), type: "expense", name, icon: ic, color, order: i })),
      ...o.inc.map((i) => DEFAULT_INCOME[i]).map(([name, ic, color], i) => ({ id: uid(), type: "income", name, icon: ic, color, order: i }))
    ];
    try {
      await Promise.all([S.be.putMany("accounts", accounts), S.be.putMany("categories", cats)]);
      const patch = { name: o.name, currency: o.currency, onboarded: true };
      await S.be.setProfile(patch);
      Object.assign(S.profile, patch); S.accounts = accounts; S.categories = cats; S.onb = null;
      location.hash = "#/home"; route();
      toast("Račun je pripravljen. Srečno pri varčevanju!");
    } catch (e) { toast(errorText(e), "error"); btn.disabled = false; btn.classList.remove("loading"); }
  };
}

// ═════════════════════════════════════════════════════════════
//  OGRODJE + USMERJANJE
// ═════════════════════════════════════════════════════════════
const TABS = [
  ["home", "Domov", "house"], ["stats", "Statistika", "chart-pie"], ["categories", "Kategorije", "tags"],
  ["accounts", "Viri", "wallet"], ["settings", "Nastavitve", "settings"]
];
function route() {
  if (!S.user || !S.profile || S.booting) return;
  if (!S.profile.onboarded) return renderOnboarding();
  if (!S.secure?.pin) return renderPinSetup();
  let r = (location.hash.replace(/^#\/?/, "") || "home").split("?")[0];
  const views = { home: viewHome, transactions: viewTransactions, stats: viewStats, categories: viewCategories, accounts: viewAccounts, settings: viewSettings, admin: viewAdmin };
  if (!views[r] || (r === "admin" && !S.isAdmin)) r = "home";
  const tab = r === "transactions" ? "home" : r === "admin" ? "settings" : r;
  if (!$("#shell")) {
    $("#app").innerHTML = `
      <div id="shell">
        <main id="view"></main>
        <button class="fab" id="fab" aria-label="Dodaj transakcijo">${icon("plus", 26)}</button>
        <nav class="tabbar">${TABS.map(([k, l, ic]) => `<a href="#/${k}" data-tab="${k}">${icon(ic, 22)}<span>${l}</span></a>`).join("")}</nav>
      </div>`;
    $("#fab").onclick = () => txSheet();
  }
  $$(".tabbar a").forEach((a) => a.classList.toggle("on", a.dataset.tab === tab));
  const v = $("#view");
  v.innerHTML = views[r]();
  v.classList.remove("enter"); void v.offsetWidth; v.classList.add("enter");
  bind[r]?.(v);
  if (S._lastRoute !== r) window.scrollTo(0, 0);
  S._lastRoute = r;
}
const rerender = () => route();
const bind = {};

const header = (title, { back = false, right = "" } = {}) => `
  <header class="top">
    ${back ? `<button class="icon-btn" data-back aria-label="Nazaj">${icon("chevron-left")}</button>` : ""}
    <h1>${title}</h1><div class="top-r">${right}</div>
  </header>`;

function txRow(t) {
  const c = cat(t.categoryId); const a = acc(t.accountId);
  let ic, color, title, sub, amt, cls;
  if (t.type === "transfer") {
    ic = "arrow-left-right"; color = "#64748B"; title = "Prenos";
    sub = `${esc(a?.name || "?")} → ${esc(acc(t.toAccountId)?.name || "?")}`; amt = money(t.amount); cls = "neutral";
  } else if (t.type === "adjust") {
    ic = "scale"; color = "#64748B"; title = "Popravek stanja"; sub = esc(a?.name || ""); amt = priv(t.amount, { sign: true }); cls = t.amount >= 0 ? "pos" : "neg";
  } else {
    ic = c?.icon || "circle-dollar-sign"; color = c?.color || "#94A3B8"; title = esc(c?.name || "Brez kategorije");
    sub = esc(a?.name || "");
    amt = t.type === "income" ? priv(t.amount, { sign: true }) : money(-t.amount, { sign: true }); cls = t.type === "income" ? "pos" : "neg";
  }
  const note = t.note ? `<span class="dot">·</span>${esc(t.note)}` : "";
  const future = t.date > todayISO() ? `<span class="badge">načrtovano</span>` : "";
  const auto = t.auto ? `<span class="badge gold" title="Samodejno">${icon("repeat", 12)}</span>` : "";
  return `<button class="tx" data-tx="${t.id}">
    <span class="bubble" style="--c:${color}">${icon(ic, 20)}</span>
    <span class="tx-main"><b>${title} ${auto}${future}</b><small>${sub}${note}</small></span>
    <span class="tx-amt ${cls}"><b>${amt}</b><small>${fmtDate(t.date)}</small></span>
  </button>`;
}
function bindTxRows(root) { $$("[data-tx]", root).forEach((b) => (b.onclick = () => txSheet(S.transactions.find((t) => t.id === b.dataset.tx)))); }
const emptyState = (ic, title, text, btn = "") => `<div class="empty">${icon(ic, 36)}<h3>${title}</h3><p class="muted">${text}</p>${btn}</div>`;

// ═════════════════════════════════════════════════════════════
//  DOMOV
// ═════════════════════════════════════════════════════════════
function viewHome() {
  const total = totalBalance(); const mk = monthKey(); const m = monthTotals(mk); const prev = monthTotals(addMonths(mk, -1));
  const b = balances(); const accs = activeAccounts();
  const recent = sortedTx(S.transactions.filter((t) => t.date <= todayISO())).slice(0, 3);
  const up = upcoming(10);
  const spend = byCategory(mk, "expense");
  const alerts = S.categories.filter((c) => c.type === "expense" && c.budget > 0 && (spend[c.id] || 0) >= c.budget * 0.8);
  const notice = S.config?.notice && LS.get("noticeSeen", "") !== S.config.notice ? S.config.notice : "";
  const expDelta = prev.expense ? Math.round(((m.expense - prev.expense) / prev.expense) * 100) : null;

  return `
  <header class="top home-top">
    <div><p class="muted sm">${greeting()},</p><h1>${esc(S.profile.name || "dobrodošel")}</h1></div>
    <div class="top-r"><a href="#/settings" class="avatar" aria-label="Nastavitve">${esc((S.profile.name || S.profile.email || "?")[0].toUpperCase())}</a></div>
  </header>
  ${notice ? `<div class="banner gold">${icon("megaphone", 18)}<span>${esc(notice)}</span><button class="icon-btn sm" data-notice aria-label="Skrij">${icon("x", 16)}</button></div>` : ""}

  <section class="hero">
    <div class="hero-top"><span>Trenutno stanje</span><button class="icon-btn sm glass" data-hide aria-label="Skrij stanje">${icon(S.hide ? "eye-off" : "eye", 18)}</button></div>
    <div class="hero-amt">${wealth(total)}</div>
    <div class="hero-sub">${monthLabel(mk, { month: "long" })}${expDelta !== null ? ` · poraba ${expDelta > 0 ? "+" : ""}${expDelta} % glede na prejšnji mesec` : ""}</div>
    <div class="hero-row">
      <div class="pill in"><span class="pi">${icon("arrow-down-left", 16)}</span><div><small>Prihodki</small><b>${priv(m.income)}</b></div></div>
      <div class="pill out"><span class="pi">${icon("arrow-up-right", 16)}</span><div><small>Odhodki</small><b>${money(m.expense)}</b></div></div>
    </div>
  </section>

  <section class="sec">
    <div class="sec-h"><h2>Viri financ</h2><a href="#/accounts" class="link">Uredi</a></div>
    <div class="acc-scroll">${accs.map((a) => `
      <a class="acc-card" href="#/accounts" style="--c:${a.color || "#F5B83D"}">
        <span class="bubble">${icon(ACC_TYPES[a.type]?.icon || "wallet", 18)}</span>
        <small>${esc(a.name)}</small><b>${wealth(b[a.id] || 0)}</b>
      </a>`).join("")}
      <button class="acc-card add" data-add-acc>${icon("plus", 20)}<small>Nov vir</small></button>
    </div>
  </section>

  ${alerts.length ? `<section class="sec">${alerts.map((c) => {
    const p = Math.round(((spend[c.id] || 0) / c.budget) * 100);
    return `<div class="banner ${p >= 100 ? "danger" : "warn"}">${icon("target", 18)}<span><b>${esc(c.name)}</b>: porabljeno ${p} % mesečnega proračuna (${money(spend[c.id] || 0)} / ${money(c.budget)})</span></div>`;
  }).join("")}</section>` : ""}

  ${up.length ? `<section class="sec">
    <div class="sec-h"><h2>Prihajajoče</h2><a href="#/categories" class="link">Naročnine</a></div>
    <div class="card list">${up.map(({ c, date }) => `
      <div class="row"><span class="bubble sm" style="--c:${c.color}">${icon(c.icon, 16)}</span>
      <span class="grow"><b>${esc(c.name)}</b><small class="muted">${fmtDate(date, true)} · ${esc(acc(c.recurring.accountId)?.name || "")}</small></span>
      <b class="${c.type === "income" ? "pos" : "neg"}">${c.type === "income" ? priv(c.recurring.amount, { sign: true }) : money(-c.recurring.amount, { sign: true })}</b></div>`).join("")}
    </div></section>` : ""}

  <section class="sec">
    <div class="sec-h"><h2>Zadnje transakcije</h2></div>
    ${recent.length ? `<div class="card list">${recent.map(txRow).join("")}</div>
      <a href="#/transactions" class="btn ghost block more">Poglej več ${icon("chevron-right", 18)}</a>`
      : emptyState("inbox", "Še ni transakcij", "Dodaj prvo transakcijo z gumbom + spodaj desno.")}
  </section>`;
}
bind.home = (v) => {
  bindTxRows(v);
  $("[data-hide]", v).onclick = toggleHide;
  $("[data-notice]", v)?.addEventListener("click", () => { LS.set("noticeSeen", S.config.notice); rerender(); });
  $("[data-add-acc]", v).onclick = () => accountSheet();
};

// ═════════════════════════════════════════════════════════════
//  VSE TRANSAKCIJE
// ═════════════════════════════════════════════════════════════
function filteredTx() {
  const f = S.txFilter; const q = f.q.trim().toLowerCase();
  return sortedTx(S.transactions.filter((t) => {
    if (f.type !== "all" && t.type !== f.type) return false;
    if (f.month !== "all" && !t.date.startsWith(f.month)) return false;
    if (f.account !== "all" && t.accountId !== f.account && t.toAccountId !== f.account) return false;
    if (f.category !== "all" && t.categoryId !== f.category) return false;
    if (q) {
      const hay = [t.note, cat(t.categoryId)?.name, acc(t.accountId)?.name, acc(t.toAccountId)?.name, (t.amount / 100).toFixed(2).replace(".", ",")].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }));
}
function viewTransactions() {
  const f = S.txFilter;
  const months = [...new Set(S.transactions.map((t) => t.date.slice(0, 7)))].sort().reverse();
  const list = filteredTx();
  const groups = {};
  list.forEach((t) => (groups[t.date] ||= []).push(t));
  let inc = 0, exp = 0; list.forEach((t) => { if (t.type === "income") inc += t.amount; if (t.type === "expense") exp += t.amount; });
  return `${header("Transakcije", { back: true, right: `<button class="icon-btn" data-csv aria-label="Izvozi CSV">${icon("download")}</button>` })}
  <div class="search">${icon("search", 18)}<input type="search" placeholder="Išči po opombi, kategoriji, znesku …" value="${esc(f.q)}" data-q></div>
  <div class="seg sm">${[["all", "Vse"], ["expense", "Odhodki"], ["income", "Prihodki"], ["transfer", "Prenosi"]].map(([k, l]) => `<button class="${f.type === k ? "on" : ""}" data-type="${k}">${l}</button>`).join("")}</div>
  <div class="filters">
    <label class="select-pill">${icon("calendar", 16)}<select data-f="month"><option value="all">Vsi meseci</option>${months.map((m) => `<option value="${m}" ${f.month === m ? "selected" : ""}>${monthLabel(m)}</option>`).join("")}</select></label>
    <label class="select-pill">${icon("wallet", 16)}<select data-f="account"><option value="all">Vsi viri</option>${S.accounts.map((a) => `<option value="${a.id}" ${f.account === a.id ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select></label>
    <label class="select-pill">${icon("tag", 16)}<select data-f="category"><option value="all">Vse kategorije</option>${S.categories.map((c) => `<option value="${c.id}" ${f.category === c.id ? "selected" : ""}>${esc(c.name)} (${c.type === "income" ? "prihodek" : "odhodek"})</option>`).join("")}</select></label>
  </div>
  <div class="sum-strip"><span>${list.length} transakcij</span><span class="pos">${priv(inc, { sign: true })}</span><span class="neg">${money(-exp)}</span></div>
  ${list.length ? Object.entries(groups).map(([d, ts]) => {
    const day = ts.reduce((s, t) => s + (t.type === "income" && !S.hide ? t.amount : t.type === "expense" ? -t.amount : 0), 0);
    return `<div class="day-h"><span>${fmtDate(d, true)}</span><span class="${day >= 0 ? "pos" : "neg"}">${day ? money(day, { sign: true }) : ""}</span></div><div class="card list">${ts.map(txRow).join("")}</div>`;
  }).join("") : emptyState("search", "Ni zadetkov", "Poskusi spremeniti iskanje ali filtre.")}`;
}
bind.transactions = (v) => {
  bindTxRows(v);
  $("[data-back]", v).onclick = () => history.length > 1 ? history.back() : (location.hash = "#/home");
  const q = $("[data-q]", v);
  q.oninput = () => { S.txFilter.q = q.value; const pos = q.selectionStart; rerender(); const n = $("[data-q]"); n.focus(); n.setSelectionRange(pos, pos); };
  $$("[data-type]", v).forEach((b) => (b.onclick = () => { S.txFilter.type = b.dataset.type; rerender(); }));
  $$("[data-f]", v).forEach((s) => (s.onchange = () => { S.txFilter[s.dataset.f] = s.value; rerender(); }));
  $("[data-csv]", v).onclick = () => exportCSV(filteredTx());
};

// ═════════════════════════════════════════════════════════════
//  TRANSAKCIJA – dodaj / uredi
// ═════════════════════════════════════════════════════════════
function txSheet(tx = null, preset = {}) {
  if (!S.accounts.length) { toast("Najprej dodaj vir financ.", "error"); return accountSheet(); }
  if (tx?.type === "adjust") {
    return openSheet({
      title: "Popravek stanja",
      body: `<div class="kv"><span>Vir</span><b>${esc(acc(tx.accountId)?.name || "?")}</b></div><div class="kv"><span>Razlika</span><b>${money(tx.amount, { sign: true, hide: false })}</b></div><div class="kv"><span>Datum</span><b>${fmtDate(tx.date, true)}</b></div>`,
      footer: `<button class="btn danger" data-del>${icon("trash2", 18)} Izbriši</button>`,
      onMount: (r) => ($("[data-del]", r).onclick = () => deleteTx(tx))
    });
  }
  const st = { type: tx?.type || preset.type || "expense", categoryId: tx?.categoryId || preset.categoryId || null };
  const accs = activeAccounts();
  const lastAcc = LS.get("lastAcc", accs[0]?.id);
  const defAcc = tx?.accountId || preset.accountId || (accs.find((a) => a.id === lastAcc) ? lastAcc : accs[0].id);
  const accOpts = (sel) => S.accounts.filter((a) => !a.archived || a.id === sel).map((a) => `<option value="${a.id}" ${a.id === sel ? "selected" : ""}>${esc(a.name)}</option>`).join("");

  const catGrid = () => {
    const list = S.categories.filter((c) => c.type === st.type).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (!list.length) return `<p class="muted sm">Ni kategorij te vrste. <a href="#/categories" data-close>Dodaj kategorijo</a></p>`;
    return list.map((c) => `<button type="button" class="cat-opt ${st.categoryId === c.id ? "on" : ""}" data-cat="${c.id}" style="--c:${c.color}"><span class="bubble">${icon(c.icon, 18)}</span><small>${esc(c.name)}</small></button>`).join("");
  };
  openSheet({
    title: tx ? "Uredi transakcijo" : "Nova transakcija",
    body: `
      <div class="seg type-seg">
        <button type="button" data-t="expense" class="exp">${icon("arrow-up-right", 16)} Odhodek</button>
        <button type="button" data-t="income" class="inc">${icon("arrow-down-left", 16)} Prihodek</button>
        <button type="button" data-t="transfer" class="trf">${icon("arrow-left-right", 16)} Prenos</button>
      </div>
      <div class="amount-big"><input id="tx-amt" inputmode="decimal" placeholder="0,00" value="${amountInput(tx?.amount)}" autocomplete="off"><span>${currency()}</span></div>
      <div id="cat-wrap"><h4 class="sec-t">Kategorija</h4><div class="cat-grid" id="cat-grid">${catGrid()}</div></div>
      <div class="grid2">
        <label class="field"><span id="acc-l">Vir</span><select id="tx-acc">${accOpts(defAcc)}</select></label>
        <label class="field" id="to-wrap"><span>Na vir</span><select id="tx-to">${accOpts(tx?.toAccountId || accs.find((a) => a.id !== defAcc)?.id)}</select></label>
        <label class="field"><span>Datum</span><input type="date" id="tx-date" value="${tx?.date || preset.date || todayISO()}"></label>
      </div>
      <label class="field"><span>Opomba</span><input id="tx-note" maxlength="140" placeholder="npr. Mercator, kosilo s sodelavci …" value="${esc(tx?.note || "")}"></label>`,
    footer: `${tx ? `<button class="btn ghost danger-t" data-del>${icon("trash2", 18)}</button>` : ""}<button class="btn primary grow" data-save>${icon("check", 18)} Shrani</button>`,
    onMount: (r) => {
      const sync = () => {
        $$("[data-t]", r).forEach((b) => b.classList.toggle("on", b.dataset.t === st.type));
        const trf = st.type === "transfer";
        $("#cat-wrap", r).hidden = trf; $("#to-wrap", r).hidden = !trf;
        $("#acc-l", r).textContent = trf ? "Iz vira" : st.type === "income" ? "Na vir" : "Iz vira";
        $(".sheet", document).dataset.type = st.type;
        $("#cat-grid", r).innerHTML = catGrid();
        $$("[data-cat]", r).forEach((b) => (b.onclick = () => { st.categoryId = b.dataset.cat; $$("[data-cat]", r).forEach((x) => x.classList.toggle("on", x === b)); }));
      };
      $$("[data-t]", r).forEach((b) => (b.onclick = () => { if (st.type !== b.dataset.t) { st.type = b.dataset.t; st.categoryId = null; } sync(); }));
      sync();
      $("[data-del]", r)?.addEventListener("click", () => deleteTx(tx));
      $("[data-save]", r).onclick = () => {
        const amount = parseAmount($("#tx-amt", r).value);
        if (!amount || amount <= 0) return toast("Vpiši znesek, večji od 0.", "error");
        const accountId = $("#tx-acc", r).value; const date = $("#tx-date", r).value || todayISO();
        const t = { ...(tx || { id: uid(), createdAt: Date.now() }), type: st.type, amount, accountId, date, note: $("#tx-note", r).value.trim() };
        if (st.type === "transfer") {
          t.toAccountId = $("#tx-to", r).value; delete t.categoryId;
          if (t.toAccountId === accountId) return toast("Izberi dva različna vira.", "error");
        } else {
          if (!st.categoryId) return toast("Izberi kategorijo.", "error");
          t.categoryId = st.categoryId; delete t.toAccountId;
        }
        t.updatedAt = Date.now();
        const i = S.transactions.findIndex((x) => x.id === t.id);
        i >= 0 ? (S.transactions[i] = t) : S.transactions.push(t);
        LS.set("lastAcc", accountId);
        persist(S.be.put("transactions", t));
        closeSheet(); rerender(); toast(tx ? "Transakcija posodobljena." : "Transakcija dodana.");
      };
      $("#tx-amt", r).addEventListener("keydown", (e) => { if (e.key === "Enter") $("[data-save]", r).click(); });
    }
  });
}
async function deleteTx(tx) {
  if (!(await confirmBox("Izbriši transakcijo?", "Tega dejanja ni mogoče razveljaviti.", "Izbriši"))) return;
  S.transactions = S.transactions.filter((t) => t.id !== tx.id);
  persist(S.be.del("transactions", tx.id));
  rerender(); toast("Transakcija izbrisana.");
}

// ═════════════════════════════════════════════════════════════
//  STATISTIKA
// ═════════════════════════════════════════════════════════════
function donut(parts, total, label) {
  const R = 62, C = 2 * Math.PI * R; let off = 0;
  const segs = total > 0 ? parts.map((p) => {
    const len = (p.value / total) * C; const gap = parts.length > 1 ? Math.min(3, len / 3) : 0;
    const s = `<circle r="${R}" cx="80" cy="80" fill="none" stroke="${p.color}" stroke-width="20" stroke-dasharray="${Math.max(len - gap, 0.01)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 80 80)" stroke-linecap="butt"/>`;
    off += len; return s;
  }).join("") : "";
  return `<svg viewBox="0 0 160 160" class="donut"><circle r="${R}" cx="80" cy="80" fill="none" stroke="var(--line)" stroke-width="20"/>${segs}
    <text x="80" y="74" text-anchor="middle" class="d-l">${label}</text><text x="80" y="96" text-anchor="middle" class="d-v">${esc(money(total))}</text></svg>`;
}
function barChart(mk) {
  const months = Array.from({ length: 6 }, (_, i) => addMonths(mk, i - 5));
  const data = months.map((m) => monthTotals(m));
  const max = Math.max(1, ...data.flatMap((d) => (S.hide ? [d.expense] : [d.income, d.expense])));
  const W = 320, H = 150, bw = 14, gw = W / 6;
  return `<svg viewBox="0 0 ${W} ${H + 22}" class="bars">
    ${[0.25, 0.5, 0.75, 1].map((g) => `<line x1="0" x2="${W}" y1="${H - g * H}" y2="${H - g * H}" class="grid"/>`).join("")}
    ${data.map((d, i) => {
      const x = i * gw + gw / 2; const hi = (d.income / max) * (H - 6); const he = (d.expense / max) * (H - 6);
      return `${S.hide ? "" : `<rect x="${x - bw - 1}" y="${H - hi}" width="${bw}" height="${hi}" rx="4" class="b-in"><title>Prihodki: ${money(d.income)}</title></rect>`}
        <rect x="${S.hide ? x - bw / 2 : x + 1}" y="${H - he}" width="${bw}" height="${he}" rx="4" class="b-out"><title>Odhodki: ${money(d.expense, { hide: false })}</title></rect>
        <text x="${x}" y="${H + 16}" text-anchor="middle" class="ax ${months[i] === mk ? "cur" : ""}">${monthLabel(months[i], { month: "short" }).replace(".", "")}</text>`;
    }).join("")}
  </svg>`;
}
function worthChart(mk) {
  const months = Array.from({ length: 6 }, (_, i) => addMonths(mk, i - 5));
  const vals = months.map((m) => {
    const [y, mm] = m.split("-").map(Number);
    const eom = isoOf(new Date(y, mm, 0)); const t = todayISO();
    return totalBalance(eom < t ? eom : t);
  });
  const min = Math.min(...vals), max = Math.max(...vals); const span = max - min || 1;
  const W = 320, H = 110, px = (i) => 10 + i * ((W - 20) / 5), py = (v) => 10 + (H - 20) * (1 - (v - min) / span);
  const line = vals.map((v, i) => `${i ? "L" : "M"}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" ");
  return `<svg viewBox="0 0 ${W} ${H + 20}" class="worth">
    <defs><linearGradient id="wg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--gold)" stop-opacity=".35"/><stop offset="1" stop-color="var(--gold)" stop-opacity="0"/></linearGradient></defs>
    <path d="${line} L${px(5)},${H} L${px(0)},${H} Z" fill="url(#wg)"/>
    <path d="${line}" fill="none" stroke="var(--gold)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${vals.map((v, i) => `<circle cx="${px(i)}" cy="${py(v)}" r="3.5" fill="var(--bg-card)" stroke="var(--gold)" stroke-width="2"><title>${monthLabel(months[i])}: ${money(v, { hide: false })}</title></circle>
      <text x="${px(i)}" y="${H + 16}" text-anchor="middle" class="ax">${monthLabel(months[i], { month: "short" }).replace(".", "")}</text>`).join("")}
  </svg>`;
}
function viewStats() {
  const mk = S.statsMonth || monthKey(); const type = S.statsType;
  const m = monthTotals(mk); const bc = byCategory(mk, type);
  const total = Object.values(bc).reduce((s, v) => s + v, 0);
  const parts = Object.entries(bc).map(([id, value]) => ({ id, value, c: cat(id) }))
    .map((p) => ({ ...p, name: p.c?.name || "Brez kategorije", color: p.c?.color || "#94A3B8", icon: p.c?.icon || "circle-dollar-sign" }))
    .sort((a, b) => b.value - a.value);
  const rate = m.income > 0 ? Math.round((m.net / m.income) * 100) : null;
  const isCur = mk === monthKey();
  const [y, mm] = mk.split("-").map(Number);
  const days = isCur ? new Date().getDate() : new Date(y, mm, 0).getDate();
  const subs = S.categories.filter((c) => c.type === "expense" && c.recurring?.enabled).reduce((s, c) => s + (c.recurring.amount || 0), 0);

  return `${header("Statistika")}
  <div class="month-nav">
    <button class="icon-btn" data-m="-1" aria-label="Prejšnji mesec">${icon("chevron-left")}</button>
    <b>${monthLabel(mk)}</b>
    <button class="icon-btn" data-m="1" ${isCur ? "disabled" : ""} aria-label="Naslednji mesec">${icon("chevron-right")}</button>
  </div>
  <div class="kpis">
    <div class="kpi"><span class="ki in">${icon("trending-up", 18)}</span><small>Prihodki</small><b class="pos">${priv(m.income)}</b></div>
    <div class="kpi"><span class="ki out">${icon("trending-down", 18)}</span><small>Odhodki</small><b class="neg">${money(m.expense)}</b></div>
    <div class="kpi"><span class="ki">${icon("scale", 18)}</span><small>Neto</small><b class="${S.hide ? "" : m.net >= 0 ? "pos" : "neg"}">${priv(m.net, { sign: true })}</b></div>
    <div class="kpi"><span class="ki gold">${icon("piggy-bank", 18)}</span><small>Stopnja varčevanja</small><b>${S.hide ? "∗∗∗" : rate === null ? "—" : rate + " %"}</b></div>
    <div class="kpi"><span class="ki">${icon("calendar", 18)}</span><small>Povprečno na dan</small><b>${money(Math.round(m.expense / days))}</b></div>
    <div class="kpi"><span class="ki">${icon("repeat", 18)}</span><small>Naročnine / mesec</small><b>${money(subs)}</b></div>
  </div>

  <section class="card pad">
    <div class="sec-h"><h2>Po kategorijah</h2>
      <div class="seg xs"><button class="${type === "expense" ? "on" : ""}" data-st="expense">Odhodki</button><button class="${type === "income" ? "on" : ""}" data-st="income">Prihodki</button></div>
    </div>
    ${type === "income" && S.hide ? emptyState("eye-off", "Prihodki so skriti", "Prikaži jih z gumbom oko na domači strani.") : total ? `<div class="donut-wrap">${donut(parts, total, type === "expense" ? "Porabljeno" : "Prejeto")}</div>
    <div class="legend">${parts.map((p) => {
      const pct = Math.round((p.value / total) * 100); const budget = type === "expense" && p.c?.budget;
      return `<div class="lg-row"><span class="bubble sm" style="--c:${p.color}">${icon(p.icon, 16)}</span>
        <span class="grow"><b>${esc(p.name)}</b><span class="bar"><i style="width:${pct}%;background:${p.color}"></i></span>${budget ? `<small class="muted">Proračun ${money(p.c.budget)} · ${Math.round((p.value / p.c.budget) * 100)} %</small>` : ""}</span>
        <span class="r"><b>${money(p.value)}</b><small class="muted">${pct} %</small></span></div>`;
    }).join("")}</div>` : emptyState("chart-pie", "Ni podatkov", `V tem mesecu ni ${type === "expense" ? "odhodkov" : "prihodkov"}.`)}
  </section>

  <section class="card pad">
    <div class="sec-h"><h2>Zadnjih 6 mesecev</h2><div class="lg-mini">${S.hide ? "" : `<i class="in"></i>Prihodki `}<i class="out"></i>Odhodki</div></div>
    ${barChart(mk)}
  </section>
  <section class="card pad">
    <div class="sec-h"><h2>Gibanje premoženja</h2><b>${wealth(totalBalance())}</b></div>
    ${S.hide ? `<p class="muted center">Stanje je skrito.</p>` : worthChart(mk)}
  </section>`;
}
bind.stats = (v) => {
  $$("[data-m]", v).forEach((b) => (b.onclick = () => { S.statsMonth = addMonths(S.statsMonth || monthKey(), +b.dataset.m); rerender(); }));
  $$("[data-st]", v).forEach((b) => (b.onclick = () => { S.statsType = b.dataset.st; rerender(); }));
};

// ═════════════════════════════════════════════════════════════
//  KATEGORIJE
// ═════════════════════════════════════════════════════════════
function viewCategories() {
  const type = S.catTab; const mk = monthKey(); const spend = byCategory(mk, type);
  const list = S.categories.filter((c) => c.type === type).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const rec = list.filter((c) => c.recurring?.enabled);
  const recSum = rec.reduce((s, c) => s + (c.recurring.amount || 0), 0);
  const budgetSum = list.reduce((s, c) => s + (c.budget || 0), 0);
  const m$ = (v) => (type === "income" ? priv(v) : money(v)); // prihodki se ob skritem stanju skrijejo
  return `${header("Kategorije", { right: `<button class="icon-btn" data-new aria-label="Nova kategorija">${icon("circle-plus")}</button>` })}
  <div class="seg">
    <button class="${type === "expense" ? "on" : ""}" data-ct="expense">${icon("arrow-up-right", 16)} Odhodki</button>
    <button class="${type === "income" ? "on" : ""}" data-ct="income">${icon("arrow-down-left", 16)} Prihodki</button>
  </div>
  <div class="kpis two">
    <div class="kpi"><span class="ki gold">${icon("repeat", 18)}</span><small>${type === "expense" ? "Naročnine" : "Redni prihodki"} (${rec.length})</small><b>${m$(recSum)}<em> / mes</em></b></div>
    <div class="kpi"><span class="ki">${icon(type === "expense" ? "target" : "coins", 18)}</span><small>${type === "expense" ? "Mesečni proračun" : "Ta mesec prejeto"}</small><b>${type === "expense" ? (budgetSum ? money(budgetSum) : "—") : m$(Object.values(spend).reduce((a, b) => a + b, 0))}</b></div>
  </div>
  ${list.length ? `<div class="card list">${list.map((c) => {
    const s = spend[c.id] || 0; const pct = c.budget ? Math.min(100, Math.round((s / c.budget) * 100)) : 0;
    const r = c.recurring?.enabled ? c.recurring : null;
    return `<button class="cat-row" data-cat="${c.id}">
      <span class="bubble" style="--c:${c.color}">${icon(c.icon, 20)}</span>
      <span class="grow">
        <b>${esc(c.name)} ${r ? `<span class="badge gold">${icon("repeat", 12)} ${m$(r.amount)} · ${r.day}.</span>` : ""}</b>
        ${c.budget ? `<span class="bar"><i class="${s > c.budget ? "over" : s > c.budget * 0.8 ? "warn" : ""}" style="width:${pct}%;${s <= c.budget * 0.8 ? `background:${c.color}` : ""}"></i></span>
          <small class="muted">${money(s)} od ${money(c.budget)}${s > c.budget ? ` · presežek ${money(s - c.budget)}` : ` · ostane ${money(c.budget - s)}`}</small>`
        : `<small class="muted">Ta mesec: ${m$(s)}</small>`}
      </span>
      ${icon("chevron-right", 18, "muted")}
    </button>`;
  }).join("")}</div>` : emptyState("tags", "Ni kategorij", "Dodaj svojo prvo kategorijo.")}
  <button class="btn ghost block more" data-new>${icon("plus", 18)} Nova kategorija</button>`;
}
bind.categories = (v) => {
  $$("[data-ct]", v).forEach((b) => (b.onclick = () => { S.catTab = b.dataset.ct; rerender(); }));
  $$("[data-new]", v).forEach((b) => (b.onclick = () => categorySheet(null, S.catTab)));
  $$("[data-cat]", v).forEach((b) => (b.onclick = () => categorySheet(cat(b.dataset.cat))));
};
function categorySheet(c = null, type = "expense") {
  const st = {
    type: c?.type || type, icon: c?.icon || (type === "income" ? "coins" : "shopping-cart"),
    color: c?.color || COLORS[S.categories.length % COLORS.length],
    rec: !!c?.recurring?.enabled
  };
  const r = c?.recurring || {};
  const accs = activeAccounts();
  openSheet({
    title: c ? "Uredi kategorijo" : "Nova kategorija",
    body: `
      <div class="cat-preview"><span class="bubble lg" id="cp" style="--c:${st.color}">${icon(st.icon, 26)}</span>
        <label class="field grow"><span>Ime</span><input id="c-name" maxlength="40" value="${esc(c?.name || "")}" placeholder="npr. Netflix, Trgovina, Plača"></label></div>
      <div class="seg sm">
        <button type="button" data-ty="expense">Odhodek</button><button type="button" data-ty="income">Prihodek</button>
      </div>
      <h4 class="sec-t">Barva</h4>
      <div class="swatches">${COLORS.map((col) => `<button type="button" class="sw" data-col="${col}" style="--c:${col}" aria-label="${col}"></button>`).join("")}</div>
      <h4 class="sec-t">Ikona</h4>
      <div class="icon-grid">${CAT_ICONS.map((i) => `<button type="button" class="ig" data-ic="${i}" aria-label="${i}">${icon(i, 20)}</button>`).join("")}</div>
      <label class="field" id="budget-wrap"><span>Mesečni proračun (neobvezno)</span><div class="money-in"><input id="c-budget" inputmode="decimal" value="${amountInput(c?.budget)}" placeholder="brez omejitve"><span>${currency()}</span></div></label>

      <div class="toggle-row">
        <span class="bubble sm" style="--c:var(--gold)">${icon("repeat", 16)}</span>
        <span class="grow"><b id="rec-title">Naročnina</b><small class="muted" id="rec-sub">Samodejno knjiži znesek vsak mesec</small></span>
        <label class="switch"><input type="checkbox" id="c-rec" ${st.rec ? "checked" : ""}><i></i></label>
      </div>
      <div id="rec-box" class="rec-box">
        <div class="grid2">
          <label class="field"><span>Mesečni znesek</span><div class="money-in"><input id="r-amt" inputmode="decimal" value="${amountInput(r.amount)}" placeholder="0,00"><span>${currency()}</span></div></label>
          <label class="field"><span>Dan v mesecu</span><input id="r-day" type="number" min="1" max="31" value="${r.day || new Date().getDate()}"></label>
          <label class="field"><span id="r-acc-l">Bremeni vir</span><select id="r-acc">${accs.map((a) => `<option value="${a.id}" ${a.id === r.accountId ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select></label>
          <label class="field"><span>Začetek</span><input id="r-start" type="date" value="${r.startDate || todayISO()}"></label>
        </div>
        <p class="muted tiny">${icon("info", 14)} Ob odprtju aplikacije se vse zapadle obremenitve knjižijo samodejno (tudi za dneve, ko aplikacija ni bila odprta). Če je dan večji od dolžine meseca, se knjiži zadnji dan meseca.</p>
        ${r.lastRun ? `<p class="muted tiny">Zadnja knjižba: ${fmtDate(r.lastRun, true)}</p>` : ""}
      </div>`,
    footer: `${c ? `<button class="btn ghost danger-t" data-del>${icon("trash2", 18)}</button>` : ""}<button class="btn primary grow" data-save>${icon("check", 18)} Shrani</button>`,
    onMount: (root) => {
      const sync = () => {
        $$("[data-ty]", root).forEach((b) => b.classList.toggle("on", b.dataset.ty === st.type));
        $$("[data-col]", root).forEach((b) => b.classList.toggle("on", b.dataset.col === st.color));
        $$("[data-ic]", root).forEach((b) => b.classList.toggle("on", b.dataset.ic === st.icon));
        const cp = $("#cp", root); cp.style.setProperty("--c", st.color); cp.innerHTML = icon(st.icon, 26);
        $("#budget-wrap", root).hidden = st.type !== "expense";
        $("#rec-box", root).hidden = !$("#c-rec", root).checked;
        $("#rec-title", root).textContent = st.type === "expense" ? "Naročnina / redni strošek" : "Reden prihodek";
        $("#rec-sub", root).textContent = st.type === "expense" ? "Samodejno bremeni izbrani vir vsak mesec" : "Samodejno pripiše znesek vsak mesec (npr. plača)";
        $("#r-acc-l", root).textContent = st.type === "expense" ? "Bremeni vir" : "Pripiši na vir";
      };
      $$("[data-ty]", root).forEach((b) => (b.onclick = () => { st.type = b.dataset.ty; sync(); }));
      $$("[data-col]", root).forEach((b) => (b.onclick = () => { st.color = b.dataset.col; sync(); }));
      $$("[data-ic]", root).forEach((b) => (b.onclick = () => { st.icon = b.dataset.ic; sync(); }));
      $("#c-rec", root).onchange = sync;
      sync();
      $("[data-del]", root)?.addEventListener("click", async () => {
        const n = S.transactions.filter((t) => t.categoryId === c.id).length;
        if (!(await confirmBox("Izbriši kategorijo?", n ? `Kategorija ima ${n} transakcij. Transakcije ostanejo, prikazane bodo kot »Brez kategorije«.` : "Kategorija bo izbrisana.", "Izbriši"))) return;
        S.categories = S.categories.filter((x) => x.id !== c.id);
        persist(S.be.del("categories", c.id)); rerender(); toast("Kategorija izbrisana.");
      });
      $("[data-save]", root).onclick = async () => {
        const name = $("#c-name", root).value.trim();
        if (!name) return toast("Vpiši ime kategorije.", "error");
        const budget = parseAmount($("#c-budget", root).value);
        const obj = { ...(c || { id: uid(), order: S.categories.filter((x) => x.type === st.type).length }), name, type: st.type, icon: st.icon, color: st.color, budget: st.type === "expense" && budget > 0 ? budget : 0 };
        if ($("#c-rec", root).checked) {
          const amount = parseAmount($("#r-amt", root).value);
          const day = Math.min(31, Math.max(1, parseInt($("#r-day", root).value, 10) || 1));
          const accountId = $("#r-acc", root).value; const startDate = $("#r-start", root).value || todayISO();
          if (!amount || amount <= 0) return toast("Vpiši mesečni znesek.", "error");
          if (!accountId) return toast("Izberi vir financ.", "error");
          const changedSchedule = !r.enabled || r.day !== day || r.startDate !== startDate;
          obj.recurring = { enabled: true, amount, day, accountId, startDate, lastRun: changedSchedule ? (r.lastRun && r.lastRun >= startDate ? r.lastRun : null) : r.lastRun || null };
          // nova naročnina z začetkom v preteklosti → vprašaj, ali knjižimo za nazaj
          if (!r.enabled && startDate < todayISO()) {
            const back = await confirmBox("Knjižim za nazaj?", "Začetek je v preteklosti. Želiš knjižiti tudi pretekle obremenitve od začetnega datuma?", "Da, knjiži", false);
            if (!back) {
              // preskoči vse pretekle obremenitve (pred današnjim dnem)
              let last = null; let d = nextDue(obj.recurring, null);
              while (d && d < todayISO()) { last = d; d = nextDue(obj.recurring, d); }
              obj.recurring.lastRun = last;
            }
          }
        } else if (c?.recurring) obj.recurring = { ...c.recurring, enabled: false };
        const i = S.categories.findIndex((x) => x.id === obj.id);
        i >= 0 ? (S.categories[i] = obj) : S.categories.push(obj);
        S.catTab = st.type;
        persist(S.be.put("categories", obj));
        closeSheet();
        const n = await processRecurring();
        rerender(); toast(c ? "Kategorija posodobljena." : "Kategorija dodana." + (n ? ` Knjiženih: ${n}.` : ""));
      };
    }
  });
}

// ═════════════════════════════════════════════════════════════
//  VIRI FINANC
// ═════════════════════════════════════════════════════════════
function viewAccounts() {
  const b = balances(); const accs = activeAccounts(); const archived = S.accounts.filter((a) => a.archived);
  const row = (a) => {
    const cnt = S.transactions.filter((t) => t.accountId === a.id || t.toAccountId === a.id).length;
    return `<button class="acc-row" data-acc="${a.id}">
      <span class="bubble" style="--c:${a.color || "#F5B83D"}">${icon(ACC_TYPES[a.type]?.icon || "wallet", 20)}</span>
      <span class="grow"><b>${esc(a.name)}</b><small class="muted">${ACC_TYPES[a.type]?.label || ""} · ${cnt} transakcij${a.includeInTotal === false ? " · ni v skupnem" : ""}</small></span>
      <b class="${(b[a.id] || 0) < 0 && !S.hide ? "neg" : ""}">${wealth(b[a.id] || 0)}</b>
    </button>`;
  };
  return `${header("Viri financ", { right: `<button class="icon-btn" data-new aria-label="Nov vir">${icon("circle-plus")}</button>` })}
  <section class="hero slim">
    <div class="hero-top"><span>Skupaj na vseh virih</span><button class="icon-btn sm glass" data-hide aria-label="Skrij stanje">${icon(S.hide ? "eye-off" : "eye", 18)}</button></div>
    <div class="hero-amt">${wealth(totalBalance())}</div>
  </section>
  <div class="actions">
    <button class="act" data-new>${icon("plus", 20)}<span>Nov vir</span></button>
    <button class="act" data-transfer>${icon("arrow-left-right", 20)}<span>Prenos</span></button>
    <button class="act" data-adjust>${icon("scale", 20)}<span>Popravi stanje</span></button>
  </div>
  <div class="card list">${accs.map(row).join("") || emptyState("wallet", "Ni virov", "Dodaj gotovino, kartico ali prihranke.")}</div>
  ${archived.length ? `<h4 class="sec-t">Arhivirano</h4><div class="card list dim">${archived.map(row).join("")}</div>` : ""}`;
}
bind.accounts = (v) => {
  $$("[data-new]", v).forEach((b) => (b.onclick = () => accountSheet()));
  $$("[data-acc]", v).forEach((b) => (b.onclick = () => accountSheet(acc(b.dataset.acc))));
  $("[data-transfer]", v).onclick = () => {
    if (activeAccounts().length < 2) return toast("Za prenos potrebuješ vsaj dva vira.", "error");
    txSheet(null, { type: "transfer" });
  };
  $("[data-adjust]", v).onclick = () => adjustSheet();
  $("[data-hide]", v).onclick = toggleHide;
};
function accountSheet(a = null) {
  const st = { type: a?.type || "bank", color: a?.color || COLORS[(S.accounts.length * 3) % COLORS.length] };
  const bal = a ? balances()[a.id] || 0 : 0;
  openSheet({
    title: a ? "Uredi vir" : "Nov vir financ",
    body: `
      <label class="field"><span>Ime</span><input id="a-name" maxlength="40" value="${esc(a?.name || "")}" placeholder="npr. NLB račun, Revolut, Gotovina"></label>
      <h4 class="sec-t">Vrsta</h4>
      <div class="type-grid">${Object.entries(ACC_TYPES).map(([k, t]) => `<button type="button" class="tg" data-ty="${k}">${icon(t.icon, 20)}<small>${t.label}</small></button>`).join("")}</div>
      <h4 class="sec-t">Barva</h4>
      <div class="swatches">${COLORS.map((c) => `<button type="button" class="sw" data-col="${c}" style="--c:${c}" aria-label="${c}"></button>`).join("")}</div>
      <label class="field"><span>Začetno stanje</span><div class="money-in"><input id="a-init" inputmode="decimal" value="${amountInput(a?.initial)}" placeholder="0,00"><span>${currency()}</span></div>
        <small class="muted">Koliko je bilo na viru, ko si ga dodal. Ne zapiše se v zgodovino.${a ? ` Trenutno stanje: <b>${wealth(bal)}</b>` : ""}</small></label>
      <div class="toggle-row"><span class="grow"><b>Upoštevaj v skupnem stanju</b><small class="muted">Izklopi npr. za dolgoročne naložbe</small></span><label class="switch"><input type="checkbox" id="a-incl" ${a?.includeInTotal === false ? "" : "checked"}><i></i></label></div>
      ${a ? `<div class="toggle-row"><span class="grow"><b>Arhiviraj</b><small class="muted">Skrij vir, zgodovina ostane</small></span><label class="switch"><input type="checkbox" id="a-arch" ${a.archived ? "checked" : ""}><i></i></label></div>
        <a class="btn ghost block" href="#/transactions" data-hist>${icon("receipt", 18)} Transakcije tega vira</a>` : ""}`,
    footer: `${a ? `<button class="btn ghost danger-t" data-del>${icon("trash2", 18)}</button>` : ""}<button class="btn primary grow" data-save>${icon("check", 18)} Shrani</button>`,
    onMount: (r) => {
      const sync = () => {
        $$("[data-ty]", r).forEach((b) => b.classList.toggle("on", b.dataset.ty === st.type));
        $$("[data-col]", r).forEach((b) => b.classList.toggle("on", b.dataset.col === st.color));
      };
      $$("[data-ty]", r).forEach((b) => (b.onclick = () => { st.type = b.dataset.ty; sync(); }));
      $$("[data-col]", r).forEach((b) => (b.onclick = () => { st.color = b.dataset.col; sync(); }));
      sync();
      $("[data-hist]", r)?.addEventListener("click", () => { S.txFilter = { q: "", type: "all", month: "all", account: a.id, category: "all" }; closeSheet(); });
      $("[data-del]", r)?.addEventListener("click", async () => {
        const n = S.transactions.filter((t) => t.accountId === a.id || t.toAccountId === a.id).length;
        if (n) return toast(`Vir ima ${n} transakcij. Namesto brisanja ga arhiviraj.`, "error");
        if (!(await confirmBox("Izbriši vir?", `Vir »${a.name}« bo izbrisan.`, "Izbriši"))) return;
        S.accounts = S.accounts.filter((x) => x.id !== a.id); persist(S.be.del("accounts", a.id)); rerender(); toast("Vir izbrisan.");
      });
      $("[data-save]", r).onclick = () => {
        const name = $("#a-name", r).value.trim();
        if (!name) return toast("Vpiši ime vira.", "error");
        const init = parseAmount($("#a-init", r).value);
        const obj = { ...(a || { id: uid(), createdAt: Date.now(), order: S.accounts.length }), name, type: st.type, color: st.color, initial: isNaN(init) ? 0 : init, includeInTotal: $("#a-incl", r).checked, archived: a ? $("#a-arch", r).checked : false };
        const i = S.accounts.findIndex((x) => x.id === obj.id);
        i >= 0 ? (S.accounts[i] = obj) : S.accounts.push(obj);
        persist(S.be.put("accounts", obj)); closeSheet(); rerender(); toast(a ? "Vir posodobljen." : "Vir dodan.");
      };
    }
  });
}
function adjustSheet() {
  const b = balances(); const accs = activeAccounts();
  if (!accs.length) return accountSheet();
  openSheet({
    title: "Popravi stanje",
    body: `<p class="muted">Vpiši dejansko stanje (npr. po bančnem izpisku). Razlika se zapiše kot popravek in se ne šteje med prihodke ali odhodke.</p>
      <label class="field"><span>Vir</span><select id="ad-acc">${accs.map((a) => `<option value="${a.id}">${esc(a.name)} – ${wealth(b[a.id] || 0)}</option>`).join("")}</select></label>
      <label class="field"><span>Dejansko stanje</span><div class="money-in"><input id="ad-amt" inputmode="decimal" placeholder="0,00"><span>${currency()}</span></div></label>`,
    footer: `<button class="btn primary grow" data-save>${icon("check", 18)} Popravi</button>`,
    onMount: (r) => {
      const pre = (id) => (S.hide ? "" : amountInput(b[id] || 0));
      $("#ad-amt", r).value = pre(accs[0].id);
      $("#ad-acc", r).onchange = (e) => ($("#ad-amt", r).value = pre(e.target.value));
      $("[data-save]", r).onclick = () => {
        const id = $("#ad-acc", r).value; const target = parseAmount($("#ad-amt", r).value);
        if (isNaN(target)) return toast("Vpiši znesek.", "error");
        const diff = target - (b[id] || 0);
        if (!diff) { closeSheet(); return toast("Stanje je že pravilno."); }
        const t = { id: uid(), type: "adjust", amount: diff, accountId: id, date: todayISO(), note: "", createdAt: Date.now() };
        S.transactions.push(t); persist(S.be.put("transactions", t)); closeSheet(); rerender(); toast("Stanje popravljeno.");
      };
    }
  });
}

// ═════════════════════════════════════════════════════════════
//  NASTAVITVE
// ═════════════════════════════════════════════════════════════
function viewSettings() {
  const p = S.profile; const theme = LS.get("theme", "dark");
  const item = (ic, title, sub, attr, right = icon("chevron-right", 18, "muted"), cls = "") =>
    `<button class="set-row ${cls}" ${attr}><span class="bubble sm" style="--c:var(--ink-2)">${icon(ic, 18)}</span><span class="grow"><b>${title}</b>${sub ? `<small class="muted">${sub}</small>` : ""}</span>${right}</button>`;
  return `${header("Nastavitve")}
  <section class="profile card">
    <div class="avatar lg">${esc((p.name || p.email || "?")[0].toUpperCase())}</div>
    <div class="grow"><b>${esc(p.name || "Brez imena")}</b><small class="muted">${esc(p.email || S.user.email)}</small></div>
    ${S.isAdmin ? `<span class="badge gold">${icon("shield-check", 12)} Admin</span>` : ""}
  </section>
  ${S.isAdmin ? `<h4 class="sec-t">Administracija</h4><div class="card list">${item("shield-check", "Skrbniška plošča", "Uporabniki, dostop, obvestila", 'data-go="admin"')}</div>` : ""}
  <h4 class="sec-t">Račun</h4>
  <div class="card list">
    ${item("user", "Ime", esc(p.name || "—"), "data-name")}
    ${item("coins", "Valuta", currency(), "data-cur")}
  </div>
  <h4 class="sec-t">Varnost</h4>
  <div class="card list">
    ${item("lock-keyhole", "Spremeni PIN", `${S.secure?.pin?.len || 4}-mestna koda za prikaz stanja`, "data-pin")}
    <div class="set-row" id="bio-row" hidden><span class="bubble sm" style="--c:var(--ink-2)">${icon("scan-face", 18)}</span><span class="grow"><b>Face ID / prstni odtis</b><small class="muted">Odklepanje z biometrijo na tej napravi</small></span><label class="switch"><input type="checkbox" id="s-bio" ${LS.get(bioKey(), null) ? "checked" : ""}><i></i></label></div>
    ${item("key-round", "Spremeni geslo", "Geslo za prijavo", "data-pw")}
  </div>
  <h4 class="sec-t">Videz</h4>
  <div class="card pad">
    <div class="seg">${[["dark", "Temna", "moon"], ["light", "Svetla", "sun"], ["system", "Sistem", "monitor"]].map(([k, l, ic]) => `<button class="${theme === k ? "on" : ""}" data-theme="${k}">${icon(ic, 16)} ${l}</button>`).join("")}</div>
    <div class="toggle-row flat"><span class="grow"><b>Skrij stanje</b><small class="muted">Skrije stanje in prihodke, odhodki ostanejo vidni. Prikaz zahteva PIN.</small></span><label class="switch"><input type="checkbox" id="s-hide" ${S.hide ? "checked" : ""}><i></i></label></div>
  </div>
  <h4 class="sec-t">Podatki</h4>
  <div class="card list">
    ${item("file-spreadsheet", "Izvozi CSV", "Za Excel / Google Preglednice", "data-csv")}
    ${item("file-json", "Varnostna kopija", "Prenesi vse podatke (JSON)", "data-json")}
    ${item("upload", "Obnovi iz kopije", "Uvozi JSON datoteko", "data-import")}
    ${item("trash2", "Izbriši vse podatke", "Začni znova s prvo nastavitvijo", "data-wipe", "", "danger-t")}
  </div>
  <h4 class="sec-t">Aplikacija</h4>
  <div class="card list">
    ${S.installPrompt ? item("smartphone", "Namesti aplikacijo", "Dodaj na začetni zaslon", "data-install") : ""}
    ${item("info", `${APP_NAME} v${APP_VERSION}`, S.be.mode === "firebase" ? "Sinhronizacija v oblaku (Firebase)" : "Lokalni način – podatki samo v tem brskalniku", "", "")}
    ${item("log-out", "Odjava", "", "data-logout", "", "danger-t")}
  </div>
  <input type="file" id="imp-file" accept="application/json,.json" hidden>`;
}
bind.settings = (v) => {
  $("[data-go]", v)?.addEventListener("click", () => (location.hash = "#/admin"));
  $$("[data-theme]", v).forEach((b) => (b.onclick = () => { LS.set("theme", b.dataset.theme); applyTheme(b.dataset.theme); persist(S.be.setProfile({ theme: b.dataset.theme })); rerender(); }));
  $("#s-hide", v).onchange = (e) => {
    if (e.target.checked) { S.hide = true; LS.set("hide", true); return; }
    e.target.checked = true; requestUnhide(); // prikaz zahteva PIN ali biometrijo
  };
  $("[data-pin]", v).onclick = () => changePinSheet();
  const bioSw = $("#s-bio", v);
  bioSupported().then((ok) => { if (ok) $("#bio-row", v)?.removeAttribute("hidden"); });
  if (bioSw) bioSw.onchange = (e) => {
    if (!e.target.checked) { LS.set(bioKey(), null); toast("Biometrija izklopljena na tej napravi."); return; }
    e.target.checked = false; enableBioSheet();
  };
  $("[data-name]", v).onclick = () => openSheet({
    title: "Ime", body: `<label class="field"><span>Ime</span><input id="n" value="${esc(S.profile.name || "")}" maxlength="40"></label>`,
    footer: `<button class="btn primary grow" data-s>Shrani</button>`,
    onMount: (r) => ($("[data-s]", r).onclick = () => { S.profile.name = $("#n", r).value.trim(); persist(S.be.setProfile({ name: S.profile.name })); closeSheet(); rerender(); })
  });
  $("[data-cur]", v).onclick = () => openSheet({
    title: "Valuta", body: `<p class="muted">Sprememba valute ne preračuna zneskov – spremeni se samo prikaz.</p><div class="chips">${CURRENCIES.map((c) => `<button class="chip ${c === currency() ? "on" : ""}" data-c="${c}">${c}</button>`).join("")}</div>`,
    onMount: (r) => $$("[data-c]", r).forEach((b) => (b.onclick = () => { S.profile.currency = b.dataset.c; persist(S.be.setProfile({ currency: b.dataset.c })); closeSheet(); rerender(); }))
  });
  $("[data-pw]", v)?.addEventListener("click", () => openSheet({
    title: "Spremeni geslo",
    body: `<label class="field"><span>Trenutno geslo</span><input type="password" id="p0" autocomplete="current-password"></label>
      <label class="field"><span>Novo geslo (vsaj 8 znakov)</span><input type="password" id="p1" autocomplete="new-password"></label>
      <label class="field"><span>Ponovi novo geslo</span><input type="password" id="p2" autocomplete="new-password"></label>`,
    footer: `<button class="btn primary grow" data-s>Spremeni</button>`,
    onMount: (r) => ($("[data-s]", r).onclick = async () => {
      const [a, b, c] = ["#p0", "#p1", "#p2"].map((s) => $(s, r).value);
      if (b.length < 8) return toast("Novo geslo mora imeti vsaj 8 znakov.", "error");
      if (b !== c) return toast("Gesli se ne ujemata.", "error");
      try { await S.be.changePassword(a, b); closeSheet(); toast("Geslo spremenjeno."); } catch (e) { toast(errorText(e), "error"); }
    })
  }));
  $("[data-csv]", v).onclick = () => exportCSV(sortedTx());
  $("[data-json]", v).onclick = exportJSON;
  $("[data-import]", v).onclick = () => $("#imp-file").click();
  $("#imp-file", v).onchange = (e) => importJSON(e.target.files[0]);
  $("[data-wipe]", v).onclick = async () => {
    if (!(await confirmBox("Izbriši vse podatke?", "Izbrisani bodo vsi viri, kategorije in transakcije. Priporočamo, da najprej preneseš varnostno kopijo.", "Izbriši vse"))) return;
    try {
      await S.be.deleteAll(); await S.be.setProfile({ onboarded: false });
      Object.assign(S, { accounts: [], categories: [], transactions: [], secure: {} }); S.profile.onboarded = false;
      toast("Podatki izbrisani."); renderOnboarding();
    } catch (e) { toast(errorText(e), "error"); }
  };
  $("[data-install]", v)?.addEventListener("click", async () => { S.installPrompt.prompt(); await S.installPrompt.userChoice; S.installPrompt = null; rerender(); });
  $("[data-logout]", v).onclick = async () => { if (await confirmBox("Odjava", "Se želiš odjaviti?", "Odjava", false)) { $("#app").innerHTML = ""; S.be.signOut(); } };
};

function download(name, content, type) {
  const blob = new Blob([content], { type }); const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function exportCSV(list) {
  const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const types = { income: "Prihodek", expense: "Odhodek", transfer: "Prenos", adjust: "Popravek" };
  const rows = [["Datum", "Vrsta", "Znesek", "Valuta", "Kategorija", "Vir", "Na vir", "Opomba"].join(";")];
  list.forEach((t) => rows.push([t.date, types[t.type], ((t.type === "expense" ? -t.amount : t.amount) / 100).toFixed(2).replace(".", ","), currency(),
    q(cat(t.categoryId)?.name || ""), q(acc(t.accountId)?.name || ""), q(acc(t.toAccountId)?.name || ""), q(t.note)].join(";")));
  download(`cekin-transakcije-${todayISO()}.csv`, "﻿" + rows.join("\r\n"), "text/csv;charset=utf-8");
  toast("CSV izvožen.");
}
function exportJSON() {
  const data = { app: "cekin", version: 1, exportedAt: new Date().toISOString(), profile: { name: S.profile.name, currency: S.profile.currency }, accounts: S.accounts, categories: S.categories, transactions: S.transactions };
  download(`cekin-kopija-${todayISO()}.json`, JSON.stringify(data, null, 2), "application/json");
  toast("Varnostna kopija prenesena.");
}
async function importJSON(file) {
  if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    if (d.app !== "cekin" || !Array.isArray(d.transactions)) throw new Error("Datoteka ni veljavna varnostna kopija aplikacije Cekin.");
    if (!(await confirmBox("Obnovi podatke?", `Uvozilo se bo ${d.accounts.length} virov, ${d.categories.length} kategorij in ${d.transactions.length} transakcij. Obstoječi zapisi z enakim ID se prepišejo.`, "Uvozi", false))) return;
    await Promise.all([S.be.putMany("accounts", d.accounts), S.be.putMany("categories", d.categories), S.be.putMany("transactions", d.transactions)]);
    const merge = (cur, inc) => { const m = new Map(cur.map((x) => [x.id, x])); inc.forEach((x) => m.set(x.id, x)); return [...m.values()]; };
    S.accounts = merge(S.accounts, d.accounts); S.categories = merge(S.categories, d.categories); S.transactions = merge(S.transactions, d.transactions);
    rerender(); toast("Podatki uvoženi.");
  } catch (e) { toast(e.message || "Uvoz ni uspel.", "error"); }
}

// ═════════════════════════════════════════════════════════════
//  ADMINISTRACIJA
// ═════════════════════════════════════════════════════════════
let adminUsers = null; let adminReqs = []; let adminQ = "";
function viewAdmin() {
  if (!adminUsers) {
    Promise.all([S.be.listUsers(), S.be.listRequests()])
      .then(([u, r]) => { adminUsers = u; adminReqs = r.filter((x) => !u.some((p) => p.uid === x.uid)); rerender(); })
      .catch((e) => toast(errorText(e), "error"));
  }
  const users = (adminUsers || []).filter((u) => !adminQ || `${u.email} ${u.name}`.toLowerCase().includes(adminQ.toLowerCase()))
    .sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0));
  const week = Date.now() - 7 * 864e5; const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const all = adminUsers || [];
  const d = (ts) => (ts ? new Intl.DateTimeFormat("sl-SI", { dateStyle: "medium", timeStyle: "short" }).format(new Date(ts)) : "—");
  return `${header("Skrbniška plošča", { back: true })}
  <div class="kpis three">
    <div class="kpi"><span class="ki gold">${icon("users", 18)}</span><small>Uporabniki</small><b>${adminUsers ? all.length : "…"}</b></div>
    <div class="kpi"><span class="ki in">${icon("clock", 18)}</span><small>Aktivni 7 dni</small><b>${adminUsers ? all.filter((u) => (u.lastActive || 0) > week).length : "…"}</b></div>
    <div class="kpi"><span class="ki">${icon("sparkles", 18)}</span><small>Novi ta mesec</small><b>${adminUsers ? all.filter((u) => (u.createdAt || 0) > monthStart).length : "…"}</b></div>
  </div>
  <button class="btn primary block" data-adduser>${icon("plus", 18)} Dodaj uporabnika</button>
  ${adminReqs.length ? `<h4 class="sec-t">Zahteve za dostop (${adminReqs.length})</h4>
  <div class="card list">${adminReqs.map((r) => `
    <div class="row user-row"><div class="avatar">${esc((r.email || "?")[0].toUpperCase())}</div>
      <span class="grow"><b>${esc(r.email || r.uid)}</b><small class="muted tiny">Obstoječ račun v projektu · ${d(r.at)}</small></span>
      <button class="icon-btn sm danger-t" data-rej="${r.uid}" aria-label="Zavrni">${icon("x", 18)}</button>
      <button class="btn primary" style="height:36px;padding:0 12px" data-appr="${r.uid}">${icon("check", 16)} Odobri</button>
    </div>`).join("")}</div>` : ""}
  <h4 class="sec-t">Obvestilo za vse uporabnike</h4>
  <div class="card pad">
    <textarea id="ad-notice" rows="3" maxlength="300" placeholder="npr. V nedeljo med 20. in 21. uro vzdrževanje.">${esc(S.config.notice || "")}</textarea>
    <div class="row-end"><button class="btn ghost" data-clear>Počisti</button><button class="btn primary" data-notice>${icon("megaphone", 18)} Objavi</button></div>
  </div>
  <h4 class="sec-t">Uporabniki</h4>
  <div class="search">${icon("search", 18)}<input type="search" placeholder="Išči po e-pošti ali imenu" value="${esc(adminQ)}" data-aq></div>
  <div class="card list">${adminUsers ? users.map((u) => `
    <button class="row user-row tx" data-user="${u.uid}"><div class="avatar ${u.disabled ? "off" : ""}">${esc((u.name || u.email || "?")[0].toUpperCase())}</div>
      <span class="grow"><b>${esc(u.name || "—")}</b><small class="muted">${esc(u.email || u.uid)}</small><small class="muted tiny">Ustvarjen: ${d(u.createdAt)} · Zadnjič: ${d(u.lastActive)}</small></span>
      ${u.disabled ? `<span class="badge red">onemogočen</span>` : u.uid === S.user.uid ? `<span class="badge gold">ti</span>` : u.onboarded ? "" : `<span class="badge">ni še prijavljen</span>`}
    </button>`).join("") || `<p class="muted pad">Ni zadetkov.</p>` : `<p class="muted pad">Nalagam …</p>`}</div>
  <p class="muted tiny pad">${icon("shield", 14)} Zaradi zasebnosti skrbnik vidi samo profile uporabnikov, ne pa njihovih transakcij. Dokončen izbris računa opraviš v Firebase Console → Authentication.</p>`;
}
bind.admin = (v) => {
  $("[data-back]", v).onclick = () => { adminUsers = null; adminReqs = []; location.hash = "#/settings"; };
  $("[data-adduser]", v).onclick = addUserSheet;
  $$("[data-appr]", v).forEach((b) => (b.onclick = async () => {
    const r = adminReqs.find((x) => x.uid === b.dataset.appr);
    try { await S.be.approveRequest(r); adminUsers = null; rerender(); toast(`Dostop odobren: ${r.email}`); } catch (e) { toast(errorText(e), "error"); }
  }));
  $$("[data-rej]", v).forEach((b) => (b.onclick = async () => {
    const r = adminReqs.find((x) => x.uid === b.dataset.rej);
    if (!(await confirmBox("Zavrni zahtevo?", r.email, "Zavrni"))) return;
    try { await S.be.rejectRequest(r); adminReqs = adminReqs.filter((x) => x !== r); rerender(); } catch (e) { toast(errorText(e), "error"); }
  }));
  $$("[data-user]", v).forEach((b) => (b.onclick = () => userSheet(adminUsers.find((u) => u.uid === b.dataset.user))));
  const setNotice = async (txt) => {
    try { await S.be.setConfig({ notice: txt }); S.config.notice = txt; rerender(); toast(txt ? "Obvestilo objavljeno." : "Obvestilo odstranjeno."); } catch (e) { toast(errorText(e), "error"); }
  };
  $("[data-notice]", v).onclick = () => setNotice($("#ad-notice", v).value.trim());
  $("[data-clear]", v).onclick = () => setNotice("");
  const q = $("[data-aq]", v);
  q.oninput = () => { adminQ = q.value; rerender(); const n = $("[data-aq]"); n.focus(); n.setSelectionRange(adminQ.length, adminQ.length); };
};

function genPassword(n = 14) {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#%&*?";
  const r = crypto.getRandomValues(new Uint32Array(n));
  return [...r].map((x) => abc[x % abc.length]).join("");
}
function addUserSheet() {
  openSheet({
    title: "Dodaj uporabnika",
    body: `<label class="field"><span>E-pošta</span><input id="nu-email" type="email" autocomplete="off" placeholder="ime@primer.si"></label>
      <label class="field"><span>Ime (neobvezno)</span><input id="nu-name" maxlength="40"></label>
      <label class="field"><span>Začetno geslo</span><div class="input-ic">${icon("key-round", 18)}<input id="nu-pw" value="${genPassword()}" autocomplete="off" spellcheck="false"><button type="button" class="icon-btn sm" data-gen aria-label="Novo geslo">${icon("refresh-cw", 18)}</button></div>
        <small class="muted">Geslo varno posreduj uporabniku. Spremeni ga lahko v Nastavitvah.</small></label>
      <div class="toggle-row"><span class="grow"><b>Pošlji e-pošto za nastavitev gesla</b><small class="muted">Uporabnik si geslo nastavi sam prek povezave</small></span><label class="switch"><input type="checkbox" id="nu-reset"><i></i></label></div>`,
    footer: `<button class="btn primary grow" data-s>${icon("plus", 18)} Ustvari račun</button>`,
    onMount: (r) => {
      $("[data-gen]", r).onclick = () => ($("#nu-pw", r).value = genPassword());
      $("[data-s]", r).onclick = async (e) => {
        const email = $("#nu-email", r).value.trim(); const password = $("#nu-pw", r).value; const name = $("#nu-name", r).value.trim();
        if (!/^\S+@\S+\.\S+$/.test(email)) return toast("Vpiši veljaven e-poštni naslov.", "error");
        if (password.length < 8) return toast("Geslo mora imeti vsaj 8 znakov.", "error");
        const btn = e.currentTarget; btn.disabled = true; btn.classList.add("loading");
        try {
          await S.be.adminCreateUser({ email, password, name, sendReset: $("#nu-reset", r).checked });
          adminUsers = null;
          openSheet({
            title: "Uporabnik ustvarjen",
            body: `<p class="muted">Podatke za prijavo varno posreduj uporabniku:</p>
              <div class="cred"><div class="kv"><span>Naslov</span><b>${esc(location.origin + location.pathname)}</b></div><div class="kv"><span>E-pošta</span><b>${esc(email)}</b></div><div class="kv"><span>Geslo</span><b class="mono">${esc(password)}</b></div></div>`,
            footer: `<button class="btn ghost" data-close>Zapri</button><button class="btn primary grow" data-copy>${icon("check", 18)} Kopiraj podatke</button>`,
            onMount: (r2) => ($("[data-copy]", r2).onclick = async () => {
              try { await navigator.clipboard.writeText(`${APP_NAME}\n${location.origin + location.pathname}\nE-pošta: ${email}\nGeslo: ${password}`); toast("Kopirano."); } catch { toast("Kopiranje ni uspelo.", "error"); }
            })
          });
          rerender();
        } catch (er) { toast(errorText(er), "error"); btn.disabled = false; btn.classList.remove("loading"); }
      };
    }
  });
}
function userSheet(u) {
  const self = u.uid === S.user.uid;
  openSheet({
    title: u.name || u.email,
    body: `<div class="kv"><span>E-pošta</span><b>${esc(u.email || "")}</b></div>
      <div class="kv"><span>Stanje</span><b class="${u.disabled ? "neg" : "pos"}">${u.disabled ? "Onemogočen" : "Aktiven"}</b></div>
      <div class="kv"><span>Prva nastavitev</span><b>${u.onboarded ? "Opravljena" : "Še ne"}</b></div>
      <div class="kv"><span>UID</span><b class="mono tiny">${esc(u.uid)}</b></div>`,
    footer: self ? `<p class="muted sm">To je tvoj račun.</p>` : `<button class="btn ghost" data-reset>${icon("mail", 18)} Ponastavi geslo</button>
      <button class="btn ${u.disabled ? "primary" : "danger"} grow" data-toggle>${icon(u.disabled ? "check" : "lock", 18)} ${u.disabled ? "Omogoči dostop" : "Onemogoči dostop"}</button>`,
    onMount: (r) => {
      $("[data-reset]", r)?.addEventListener("click", async () => { try { await S.be.adminSendReset(u.email); toast("E-pošta za ponastavitev poslana."); } catch (e) { toast(errorText(e), "error"); } });
      $("[data-toggle]", r)?.addEventListener("click", async () => {
        try { await S.be.adminSetDisabled(u.uid, !u.disabled); u.disabled = !u.disabled; closeSheet(); rerender(); toast(u.disabled ? "Dostop onemogočen." : "Dostop omogočen."); }
        catch (e) { toast(errorText(e), "error"); }
      });
    }
  });
}

// ═════════════════════════════════════════════════════════════
//  PIN + BIOMETRIJA (prikaz skritega stanja)
// ═════════════════════════════════════════════════════════════
const PIN_MAX_FAILS = 5, PIN_LOCK_MS = 60000;
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
async function pinHash(pin, salt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new TextEncoder().encode("cekin-pin:" + salt), iterations: 210000, hash: "SHA-256" }, key, 256);
  return b64u(bits);
}
const checkPin = async (pin) => (await pinHash(pin, S.secure.pin.salt)) === S.secure.pin.hash;
async function savePin(pin) {
  const salt = b64u(crypto.getRandomValues(new Uint8Array(16)));
  const obj = { hash: await pinHash(pin, salt), salt, len: pin.length, updatedAt: Date.now() };
  await S.be.setSecure({ pin: obj });
  S.secure = { ...(S.secure || {}), pin: obj };
}
const weakPin = (p) => /^(\d)\1+$/.test(p) || "01234567890".includes(p) || "09876543210".includes(p);
function lockedFor() { const f = LS.get("pinFails", { n: 0, until: 0 }); const s = Math.ceil((f.until - Date.now()) / 1000); return s > 0 ? s : 0; }
function addFail() {
  const f = LS.get("pinFails", { n: 0, until: 0 }); f.n++;
  if (f.n >= PIN_MAX_FAILS) { f.until = Date.now() + PIN_LOCK_MS; f.n = 0; LS.set("pinFails", f); return `Preveč napačnih poskusov. Poskusi znova čez ${PIN_LOCK_MS / 1000} s.`; }
  LS.set("pinFails", f); return `Napačen PIN. Še ${PIN_MAX_FAILS - f.n} ${PIN_MAX_FAILS - f.n === 1 ? "poskus" : "poskusi"}.`;
}
const clearFails = () => LS.set("pinFails", { n: 0, until: 0 });

// ── tipkovnica ───────────────────────────────────────────────
function pinPadHTML({ title, sub, len, bio = false, extra = "" }) {
  return `<div class="pinpad" data-len="${len}">
    <div class="pin-head"><span class="bubble lg" style="--c:var(--gold)">${icon("lock-keyhole", 26)}</span><h2>${title}</h2><p class="muted" data-sub>${sub}</p></div>
    <div class="pin-dots">${"<i></i>".repeat(len)}</div>
    <p class="pin-err" data-err></p>
    <div class="keys">
      ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button type="button" data-k="${n}">${n}</button>`).join("")}
      ${bio ? `<button type="button" class="kfn" data-bio aria-label="Biometrija">${icon("scan-face", 28)}</button>` : "<span></span>"}
      <button type="button" data-k="0">0</button>
      <button type="button" class="kfn" data-del aria-label="Izbriši">${icon("delete", 26)}</button>
    </div>${extra}
  </div>`;
}
function bindPinPad(root, { onComplete, onBio }) {
  const pad = $(".pinpad", root); const len = +pad.dataset.len; let val = ""; let busy = false;
  const dots = () => $$(".pin-dots i", root).forEach((d, i) => d.classList.toggle("on", i < val.length));
  const fail = (msg) => {
    const d = $(".pin-dots", root); d.classList.remove("shake"); void d.offsetWidth; d.classList.add("shake");
    $("[data-err]", root).textContent = msg || ""; setTimeout(() => { val = ""; dots(); }, 280);
  };
  const press = async (k) => {
    if (busy) return;
    if (k === "del") val = val.slice(0, -1); else if (val.length < len) val += k;
    dots(); if (k !== "del") $("[data-err]", root).textContent = "";
    if (val.length === len) {
      busy = true; const res = await onComplete(val); busy = false;
      if (res !== true) fail(typeof res === "string" ? res : "");
    }
  };
  $$("[data-k]", root).forEach((b) => (b.onclick = () => press(b.dataset.k)));
  $("[data-del]", root).onclick = () => press("del");
  if (onBio) $("[data-bio]", root)?.addEventListener("click", onBio);
  const onKey = (e) => {
    if (!document.body.contains(pad)) return document.removeEventListener("keydown", onKey);
    if (e.target.matches?.("input, textarea, select")) return;
    if (/^\d$/.test(e.key)) press(e.key); else if (e.key === "Backspace") press("del");
  };
  document.addEventListener("keydown", onKey);
}
// nastavitev novega PIN-a (izbira 4/6, vnos, ponovitev)
function pinSetupFlow(root, onDone) {
  let len = S.secure?.pin?.len || 4, first = null;
  const render = () => {
    root.innerHTML = (first ? "" : `<div class="seg sm pin-len"><button type="button" data-l="4" class="${len === 4 ? "on" : ""}">4 števke</button><button type="button" data-l="6" class="${len === 6 ? "on" : ""}">6 števk</button></div>`)
      + pinPadHTML({ title: first ? "Ponovi PIN" : "Nastavi PIN", sub: first ? "Za potrditev vnesi PIN še enkrat." : `Izberi ${len}-mestno kodo.`, len });
    $$("[data-l]", root).forEach((b) => (b.onclick = () => { len = +b.dataset.l; render(); }));
    bindPinPad(root, {
      onComplete: async (pin) => {
        if (!first) { if (weakPin(pin)) return "Koda je preveč predvidljiva. Izberi drugo."; first = pin; render(); return true; }
        if (pin !== first) { first = null; render(); $("[data-err]", root).textContent = "Kodi se ne ujemata. Začni znova."; return true; }
        try { await savePin(pin); clearFails(); onDone(); } catch (e) { toast(errorText(e), "error"); first = null; render(); }
        return true;
      }
    });
  };
  render();
}
function renderPinSetup() {
  $("#app").innerHTML = `<div class="pin-screen">
    <div class="pin-top"><div class="logo-mark sm">${logoSvg()}</div><b>${APP_NAME}</b></div>
    <div id="pin-root"></div>
    <p class="muted tiny center pin-note">${icon("shield-check", 14)} PIN potrebuješ za prikaz skritega stanja. Shrani se samo zgoščen in ga ne vidi nihče, tudi skrbnik ne.</p>
  </div>`;
  pinSetupFlow($("#pin-root"), () => { toast("PIN je nastavljen."); route(); bioSupported().then((ok) => ok && !LS.get(bioKey(), null) && enableBioSheet(true)); });
}

// ── biometrija (WebAuthn, vgrajen avtentikator naprave) ─────
const bioKey = () => "bio:" + (S.user?.uid || "");
const bioOn = () => !!LS.get(bioKey(), null) && !!window.PublicKeyCredential;
async function bioSupported() {
  try { return window.isSecureContext && !!window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); } catch { return false; }
}
async function bioRegister() {
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    rp: { name: APP_NAME, id: location.hostname },
    user: { id: new TextEncoder().encode(S.user.uid), name: S.user.email, displayName: S.profile.name || S.user.email },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
    timeout: 60000, attestation: "none"
  } });
  LS.set(bioKey(), b64u(cred.rawId));
}
async function bioVerify(silent = false) {
  const id = LS.get(bioKey(), null); if (!id) return false;
  try {
    const a = await navigator.credentials.get({ publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)), rpId: location.hostname,
      allowCredentials: [{ type: "public-key", id: unb64u(id) }], userVerification: "required", timeout: 60000
    } });
    return !!(new Uint8Array(a.response.authenticatorData)[32] & 0x04); // zastavica UV = uporabnik preverjen
  } catch { if (!silent) toast("Biometrično preverjanje ni uspelo. Vnesi PIN.", "error"); return false; }
}
function enableBioSheet(afterSetup = false) {
  const grant = (r) => {
    $(".sheet-body", r).innerHTML = `<div class="empty">${icon("scan-face", 44)}<h3>Face ID / prstni odtis</h3><p class="muted">Stanje boš lahko prikazal z biometrijo te naprave namesto s PIN-om. Biometrični podatki ne zapustijo naprave.</p></div>`;
    $(".sheet-foot", r).innerHTML = `<button class="btn ghost" data-close>${afterSetup ? "Preskoči" : "Prekliči"}</button><button class="btn primary grow" data-on>${icon("fingerprint", 18)} Vklopi</button>`;
    $(".sheet-foot [data-close]", r).onclick = closeSheet;
    $("[data-on]", r).onclick = async () => {
      try { await bioRegister(); closeSheet(); toast("Biometrija vklopljena na tej napravi."); rerender(); }
      catch { toast("Biometrije ni bilo mogoče vklopiti.", "error"); }
    };
  };
  openSheet({
    title: "Biometrija", body: afterSetup ? "" : `<div id="pin-root"></div>`, footer: "<span></span>",
    onMount: (r) => {
      if (afterSetup) return grant(r); // PIN je bil pravkar nastavljen
      const root = $("#pin-root", r);
      root.innerHTML = pinPadHTML({ title: "Potrdi s PIN-om", sub: "Za vklop biometrije vnesi PIN.", len: S.secure.pin.len });
      bindPinPad(root, { onComplete: async (pin) => {
        const l = lockedFor(); if (l) return `Preveč poskusov. Poskusi čez ${l} s.`;
        if (await checkPin(pin)) { clearFails(); grant(r); return true; }
        return addFail();
      } });
    }
  });
}

// ── prikaz / skrivanje ───────────────────────────────────────
function toggleHide() {
  if (S.hide) return requestUnhide();
  S.hide = true; LS.set("hide", true); rerender(); // skrivanje ne zahteva kode
}
function requestUnhide() {
  if (!S.secure?.pin) return renderPinSetup();
  const bio = bioOn();
  const done = () => { S.hide = false; LS.set("hide", false); clearFails(); closeSheet(); rerender(); };
  openSheet({
    title: "Prikaži stanje", body: `<div id="pin-root"></div>`,
    onMount: (r) => {
      const root = $("#pin-root", r);
      root.innerHTML = pinPadHTML({ title: "Vnesi PIN", sub: bio ? "ali uporabi Face ID / prstni odtis" : "za prikaz stanja", len: S.secure.pin.len, bio,
        extra: `<button type="button" class="link" data-forgot>Pozabljen PIN?</button>` });
      bindPinPad(root, {
        onComplete: async (pin) => {
          const l = lockedFor(); if (l) return `Preveč poskusov. Poskusi čez ${l} s.`;
          if (await checkPin(pin)) { done(); return true; }
          return addFail();
        },
        onBio: async () => { if (await bioVerify()) done(); }
      });
      $("[data-forgot]", root).onclick = forgotPin;
      if (bio) bioVerify(true).then((ok) => ok && done()); // takoj ponudi biometrijo (še v okviru klika)
    }
  });
}
function changePinSheet(skipOld = false) {
  openSheet({
    title: "Spremeni PIN", body: `<div id="pin-root"></div>`,
    onMount: (r) => {
      const root = $("#pin-root", r);
      const setup = () => pinSetupFlow(root, () => { closeSheet(); toast("PIN je spremenjen."); rerender(); });
      if (skipOld) return setup();
      root.innerHTML = pinPadHTML({ title: "Trenutni PIN", sub: "Najprej vnesi trenutni PIN.", len: S.secure.pin.len, extra: `<button type="button" class="link" data-forgot>Pozabljen PIN?</button>` });
      bindPinPad(root, { onComplete: async (pin) => {
        const l = lockedFor(); if (l) return `Preveč poskusov. Poskusi čez ${l} s.`;
        if (await checkPin(pin)) { clearFails(); setup(); return true; }
        return addFail();
      } });
      $("[data-forgot]", root).onclick = forgotPin;
    }
  });
}
function forgotPin() {
  openSheet({
    title: "Pozabljen PIN",
    body: `<p class="muted">Za nastavitev novega PIN-a vnesi geslo svojega računa.</p><label class="field"><span>Geslo računa</span><input type="password" id="fp-pw" autocomplete="current-password"></label>`,
    footer: `<button class="btn primary grow" data-s>Naprej</button>`,
    onMount: (r) => {
      const go = async () => {
        const b = $("[data-s]", r); b.disabled = true; b.classList.add("loading");
        try { await S.be.verifyPassword($("#fp-pw", r).value); clearFails(); changePinSheet(true); }
        catch (e) { toast(errorText(e), "error"); b.disabled = false; b.classList.remove("loading"); }
      };
      $("[data-s]", r).onclick = go;
      $("#fp-pw", r).addEventListener("keydown", (e) => e.key === "Enter" && go());
    }
  });
}

// ═════════════════════════════════════════════════════════════
//  PWA
// ═════════════════════════════════════════════════════════════
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); S.installPrompt = e; });
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {}));
}

boot();
