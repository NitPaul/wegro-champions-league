/* ==========================================================================
   Prints the database rules for whoever is currently in ADMIN_UIDS.
   Run it after adding or removing an admin:

       node tools/make-rules.mjs

   It writes database.rules.json and prints the block to paste into
   Firebase → Realtime Database → Rules → Publish.

   The point is that the admin list lives in ONE place (js/config.js). Editing
   the rules by hand is how the panel and the database end up disagreeing about
   who the admin is — which looks like "I can open the screen but nothing saves".
   ========================================================================== */

import { readFileSync, writeFileSync } from "node:fs";

// Read config.js as text rather than importing it. The project has no
// package.json, so whether Node treats a .js file as a module depends on its
// syntax-detection heuristic — and that flips the moment anyone adds one. This
// little tool should not be able to break for that reason.
const configPath = new URL("../js/config.js", import.meta.url);
const source = readFileSync(configPath, "utf8");
const match = source.match(/ADMIN_UIDS\s*=\s*\[([^\]]*)\]/);

if (!match) {
  console.error("Could not find ADMIN_UIDS in js/config.js.");
  process.exit(1);
}

const ADMIN_UIDS = [...match[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);

if (!ADMIN_UIDS.length) {
  console.error("ADMIN_UIDS in js/config.js is empty — add at least one UID first.");
  process.exit(1);
}

const condition = ADMIN_UIDS.map((uid) => `auth.uid === '${uid}'`).join(" || ");

const rules = {
  rules: {
    ".read": false,
    ".write": false,
    wegro: {
      ".read": true,
      ".write": `auth != null && (${condition})`,
    },
  },
};

const json = JSON.stringify(rules, null, 2) + "\n";
writeFileSync(new URL("../database.rules.json", import.meta.url), json);

console.log(`\nAdmins (${ADMIN_UIDS.length}):`);
for (const uid of ADMIN_UIDS) console.log("  " + uid);
console.log("\nWritten to database.rules.json.");
console.log("Paste this into Firebase → Realtime Database → Rules → Publish:\n");
console.log(json);
