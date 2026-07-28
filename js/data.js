/* ==========================================================================
   Shared tournament logic — imported by the public site, the admin console
   and the auction console. Pure functions only: no DOM, no network.

   Standings and every stat are DERIVED from matches. Nothing aggregate is ever
   stored, so the numbers can never drift out of sync with the results.
   ========================================================================== */

export const POSITIONS = ["GK", "DEF", "MID", "FWD"];
export const POSITION_LABEL = {
  GK: "Goalkeeper",
  DEF: "Defence",
  MID: "Midfield",
  FWD: "Forward",
};

export const STATUS_LABEL = {
  scheduled: "Scheduled",
  live: "Live",
  ft: "Full-time",
};

/* ------------------------------------------------------------- match clock */

/** The periods a match moves through, in order. Extra time is opt-in. */
export const PERIOD_ORDER = ["pre", "h1", "ht", "h2", "ft"];
export const PERIOD_LABEL = {
  pre: "Not started",
  h1: "First half",
  ht: "Half-time",
  h2: "Second half",
  et: "Extra time",
  ft: "Full-time",
};
/** Periods where the clock should actually be ticking. */
export const PLAYING_PERIODS = ["h1", "h2", "et"];

export function periodLength(data, period) {
  const s = getSettings(data);
  if (period === "h1" || period === "h2") return Number(s.halfSeconds);
  if (period === "ht") return Number(s.breakSeconds);
  if (period === "et") return Number(s.extraSeconds);
  return 0;
}

/**
 * Where a match's clock is *right now*.
 *
 * The database stores when the clock was last started plus the seconds banked
 * before that, never a ticking value — so one admin press is one write, and
 * every viewer computes the same running time locally. `nowMs` should come from
 * `serverNow()` so a viewer with a wrong device clock still sees the right time.
 */
export function clockState(match, nowMs = Date.now()) {
  const c = match?.clock || {};
  const period = c.period || "pre";
  const banked = Number(c.elapsed || 0);
  const running = Boolean(c.running) && Number(c.startedAt) > 0;
  const elapsed = running
    ? banked + Math.max(0, (nowMs - Number(c.startedAt)) / 1000)
    : banked;
  return {
    period,
    running,
    elapsed,
    added: Number(c.addedSeconds || 0),
    label: PERIOD_LABEL[period] || period,
    isPlaying: PLAYING_PERIODS.includes(period),
  };
}

