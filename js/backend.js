/* ==========================================================================
   Backend abstraction.

   Two interchangeable implementations behind one API:

   1. FIREBASE  — used the moment js/config.js has a real config. Realtime
                  Database for data (public read, admin-only write, enforced
                  server-side by database.rules.json) + Email/Password auth.

   2. DEMO      — used while the config is blank. Data lives in localStorage so
                  you can explore the whole site offline before Firebase exists.
                  NOT shared between devices and NOT secure. Every page shows a
                  visible DEMO MODE banner so this can never be mistaken for the
                  real thing.

   Public API (identical in both modes):
     isDemo                                  boolean
     subscribe(cb)             -> unsubscribe; cb(data|null) on every change
     writePath(relPath, value) -> Promise    ; relPath is relative to DB_PATH
     writeMany({path: value})  -> Promise    ; multi-path atomic update
     onAuth(cb)                -> unsubscribe; cb(user|null)
     signIn(email, password)   -> Promise<user>
     signOutAdmin()            -> Promise
     currentUser()             -> user|null
   ========================================================================== */

import { firebaseConfig, DB_PATH, DEMO_PASSPHRASE } from "./config.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.5";

export const isDemo = !firebaseConfig.apiKey || !firebaseConfig.databaseURL;

/* ------------------------------------------------------------------ FIREBASE */

let fb = null; // { db, auth, ref, onValue, update, set, serverTimestamp, ... }

