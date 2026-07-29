/* ==========================================================================
   Match-day console — the screen the referee holds during a game.

   Built for one job: during a 16-minute match you look at ONE screen and never
   hunt for a tab. Pick the match, start the clock, and every action you need —
   goal, save, clearance, stoppage time, half-time — is a tap on that screen.

   Design rules this file follows, in priority order:

     1. The scoreline is never held hostage. Tapping GOAL and then the scorer
        saves the goal immediately. The follow-up questions (where from, who
        assisted) come after, and every one of them can be skipped. A referee
        who walks away mid-flow still has a correct score.
     2. The frequent thing is the fewest taps. Saves happen constantly and a
        squad has exactly one goalkeeper, so a save is ONE tap — the keeper is
        named on the button so it is never a guess.
     3. Everything is undoable, from the log underneath, and removing a goal
        takes it off the scoreline too.

   Clock design: the database never stores a ticking number. It stores when the
   clock was last started plus the seconds banked before that, so pressing Start
   is exactly one write and every viewer derives the same running time locally.
   ========================================================================== */

import { writeMany, serverNow, SERVER_TIME } from "./backend.js";
import { $, setHTML, show, toast } from "./ui.js";
import { celebrate } from "./confetti.js";
import * as D from "./data.js";

const e = D.escapeHtml;

let data = null;
let wired = false;
let matchId = null;
let ticker = 0;

/**
 * What the referee is part-way through, or null when the console is idle.
 * `{ kind, teamId, step, evId }` — see the flow table in handleFlowPick().
 */
let flow = null;

/* ------------------------------------------------------------------ render */

export function renderLive(next) {
  data = next;
  if (!wired) wire();

  const matches = D.matchesList(data);
  const sel = $("#liveMatch");
  const keep = sel.value || matchId;

  setHTML(
    sel,
    matches
      .map((m) => {
        const s = D.matchSides(data, m);
        const c = D.clockState(m, serverNow());
        const tag = m.status === "ft" ? " ✓" : c.period !== "pre" ? " ●" : "";
        return `<option value="${e(m.id)}">${
          m.isFinal ? "Final" : `Match ${m.no}`
        } — ${e(s.homeLabel)} v ${e(s.awayLabel)}${tag}</option>`;
      })
      .join("")
  );

  // Default to the live match, else the first one not finished.
  if (matches.some((m) => m.id === keep)) sel.value = keep;
  else {
    const auto =
      matches.find((m) => m.status === "live") ||
      matches.find((m) => m.status !== "ft") ||
      matches[0];
    if (auto) sel.value = auto.id;
  }
  matchId = sel.value;

  paintConsole();
  paintEvents();
  paintRefPoints();
  startTicker();
}

/** The points table, inside the referee's own guide, from live settings. */
function paintRefPoints() {
  const w = D.getPoints(data);
  setHTML(
    $("#refPoints"),
    D.POINT_FIELDS.map(
      ([k, label]) => `<div class="ref-pt">
        <span>${e(label)}</span><b class="${w[k] < 0 ? "is-neg" : ""}">${w[k] > 0 ? "+" : ""}${w[k]}</b>
      </div>`
    ).join("")
  );
}

function currentMatch() {
  return data?.matches?.[matchId] || null;
}

/**
 * Both scorelines as real numbers.
 *
 * A seeded match starts with both scores `null`, and `isPlayed()` requires both
 * to be set — so a 0-0 draw, or a match where only one side ever scored, would
 * never count towards the table. Every write that means "this match is under
 * way" pins both sides down.
 */
function bothScores(m) {
  return {
    [`matches/${m.id}/homeScore`]: Number(m.homeScore || 0),
    [`matches/${m.id}/awayScore`]: Number(m.awayScore || 0),
  };
}

