// Podatkovni sloj: Firebase (oblak) ali lokalni demo način.
// Obe izvedbi imata enak vmesnik, zato app.js ne ve, katera teče.
import { FIREBASE_CONFIG } from "./config.js";

const COLS = ["accounts", "categories", "transactions"];
const FB_VERSION = "10.12.2";

export class BackendError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

const ERRORS = {
  "auth/invalid-email": "E-poštni naslov ni veljaven.",
  "auth/user-not-found": "Napačen e-poštni naslov ali geslo.",
  "auth/wrong-password": "Napačen e-poštni naslov ali geslo.",
  "auth/invalid-credential": "Napačen e-poštni naslov ali geslo.",
  "auth/invalid-login-credentials": "Napačen e-poštni naslov ali geslo.",
  "auth/email-already-in-use": "Račun s tem e-poštnim naslovom že obstaja.",
  "auth/weak-password": "Geslo mora imeti vsaj 8 znakov.",
  "auth/too-many-requests": "Preveč poskusov. Poskusi znova čez nekaj minut.",
  "auth/network-request-failed": "Ni internetne povezave.",
  "auth/requires-recent-login": "Za to dejanje se moraš znova prijaviti.",
  "auth/operation-not-allowed": "Registracija je trenutno onemogočena.",
  "auth/admin-restricted-operation": "Registracija je trenutno onemogočena.",
  "registration-closed": "Registracija ni mogoča. Račun ti ustvari skrbnik.",
  "no-access": "Ta račun nima dostopa do aplikacije. Za dostop se obrni na skrbnika.",
  "pending": "Ta račun še nima dostopa do Cekina. Skrbnik je prejel tvojo zahtevo – ko jo odobri, se lahko prijaviš.",
  "exists-in-project": "Ta e-pošta že ima račun v projektu (npr. iz druge aplikacije). Naj se uporabnik prijavi v Cekin s svojim obstoječim geslom – njegova zahteva se ti prikaže med zahtevami za dostop, kjer jo odobriš.",
  "account-disabled": "Tvoj dostop je onemogočen. Obrni se na skrbnika.",
  "permission-denied": "Nimaš dovoljenja za to dejanje (preveri pravila baze)."
};
export function errorText(e) {
  const code = e?.code || "";
  return ERRORS[code] || e?.message || "Prišlo je do napake.";
}

export async function createBackend() {
  const configured = FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.databaseURL;
  return configured ? createFirebaseBackend(FIREBASE_CONFIG) : createLocalBackend();
}

