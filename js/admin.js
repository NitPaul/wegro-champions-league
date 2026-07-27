/* ==========================================================================
   Admin console.

   Security note: this file only controls what the admin SEES. What the admin
   is ALLOWED to do is enforced by the Realtime Database rules in
   database.rules.json — a visitor who forces this UI open still gets
   PERMISSION_DENIED on every write.
   ========================================================================== */

import { subscribe, writeMany, replaceAll, onAuth, signIn, signOutAdmin, isDemo, friendlyError } from "./backend.js";
import { $, $$, setHTML, show, wireTabs, rememberTab, toast, confirmPhrase } from "./ui.js";
import { renderAuction } from "./auction.js";
import * as D from "./data.js";

const e = D.escapeHtml;

let data = null;
let signedIn = false;
/* Declared up here, not beside their renderers: in demo mode onAuth fires
   synchronously during module evaluation, so a later `let` would be in its
   temporal dead zone by the time the first render runs. */
let matchSig = "";
let settingsPainted = false;

show($("#demoBanner"), isDemo);
if (isDemo) {
  show($("#emailField"), false);
  $("#email").required = false;
  $("#loginNote").textContent =
    "Demo mode — sign in with the passphrase from js/config.js. Nothing here is secure until Firebase is configured.";
}

/* -------------------------------------------------------------------- auth */

onAuth((user) => {
  signedIn = Boolean(user);
  show($("#loginView"), !signedIn);
  show($("#adminView"), signedIn);
  if (user) {
    $("#whoami").textContent = user.email || "Signed in";
    render();
  }
});

$("#loginForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const btn = $("#loginBtn");
  const err = $("#loginErr");
  show(err, false);
  btn.disabled = true;
  btn.textContent = "Signing in…";
  try {
    await signIn($("#email").value.trim(), $("#password").value);
    $("#password").value = "";
  } catch (ex) {
    err.textContent = friendlyError(ex);
    show(err, true);
  } finally {
    btn.disabled = false;
    btn.textContent = "Sign in";
  }
});

$("#signOut").addEventListener("click", async () => {
  await signOutAdmin();
  toast("Signed out.");
});

/* -------------------------------------------------------------------- data */

subscribe((next) => {
  data = next;
  if (signedIn) render();
});

let saveTab = () => {};
const selectTab = wireTabs($("#tabs"), { onChange: (n) => saveTab(n) });
saveTab = rememberTab("wgcl:admintab", selectTab);

$("#seedBtn").addEventListener("click", async () => {
  $("#seedBtn").disabled = true;
  try {
    await replaceAll(D.seed());
    toast("Tournament loaded.");
  } catch (ex) {
    toast(friendlyError(ex), "err");
    $("#seedBtn").disabled = false;
  }
});

/** Re-render without stealing focus or wiping a half-typed value. */
function preserveFocus(fn) {
  const el = document.activeElement;
  const id = el?.id;
  const start = el?.selectionStart;
  const end = el?.selectionEnd;
  fn();
  if (!id) return;
  const back = document.getElementById(id);
  if (!back || back === document.activeElement) return;
  back.focus({ preventScroll: true });
  try {
    if (start != null && back.setSelectionRange) back.setSelectionRange(start, end);
  } catch {
    /* not a text input */
  }
}

function render() {
  const empty = !data || !data.teams;
  show($("#noData"), empty);
  show($("#adminBody"), !empty);
  if (empty) return;

  renderAuction(data);
  preserveFocus(() => renderMatches());
  renderEvents();
  renderSettings();
}

/* ----------------------------------------------------------------- matches */