const mmss = (secs) => {
  const s = Math.max(0, Math.floor(secs));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Football-style clock: counts up, stops at the period length, then shows
 * stoppage separately (`08:00 +1:23`) rather than running past it.
 */
export function formatClock(elapsed, length) {
  if (!length) return { main: mmss(elapsed), extra: null };
  if (elapsed <= length) return { main: mmss(elapsed), extra: null };
  return { main: mmss(length), extra: `+${mmss(elapsed - length)}` };
}

/** The next period in the sequence, honouring an extra-time detour. */
export function nextPeriod(current) {
  if (current === "et") return "ft";
  const i = PERIOD_ORDER.indexOf(current);
  if (i < 0 || i >= PERIOD_ORDER.length - 1) return "ft";
  return PERIOD_ORDER[i + 1];
}

/** A fresh, stopped clock for a given period. */
export const freshClock = (period = "pre") => ({
  period,
  running: false,
  startedAt: null,
  elapsed: 0,
  addedSeconds: 0,
});

/* ----------------------------------------------------------------- helpers */

/** Escape before any innerHTML. Team/player names are admin-supplied text. */
export function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

/** RTDB returns objects, not arrays. Normalise to an array carrying its key. */
export function toArray(obj) {
  if (!obj) return [];
  if (Array.isArray(obj)) return obj.filter(Boolean);
  return Object.entries(obj).map(([id, v]) => ({ ...v, id: v?.id ?? id }));
}

export const bdt = (n) => `${Number(n || 0)} BDT`;

/* -------------------------------------------------------------------- seed */

const CAPTAINS = [
  ["t1", "A", "LOSS MAKER", "KBD MD. Robiullah", "robiullah"],
  ["t2", "B", "LEGACY", "MD. Alvi Rahman", "alvi"],
  ["t3", "C", "SHARIAH", "Mahdi Mohammad Mehrab", "mehrab"],
  ["t4", "D", "SHOMOGRO", "MD. Mehedi Hasan", "mehedi"],
];

const POOL = [
  ["GK", ["Sabbir", "Jubair", "Shojeb", "Shanto"]],
  ["DEF", ["Faruk", "Meshkat", "Ahbab", "Iftiakh Siam", "Anirban", "Mobin"]],
  ["MID", ["Sajid", "Monir", "Ayon", "Afsar", "Aonyendo", "Mehedi (ops)", "Rabbe", "Imtiaz"]],
  ["FWD", ["Munna", "Yousuf", "Rabin", "Saad", "Mahmud", "Imran", "Uthsho"]],
];

/** Round-robin order exactly as printed in the tournament deck. */
const FIXTURES = [
  ["t1", "t2", "16:00"], // Match 1 — A v B
  ["t3", "t4", "16:30"], // Match 2 — C v D
  ["t1", "t3", "17:00"], // Match 3 — A v C
  ["t1", "t4", "17:30"], // Match 4 — A v D
  ["t2", "t4", "18:00"], // Match 5 — B v D
  ["t2", "t3", "18:30"], // Match 6 — B v C
];

export function seed() {
  const teams = {};
  for (const [id, slot, name, captainName, photo] of CAPTAINS) {
    teams[id] = {
      id,
      slot,
      name,
      captainName,
      captainPhoto: `assets/captains/${photo}.jpg`,
      jerseyColor: null,
      jerseyLabel: "",
      jerseyCost: 0,
    };
  }

  const players = {};
  let n = 0;
  for (const [pos, names] of POOL) {
    for (const name of names) {
      const id = `p${String(++n).padStart(2, "0")}`;
      players[id] = { id, name, pos, teamId: null, price: null };
    }
  }

  const matches = {};
  FIXTURES.forEach(([homeId, awayId, time], i) => {
    const id = `m${i + 1}`;
    matches[id] = {
      id,
      no: i + 1,
      homeId,
      awayId,
      homeScore: null,
      awayScore: null,
      status: "scheduled",
      time,
      isFinal: false,
      events: null,
      clock: freshClock(),
    };
  });
  matches.m7 = {
    id: "m7",
    no: 7,
    homeId: null,
    awayId: null,
    homeScore: null,
    awayScore: null,
    status: "scheduled",
    time: "19:05",
    isFinal: true,
    events: null,
    clock: freshClock(),
  };

  return {
    meta: {
      name: "WeGro Champions League",
      season: "2026",
      venueName: "ChattoTurf, Bashundhara",
      plusCode: "RC7G+HQ Dhaka",
      mapUrl: "https://www.google.com/maps/search/?api=1&query=RC7G%2BHQ%20Dhaka",
      mapEmbedUrl:
        "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3650.129914925772!2d90.42436437369103!3d23.81397888633572!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3755c70012ef1109%3A0x1344a372022c1649!2sChattoturf%20Bashundhara!5e0!3m2!1sen!2sbd!4v1785181698373!5m2!1sen!2sbd",
      dateLabel: "Saturday, 1 August 2026",
      timeLabel: "4:00 PM – 7:30 PM",
      kickoffISO: "2026-08-01T16:00:00+06:00",
      auctionLabel: "28 July 2026, 12:00 PM · Level 3 Meeting Room",
      updatedAt: null,
    },
    settings: {
      budget: 100,
      basePrice: 8,
      minRaise: 1,
      maxRaise: 5,
      squadSize: 6, // bought players per team, on top of the captain
      minPerCategory: 1,
      maxPerCategory: 2,
      maxGK: 1,
      auctionOpen: true,
      goldenBallPlayerId: null,
      // Match clock, in seconds — deck Rule 1: two 8-minute halves, 2-minute break.
      halfSeconds: 480,
      breakSeconds: 120,
      extraSeconds: 300,
    },
    teams,
    players,
    matches,
  };
}

/* ---------------------------------------------------------------- accessors */

export const getSettings = (data) => ({ ...seed().settings, ...(data?.settings || {}) });
export const getMeta = (data) => ({ ...seed().meta, ...(data?.meta || {}) });

export const teamsList = (data) =>
  toArray(data?.teams).sort((a, b) => String(a.slot).localeCompare(String(b.slot)));

export const playersList = (data) =>
  toArray(data?.players).sort(
    (a, b) => POSITIONS.indexOf(a.pos) - POSITIONS.indexOf(b.pos) || a.name.localeCompare(b.name)
  );

export const matchesList = (data) => toArray(data?.matches).sort((a, b) => a.no - b.no);

export const groupMatches = (data) => matchesList(data).filter((m) => !m.isFinal);
export const finalMatch = (data) => matchesList(data).find((m) => m.isFinal) || null;

export const teamById = (data, id) => (id ? data?.teams?.[id] || null : null);
export const playerById = (data, id) => (id ? data?.players?.[id] || null : null);

export const isPlayed = (m) => m?.status === "ft" && m.homeScore != null && m.awayScore != null;

export const teamPlayers = (data, teamId) =>
  playersList(data).filter((p) => p.teamId === teamId);

/* --------------------------------------------------------------- standings */

/**
 * League table from the played group matches.
 * Tiebreaks, in order: Points → Goal Difference (deck Rule 7) → Goals For →
 * head-to-head → team name. Head-to-head only settles a straight pair; with
 * three or more level teams it is skipped, which is the standard convention.
 */
export function standings(data) {
  const played = groupMatches(data).filter(isPlayed);
  const rows = {};

  for (const t of teamsList(data)) {
    rows[t.id] = {
      teamId: t.id,
      team: t,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDiff: 0,
      points: 0,
      form: [],
    };
  }

  for (const m of played) {
    const h = rows[m.homeId];
    const a = rows[m.awayId];
    if (!h || !a) continue; // team deleted — skip rather than crash
    const hs = Number(m.homeScore);
    const as = Number(m.awayScore);

    h.played++;
    a.played++;
    h.goalsFor += hs;
    h.goalsAgainst += as;
    a.goalsFor += as;
    a.goalsAgainst += hs;

    if (hs > as) {
      h.won++;
      h.points += 3;
      a.lost++;
      h.form.push("W");
      a.form.push("L");
    } else if (hs < as) {
      a.won++;
      a.points += 3;
      h.lost++;
      h.form.push("L");
      a.form.push("W");
    } else {
      h.drawn++;
      a.drawn++;
      h.points++;
      a.points++;
      h.form.push("D");
      a.form.push("D");
    }
  }

  const list = Object.values(rows);
  for (const r of list) r.goalDiff = r.goalsFor - r.goalsAgainst;

  const headToHead = (a, b) => {
    const m = played.find(
      (x) =>
        (x.homeId === a.teamId && x.awayId === b.teamId) ||
        (x.homeId === b.teamId && x.awayId === a.teamId)
    );
    if (!m) return 0;
    const aScore = m.homeId === a.teamId ? Number(m.homeScore) : Number(m.awayScore);
    const bScore = m.homeId === b.teamId ? Number(m.homeScore) : Number(m.awayScore);
    return bScore - aScore;
  };

  list.sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDiff - a.goalDiff ||
      b.goalsFor - a.goalsFor ||
      headToHead(a, b) ||
      a.team.name.localeCompare(b.team.name)
  );

  list.forEach((r, i) => (r.pos = i + 1));
  return list;
}

