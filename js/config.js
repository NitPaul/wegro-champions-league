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

   GitHub's secret scanner flags the apiKey below because it matches the shape
   of a Google API key. It cannot tell a browser key from a server key, so this
   is a false positive — close the alert as such. Do NOT rotate the key: it has
   to be public for the site to work, and rotating breaks every visitor.

   What DOES matter, and is worth checking once:
     - Authentication -> Settings -> User actions: turn OFF "Enable create
       (sign-up)". Otherwise anyone holding this key can create accounts in the
       project. They still cannot write — the rule pins writes to the admin UID
       — but there is no reason to leave the door open. Add admin accounts from
       the console instead.
     - Google Cloud Console -> Credentials -> the browser key: restrict it to
       this site's domains so it only works from here.
   ========================================================================== */

export const firebaseConfig = {
  apiKey: "AIzaSyA862gvve4AihIJmZEHnq0DNR3DBS7la-M",
  authDomain: "wegro-champions-league.firebaseapp.com",
  databaseURL:
    "https://wegro-champions-league-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "wegro-champions-league",
  storageBucket: "wegro-champions-league.firebasestorage.app",
  messagingSenderId: "1093328363797",
  appId: "1:1093328363797:web:ba0d9b67abde034721c91c",
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
export const ADMIN_UIDS = ["w5ueQU809vW0lhEnpKlosnesesC2"];

/** Where the tournament lives in the database. Change the season to run 2027. */
export const DB_PATH = "wegro/cl2026";

/**
 * Demo mode passphrase.
 * Only used while `firebaseConfig` is still blank, so you can click around the
 * admin panel before Firebase exists. Once Firebase is configured this value is
 * ignored entirely and real email/password login takes over.
 */
export const DEMO_PASSPHRASE = "wegro2026";