/** Only rebuild the score inputs when the underlying values actually change. */
function renderMatches() {
  const list = D.matchesList(data);
  const sig = JSON.stringify(
    list.map((m) => [m.id, m.homeScore, m.awayScore, m.status, D.matchSides(data, m).homeLabel, D.matchSides(data, m).awayLabel, D.matchEvents(m).length])
  );
  if (sig === matchSig) return;
  matchSig = sig;

  setHTML(
    $("#matchList"),
    list
      .map((m) => {
        const s = D.matchSides(data, m);
        const tally = D.eventTally(data, m);
        const logged = D.matchEvents(m).length;
        const goals = Number(m.homeScore || 0) + Number(m.awayScore || 0);
        const drawnFinal = m.isFinal && D.isPlayed(m) && Number(m.homeScore) === Number(m.awayScore);
        const locked = m.isFinal && !D.groupStageComplete(data);

        return `<div class="match ${m.isFinal ? "is-final" : ""} ${m.status === "live" ? "is-live" : ""}">
        <div class="match__head">
          <span class="match__no">${m.isFinal ? "🏆 Final" : `Match ${m.no}`}
            <span class="faint" style="font-weight:500"> · ${e(m.time || "")}</span></span>
          <select class="input" style="width:auto;padding:5px 30px 5px 10px" data-status="${e(m.id)}">
            ${["scheduled", "live", "ft"]
              .map(
                (v) => `<option value="${v}"${m.status === v ? " selected" : ""}>${e(D.STATUS_LABEL[v])}</option>`
              )
              .join("")}
          </select>
        </div>

        <div class="match__grid">
          <span class="match__team">${e(s.homeLabel)}</span>
          <input class="input input--score" type="number" min="0" step="1" inputmode="numeric"
                 id="sc-${e(m.id)}-h" value="${m.homeScore ?? ""}" ${locked ? "disabled" : ""} aria-label="${e(s.homeLabel)} score" />
          <span class="match__dash">–</span>
          <input class="input input--score" type="number" min="0" step="1" inputmode="numeric"
                 id="sc-${e(m.id)}-a" value="${m.awayScore ?? ""}" ${locked ? "disabled" : ""} aria-label="${e(s.awayLabel)} score" />
          <span class="match__team away">${e(s.awayLabel)}</span>
        </div>

        <div class="match__foot">
          <button class="btn btn--primary btn--sm" data-save="${e(m.id)}" type="button" ${locked ? "disabled" : ""}>Save score</button>
          <button class="btn btn--sm btn--danger" data-clear="${e(m.id)}" type="button">Clear</button>
          ${
            locked
              ? `<span class="faint">Unlocks when all group matches are full-time</span>`
              : tally && !tally.matches && logged > 0
              ? `<span class="match__warn">⚠ Scorers logged (${tally.home}–${tally.away}) don't match the scoreline (${tally.homeScore}–${tally.awayScore}). Add the missing goals in the Goals tab, or use a Rule 4 penalty goal.</span>`
              : tally && logged === 0 && goals > 0
              ? `<span class="faint" style="width:100%">No scorers logged yet — add them in the Goals tab to fill the Top Scorer table.</span>`
              : ""
          }
          ${drawnFinal ? `<span class="match__warn">⚠ The Final cannot end level — record the shoot-out result.</span>` : ""}
        </div>
      </div>`;
      })
      .join("")
  );
}

$("#matchList").addEventListener("click", async (ev) => {
  const save = ev.target.closest("[data-save]");
  const clear = ev.target.closest("[data-clear]");

  if (save) {
    const id = save.dataset.save;
    const h = $(`#sc-${id}-h`).value;
    const a = $(`#sc-${id}-a`).value;
    if (h === "" || a === "") return toast("Enter both scores.", "err");
    const hn = Number(h);
    const an = Number(a);
    if (!Number.isInteger(hn) || !Number.isInteger(an) || hn < 0 || an < 0)
      return toast("Scores must be whole numbers of 0 or more.", "err");

    const m = data.matches[id];
    try {
      await writeMany({
        [`matches/${id}/homeScore`]: hn,
        [`matches/${id}/awayScore`]: an,
        // Saving a score almost always means the match is done.
        [`matches/${id}/status`]: m.status === "live" ? "live" : "ft",
      });
      toast("Score saved.");
    } catch (ex) {
      toast(friendlyError(ex), "err");
    }
  }

  if (clear) {
    const id = clear.dataset.clear;
    if (!confirm("Clear this score and every goal logged for this match?")) return;
    try {
      await writeMany({
        [`matches/${id}/homeScore`]: null,
        [`matches/${id}/awayScore`]: null,
        [`matches/${id}/status`]: "scheduled",
        [`matches/${id}/events`]: null,
      });
      toast("Match cleared.");
    } catch (ex) {
      toast(friendlyError(ex), "err");
    }
  }
});

