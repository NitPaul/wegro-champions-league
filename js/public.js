/* ==========================================================================
   Public site. Read-only: it never writes, it only subscribes.
   Every visitor sees the same data update live as the admin edits it.
   ========================================================================== */

import { subscribe, isDemo } from "./backend.js";
import { $, setHTML, show, wireTabs, rememberTab } from "./ui.js";
import { renderCharts, initCharts } from "./charts.js";
import { celebrate } from "./confetti.js";
import * as D from "./data.js";

const e = D.escapeHtml;

/* ------------------------------------------------------------ static copy */

const RULES = [
  "Every team plays every team. Each match: two halves of 8 minutes (16 minutes total), with a 2-minute interval break.",
  "A referee officiates every match. The referee's decision is final.",
  "The referee keeps match stats and awards medals for individual brilliance.",
  "Punctuality is mandatory: teams have 2 minutes to enter the field once called. After that, 1 goal is penalised instantly, plus 1 additional goal for every extra minute of delay — the stopwatch starts after the 2-minute mark.",
  "Each team picks one jersey/t-shirt colour, worn by all members in every match. Colours are decided during the player auction through bidding, and the winning bid is deducted from the captain's 100 BDT auction budget.",
  "Trophies and medals go to the champion and runners-up. Extra medals are awarded for Top Scorer, Best Player (Golden Ball) and Best Goalkeeper.",
  "A win earns 3 points, a draw earns 1. If two teams are tied on points after 6 matches, goal difference decides the leaderboard position.",
];

/* ------------------------------------------------------------------ boot */

show($("#demoBanner"), isDemo);

let saveTab = () => {};
const selectTab = wireTabs($("#tabs"), { onChange: (name) => saveTab(name) });
saveTab = rememberTab("wgcl:tab", selectTab);

let current = null;
let gotData = false;

// Until the first snapshot arrives, show a spinner rather than a page of empty
// tables. If nothing arrives at all, say so instead of hanging silently.
setShell(false);
const offlineTimer = setTimeout(() => {
  if (gotData) return;
  show($("#loading"), false);
  show($("#offline"), true);
}, 8000);

subscribe((data) => {
  gotData = true;
  clearTimeout(offlineTimer);
  show($("#loading"), false);
  show($("#offline"), false);
  current = data;
  render(data);
});

/** Show or hide the hero, tab strip and tab panels as one unit. */
function setShell(visible) {
  show($(".hero"), visible);
  show($("#tabs"), visible);
  show($("#content"), visible);
}

// Keep relative times and the countdown honest without re-rendering everything.
setInterval(() => {
  if (!current) return;
  paintUpdated(current);
  paintCountdown(current);
}, 1000);

/* ---------------------------------------------------------------- render */

function render(data) {
  const empty = !data || !data.teams;
  show($("#notSetUp"), empty);
  setShell(!empty);
  if (empty) {
    show($("#countdownCard"), false);
    show($("#championBanner"), false);
    show($("#liveBanner"), false);
    setHTML($("#updated"), "");
    return;
  }

  paintUpdated(data);
  paintHero(data);
  paintCountdown(data);
  paintBanners(data);
  paintOverview(data);
  paintFixtures(data);
  paintTable(data);
  paintSquads(data);
  paintStats(data);
  paintRules(data);
  renderCharts(data);
  flagChanges(data);
}

/* ---------------------------------------------------- change highlighting */

initCharts();
let prevScores = null;
let sawChampion = false;
let firstPaint = true;

/**
 * Pulse any scoreline that just changed, and fire the confetti when a champion
 * is crowned. Both are skipped on the first paint, so opening the page on an
 * already-finished tournament doesn't set everything flashing at once.
 */
function flagChanges(data) {
  const now = {};
  for (const m of D.matchesList(data)) now[m.id] = `${m.homeScore}-${m.awayScore}`;

  if (prevScores) {
    for (const [id, val] of Object.entries(now)) {
      if (prevScores[id] === val) continue;
      const score = document.querySelector(`[data-match="${id}"] .fx__score`);
      if (!score) continue;
      score.classList.remove("bump");
      void score.offsetWidth; // restart the animation
      score.classList.add("bump");
    }
  }
  prevScores = now;

  const champ = D.champion(data);
  if (champ && !sawChampion && !firstPaint) celebrate("champion");
  sawChampion = Boolean(champ);
  firstPaint = false;
}

/* -------------------------------------------------------------- header */