/** True once every group match is full-time — the Final can then be seeded. */
export const groupStageComplete = (data) => {
  const gm = groupMatches(data);
  return gm.length > 0 && gm.every(isPlayed);
};

/**
 * Resolve a match's two sides. For the Final this derives the finalists from
 * the table rather than reading stored ids, so it can never go stale.
 * Returns `{ home, away, homeLabel, awayLabel, derived }`.
 */
export function matchSides(data, match) {
  if (!match) return { home: null, away: null, homeLabel: "—", awayLabel: "—", derived: false };

  if (match.isFinal) {
    if (groupStageComplete(data)) {
      const table = standings(data);
      const home = table[0]?.team || null;
      const away = table[1]?.team || null;
      return {
        home,
        away,
        homeLabel: home?.name || "Leaderboard 1",
        awayLabel: away?.name || "Leaderboard 2",
        derived: true,
      };
    }
    return {
      home: null,
      away: null,
      homeLabel: "Leaderboard 1",
      awayLabel: "Leaderboard 2",
      derived: true,
    };
  }

  const home = teamById(data, match.homeId);
  const away = teamById(data, match.awayId);
  return {
    home,
    away,
    homeLabel: home?.name || "TBD",
    awayLabel: away?.name || "TBD",
    derived: false,
  };
}

/** The champion, once the Final has a decided result. */
export function champion(data) {
  const f = finalMatch(data);
  if (!isPlayed(f)) return null;
  const { home, away } = matchSides(data, f);
  const hs = Number(f.homeScore);
  const as = Number(f.awayScore);
  if (hs === as) return null; // knockout can't be drawn; admin is warned
  return { winner: hs > as ? home : away, runnerUp: hs > as ? away : home };
}