/** Only the clock digits are repainted each second — never the whole console. */
function startTicker() {
  if (ticker) return;
  ticker = setInterval(() => {
    const m = currentMatch();
    if (!m) return;
    const c = D.clockState(m, serverNow());
    const len = D.periodLength(data, c.period);
    const f = D.formatClock(c.elapsed, len);
    const main = $("#clockMain");
    const extra = $("#clockExtra");
    const bar = $("#clockBar");
    if (main) main.textContent = f.main;
    if (extra) {
      extra.textContent = f.extra || "";
      show(extra, Boolean(f.extra));
    }
    if (bar && len) bar.style.width = `${Math.min(100, (c.elapsed / len) * 100)}%`;
  }, 250);
}

/** The keeper a save is credited to, and the defenders a clearance suggests. */
const keeperOf = (teamId) => D.teamSquad(data, teamId).find((p) => p.pos === "GK") || null;

/* --------------------------------------------------------------- the console */

function paintConsole() {
  const m = currentMatch();
  if (!m) {
    setHTML($("#console"), `<div class="card"><div class="empty">No match selected.</div></div>`);
    return;
  }

  const sides = D.matchSides(data, m);
  const c = D.clockState(m, serverNow());
  const len = D.periodLength(data, c.period);
  const f = D.formatClock(c.elapsed, len);
  const locked = m.isFinal && !D.groupStageComplete(data);

  setHTML(
    $("#console"),
    `<div class="card console-card ${c.isPlaying && c.running ? "is-running" : ""}">
      <div class="console-head">
        <span class="pill ${c.running ? "pill--live" : ""}">${e(c.label)}</span>
        <span class="faint">${m.isFinal ? "🏆 Final" : `Match ${m.no}`}${
      m.time ? ` · scheduled ${e(m.time)}` : ""
    }</span>
      </div>

      <div class="console-score">
        <div class="cs-team">${e(sides.homeLabel)}</div>
        <div class="cs-num">${m.homeScore ?? 0}</div>
        <div class="cs-dash">–</div>
        <div class="cs-num">${m.awayScore ?? 0}</div>
        <div class="cs-team cs-team--away">${e(sides.awayLabel)}</div>
      </div>

      <div class="clock">
        <span id="clockMain">${f.main}</span><span class="clock-extra" id="clockExtra" ${
      f.extra ? "" : "hidden"
    }>${f.extra || ""}</span>
      </div>
      <div class="clock-track"><i id="clockBar" style="width:${
        len ? Math.min(100, (c.elapsed / len) * 100) : 0
      }%"></i></div>

      ${
        locked
          ? `<p class="faint" style="text-align:center">The Final unlocks once all six group matches are full-time.</p>`
          : `
      <div class="console-controls">
        ${
          c.running
            ? `<button class="btn btn--orange" type="button" data-clk="pause">⏸ Pause</button>`
            : `<button class="btn btn--primary" type="button" data-clk="start">${
                c.period === "pre" ? "▶ Kick off" : "▶ Resume"
              }</button>`
        }
        <button class="btn" type="button" data-clk="next">⏭ ${
          c.period === "pre"
            ? "Skip to first half"
            : c.period === "h1"
            ? "End first half"
            : c.period === "ht"
            ? "Start second half"
            : c.period === "h2"
            ? "End the match"
            : c.period === "et"
            ? "End extra time"
            : "Full-time"
        }</button>
        <button class="btn btn--sm" type="button" data-clk="add60">+1 min stoppage</button>
        ${
          c.period === "ft"
            ? `<button class="btn btn--sm" type="button" data-clk="extra">Add extra time</button>`
            : ""
        }
        <button class="btn btn--sm btn--danger" type="button" data-clk="reset">Reset clock</button>
      </div>`
      }
    </div>

    ${locked ? "" : actionGrid(sides)}
    ${flow ? flowPanel(sides) : ""}`
  );
}

/**
 * The logging pad: one column per team, so the referee's thumb never has to
 * decide which side a button belongs to. Goal is the big target; the two
 * point-scoring defensive actions sit under it.
 */