$("#matchList").addEventListener("change", async (ev) => {
  const sel = ev.target.closest("[data-status]");
  if (!sel) return;
  try {
    await writeMany({ [`matches/${sel.dataset.status}/status`]: sel.value });
    toast(`Marked ${D.STATUS_LABEL[sel.value].toLowerCase()}.`);
  } catch (ex) {
    toast(friendlyError(ex), "err");
  }
});

/* ------------------------------------------------------------------ events */

function renderEvents() {
  const matches = D.matchesList(data);
  const sel = $("#evMatch");
  const keep = sel.value;
  setHTML(
    sel,
    matches
      .map((m) => {
        const s = D.matchSides(data, m);
        return `<option value="${e(m.id)}">${m.isFinal ? "Final" : `Match ${m.no}`} — ${e(
          s.homeLabel
        )} v ${e(s.awayLabel)}</option>`;
      })
      .join("")
  );
  if (matches.some((m) => m.id === keep)) sel.value = keep;

  const match = data.matches?.[sel.value];
  const sides = D.matchSides(data, match);

  const teamSel = $("#evTeam");
  const keepTeam = teamSel.value;
  const teams = [sides.home, sides.away].filter(Boolean);
  setHTML(
    teamSel,
    teams.length
      ? teams.map((t) => `<option value="${e(t.id)}">${e(t.name)}</option>`).join("")
      : `<option value="">— teams not decided yet —</option>`
  );
  if (teams.some((t) => t.id === keepTeam)) teamSel.value = keepTeam;

  const squad = D.teamPlayers(data, teamSel.value);
  const captain = D.teamById(data, teamSel.value);
  const opts = (allowNone) =>
    (allowNone ? `<option value="">— none —</option>` : "") +
    (captain ? `<option value="__captain">${e(captain.captainName)} (captain)</option>` : "") +
    squad.map((p) => `<option value="${e(p.id)}">${e(p.name)} (${e(p.pos)})</option>`).join("");

  const keepScorer = $("#evScorer").value;
  const keepAssist = $("#evAssist").value;
  setHTML($("#evScorer"), squad.length || captain ? opts(false) : `<option value="">— squad not set —</option>`);
  setHTML($("#evAssist"), opts(true));
  if ([...$("#evScorer").options].some((o) => o.value === keepScorer)) $("#evScorer").value = keepScorer;
  if ([...$("#evAssist").options].some((o) => o.value === keepAssist)) $("#evAssist").value = keepAssist;

  // Event list + tally
  const events = D.matchEvents(match);
  const tally = match ? D.eventTally(data, match) : null;
  $("#evTally").innerHTML = tally
    ? `<span class="pill ${tally.matches ? "pill--mint" : "pill--flame"}">Logged ${tally.home}–${
        tally.away
      } · Score ${tally.homeScore}–${tally.awayScore}</span>`
    : `<span class="pill">Not started</span>`;

  setHTML(
    $("#evList"),
    events.length
      ? events
          .map((ev2) => {
            const team = D.teamById(data, ev2.teamId);
            const scorer = D.playerById(data, ev2.scorerId);
            const assist = D.playerById(data, ev2.assistId);
            const who =
              ev2.type === "penalty_goal"
                ? "Punctuality penalty (Rule 4)"
                : `${scorer?.name || ev2.scorerName || "Unknown"}${ev2.penalty ? " (pen)" : ""}${
                    assist ? ` · assist ${assist.name}` : ev2.assistName ? ` · assist ${ev2.assistName}` : ""
                  }`;
            return `<div class="ev-row">
              <span>⚽</span>
              <span class="grow"><b>${e(who)}</b><div class="faint">${e(team?.name || "")}</div></span>
              <button class="btn btn--sm btn--danger" data-delev="${e(ev2.id)}" type="button">Remove</button>
            </div>`;
          })
          .join("")
      : `<div class="empty">No goals logged for this match yet.</div>`
  );
}

for (const id of ["#evMatch", "#evTeam"]) $(id).addEventListener("change", renderEvents);