/* -------------------------------------------------------------- match events */

/** Every goal event across the tournament, flattened. */
export function allEvents(data) {
  const out = [];
  for (const m of matchesList(data)) {
    for (const e of toArray(m.events)) out.push({ ...e, matchId: m.id, matchNo: m.no });
  }
  return out;
}

export const matchEvents = (m) => toArray(m?.events);

/** Goals logged for one side of a match (used for the tally-mismatch warning). */
export function loggedGoals(data, match) {
  const { home, away } = matchSides(data, match);
  const evs = matchEvents(match);
  const count = (teamId) =>
    teamId ? evs.filter((e) => e.teamId === teamId).length : 0;
  return { home: count(home?.id), away: count(away?.id) };
}

/** Does the logged scorer list add up to the scoreline? */
export function eventTally(data, match) {
  if (!isPlayed(match) && match?.status !== "live") return null;
  const logged = loggedGoals(data, match);
  const hs = Number(match.homeScore || 0);
  const as = Number(match.awayScore || 0);
  return {
    ...logged,
    homeScore: hs,
    awayScore: as,
    matches: logged.home === hs && logged.away === as,
  };
}

/* ---------------------------------------------------------------- stat tables */

function playerTable(data, pick) {
  const counts = new Map();
  for (const e of allEvents(data)) {
    const id = pick(e);
    if (!id) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([playerId, value]) => ({
      playerId,
      player: playerById(data, playerId),
      team: teamById(data, playerById(data, playerId)?.teamId),
      value,
    }))
    .filter((r) => r.player)
    .sort((a, b) => b.value - a.value || a.player.name.localeCompare(b.player.name));
}

export const topScorers = (data) => playerTable(data, (e) => e.scorerId);
export const topAssists = (data) => playerTable(data, (e) => e.assistId);

/**
 * Clean sheets, credited to a team's goalkeeper. Each squad has exactly one GK
 * under the auction rules; if a team somehow has none, the sheet is dropped
 * rather than mis-credited.
 */