function actionGrid(sides) {
  const m = currentMatch();
  const block = (team, which) => {
    if (!team)
      return `<div class="act-team"><div class="act-head">TBD</div>
        <button class="act act--goal" type="button" disabled>⚽ GOAL</button></div>`;

    const gk = keeperOf(team.id);
    const n = countFor(m, team.id);
    return `<div class="act-team act-team--${which}">
      <div class="act-head">${e(team.name)}</div>
      <button class="act act--goal" type="button" data-act="goal" data-team="${e(team.id)}">
        <span class="act-ico">⚽</span><span class="act-lbl">GOAL</span>
      </button>
      <div class="act-row">
        <button class="act act--save" type="button" data-act="save" data-team="${e(team.id)}">
          <span class="act-ico">🧤</span>
          <span class="act-lbl">SAVE</span>
          <span class="act-sub">${gk ? e(gk.name) : "pick keeper"}</span>
        </button>
        <button class="act act--clear" type="button" data-act="clearance" data-team="${e(team.id)}">
          <span class="act-ico">🛡</span>
          <span class="act-lbl">CLEARANCE</span>
          <span class="act-sub">pick player</span>
        </button>
      </div>
      <div class="act-tally faint">
        ${n.goals} goal${n.goals === 1 ? "" : "s"} · ${n.saves} save${
      n.saves === 1 ? "" : "s"
    } · ${n.clearances} clearance${n.clearances === 1 ? "" : "s"}
      </div>
    </div>`;
  };

  return `<div class="card act-card">
    <div class="act-grid">${block(sides.home, "home")}${block(sides.away, "away")}</div>
    <p class="faint console-hint">
      <b>Goal:</b> tap GOAL → who scored → where from → who assisted. The score saves on
      the first tap; the rest can be skipped.
      <b>Save</b> is one tap. Everything can be removed in the log below.
    </p>
  </div>`;
}

/** What this team has logged in this match — shown live under their buttons. */
function countFor(m, teamId) {
  const evs = D.matchEvents(m).filter((x) => x.teamId === teamId);
  return {
    goals: evs.filter(D.isGoalEvent).length,
    saves: evs.filter((x) => x.type === "save").length,
    clearances: evs.filter((x) => x.type === "clearance").length,
  };
}

/* ------------------------------------------------------------- the flow pad */

/** One tappable player button. */
function playerBtn(p, extra = "") {
  return `<button class="picker-btn ${extra}" type="button" data-pick="${e(p.id)}">
    ${e(p.name)}<span>${e(p.pos)}</span>
  </button>`;
}

function panel(title, sub, inner) {
  return `<div class="picker" id="picker">
    <div class="picker-head">
      <div><b>${title}</b>${sub ? `<div class="faint">${sub}</div>` : ""}</div>
      <button class="btn btn--sm btn--ghost" type="button" data-pick="cancel">Close</button>
    </div>
    ${inner}
  </div>`;
}