async function addEvent(type) {
  const matchId = $("#evMatch").value;
  const teamId = $("#evTeam").value;
  if (!matchId || !teamId) return toast("Pick a match and a team first.", "err");

  const evId = `e${Date.now().toString(36)}`;
  const payload = { id: evId, type, teamId, at: Date.now() };

  if (type === "goal") {
    const scorer = $("#evScorer").value;
    if (!scorer) return toast("Pick who scored.", "err");
    const assist = $("#evAssist").value;
    const captain = D.teamById(data, teamId);

    // Captains are not in the players list, so store their name instead of an id.
    if (scorer === "__captain") payload.scorerName = captain?.captainName || "Captain";
    else payload.scorerId = scorer;

    if (assist === "__captain") payload.assistName = captain?.captainName || "Captain";
    else if (assist) payload.assistId = assist;

    payload.penalty = $("#evPenalty").checked;
  }

  try {
    await writeMany({ [`matches/${matchId}/events/${evId}`]: payload });
    $("#evPenalty").checked = false;
    toast(type === "goal" ? "Goal logged." : "Penalty goal logged.");
  } catch (ex) {
    toast(friendlyError(ex), "err");
  }
}

$("#addGoal").addEventListener("click", () => addEvent("goal"));
$("#addPenaltyGoal").addEventListener("click", () => addEvent("penalty_goal"));

$("#evList").addEventListener("click", async (ev) => {
  const b = ev.target.closest("[data-delev]");
  if (!b) return;
  try {
    await writeMany({ [`matches/${$("#evMatch").value}/events/${b.dataset.delev}`]: null });
    toast("Goal removed.");
  } catch (ex) {
    toast(friendlyError(ex), "err");
  }
});

/* ---------------------------------------------------------------- settings */

const SETTING_FIELDS = [
  ["budget", "Budget per captain (BDT)", "number"],
  ["basePrice", "Player base price (BDT)", "number"],
  ["minRaise", "Minimum raise (BDT)", "number"],
  ["maxRaise", "Maximum raise (BDT)", "number"],
  ["squadSize", "Players bought per team", "number"],
  ["minPerCategory", "Minimum per position", "number"],
  ["maxPerCategory", "Maximum per position", "number"],
  ["maxGK", "Maximum goalkeepers", "number"],
];

const META_FIELDS = [
  ["venueName", "Venue", "text"],
  ["plusCode", "GPS / Plus code", "text"],
  ["dateLabel", "Date", "text"],
  ["timeLabel", "Time", "text"],
  ["kickoffISO", "Kick-off (for the countdown)", "text"],
  ["auctionLabel", "Auction date & place", "text"],
  ["mapUrl", "Google Maps link", "url"],
  ["season", "Season", "text"],
];

function renderSettings() {
  const s = D.getSettings(data);
  const meta = D.getMeta(data);

  if (!settingsPainted) {
    setHTML(
      $("#settingsGrid"),
      SETTING_FIELDS.map(
        ([k, label, type]) =>
          `<div class="field"><label for="set-${k}">${e(label)}</label>
           <input class="input" type="${type}" id="set-${k}" min="0" step="1" value="${e(s[k])}" /></div>`
      ).join("")
    );
    setHTML(
      $("#metaGrid"),
      META_FIELDS.map(
        ([k, label, type]) =>
          `<div class="field"><label for="meta-${k}">${e(label)}</label>
           <input class="input" type="${type}" id="meta-${k}" value="${e(meta[k] ?? "")}" /></div>`
      ).join("")
    );
    $("#setAuctionOpen").checked = Boolean(s.auctionOpen);
    settingsPainted = true;
  }

  // Golden Ball options (rebuilt each time — squads change during the auction).
  const gb = $("#setGoldenBall");
  const keep = gb.value || s.goldenBallPlayerId || "";
  setHTML(
    gb,
    `<option value="">— not decided —</option>` +
      D.teamsList(data)
        .map((t) => {
          const squad = D.teamPlayers(data, t.id);
          if (!squad.length) return "";
          return `<optgroup label="${e(t.name)}">${squad
            .map((p) => `<option value="${e(p.id)}">${e(p.name)} (${e(p.pos)})</option>`)
            .join("")}</optgroup>`;
        })
        .join("")
  );
  gb.value = [...gb.options].some((o) => o.value === keep) ? keep : "";

  // Teams & captains
  setHTML(
    $("#teamEdit"),
    D.teamsList(data)
      .map(
        (t) => `<div class="team-edit-row">
        <img src="${e(t.captainPhoto)}" alt="" onerror="this.style.visibility='hidden'" />
        <div class="field"><label for="tn-${e(t.id)}">Team name</label>
          <input class="input" id="tn-${e(t.id)}" value="${e(t.name)}" /></div>
        <div class="field"><label for="tc-${e(t.id)}">Captain</label>
          <input class="input" id="tc-${e(t.id)}" value="${e(t.captainName)}" /></div>
        <button class="btn btn--primary btn--sm" data-tsave="${e(t.id)}" type="button">Save</button>
      </div>`
      )
      .join("")
  );
}