function paintUpdated(data) {
  const el = $("#updated");
  if (el) el.textContent = `Updated ${D.formatUpdated(D.getMeta(data).updatedAt)}`;
}

/* ---------------------------------------------------------------- hero */

function paintHero(data) {
  const meta = D.getMeta(data);
  $("#heroEyebrow").textContent = `Season ${meta.season}`;
  $("#heroSub").textContent = `${meta.venueName} · ${meta.dateLabel} · ${meta.timeLabel}`;

  const done = D.groupMatches(data).filter(D.isPlayed).length;
  const total = D.groupMatches(data).length;
  const champ = D.champion(data);
  const live = D.matchesList(data).find((m) => m.status === "live");
  const prog = D.auctionProgress(data);

  const pills = [];
  if (champ) pills.push(`<span class="pill pill--gold">🏆 ${e(champ.winner?.name)} are champions</span>`);
  else if (live) pills.push(`<span class="pill pill--live">Live now</span>`);
  pills.push(`<span class="pill">${done}/${total} group matches played</span>`);
  pills.push(
    prog.done
      ? `<span class="pill pill--mint">Squads complete</span>`
      : `<span class="pill">${prog.sold}/${prog.total} players auctioned</span>`
  );
  setHTML($("#heroPills"), pills.join(""));
}

function paintCountdown(data) {
  const card = $("#countdownCard");
  const champ = D.champion(data);
  const cd = champ ? null : D.countdown(D.getMeta(data).kickoffISO);
  show(card, Boolean(cd));
  if (!cd) return;
  const unit = (v, l) => `<div class="cd-unit"><b>${String(v).padStart(2, "0")}</b><span>${l}</span></div>`;
  setHTML(
    $("#countdown"),
    unit(cd.days, "days") + unit(cd.hours, "hrs") + unit(cd.minutes, "min") + unit(cd.seconds, "sec")
  );
}

function paintBanners(data) {
  const champ = D.champion(data);
  const cb = $("#championBanner");
  show(cb, Boolean(champ));
  if (champ)
    setHTML(
      cb,
      `<span style="font-size:26px">🏆</span><span>CHAMPIONS: ${e(champ.winner?.name)}</span>
       <span class="pill" style="background:rgba(0,0,0,.14);border-color:rgba(0,0,0,.2);color:#2c1f00">
         Runners-up: ${e(champ.runnerUp?.name)}</span>`
    );

  const live = D.matchesList(data).find((m) => m.status === "live");
  const lb = $("#liveBanner");
  show(lb, Boolean(live));
  if (live) {
    const s = D.matchSides(data, live);
    setHTML(
      lb,
      `<span class="pill pill--live">Live</span>
       <span><b>${e(s.homeLabel)}</b> ${live.homeScore ?? 0} – ${live.awayScore ?? 0} <b>${e(s.awayLabel)}</b></span>
       <span class="faint">${live.isFinal ? "Final" : `Match ${live.no}`}</span>`
    );
  }
}

/* ------------------------------------------------------------- overview */

function paintOverview(data) {
  const meta = D.getMeta(data);

  // Next up: the live match, else the first not-yet-played match.
  const list = D.matchesList(data);
  const next = list.find((m) => m.status === "live") || list.find((m) => !D.isPlayed(m));
  const champ = D.champion(data);

  if (champ) {
    setHTML(
      $("#nextUp"),
      `<div class="empty">The tournament is complete.<br /><b style="color:var(--gold)">${e(
        champ.winner?.name
      )}</b> lifted the trophy.</div>`
    );
  } else if (next) {
    setHTML($("#nextUp"), fixtureCard(data, next, { open: false, plain: true }));
  } else {
    setHTML($("#nextUp"), `<div class="empty">No matches scheduled.</div>`);
  }

  // Mini leaderboard
  const table = D.standings(data);
  setHTML(
    $("#miniTable"),
    table.length
      ? table
          .map(
            (r) => `<div class="mini-row${r.pos <= 2 ? " qualified" : ""}">
              <span class="pos">${r.pos}</span>
              <span class="grow"><b>${e(r.team.name)}</b>
                <div class="faint">${r.played} played · GD ${r.goalDiff >= 0 ? "+" : ""}${r.goalDiff}</div>
              </span>
              <span class="pts">${r.points}</span>
            </div>`
          )
          .join("")
      : `<div class="empty">No results yet.</div>`
  );

  // Venue
  setHTML(
    $("#venueList"),
    [
      ["Venue", meta.venueName],
      ["GPS / Plus code", meta.plusCode],
      ["Date", meta.dateLabel],
      ["Time", meta.timeLabel],
    ]
      .map(([k, v]) => `<li><span class="k">${e(k)}</span><span class="v">${e(v)}</span></li>`)
      .join("")
  );
  const map = $("#mapLink");
  map.href = meta.mapUrl;

  const s = D.getSettings(data);
  setHTML(
    $("#formatPills"),
    [
      `${D.teamsList(data).length} teams`,
      `${D.groupMatches(data).length} group matches + Final`,
      "2 × 8 min halves",
      `${s.budget} BDT auction budget`,
    ]
      .map((t) => `<span class="pill">${e(t)}</span>`)
      .join("")
  );
}