function flowPanel(sides) {
  const team = D.teamById(data, flow.teamId);
  if (!team) return "";
  const squad = D.teamPlayers(data, team.id);

  /* ---- who did it? --------------------------------------------------- */
  if (flow.step === "who") {
    const isGoal = flow.kind === "goal" || flow.kind === "fixscorer";
    // For a clearance, defenders come first — that is who usually clears.
    const order =
      flow.kind === "clearance"
        ? [...squad].sort(
            (a, b) => (a.pos === "DEF" ? 0 : 1) - (b.pos === "DEF" ? 0 : 1)
          )
        : squad;

    const title = isGoal
      ? `Who scored for ${e(team.name)}?`
      : flow.kind === "save"
      ? `Who made the save for ${e(team.name)}?`
      : `Who cleared it for ${e(team.name)}?`;

    return panel(
      title,
      isGoal ? "The goal is saved as soon as you tap." : "",
      `<div class="picker-grid">
        <button class="picker-btn is-cap" type="button" data-pick="__captain">
          ${e(team.captainName)}<span>captain</span>
        </button>
        ${order
          .map((p) =>
            playerBtn(p, flow.kind === "clearance" && p.pos === "DEF" ? "is-hint" : "")
          )
          .join("")}
        ${
          isGoal
            ? `<button class="picker-btn is-alt" type="button" data-pick="__unknown">
                 Not sure<span>log it later</span>
               </button>
               <button class="picker-btn is-alt" type="button" data-pick="__own">
                 Own goal<span>no scorer</span>
               </button>`
            : ""
        }
      </div>`
    );
  }

  /* ---- where from? --------------------------------------------------- */
  if (flow.step === "zone") {
    const cell = (k) =>
      `<button class="zone-cell" type="button" data-zone="${k}">${e(D.ZONE_LABEL[k])}</button>`;
    return panel(
      "Where was it scored from?",
      "Tap the pitch. Skip if you did not see it.",
      `<div class="zone-pick">
        <div class="zone-goal">▲ GOAL</div>
        <div class="zone-grid">
          ${cell("lb")}${cell("ib")}${cell("rb")}
          ${cell("lw")}${cell("lr")}${cell("rw")}
        </div>
        <div class="zone-extra">
          <button class="zone-cell zone-cell--pk" type="button" data-zone="pk">
            ⚽ ${e(D.ZONE_LABEL.pk)} <span>penalty kick</span>
          </button>
          <button class="btn btn--ghost" type="button" data-zone="skip">Skip</button>
        </div>
      </div>`
    );
  }

  /* ---- who assisted? ------------------------------------------------- */
  if (flow.step === "assist") {
    const scorer = D.playerById(data, flow.scorerId);
    // The scorer cannot assist their own goal.
    const rest = squad.filter((p) => p.id !== flow.scorerId);
    return panel(
      "Who assisted?",
      scorer ? `Goal by ${e(scorer.name)}` : "",
      `<div class="picker-grid">
        <button class="picker-btn is-cap" type="button" data-assist="__captain">
          ${e(team.captainName)}<span>captain</span>
        </button>
        ${rest
          .map(
            (p) => `<button class="picker-btn" type="button" data-assist="${e(p.id)}">
              ${e(p.name)}<span>${e(p.pos)}</span>
            </button>`
          )
          .join("")}
        <button class="picker-btn is-alt" type="button" data-assist="none">
          No assist<span>solo goal</span>
        </button>
      </div>`
    );
  }

  return "";
}

/* ------------------------------------------------------------- the match log */