$("#saveSettings").addEventListener("click", async () => {
  const patch = {};
  for (const [k] of SETTING_FIELDS) {
    const v = Number($(`#set-${k}`).value);
    if (!Number.isFinite(v) || v < 0) return toast(`"${k}" must be a number of 0 or more.`, "err");
    patch[`settings/${k}`] = v;
  }
  if (patch["settings/minRaise"] > patch["settings/maxRaise"])
    return toast("Minimum raise cannot be larger than the maximum raise.", "err");
  if (patch["settings/minPerCategory"] > patch["settings/maxPerCategory"])
    return toast("Minimum per position cannot exceed the maximum.", "err");

  patch["settings/auctionOpen"] = $("#setAuctionOpen").checked;
  patch["settings/goldenBallPlayerId"] = $("#setGoldenBall").value || null;

  try {
    await writeMany(patch);
    toast("Settings saved.");
  } catch (ex) {
    toast(friendlyError(ex), "err");
  }
});

$("#saveMeta").addEventListener("click", async () => {
  const patch = {};
  for (const [k] of META_FIELDS) patch[`meta/${k}`] = $(`#meta-${k}`).value.trim() || null;
  try {
    await writeMany(patch);
    toast("Details saved.");
  } catch (ex) {
    toast(friendlyError(ex), "err");
  }
});

$("#teamEdit").addEventListener("click", async (ev) => {
  const b = ev.target.closest("[data-tsave]");
  if (!b) return;
  const id = b.dataset.tsave;
  const name = $(`#tn-${id}`).value.trim();
  const cap = $(`#tc-${id}`).value.trim();
  if (!name) return toast("Team name cannot be empty.", "err");
  try {
    await writeMany({ [`teams/${id}/name`]: name, [`teams/${id}/captainName`]: cap || null });
    toast("Team saved.");
  } catch (ex) {
    toast(friendlyError(ex), "err");
  }
});

/* ------------------------------------------------------------------ danger */

$("#resetScores").addEventListener("click", async () => {
  if (!confirmPhrase("This clears every result and every goal.", "CLEAR")) return;
  const patch = {};
  for (const m of D.matchesList(data)) {
    patch[`matches/${m.id}/homeScore`] = null;
    patch[`matches/${m.id}/awayScore`] = null;
    patch[`matches/${m.id}/status`] = "scheduled";
    patch[`matches/${m.id}/events`] = null;
  }
  try {
    await writeMany(patch);
    matchSig = "";
    toast("All scores cleared.");
  } catch (ex) {
    toast(friendlyError(ex), "err");
  }
});

$("#resetAuction").addEventListener("click", async () => {
  if (!confirmPhrase("This returns all players to the pool and refunds every budget.", "RESET")) return;
  const patch = {};
  for (const p of D.playersList(data)) {
    patch[`players/${p.id}/teamId`] = null;
    patch[`players/${p.id}/price`] = null;
  }
  for (const t of D.teamsList(data)) {
    patch[`teams/${t.id}/jerseyColor`] = null;
    patch[`teams/${t.id}/jerseyLabel`] = null;
    patch[`teams/${t.id}/jerseyCost`] = 0;
  }
  patch["settings/auctionOpen"] = true;
  try {
    await writeMany(patch);
    toast("Auction reset.");
  } catch (ex) {
    toast(friendlyError(ex), "err");
  }
});

$("#resetAll").addEventListener("click", async () => {
  if (!confirmPhrase("This wipes the entire tournament and starts over.", "DELETE")) return;
  try {
    await replaceAll(D.seed());
    matchSig = "";
    settingsPainted = false;
    toast("Tournament reset.");
  } catch (ex) {
    toast(friendlyError(ex), "err");
  }
});