async function initFirebase() {
  if (fb) return fb;
  const [{ initializeApp }, dbMod, authMod] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-database.js`),
    import(`${SDK}/firebase-auth.js`),
  ]);
  const app = initializeApp(firebaseConfig);
  fb = {
    db: dbMod.getDatabase(app),
    auth: authMod.getAuth(app),
    ...dbMod,
    ...authMod,
  };
  // Keep the admin signed in across refreshes — a mid-match reload should not
  // dump the referee back to a login screen.
  await fb.setPersistence(fb.auth, fb.browserLocalPersistence).catch(() => {});
  return fb;
}

/* ---------------------------------------------------------------------- DEMO */

const LS_DATA = "wgcl:data";
const LS_AUTH = "wgcl:admin";
const demoListeners = new Set();
const demoAuthListeners = new Set();

function demoRead() {
  try {
    const raw = localStorage.getItem(LS_DATA);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function demoWrite(data) {
  localStorage.setItem(LS_DATA, JSON.stringify(data));
  demoListeners.forEach((cb) => cb(structuredClone(data)));
}
function setIn(obj, path, value) {
  const parts = String(path).split("/").filter(Boolean);
  if (!parts.length) return value === null ? null : value;
  const root = obj ? structuredClone(obj) : {};
  let node = root;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof node[parts[i]] !== "object" || node[parts[i]] === null) node[parts[i]] = {};
    node = node[parts[i]];
  }
  const last = parts[parts.length - 1];
  if (value === null) delete node[last];
  else node[last] = value;
  return root;
}

// Cross-tab sync so the projector view updates while you run the auction.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === LS_DATA) demoListeners.forEach((cb) => cb(demoRead()));
  });
}

const demoUser = () =>
  localStorage.getItem(LS_AUTH) === "1"
    ? { uid: "demo-admin", email: "demo@wegro.local", isDemo: true }
    : null;

/* -------------------------------------------------------------- PUBLIC API */

/* Demo callbacks fire on a microtask, never synchronously. Firebase's do the
   same, and a synchronous first callback would run page code while its own
   module is still being evaluated. */
const later = (fn) => Promise.resolve().then(fn);

export function subscribe(cb) {
  if (isDemo) {
    demoListeners.add(cb);
    later(() => cb(demoRead()));
    return () => demoListeners.delete(cb);
  }
  let off = () => {};
  let cancelled = false;
  initFirebase().then(({ db, ref, onValue }) => {
    if (cancelled) return;
    const node = ref(db, DB_PATH);
    off = onValue(
      node,
      (snap) => cb(snap.val()),
      (err) => {
        console.error("[backend] read failed:", err);
        cb(null);
      }
    );
  });
  return () => {
    cancelled = true;
    off();
  };
}

/** Write one path (relative to DB_PATH). `null` deletes. Stamps meta/updatedAt. */
export async function writePath(relPath, value) {
  return writeMany({ [relPath]: value });
}

/** Write several paths at once so the UI never shows a half-applied change. */
export async function writeMany(patch) {
  const updates = { ...patch };

  if (isDemo) {
    if (!demoUser()) throw new Error("Not signed in.");
    let data = demoRead();
    updates["meta/updatedAt"] = Date.now();
    for (const [p, v] of Object.entries(updates)) data = setIn(data, p, v);
    demoWrite(data);
    return;
  }

  const { db, ref, update, serverTimestamp } = await initFirebase();
  updates["meta/updatedAt"] = serverTimestamp();
  await update(ref(db, DB_PATH), updates);
}

/** Replace the whole tournament node (used by seeding and reset). */
export async function replaceAll(data) {
  if (isDemo) {
    if (!demoUser()) throw new Error("Not signed in.");
    demoWrite({ ...data, meta: { ...data.meta, updatedAt: Date.now() } });
    return;
  }
  const { db, ref, set, serverTimestamp } = await initFirebase();
  await set(ref(db, DB_PATH), {
    ...data,
    meta: { ...data.meta, updatedAt: serverTimestamp() },
  });
}

export function onAuth(cb) {
  if (isDemo) {
    demoAuthListeners.add(cb);
    later(() => cb(demoUser()));
    return () => demoAuthListeners.delete(cb);
  }
  let off = () => {};
  let cancelled = false;
  initFirebase().then(({ auth, onAuthStateChanged }) => {
    if (cancelled) return;
    off = onAuthStateChanged(auth, cb);
  });
  return () => {
    cancelled = true;
    off();
  };
}

export async function signIn(email, password) {
  if (isDemo) {
    if (password !== DEMO_PASSPHRASE) {
      const e = new Error("Wrong demo passphrase.");
      e.code = "auth/wrong-password";
      throw e;
    }
    localStorage.setItem(LS_AUTH, "1");
    demoAuthListeners.forEach((cb) => cb(demoUser()));
    return demoUser();
  }
  const { auth, signInWithEmailAndPassword } = await initFirebase();
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function signOutAdmin() {
  if (isDemo) {
    localStorage.removeItem(LS_AUTH);
    demoAuthListeners.forEach((cb) => cb(null));
    return;
  }
  const { auth, signOut } = await initFirebase();
  await signOut(auth);
}

export function currentUser() {
  if (isDemo) return demoUser();
  return fb?.auth?.currentUser ?? null;
}

/** Turn a Firebase error into something a human can act on. */
export function friendlyError(err) {
  const code = err?.code || "";
  if (code.includes("wrong-password") || code.includes("invalid-credential"))
    return "Wrong email or password.";
  if (code.includes("user-not-found")) return "No admin account with that email.";
  if (code.includes("invalid-email")) return "That doesn't look like an email address.";
  if (code.includes("too-many-requests"))
    return "Too many attempts. Wait a minute and try again.";
  if (code.includes("network")) return "Network error — check your connection.";
  // The two you hit when js/config.js is wrong, rather than the password.
  if (code.includes("api-key-not-valid") || code.includes("invalid-api-key"))
    return "The Firebase apiKey in js/config.js is not valid — re-copy it from the Firebase console.";
  if (code.includes("configuration-not-found") || code.includes("operation-not-allowed"))
    return "Email/Password sign-in is not enabled for this Firebase project. Turn it on under Authentication → Sign-in method.";
  if (String(err?.message || "").includes("PERMISSION_DENIED"))
    return "Permission denied — this account is not the tournament admin.";
  return err?.message || "Something went wrong.";
}