function paintEvents() {
  const m = currentMatch();
  const events = D.matchEvents(m);
  const tally = m ? D.eventTally(data, m) : null;

  const goals = events.filter(D.isGoalEvent).length;
  const saves = events.filter((x) => x.type === "save").length;
  const clears = events.filter((x) => x.type === "clearance").length;

  $("#liveTally").innerHTML = `${
    tally
      ? `<span class="pill ${tally.matches ? "pill--mint" : "pill--flame"}">Goals logged ${
          tally.home
        }–${tally.away} · Score ${tally.homeScore}–${tally.awayScore}</span>`
      : `<span class="pill">Not started</span>`
  } <span class="pill">${saves} save${saves === 1 ? "" : "s"}</span>
    <span class="pill">${clears} clearance${clears === 1 ? "" : "s"}</span>`;

  setHTML(
    $("#liveEvents"),
    events.length
      ? [...events]
          .reverse() // newest first — the thing you might have just got wrong
          .map((ev) => {
            const team = D.teamById(data, ev.teamId);
            const actor = D.playerById(data, ev.scorerId || ev.playerId);
            const assist = D.playerById(data, ev.assistId);

            const name =
              ev.type === "penalty_goal"
                ? "Punctuality penalty (Rule 4)"
                : ev.ownGoal
                ? "Own goal"
                : actor?.name || ev.scorerName || ev.playerName || "Player not recorded";

            const detail = [
              team?.name,
              ev.type === "goal" && ev.zone ? D.ZONE_LABEL[ev.zone] : null,
              assist ? `assist ${assist.name}` : ev.assistName ? `assist ${ev.assistName}` : null,
              ev.clockLabel || null,
            ]
              .filter(Boolean)
              .join(" · ");

            return `<div class="ev-row ev-row--${e(ev.type)}">
              <span class="ev-ico">${D.ACTION_ICON[ev.type] || "•"}</span>
              <span class="grow"><b>${e(name)}</b>
                <div class="faint">${e(detail)}</div></span>
              ${
                ev.type === "goal" && !ev.ownGoal && !actor && !ev.scorerName
                  ? `<button class="btn btn--sm" type="button" data-fixev="${e(
                      ev.id
                    )}" data-fixteam="${e(ev.teamId)}">Add scorer</button>`
                  : ""
              }
              <button class="btn btn--sm btn--danger" type="button" data-delev="${e(
                ev.id
              )}">Remove</button>
            </div>`;
          })
          .join("")
      : `<div class="empty">Nothing logged yet. Goals, saves and clearances appear here as you tap them.</div>`
  );
}

/* ------------------------------------------------------------------ actions */

/** Stamp every event with the match clock, so the log reads like a timeline. */
function stamp(m) {
  const c = D.clockState(m, serverNow());
  const f = D.formatClock(c.elapsed, D.periodLength(data, c.period));
  return `${c.label} ${f.main}${f.extra || ""}`;
}

/** One write: the scoreline and the scorer, so the two can never disagree. */
async function scoreGoal(teamId, pick) {
  const m = currentMatch();
  const sides = D.matchSides(data, m);
  const isHome = teamId === sides.home?.id;
  const field = isHome ? "homeScore" : "awayScore";
  const current = Number(m[field] || 0);

  const evId = `e${Date.now().toString(36)}`;
  const ev = { id: evId, type: "goal", teamId, at: SERVER_TIME, clockLabel: stamp(m) };

  if (pick === "__captain") ev.scorerName = D.teamById(data, teamId)?.captainName || "Captain";
  else if (pick === "__own") ev.ownGoal = true;
  else if (pick !== "__unknown") ev.scorerId = pick;

  try {
    await writeMany({
      // Write BOTH sides, not just the scoring one. A match whose other score is
      // still null does not count as played, so it would quietly never reach the
      // leaderboard.
      ...bothScores(m),
      [`matches/${m.id}/${field}`]: current + 1,
      [`matches/${m.id}/events/${evId}`]: ev,
      [`matches/${m.id}/status`]: m.status === "ft" ? "ft" : "live",
    });
    celebrate("sale");
    toast(`GOAL — ${D.teamById(data, teamId)?.name} ${current + 1}`);

    // An own goal has no scorer to credit and no assist to ask about, so the
    // follow-up questions are skipped entirely.
    if (pick === "__own") flow = null;
    else flow = { kind: "goal", teamId, step: "zone", evId, scorerId: ev.scorerId || null };
    paintConsole();
  } catch (ex) {
    toast(`Could not save: ${ex.message}`, "err");
  }
}

/** A save or a clearance: no scoreline, one event, straight to the log. */
async function logAction(type, teamId, playerId, playerName) {
  const m = currentMatch();
  const evId = `e${Date.now().toString(36)}`;
  const ev = { id: evId, type, teamId, at: SERVER_TIME, clockLabel: stamp(m) };
  if (playerName) ev.playerName = playerName;
  else ev.playerId = playerId;

  try {
    await writeMany({
      [`matches/${m.id}/events/${evId}`]: ev,
      // Logging a save means the match is under way, same as a goal does.
      [`matches/${m.id}/status`]: m.status === "ft" ? "ft" : "live",
      ...bothScores(m),
    });
    const who = playerName || D.playerById(data, playerId)?.name || "Player";
    toast(`${D.ACTION_ICON[type]} ${D.ACTION_LABEL[type]} — ${who}`);
    flow = null;
    paintConsole();
  } catch (ex) {
    toast(`Could not save: ${ex.message}`, "err");
  }
}

/** Attach a scorer to a goal already on the board. The score is already right. */
async function nameScorer(teamId, pick) {
  const m = currentMatch();
  const base = `matches/${m.id}/events/${flow.evId}`;
  const patch = {};
  if (pick === "__captain") patch[`${base}/scorerName`] = D.teamById(data, teamId)?.captainName;
  else if (pick === "__own") patch[`${base}/ownGoal`] = true;
  else if (pick !== "__unknown") patch[`${base}/scorerId`] = pick;

  flow = null;
  if (!Object.keys(patch).length) return void paintConsole();
  try {
    await writeMany(patch);
    toast("Scorer added.");
  } catch (ex) {
    toast(`Could not save: ${ex.message}`, "err");
  }
}

/** Step 2 of the goal flow. Skipping leaves the goal exactly as it was. */
async function setZone(zone) {
  const m = currentMatch();
  const { evId, teamId, scorerId } = flow;
  flow = { kind: "goal", teamId, step: "assist", evId, scorerId };

  if (zone === "skip") return void paintConsole();
  const patch = { [`matches/${m.id}/events/${evId}/zone`]: zone };
  // The penalty-spot cell records the goal type as well as the place.
  if (zone === "pk") patch[`matches/${m.id}/events/${evId}/penalty`] = true;
  try {
    await writeMany(patch);
    paintConsole();
  } catch (ex) {
    toast(`Could not save: ${ex.message}`, "err");
  }
}

/** Step 3, and the end of the goal flow. */
async function setAssist(pick) {
  const m = currentMatch();
  const { evId, teamId } = flow;
  flow = null;

  if (pick === "none") {
    paintConsole();
    return;
  }
  const base = `matches/${m.id}/events/${evId}`;
  const patch =
    pick === "__captain"
      ? { [`${base}/assistName`]: D.teamById(data, teamId)?.captainName || "Captain" }
      : { [`${base}/assistId`]: pick };
  try {
    await writeMany(patch);
    toast("Assist added.");
  } catch (ex) {
    toast(`Could not save: ${ex.message}`, "err");
  }
}

/**
 * A tap in the "who" step. What it means depends on the flow that opened it:
 *
 *   goal       → score a new goal, then ask where from
 *   fixscorer  → name the scorer of a goal already on the board
 *   save       → log a save
 *   clearance  → log a clearance
 */
function handleFlowPick(pick) {
  const { kind, teamId } = flow;
  if (kind === "fixscorer") return nameScorer(teamId, pick);
  if (kind === "goal") return scoreGoal(teamId, pick);

  const captainName = pick === "__captain" ? D.teamById(data, teamId)?.captainName : null;
  return logAction(kind, teamId, pick, captainName);
}

async function clockAction(action) {
  const m = currentMatch();
  const c = D.clockState(m, serverNow());
  const path = `matches/${m.id}/clock`;
  const patch = {};

  if (action === "start") {
    const period = c.period === "pre" ? "h1" : c.period;
    patch[`${path}/period`] = period;
    patch[`${path}/running`] = true;
    // The SERVER stamps this, never this device. Writing Date.now() here while
    // reading with serverNow() made the clock open at the device's clock drift.
    patch[`${path}/startedAt`] = SERVER_TIME;
    patch[`${path}/elapsed`] = Math.round(c.elapsed);
    patch[`matches/${m.id}/status`] = "live";
    Object.assign(patch, bothScores(m)); // 0-0 from kick-off, not null-null
  }

  if (action === "pause") {
    // Bank the seconds run so far, then stop.
    patch[`${path}/running`] = false;
    patch[`${path}/startedAt`] = null;
    patch[`${path}/elapsed`] = Math.round(c.elapsed);
  }

  if (action === "next" || action === "extra") {
    const period = action === "extra" ? "et" : D.nextPeriod(c.period);
    Object.assign(patch, {
      [`${path}/period`]: period,
      [`${path}/running`]: false,
      [`${path}/startedAt`]: null,
      [`${path}/elapsed`]: 0,
      [`${path}/addedSeconds`]: 0,
    });
    // Reaching full-time is what makes a result count towards the table, so both
    // scores must be real numbers by then — including a goalless draw.
    patch[`matches/${m.id}/status`] = period === "ft" ? "ft" : "live";
    Object.assign(patch, bothScores(m));
  }

  if (action === "add60") patch[`${path}/addedSeconds`] = c.added + 60;

  if (action === "reset") {
    if (!confirm("Reset the clock for this match back to not started?")) return;
    Object.assign(patch, {
      [`${path}/period`]: "pre",
      [`${path}/running`]: false,
      [`${path}/startedAt`]: null,
      [`${path}/elapsed`]: 0,
      [`${path}/addedSeconds`]: 0,
      // Also stand the match down. Leaving it "live" is why the public page
      // kept showing a LIVE badge for a match that was no longer being played.
      [`matches/${m.id}/status`]: "scheduled",
    });
  }

  try {
    await writeMany(patch);
    if (action === "next" && D.nextPeriod(c.period) === "ft") toast("Full-time saved.");
  } catch (ex) {
    toast(`Could not save: ${ex.message}`, "err");
  }
}

/* ------------------------------------------------------------------- wiring */

function wire() {
  wired = true;

  $("#liveMatch").addEventListener("change", () => {
    matchId = $("#liveMatch").value;
    flow = null;
    paintConsole();
    paintEvents();
  });

  $("#console").addEventListener("click", (ev) => {
    // Start a flow.
    const act = ev.target.closest("[data-act]");
    if (act) {
      const { act: kind, team } = act.dataset;

      // A save is one tap: there is exactly one keeper per squad, and the
      // button already shows their name, so there is nothing to disambiguate.
      if (kind === "save") {
        const gk = keeperOf(team);
        if (gk) return void logAction("save", team, gk.id);
      }

      flow = { kind, teamId: team, step: "who" };
      paintConsole();
      $("#picker")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }

    const clk = ev.target.closest("[data-clk]");
    if (clk) return void clockAction(clk.dataset.clk);
    if (!flow) return;

    const zone = ev.target.closest("[data-zone]");
    if (zone) return void setZone(zone.dataset.zone);

    const assist = ev.target.closest("[data-assist]");
    if (assist) return void setAssist(assist.dataset.assist);

    const pick = ev.target.closest("[data-pick]");
    if (!pick) return;
    if (pick.dataset.pick === "cancel") {
      flow = null;
      paintConsole();
      return;
    }
    handleFlowPick(pick.dataset.pick);
  });

  $("#liveEvents").addEventListener("click", async (ev) => {
    const del = ev.target.closest("[data-delev]");
    if (del) {
      const m = currentMatch();
      const target = D.matchEvents(m).find((x) => x.id === del.dataset.delev);
      const patch = { [`matches/${m.id}/events/${del.dataset.delev}`]: null };

      // Only a goal touches the scoreline; removing a save must leave it alone.
      if (D.isGoalEvent(target)) {
        const sides = D.matchSides(data, m);
        const field = target.teamId === sides.home?.id ? "homeScore" : "awayScore";
        if (!confirm("Remove this goal and take it off the scoreline?")) return;
        patch[`matches/${m.id}/${field}`] = Math.max(0, Number(m[field] || 0) - 1);
      }

      try {
        await writeMany(patch);
        toast(D.isGoalEvent(target) ? "Goal removed." : "Removed from the log.");
      } catch (ex) {
        toast(`Could not save: ${ex.message}`, "err");
      }
      return;
    }

    // "Add scorer" on a goal logged as Not sure — fills the name without
    // touching the scoreline, which is already right.
    const fix = ev.target.closest("[data-fixev]");
    if (!fix) return;
    flow = { kind: "fixscorer", teamId: fix.dataset.fixteam, step: "who", evId: fix.dataset.fixev };
    paintConsole();
    $("#picker")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}
