/* ==========================================================================
   THE ONLY FILE YOU NEED TO EDIT TO GO LIVE.
   Follow README.md → "Step 1: Firebase" and paste your config below.
   ==========================================================================

   Is it safe to have these keys in a public repo?  YES.
   A Firebase web config is an *identifier*, not a secret — it just says which
   project to talk to. What actually protects your data is the Realtime
   Database security rule in `database.rules.json`, which rejects every write
   that does not come from your admin account. Google publishes these configs
   in their own docs for exactly this reason.
   ========================================================================== */

export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  databaseURL: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};

/**
 * The Google account(s) allowed to open the admin panel.
 *
 * Leave this EMPTY the first time. Sign in with Google once and the panel shows
 * you your own UID with a copy button — paste it here and into
 * `database.rules.json`, then redeploy.
 *
 * This list controls the admin *screen*. What actually protects the data is the
 * matching UID in the database rules, which Google's servers enforce.
 */
export const ADMIN_UIDS = [];

/** Where the tournament lives in the database. Change the season to run 2027. */
export const DB_PATH = "wegro/cl2026";

/**
 * Demo mode passphrase.
 * Only used while `firebaseConfig` is still blank, so you can click around the
 * admin panel before Firebase exists. Once Firebase is configured this value is
 * ignored entirely and real email/password login takes over.
 */
export const DEMO_PASSPHRASE = "wegro2026";
