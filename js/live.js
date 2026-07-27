/* ==========================================================================
   Match-day console.

   Built for one job: during a 16-minute match you look at ONE screen and never
   hunt for a tab. Pick the match, start the clock, and every action you need —
   goal, scorer, stoppage time, half-time — is a single tap on that screen.

   Clock design: the database never stores a ticking number. It stores when the
   clock was last started plus the seconds banked before that, so pressing Start
   is exactly one write and every viewer derives the same running time locally.
   That keeps the public page's live clock free.

   Scoring design: a goal and its scorer are recorded in ONE write. The old
   two-step flow (type the score, log the scorer later) is what lets the tally
   drift out of sync during a fast match.
   ========================================================================== */

import { writeMany, serverNow, SERVER_TIME } from "./backend.js";
import { $, setHTML, show, toast } from "./ui.js";
import { celebrate } from "./confetti.js";
import * as D from "./data.js";

const e = D.escapeHtml;

let data = null;
let wired = false;
let matchId = null;
let pickingFor = null; // team id whose scorer picker is open
let fixingEvent = null; // set when naming the scorer of an existing goal
let ticker = 0;

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
  startTicker();
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

  const teamBtn = (team, which) =>
    team
      ? `<button class="goal-btn goal-btn--${which}" type="button" data-goal="${e(team.id)}" ${
          locked ? "disabled" : ""
        }>
           <span class="plus">+1</span>
           <span class="nm">${e(team.name)}</span>
         </button>`
      : `<button class="goal-btn" type="button" disabled><span class="nm">TBD</span></button>`;

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
      </div>

      <div class="goal-row">
        ${teamBtn(sides.home, "home")}
        ${teamBtn(sides.away, "away")}
      </div>
      <p class="faint console-hint">
        Tap <b>+1</b>, then tap who scored — the goal and the scorer save together.
      </p>`
      }
    </div>
    ${pickingFor ? scorerPicker(sides) : ""}`
  );
}

/** Player buttons, so logging a scorer is one tap rather than a dropdown. */
function scorerPicker(sides) {
  const team = D.teamById(data, pickingFor);
  if (!team) return "";
  const squad = D.teamPlayers(data, team.id);

  return `<div class="picker" id="picker">
    <div class="picker-head">
      <b>Who scored for ${e(team.name)}?</b>
      <button class="btn btn--sm btn--ghost" type="button" data-pick="cancel">Cancel</button>
    </div>
    <div class="picker-grid">
      <button class="picker-btn is-cap" type="button" data-pick="__captain">
        ${e(team.captainName)}<span>captain</span>
      </button>
      ${squad
        .map(
          (p) => `<button class="picker-btn" type="button" data-pick="${e(p.id)}">
            ${e(p.name)}<span>${e(p.pos)}</span>
          </button>`
        )
        .join("")}
      <button class="picker-btn is-alt" type="button" data-pick="__unknown">
        Not sure<span>log it later</span>
      </button>
      <button class="picker-btn is-alt" type="button" data-pick="__own">
        Own goal<span>no scorer</span>
      </button>
    </div>
  </div>`;
}

