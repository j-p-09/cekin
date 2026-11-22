// ─────────────────────────────────────────────────────────────
//  CEKIN – nastavitve
//  Projekt: projekti-sistem (Realtime Database). Manjkajo še apiKey,
//  messagingSenderId in appId. Vpiši podatke svojega Firebase projekta (Firebase Console →
//  Project settings → General → Your apps → Web app → Config).
//
//  Ti podatki NISO skrivnost – Firebase jih pričakuje v odjemalcu.
//  Varnost zagotavljajo pravila v datoteki database.rules.json.
//
//  Če pustiš apiKey prazen, aplikacija teče v LOKALNEM (demo)
//  načinu: podatki se shranijo samo v ta brskalnik.
// ─────────────────────────────────────────────────────────────
export const FIREBASE_CONFIG = {
  apiKey: "",                       // ← VPIŠI (Project settings → General → Web app)
  authDomain: "projekti-sistem.firebaseapp.com",
  databaseURL: "https://projekti-sistem-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "projekti-sistem",
  storageBucket: "",
  messagingSenderId: "",            // ← VPIŠI
  appId: ""                         // ← VPIŠI
};

export const APP_NAME = "Cekin";
export const APP_VERSION = "1.1.0";