// ═════════════════════════════════════════════════════════════
//  FIREBASE (Authentication + Realtime Database)
//  Vsi podatki so v veji "cekin/", da ne posegajo v druge aplikacije
//  istega projekta:
//    cekin/admins/{uid}            – skrbniki (samo prek Firebase Console)
//    cekin/config/app              – obvestilo za vse
//    cekin/profiles/{uid}          – profil (ustvari ga skrbnik)
//    cekin/requests/{uid}          – zahteve za dostop obstoječih računov
//    cekin/data/{uid}/{zbirka}/{id} – finančni podatki (samo lastnik)
// ═════════════════════════════════════════════════════════════
async function createFirebaseBackend(cfg) {
  const base = `https://www.gstatic.com/firebasejs/${FB_VERSION}`;
  const [appMod, A, D] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-auth.js`),
    import(`${base}/firebase-database.js`)
  ]);
  // Poimenovana instanca "cekin" → seja prijave je ločena od drugih aplikacij na isti domeni.
  const app = appMod.initializeApp(cfg, "cekin");
  const auth = A.getAuth(app);
  const db = D.getDatabase(app, cfg.databaseURL);
  const R = (path) => D.ref(db, "cekin/" + path);

  const uid = () => auth.currentUser?.uid;
  const clean = (o) => JSON.parse(JSON.stringify(o)); // odstrani undefined
  const val = async (path) => (await D.get(R(path))).val();
  const wrap = (fn) => async (...a) => {
    try { return await fn(...a); }
    catch (e) {
      const code = e.code === "PERMISSION_DENIED" || /permission/i.test(e.message || "") ? "permission-denied" : (e.code || "error");
      throw new BackendError(code, errorText({ ...e, code }));
    }
  };
  const isAdmin = async () => { try { return !!(await val(`admins/${uid()}`)); } catch { return false; } };

  return {
    mode: "firebase",
    onAuth(cb) {
      return A.onAuthStateChanged(auth, (u) => cb(u ? { uid: u.uid, email: u.email } : null));
    },
    signIn: wrap((email, pw) => A.signInWithEmailAndPassword(auth, email, pw)),
    // Javne registracije NI – uporabnike doda skrbnik.
    signUp: async () => { throw new BackendError("registration-closed", errorText({ code: "registration-closed" })); },
    resetPassword: wrap((email) => A.sendPasswordResetEmail(auth, email)),
    signOut: () => A.signOut(auth),
    changePassword: wrap(async (oldPw, newPw) => {
      const u = auth.currentUser;
      await A.reauthenticateWithCredential(u, A.EmailAuthProvider.credential(u.email, oldPw));
      await A.updatePassword(u, newPw);
    }),

    // Dostop ima samo, kdor ima profil (ustvari ga skrbnik).
    // Računi iz drugih aplikacij istega projekta brez profila oddajo zahtevo za dostop;
    // računa NE brišemo, ker ga morda uporablja druga aplikacija.
    ensureProfile: wrap(async () => {
      const p = await val(`profiles/${uid()}`);
      if (p) {
        if (p.disabled) { await A.signOut(auth); throw new BackendError("account-disabled"); }
        return p;
      }
      // Skrbnik se ob prvi prijavi nastavi sam – pravila to dovolijo samo
      // e-poštnemu naslovu skrbnika (zapisan je samo v pravilih baze, ne v kodi).
      if (!(await isAdmin())) { try { await D.set(R(`admins/${uid()}`), true); } catch {} }
      if (await isAdmin()) {
        const profile = { email: auth.currentUser.email, name: "", currency: "EUR", onboarded: false, createdAt: Date.now(), lastActive: Date.now() };
        await D.set(R(`profiles/${uid()}`), profile);
        return profile;
      }
      try { await D.set(R(`requests/${uid()}`), { email: auth.currentUser.email, at: Date.now() }); } catch {}
      await A.signOut(auth);
      throw new BackendError("pending");
    }),
    setProfile: (patch) => D.update(R(`profiles/${uid()}`), clean(patch)),
    isAdmin,

    loadAll: wrap(async () => {
      const d = (await val(`data/${uid()}`)) || {};
      return Object.fromEntries(COLS.map((c) => [c, Object.entries(d[c] || {}).map(([id, o]) => ({ ...o, id }))]));
    }),
    put: (col, obj) => D.set(R(`data/${uid()}/${col}/${obj.id}`), clean(obj)),
    del: (col, id) => D.remove(R(`data/${uid()}/${col}/${id}`)),
    async putMany(col, arr) {
      for (let i = 0; i < arr.length; i += 400) {
        const patch = {};
        arr.slice(i, i + 400).forEach((o) => (patch[`${col}/${o.id}`] = clean(o)));
        await D.update(R(`data/${uid()}`), patch);
      }
    },
    deleteAll: () => D.remove(R(`data/${uid()}`)),

    getConfig: async () => { try { return (await val("config/app")) || {}; } catch { return {}; } },
    setConfig: wrap((patch) => D.update(R("config/app"), clean(patch))),

    listUsers: wrap(async () => Object.entries((await val("profiles")) || {}).map(([u, p]) => ({ uid: u, ...p }))),
    listRequests: wrap(async () => Object.entries((await val("requests")) || {}).map(([u, r]) => ({ uid: u, ...r }))),
    approveRequest: wrap(async (r, name = "") => {
      await D.set(R(`profiles/${r.uid}`), { email: r.email, name, currency: "EUR", onboarded: false, createdAt: Date.now(), createdBy: uid() });
      await D.remove(R(`requests/${r.uid}`));
    }),
    rejectRequest: wrap((r) => D.remove(R(`requests/${r.uid}`))),

    // Skrbnik ustvari uporabnika prek ločene (sekundarne) instance, da se sam ne odjavi.
    adminCreateUser: wrap(async ({ email, password, name, sendReset }) => {
      const sec = appMod.initializeApp(cfg, "cekin-admin-" + Date.now());
      const secAuth = A.getAuth(sec);
      try {
        let cred;
        try { cred = await A.createUserWithEmailAndPassword(secAuth, email, password); }
        catch (e) { if (e.code === "auth/email-already-in-use") throw new BackendError("exists-in-project"); throw e; }
        await D.set(R(`profiles/${cred.user.uid}`), {
          email: cred.user.email, name: name || "", currency: "EUR", onboarded: false, createdAt: Date.now(), createdBy: uid()
        });
        if (sendReset) await A.sendPasswordResetEmail(auth, email);
        return cred.user.uid;
      } finally {
        try { await A.signOut(secAuth); } catch {}
        try { await appMod.deleteApp(sec); } catch {}
      }
    }),
    adminSetDisabled: wrap((userId, disabled) => D.update(R(`profiles/${userId}`), { disabled })),
    adminSendReset: wrap((email) => A.sendPasswordResetEmail(auth, email))
  };
}

// ═════════════════════════════════════════════════════════════
//  LOKALNI DEMO NAČIN (localStorage) – za preizkus brez Firebase
// ═════════════════════════════════════════════════════════════
function createLocalBackend() {
  const K = (k) => `cekin:local:${k}`;
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(K(k))) ?? d; } catch { return d; } };
  const write = (k, v) => localStorage.setItem(K(k), JSON.stringify(v));
  let listeners = [];
  let current = read("session", null);

  async function hash(pw, salt) {
    if (crypto?.subtle) {
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
      const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: 150000, hash: "SHA-256" }, key, 256);
      return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    return btoa(salt + pw);
  }
  const emit = () => listeners.forEach((cb) => cb(current));
  const data = () => read(`data:${current.uid}`, { profile: null, accounts: {}, categories: {}, transactions: {} });
  const save = (d) => write(`data:${current.uid}`, d);
  const fail = (code) => { throw new BackendError(code, errorText({ code })); };

  return {
    mode: "local",
    onAuth(cb) { listeners.push(cb); setTimeout(() => cb(current), 0); return () => (listeners = listeners.filter((l) => l !== cb)); },
    async signIn(email, pw) {
      const users = read("users", {});
      const u = users[email.toLowerCase()];
      if (!u || (await hash(pw, u.salt)) !== u.hash) fail("auth/invalid-credential");
      current = { uid: u.uid, email: email.toLowerCase() }; write("session", current); emit();
    },
    async signUp(email, pw) {
      if (!/^\S+@\S+\.\S+$/.test(email)) fail("auth/invalid-email");
      if (pw.length < 8) fail("auth/weak-password");
      const users = read("users", {});
      if (users[email.toLowerCase()]) fail("auth/email-already-in-use");
      const salt = crypto.randomUUID(); const id = "u_" + crypto.randomUUID().slice(0, 12);
      users[email.toLowerCase()] = { uid: id, salt, hash: await hash(pw, salt) };
      write("users", users);
      current = { uid: id, email: email.toLowerCase() }; write("session", current); emit();
    },
    async resetPassword() { fail("V lokalnem načinu ponastavitev gesla ni na voljo."); },
    async signOut() { current = null; localStorage.removeItem(K("session")); emit(); },
    async changePassword(oldPw, newPw) {
      const users = read("users", {}); const u = users[current.email];
      if ((await hash(oldPw, u.salt)) !== u.hash) fail("auth/invalid-credential");
      if (newPw.length < 8) fail("auth/weak-password");
      u.salt = crypto.randomUUID(); u.hash = await hash(newPw, u.salt); write("users", users);
    },
    async ensureProfile() {
      const d = data();
      if (!d.profile) {
        d.profile = { email: current.email, name: "", currency: "EUR", onboarded: false, createdAt: Date.now(), lastActive: Date.now() };
        save(d);
      }
      return d.profile;
    },
    async setProfile(p) { const d = data(); d.profile = { ...d.profile, ...p }; save(d); },
    async isAdmin() { return false; },
    async loadAll() { const d = data(); return Object.fromEntries(COLS.map((c) => [c, Object.values(d[c])])); },
    async put(col, o) { const d = data(); d[col][o.id] = o; save(d); },
    async del(col, id) { const d = data(); delete d[col][id]; save(d); },
    async putMany(col, arr) { const d = data(); arr.forEach((o) => (d[col][o.id] = o)); save(d); },
    async deleteAll() { const d = data(); COLS.forEach((c) => (d[c] = {})); save(d); },
    async getConfig() { return {}; },
    async setConfig() {},
    async listUsers() { return []; },
    async adminCreateUser() {}, async adminSetDisabled() {}, async adminSendReset() {},
    async listRequests() { return []; }, async approveRequest() {}, async rejectRequest() {}
  };
}