/* ------------------------------------------------------------- fixtures */

function paintFixtures(data) {
  const list = D.matchesList(data);
  setHTML(
    $("#fixtures"),
    list.length ? list.map((m) => fixtureCard(data, m)).join("") : `<div class="empty">No fixtures.</div>`
  );
}

function fixtureCard(data, m, { plain = false } = {}) {
  const s = D.matchSides(data, m);
  const played = D.isPlayed(m);
  const live = m.status === "live";
  const hs = m.homeScore;
  const as = m.awayScore;

  const cls = [
    "fx",
    m.isFinal ? "fx--final" : "",
    live ? "fx--live" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const label = m.isFinal ? "Final" : `Match ${m.no}`;
  const status = live
    ? `<span class="pill pill--live">Live</span>`
    : played
    ? `<span class="pill pill--mint">Full-time</span>`
    : `<span>${e(m.time || "")}</span>`;

  const winner =
    played && hs !== as ? (Number(hs) > Number(as) ? "home" : "away") : null;

  const score =
    played || live
      ? `<span class="fx__score">${hs ?? 0} <span style="opacity:.45">–</span> ${as ?? 0}</span>`
      : `<span class="fx__score fx__score--pending">${e(m.time || "vs")}</span>`;

  const side = (label, which) =>
    `<span class="fx__team${which === "away" ? " fx__team--away" : ""}${
      winner ? (winner === which ? " win" : " lose") : ""
    }"><span class="fx__name">${e(label)}</span></span>`;

  const events = D.matchEvents(m);
  const bodyTag = events.length && !plain ? "button" : "div";
  const bodyAttrs =
    events.length && !plain
      ? ` type="button" data-fx="${e(m.id)}" aria-expanded="false" aria-controls="ev-${e(m.id)}"`
      : "";

  const evHtml = events.length
    ? `<div class="fx__events" id="ev-${e(m.id)}" hidden>${events
        .map((ev) => {
          const away = ev.teamId === s.away?.id;
          const scorer = D.playerById(data, ev.scorerId);
          const assist = D.playerById(data, ev.assistId);
          const who =
            ev.type === "penalty_goal"
              ? `<b>Punctuality penalty</b> <span class="faint">(Rule 4)</span>`
              : `<b>${e(scorer?.name || "Unknown")}</b>${ev.penalty ? ' <span class="faint">(pen)</span>' : ""}${
                  assist ? ` <span class="faint">assist ${e(assist.name)}</span>` : ""
                }`;
          return `<div class="fx__ev${away ? " away" : ""}">⚽ ${who}</div>`;
        })
        .join("")}</div>`
    : "";

  return `<article class="${cls}" data-match="${e(m.id)}">
    <div class="fx__head"><span>${e(label)}</span>${status}</div>
    <${bodyTag} class="fx__body"${bodyAttrs}>
      ${side(s.homeLabel, "home")}${score}${side(s.awayLabel, "away")}
    </${bodyTag}>
    ${evHtml}
  </article>`;
}

// Expand / collapse a match's scorer list.
document.addEventListener("click", (ev) => {
  const btn = ev.target.closest("[data-fx]");
  if (!btn) return;
  const panel = document.getElementById(`ev-${btn.dataset.fx}`);
  if (!panel) return;
  const open = panel.hidden;
  panel.hidden = !open;
  btn.setAttribute("aria-expanded", String(open));
});

/* ------------------------------------------------------------ standings */

function paintTable(data) {
  const rows = D.standings(data);
  if (!rows.length) {
    setHTML($("#table"), `<div class="empty">No teams yet.</div>`);
    return;
  }
  const complete = D.groupStageComplete(data);
  setHTML(
    $("#table"),
    `<table class="tbl">
      <thead><tr>
        <th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th>
        <th>GF</th><th>GA</th><th>GD</th><th>Pts</th><th>Form</th>
      </tr></thead>
      <tbody>${rows
        .map(
          (r) => `<tr class="${r.pos <= 2 ? "qualified" : ""}">
          <td><span class="pos">${r.pos}</span></td>
          <td><span class="team-cell">${
            r.team.jerseyColor ? `<span class="jersey-dot" style="background:${e(r.team.jerseyColor)}"></span>` : ""
          }${e(r.team.name)}${complete && r.pos <= 2 ? ' <span class="q">Q</span>' : ""}</span></td>
          <td class="num">${r.played}</td><td class="num">${r.won}</td>
          <td class="num">${r.drawn}</td><td class="num">${r.lost}</td>
          <td class="num">${r.goalsFor}</td><td class="num">${r.goalsAgainst}</td>
          <td class="num">${r.goalDiff >= 0 ? "+" : ""}${r.goalDiff}</td>
          <td class="num"><b>${r.points}</b></td>
          <td><span class="form">${r.form.slice(-5).map((f) => `<i class="${f}">${f}</i>`).join("")}</span></td>
        </tr>`
        )
        .join("")}</tbody>
    </table>`
  );
}

/* --------------------------------------------------------------- squads */

function paintSquads(data) {
  const state = D.auctionState(data);
  const s = D.getSettings(data);
  const prog = D.auctionProgress(data);

  setHTML(
    $("#auctionStatus"),
    `<div class="progress-line">
       <b>Auction</b>
       <div class="progress-bar"><i style="width:${prog.total ? (prog.sold / prog.total) * 100 : 0}%"></i></div>
       <span class="faint">${prog.sold} of ${prog.total} players sold${
      prog.done ? " · complete" : ""
    }</span>
     </div>`
  );

  setHTML(
    $("#squads"),
    D.teamsList(data)
      .map((t) => {
        const st = state[t.id];
        const squad = st.squad;
        const pct = Math.min(100, (st.spent / Number(s.budget)) * 100);
        const byPos = D.POSITIONS.flatMap((pos) =>
          squad.filter((p) => p.pos === pos).sort((a, b) => a.name.localeCompare(b.name))
        );
        const emptySlots = Math.max(0, st.slotsLeft);

        return `<article class="card">
        <div class="squad__head">
          <img class="squad__avatar" src="${e(t.captainPhoto)}" alt="" loading="lazy"
               onerror="this.style.visibility='hidden'" />
          <div class="grow">
            <div class="squad__name">${e(t.name)}</div>
            <div class="squad__cap">${e(t.captainName)} <span class="faint">· captain</span></div>
          </div>
          ${t.jerseyColor ? `<span class="jersey-dot" style="background:${e(t.jerseyColor)}" title="${e(t.jerseyLabel || "Jersey colour")}"></span>` : ""}
        </div>

        <div class="budget${st.remaining < 0 ? " over" : ""}"><i style="width:${pct}%"></i></div>
        <div class="spread faint">
          <span>${st.spent} / ${s.budget} BDT spent</span>
          <span>${st.remaining} BDT left</span>
        </div>

        <ul class="squad__list">
          <li class="is-captain">
            <span class="pos-tag">CAP</span><span class="grow">${e(t.captainName)}</span>
            <span class="price">—</span>
          </li>
          ${byPos
            .map(
              (p) => `<li>
                <span class="pos-tag ${e(p.pos)}">${e(p.pos)}</span>
                <span class="grow">${e(p.name)}</span>
                <span class="price">${p.price != null ? `${p.price} BDT` : ""}</span>
              </li>`
            )
            .join("")}
          ${Array.from({ length: emptySlots })
            .map(() => `<li class="slot-empty"><span class="pos-tag">—</span><span class="grow">Open slot</span></li>`)
            .join("")}
        </ul>
      </article>`;
      })
      .join("")
  );

  // Remaining pool
  const unsold = D.playersList(data).filter((p) => !p.teamId);
  show($("#unsoldCard"), unsold.length > 0);
  if (unsold.length) {
    setHTML(
      $("#unsold"),
      D.POSITIONS.filter((pos) => unsold.some((p) => p.pos === pos))
        .map(
          (pos) => `<div class="pool__group">
            <h4>${e(D.POSITION_LABEL[pos])} · ${unsold.filter((p) => p.pos === pos).length} left</h4>
            <div class="pool__chips">${unsold
              .filter((p) => p.pos === pos)
              .map((p) => `<span class="pill">${e(p.name)}</span>`)
              .join("")}</div>
          </div>`
        )
        .join("")
    );
  }
}

/* ---------------------------------------------------------------- stats */

function statList(rows, unit, emptyMsg) {
  if (!rows.length) return `<div class="empty">${e(emptyMsg)}</div>`;
  return rows
    .slice(0, 10)
    .map(
      (r, i) => `<div class="stat-row">
        <span class="rank">${i + 1}</span>
        <span class="who"><b>${e(r.player.name)}</b><span>${e(r.team?.name || "Unsold")}</span></span>
        <span class="val">${r.value}</span>
      </div>`
    )
    .join("");
}

function paintStats(data) {
  setHTML($("#scorers"), statList(D.topScorers(data), "goals", "No goals logged yet."));
  setHTML($("#assists"), statList(D.topAssists(data), "assists", "No assists logged yet."));

  const keepers = D.cleanSheets(data);
  setHTML(
    $("#keepers"),
    keepers.length
      ? keepers
          .map(
            (r, i) => `<div class="stat-row">
              <span class="rank">${i + 1}</span>
              <span class="who"><b>${e(r.player.name)}</b><span>${e(r.team.name)} · ${r.conceded} conceded</span></span>
              <span class="val">${r.value}</span>
            </div>`
          )
          .join("")
      : `<div class="empty">Goalkeepers appear once squads are set.</div>`
  );

  const aw = D.awards(data);
  const card = (medal, label, winner, sub) =>
    `<div class="award${winner ? "" : " tbd"}">
      <div class="medal">${medal}</div>
      <div class="label">${e(label)}</div>
      <div class="winner">${winner ? e(winner) : "To be decided"}</div>
      ${winner && sub ? `<div class="sub">${e(sub)}</div>` : ""}
    </div>`;

  const ts = aw.topScorer;
  setHTML(
    $("#awards"),
    card(
      "⚽",
      "Top scorer",
      ts.length ? ts.map((x) => x.player.name).join(" & ") : null,
      ts.length ? `${ts[0].value} goal${ts[0].value === 1 ? "" : "s"}` : ""
    ) +
      card(
        "🏅",
        "Golden Ball",
        aw.goldenBall?.player?.name || null,
        aw.goldenBall?.team?.name || ""
      ) +
      card(
        "🧤",
        "Best goalkeeper",
        aw.bestGoalkeeper?.player?.name || null,
        aw.bestGoalkeeper
          ? `${aw.bestGoalkeeper.value} clean sheet${aw.bestGoalkeeper.value === 1 ? "" : "s"}`
          : ""
      )
  );
}

/* ---------------------------------------------------------------- rules */

function paintRules(data) {
  setHTML($("#rules"), RULES.map((r) => `<li><span>${e(r)}</span></li>`).join(""));

  const s = D.getSettings(data);
  const meta = D.getMeta(data);
  $("#auctionWhen").textContent = `Bidding: ${meta.auctionLabel}`;

  setHTML(
    $("#auctionTiles"),
    [
      [`${s.budget} BDT`, "Budget per captain"],
      [`${s.basePrice} BDT`, "Player base price"],
      [`${s.minRaise}–${s.maxRaise} BDT`, "Bid increment"],
      [`1 min · ${s.maxPerCategory} max`, "Per position"],
    ]
      .map(([b, l]) => `<div class="tile"><b>${e(b)}</b><span>${e(l)}</span></div>`)
      .join("")
  );

  setHTML(
    $("#auctionRules"),
    [
      `Each captain starts with a fixed budget of ${s.budget} BDT.`,
      `Every player's base price is ${s.basePrice} BDT — captains must bid at least this to acquire them.`,
      `Each raise must be a minimum of ${s.minRaise} BDT and a maximum of ${s.maxRaise} BDT.`,
      `Each captain must acquire at least ${s.minPerCategory} player from every position category and at most ${s.maxPerCategory} — except goalkeepers, where the limit is ${s.maxGK}.`,
      `Squads finish with ${s.squadSize} bought players alongside the captain.`,
      "Jersey colour is also won through bidding, and that cost comes out of the same budget.",
    ]
      .map((r) => `<li>${e(r)}</li>`)
      .join("")
  );
}