export function cleanSheets(data) {
  const byTeam = new Map();
  const conceded = new Map();

  for (const m of matchesList(data)) {
    if (!isPlayed(m)) continue;
    const { home, away } = matchSides(data, m);
    const hs = Number(m.homeScore);
    const as = Number(m.awayScore);
    const bump = (team, against, sheet) => {
      if (!team) return;
      conceded.set(team.id, (conceded.get(team.id) || 0) + against);
      if (sheet) byTeam.set(team.id, (byTeam.get(team.id) || 0) + 1);
    };
    bump(home, as, as === 0);
    bump(away, hs, hs === 0);
  }

  return teamsList(data)
    .map((t) => {
      const gk = teamPlayers(data, t.id).find((p) => p.pos === "GK");
      if (!gk) return null;
      return {
        playerId: gk.id,
        player: gk,
        team: t,
        value: byTeam.get(t.id) || 0,
        conceded: conceded.get(t.id) || 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.value - a.value || a.conceded - b.conceded);
}

/** Goals broken down by the scorer's position. Rule-4 penalty goals are excluded. */
export function goalsByPosition(data) {
  const counts = Object.fromEntries(POSITIONS.map((p) => [p, 0]));
  for (const ev of allEvents(data)) {
    const p = playerById(data, ev.scorerId);
    if (p && counts[p.pos] != null) counts[p.pos]++;
  }
  return POSITIONS.map((pos) => ({ pos, label: POSITION_LABEL[pos], value: counts[pos] }));
}

/** The three medals from deck Rule 6. */
export function awards(data) {
  const scorers = topScorers(data);
  const keepers = cleanSheets(data);
  const settings = getSettings(data);
  const gbId = settings.goldenBallPlayerId;

  const topGoals = scorers[0]?.value || 0;
  // cleanSheets() is already sorted by sheets desc, then goals conceded asc,
  // so the winner is simply the first row — provided anyone kept a clean sheet.
  const bestKeeper = keepers[0] || null;

  return {
    topScorer: topGoals > 0 ? scorers.filter((s) => s.value === topGoals) : [],
    bestGoalkeeper: bestKeeper && bestKeeper.value > 0 ? bestKeeper : null,
    goldenBall: gbId
      ? { player: playerById(data, gbId), team: teamById(data, playerById(data, gbId)?.teamId) }
      : null,
  };
}

/* ------------------------------------------------------------------ auction */

/**
 * Per-team auction position: spend, remaining budget, squad counts and which
 * position categories the team is still allowed (or still required) to buy.
 */
export function auctionState(data) {
  const s = getSettings(data);
  const out = {};

  for (const t of teamsList(data)) {
    const squad = teamPlayers(data, t.id);
    const spentOnPlayers = squad.reduce((n, p) => n + Number(p.price || 0), 0);
    const jerseyCost = Number(t.jerseyCost || 0);
    const spent = spentOnPlayers + jerseyCost;
    const remaining = Number(s.budget) - spent;
    const slotsLeft = Number(s.squadSize) - squad.length;

    const counts = {};
    for (const pos of POSITIONS) counts[pos] = squad.filter((p) => p.pos === pos).length;

    // How many buys are still mandatory to end up with a legal squad.
    const stillRequired = POSITIONS.reduce(
      (n, pos) => n + Math.max(0, Number(s.minPerCategory) - counts[pos]),
      0
    );

    out[t.id] = {
      team: t,
      squad,
      counts,
      max: { GK: Number(s.maxGK), DEF: s.maxPerCategory, MID: s.maxPerCategory, FWD: s.maxPerCategory },
      spent,
      spentOnPlayers,
      jerseyCost,
      remaining,
      slotsLeft,
      stillRequired,
      /** Most this team can bid right now and still complete a legal squad. */
      maxBid: Math.max(
        0,
        remaining - Math.max(0, slotsLeft - 1) * Number(s.basePrice)
      ),
      complete: slotsLeft === 0,
    };
  }
  return out;
}

/**
 * Snapshot of every squad as it WOULD look after a hypothetical sale.
 * Used by the tournament-wide guards below.
 */
function simulate(data, playerId, teamId) {
  const s = getSettings(data);
  const teams = teamsList(data);
  const counts = {};
  const bought = {};
  const pool = Object.fromEntries(POSITIONS.map((p) => [p, 0]));

  for (const t of teams) {
    counts[t.id] = Object.fromEntries(POSITIONS.map((p) => [p, 0]));
    bought[t.id] = 0;
  }
  for (const p of playersList(data)) {
    const owner = p.id === playerId ? teamId : p.teamId;
    if (owner && counts[owner]) {
      counts[owner][p.pos]++;
      bought[owner]++;
    } else {
      pool[p.pos]++;
    }
  }
  return { s, teams, counts, bought, pool };
}

/**
 * Is the pool exactly the size of the squads? Only then can EVERY player be
 * sold, which is what the absorption guard below assumes. With a spare player
 * in the pool someone must go unsold by arithmetic, so that guard would fire on
 * a perfectly legal sale.
 */
function poolIsExact(data) {
  const s = getSettings(data);
  return playersList(data).length === teamsList(data).length * Number(s.squadSize);
}

/**
 * Tournament-wide feasibility. The per-team rules alone are not enough: this
 * pool barely covers the squads, so a locally-legal purchase can still strand
 * another team. Example: defenders. Six exist and every team needs at least one,
 * so the moment three teams own two defenders each the fourth can never field a
 * legal squad.
 *
 * Returns `{ ok, error }` for the state produced by the hypothetical sale.
 */
function validateGlobalShape(data, playerId, teamId) {
  const { s, teams, counts, bought, pool } = simulate(data, playerId, teamId);
  const min = Number(s.minPerCategory);
  const caps = { GK: Number(s.maxGK), DEF: s.maxPerCategory, MID: s.maxPerCategory, FWD: s.maxPerCategory };
  const everyoneMustSell = poolIsExact(data);

  for (const pos of POSITIONS) {
    const slotsOf = (t) => Number(s.squadSize) - bought[t.id];

    // Scarcity: enough of this position left for every team that still needs one.
    const needing = teams.filter((t) => counts[t.id][pos] < min && slotsOf(t) > 0);
    if (pool[pos] < needing.length) {
      const names = needing.map((t) => t.name).join(", ");
      return {
        ok: false,
        error: `Only ${pool[pos]} ${pos} would be left but ${needing.length} ${
          needing.length === 1 ? "team still needs" : "teams still need"
        } one (${names}). Every squad must have at least ${min} ${pos}.`,
      };
    }

    // Absorption: enough room left for every remaining player of this position
    // to find a home, otherwise someone goes unsold. Only meaningful when the
    // pool and the squads are the same size — see poolIsExact.
    if (!everyoneMustSell) continue;
    const room = teams.reduce(
      (n, t) => n + Math.min(Math.max(0, caps[pos] - counts[t.id][pos]), Math.max(0, slotsOf(t))),
      0
    );
    if (room < pool[pos]) {
      return {
        ok: false,
        error: `${pool[pos]} ${pos} would still need buyers but only ${room} ${pos} slot${
          room === 1 ? "" : "s"
        } remain across all teams. Some players would go unsold.`,
      };
    }
  }
  return { ok: true, error: null };
}

/**
 * Which position mixes are still possible for every team, given what has been
 * bought so far. Drives the "shapes still available" hint in the auction UI.
 */
export function shapeAdvice(data) {
  const { s, teams, counts, bought, pool } = simulate(data, null, null);
  const min = Number(s.minPerCategory);
  const out = {};
  for (const pos of POSITIONS) {
    const needing = teams.filter(
      (t) => counts[t.id][pos] < min && Number(s.squadSize) - bought[t.id] > 0
    );
    out[pos] = { left: pool[pos], teamsNeeding: needing.length, tight: pool[pos] <= needing.length };
  }
  return out;
}

/**
 * Can this team buy this player at this price? Returns `{ ok, error }`.
 * This is the guard that stops a captain overspending early and being unable
 * to field a legal squad — the failure mode that actually ruins an auction.
 */
export function validateSale(data, playerId, teamId, price) {
  const s = getSettings(data);
  const player = playerById(data, playerId);
  const team = teamById(data, teamId);
  const st = auctionState(data)[teamId];

  if (!player) return { ok: false, error: "Unknown player." };
  if (!team || !st) return { ok: false, error: "Pick a team." };
  if (player.teamId)
    return { ok: false, error: `${player.name} is already sold to ${teamById(data, player.teamId)?.name || "a team"}.` };

  const p = Number(price);
  if (!Number.isFinite(p) || p < 0) return { ok: false, error: "Enter a valid price." };
  if (p < Number(s.basePrice))
    return { ok: false, error: `Below base price — minimum is ${bdt(s.basePrice)}.` };

  if (st.slotsLeft <= 0)
    return { ok: false, error: `${team.name} already has a full squad of ${s.squadSize}.` };

  const cap = st.max[player.pos];
  if (st.counts[player.pos] >= cap)
    return {
      ok: false,
      error: `${team.name} already has ${st.counts[player.pos]} ${player.pos} — the limit is ${cap}.`,
    };

  if (p > st.remaining)
    return { ok: false, error: `${team.name} only has ${bdt(st.remaining)} left.` };

  // Money guard: enough left to fill every remaining slot at base price.
  const after = st.remaining - p;
  const slotsAfter = st.slotsLeft - 1;
  const floor = slotsAfter * Number(s.basePrice);
  if (after < floor)
    return {
      ok: false,
      error: `Too expensive — ${team.name} still needs ${slotsAfter} more player${
        slotsAfter === 1 ? "" : "s"
      } (${bdt(floor)} minimum). Max bid is ${bdt(st.maxBid)}.`,
    };

  // Squad-shape guard: enough slots left for every category still required.
  const countsAfter = { ...st.counts, [player.pos]: st.counts[player.pos] + 1 };
  const requiredAfter = POSITIONS.reduce(
    (n, pos) => n + Math.max(0, Number(s.minPerCategory) - countsAfter[pos]),
    0
  );
  if (requiredAfter > slotsAfter) {
    const missing = POSITIONS.filter((pos) => countsAfter[pos] < Number(s.minPerCategory));
    return {
      ok: false,
      error: `${team.name} would have no slot left for ${missing.join(", ")} — every team needs at least ${s.minPerCategory} per position.`,
    };
  }

  // Finally, the tournament-wide guards.
  return validateGlobalShape(data, playerId, teamId);
}

/** Auction progress across all teams. */
export function auctionProgress(data) {
  const players = playersList(data);
  const sold = players.filter((p) => p.teamId);
  return {
    sold: sold.length,
    total: players.length,
    spend: sold.reduce((n, p) => n + Number(p.price || 0), 0),
    done: players.length > 0 && sold.length === players.length,
  };
}

/* ------------------------------------------------------------- formatting */

export function formatUpdated(ts) {
  if (!ts) return "not yet";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "not yet";
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function countdown(toISO) {
  const target = new Date(toISO).getTime();
  if (Number.isNaN(target)) return null;
  const ms = target - Date.now();
  if (ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  };
}