function paintEvents() {
  const m = currentMatch();
  const events = D.matchEvents(m);
  const tally = m ? D.eventTally(data, m) : null;

  $("#liveTally").innerHTML = tally
    ? `<span class="pill ${tally.matches ? "pill--mint" : "pill--flame"}">Logged ${
        tally.home
      }–${tally.away} · Score ${tally.homeScore}–${tally.awayScore}</span>`
    : `<span class="pill">Not started</span>`;

  setHTML(
    $("#liveEvents"),
    events.length
      ? events
          .map((ev) => {
            const team = D.teamById(data, ev.teamId);
            const scorer = D.playerById(data, ev.scorerId);
            const name =
              ev.type === "penalty_goal"
                ? "Punctuality penalty (Rule 4)"
                : ev.ownGoal
                ? "Own goal"
                : scorer?.name || ev.scorerName || "Scorer not recorded";
            return `<div class="ev-row">
              <span>⚽</span>
              <span class="grow"><b>${e(name)}</b>
                <div class="faint">${e(team?.name || "")}${
              ev.at ? ` · ${e(ev.clockLabel || "")}` : ""
            }</div></span>
              ${
                !scorer && ev.type === "goal" && !ev.ownGoal
                  ? `<button class="btn btn--sm" type="button" data-fixev="${e(ev.id)}" data-fixteam="${e(
                      ev.teamId
                    )}">Add scorer</button>`
                  : ""
              }
              <button class="btn btn--sm btn--danger" type="button" data-delev="${e(ev.id)}">Remove</button>
            </div>`;
          })
          .join("")
      : `<div class="empty">No goals yet.</div>`
  );
}

/* ------------------------------------------------------------------ actions */

/**
 * A tap on the scorer picker means one of two things, depending on how the
 * picker was opened: score a brand-new goal, or name the scorer of a goal
 * already on the board. Only the first touches the scoreline.
 */
function handlePick(teamId, pick) {
  return fixingEvent ? nameScorer(teamId, pick) : scoreGoal(teamId, pick);
}

/** Attach a scorer to an existing goal. The scoreline is already correct. */
async function nameScorer(teamId, pick) {
  const m = currentMatch();
  const base = `matches/${m.id}/events/${fixingEvent}`;
  const patch = {};
  if (pick === "__captain") patch[`${base}/scorerName`] = D.teamById(data, teamId)?.captainName;
  else if (pick === "__own") patch[`${base}/ownGoal`] = true;
  else if (pick !== "__unknown") patch[`${base}/scorerId`] = pick;

  fixingEvent = null;
  pickingFor = null;
  if (!Object.keys(patch).length) return void paintConsole();
  try {
    await writeMany(patch);
    toast("Scorer added.");
  } catch (ex) {
    toast(`Could not save: ${ex.message}`, "err");
  }
}

/** One write: the scoreline and the scorer, so the two can never disagree. */
async function scoreGoal(teamId, pick) {
  const m = currentMatch();
  const sides = D.matchSides(data, m);
  const isHome = teamId === sides.home?.id;
  const field = isHome ? "homeScore" : "awayScore";
  const current = Number(m[field] || 0);

  const c = D.clockState(m, serverNow());
  const f = D.formatClock(c.elapsed, D.periodLength(data, c.period));
  const evId = `e${Date.now().toString(36)}`;
  const ev = {
    id: evId,
    type: "goal",
    teamId,
    at: SERVER_TIME,
    clockLabel: `${c.label} ${f.main}${f.extra || ""}`,
  };

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
    pickingFor = null;
    celebrate("sale");
    toast(`GOAL — ${D.teamById(data, teamId)?.name} ${current + 1}`);
  } catch (ex) {
    toast(`Could not save: ${ex.message}`, "err");
  }
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
    pickingFor = null;
    paintConsole();
    paintEvents();
  });

  $("#console").addEventListener("click", (ev) => {
    const goal = ev.target.closest("[data-goal]");
    if (goal) {
      pickingFor = goal.dataset.goal;
      paintConsole();
      $("#picker")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }
    const clk = ev.target.closest("[data-clk]");
    if (clk) return void clockAction(clk.dataset.clk);

    const pick = ev.target.closest("[data-pick]");
    if (!pick) return;
    if (pick.dataset.pick === "cancel") {
      pickingFor = null;
      fixingEvent = null;
      paintConsole();
      return;
    }
    handlePick(pickingFor, pick.dataset.pick);
  });

  $("#liveEvents").addEventListener("click", async (ev) => {
    const del = ev.target.closest("[data-delev]");
    if (del) {
      const m = currentMatch();
      const target = D.matchEvents(m).find((x) => x.id === del.dataset.delev);
      const sides = D.matchSides(data, m);
      const field = target?.teamId === sides.home?.id ? "homeScore" : "awayScore";
      if (!confirm("Remove this goal and take it off the scoreline?")) return;
      try {
        await writeMany({
          [`matches/${m.id}/events/${del.dataset.delev}`]: null,
          [`matches/${m.id}/${field}`]: Math.max(0, Number(m[field] || 0) - 1),
        });
        toast("Goal removed.");
      } catch (ex) {
        toast(`Could not save: ${ex.message}`, "err");
      }
      return;
    }

    // "Add scorer" on a goal logged as Not sure — fills the name without
    // touching the scoreline, which is already right.
    const fix = ev.target.closest("[data-fixev]");
    if (!fix) return;
    fixingEvent = fix.dataset.fixev;
    pickingFor = fix.dataset.fixteam;
    paintConsole();
    $("#picker")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}
