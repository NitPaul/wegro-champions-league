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

/* ------------------------------------------------------------ match actions */

/**
 * Where a goal was struck from. Laid out as the attacking third seen from
 * behind the scorer: the top row is far from goal, the bottom row is the box.
 * The referee taps a cell on a pitch diagram, so these keys are grid positions,
 * not free text.
 */
export const ZONES = [
  ["lw", "Left wing"],
  ["lr", "Long range"],
  ["rw", "Right wing"],
  ["lb", "Left of box"],
  ["ib", "Inside the box"],
  ["rb", "Right of box"],
  ["pk", "Penalty spot"],
];
export const ZONE_LABEL = Object.fromEntries(ZONES);

/** Everything the referee can log. Goals move the scoreline; the rest do not. */
export const ACTION_LABEL = {
  goal: "Goal",
  penalty_goal: "Punctuality penalty",
  save: "Save",
  clearance: "Clearance",
  shot: "Shot on target",
  chance: "Chance created",
};
export const ACTION_ICON = {
  goal: "⚽",
  penalty_goal: "⏱",
  save: "🧤",
  clearance: "🛡",
  shot: "🎯",
  chance: "🔑",
};

/**
 * Does this event change the score?
 *
 * Only the two goal types. Everything else — saves, clearances, shots on target,
 * chances created — is a credit to a player and must leave the scoreline alone,
 * or the tally warning in the admin console would fire on every match.
 */
export const isGoalEvent = (ev) => ev?.type === "goal" || ev?.type === "penalty_goal";

/* ----------------------------------------------------------- award scoring */

/**
 * One points table drives all four medals — the same numbers, filtered
 * differently, so a player can check their own total from the match log.
 *
 * The weights are deliberately generous to the unglamorous jobs. A keeper who
 * makes eight saves behind a beaten defence out-scores a striker who taps in
 * three, which is the point: Golden Ball has to be winnable from any position,
 * or it is just the Golden Boot with a longer name.
 *
 * The near-misses are paid too, one step below the thing they nearly were: a
 * chance created is an assist the striker wasted (2 against 3), a shot on target
 * is a goal the keeper stopped (1). Both are cheap on purpose — they happen far
 * more often than goals, so a big number here would drown everything else out.
 *
 * `criticalGoal` is a BONUS added on top of `goal`, not a replacement for it, so
 * a decider is worth 5 + 3 = 8. That makes the goal that settles a match matter
 * more than a fourth in a rout, without letting one moment outweigh a keeper's
 * entire evening.
 *
 * Every value is editable in admin Settings, so nothing here is a decision the
 * organisers are stuck with.
 */
export const DEFAULT_POINTS = {
  goal: 5,
  criticalGoal: 3,
  assist: 3,
  chance: 2,
  shot: 1,
  save: 2,
  clearance: 1,
  cleanSheetGK: 5,
  cleanSheetDEF: 3,
  ownGoal: -3,
  concededGK: -1,
};

/** Order and labels for the points table wherever it is shown or edited. */
export const POINT_FIELDS = [
  ["goal", "Goal"],
  ["criticalGoal", "Critical goal — bonus on top"],
  ["assist", "Assist"],
  ["chance", "Chance created"],
  ["shot", "Shot on target"],
  ["save", "Save"],
  ["clearance", "Clearance"],
  ["cleanSheetGK", "Clean sheet — goalkeeper"],
  ["cleanSheetDEF", "Clean sheet — defender"],
  ["ownGoal", "Own goal"],
  ["concededGK", "Goal conceded — goalkeeper"],
];

export const getPoints = (data) => ({ ...DEFAULT_POINTS, ...(data?.settings?.points || {}) });

/**
 * The four medals, in the order they are presented.
 *
 * `[key, label, medal, overrideSetting, basis]`. Every medal computes a winner
 * from the points table AND can be overruled by name from Settings: the referee's
 * log is the default, not the verdict. Management may hand any of these to
 * someone else — a player who was decisive in a way no tally captures, or one who
 * is simply the right recipient — and the public card then says so rather than
 * quietly contradicting the numbers printed underneath it.
 *
 * Driving admin, the public cards and the awards themselves off this one list is
 * what keeps those three from disagreeing after an override.
 */
export const MEDALS = [
  ["goldenBall", "Golden Ball", "🏅", "goldenBallPlayerId", "highest points total of anyone"],
  ["goldenBoot", "Golden Boot", "👟", "goldenBootPlayerId", "most goals scored"],
  ["goldenGlove", "Golden Glove", "🧤", "goldenGlovePlayerId", "highest points total among goalkeepers"],
  ["bestDefender", "Best Defender", "🛡", "bestDefenderPlayerId", "highest points total among defenders"],
];

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
  ["GK", ["Sabbir", "Jubair", "Meshkat", "Shanto"]],
  ["DEF", ["Faruk", "Shojeb", "Ahbab", "Iftiakh Siam", "Anirban", "Mobin"]],
  ["MID", ["Sajid", "Monir", "Ayon", "Afsar", "Aonyendo", "Mehedi (ops)", "Rabbe", "Imtiaz"]],
  ["FWD", ["Munna", "Yousuf", "Rabin", "Saad", "Mahmud", "Imran", "Uthsho"]],
];

/**
 * Players who sit outside the auction entirely: `[name, position]`.
 *
 * The chairman may or may not turn up on the day. If he does, the admin drops
 * him into whichever squad needs a body — he costs nothing, fills no squad slot
 * and counts against no position limit, so adding him can never break a squad
 * that was already legal, and leaving him unassigned changes nothing either.
 * Everything that counts money, slots or positions goes through
 * `auctionPlayers()` and skips these.
 */
const SPECIALS = [["Chairman", "MID"]];

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
  // Specials keep their own id prefix so changing the auction pool can never
  // renumber them on top of one another.
  SPECIALS.forEach(([name, pos], i) => {
    const id = `s${i + 1}`;
    players[id] = { id, name, pos, teamId: null, price: 0, special: true };
  });

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
      // One override per medal — null means "let the points table decide".
      goldenBallPlayerId: null,
      goldenBootPlayerId: null,
      goldenGlovePlayerId: null,
      bestDefenderPlayerId: null,
      // Match clock, in seconds — deck Rule 1: two 8-minute halves, 2-minute break.
      halfSeconds: 480,
      breakSeconds: 120,
      extraSeconds: 300,
      points: DEFAULT_POINTS,
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

/**
 * A special player is outside the auction: no fee, no squad slot, no position
 * limit. Only the admin can place one, and only by hand.
 */
export const isSpecial = (p) => Boolean(p?.special);

/** The auction pool — everyone the captains actually bid on. */
export const auctionPlayers = (data) => playersList(data).filter((p) => !isSpecial(p));

export const specialPlayers = (data) => playersList(data).filter(isSpecial);

/** A team's bought players, and its specials, kept apart. */
export const teamSquad = (data, teamId) =>
  teamPlayers(data, teamId).filter((p) => !isSpecial(p));
export const teamSpecials = (data, teamId) =>
  teamPlayers(data, teamId).filter(isSpecial);

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

/**
 * Goals logged for one side of a match (used for the tally-mismatch warning).
 *
 * Only goal events count. The match log also carries saves and clearances, and
 * counting those here would make every match look like the scoreline was wrong.
 */
export function loggedGoals(data, match) {
  const { home, away } = matchSides(data, match);
  const evs = matchEvents(match).filter(isGoalEvent);
  const count = (teamId) =>
    teamId ? evs.filter((e) => e.teamId === teamId).length : 0;
  return { home: count(home?.id), away: count(away?.id) };
}

/** Just the goals from a match log, in the order they were scored. */
export const goalEvents = (m) => matchEvents(m).filter(isGoalEvent);

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
      // The auction GK, not a special guest who happens to be listed as one.
      const gk = teamSquad(data, t.id).find((p) => p.pos === "GK");
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

/* ------------------------------------------------------- the points engine */

/** Clean sheets and goals conceded, per team, from full-time matches only. */
function teamDefensive(data) {
  const out = {};
  for (const t of teamsList(data)) out[t.id] = { sheets: 0, conceded: 0, played: 0 };

  for (const m of matchesList(data)) {
    if (!isPlayed(m)) continue;
    const { home, away } = matchSides(data, m);
    const hs = Number(m.homeScore);
    const as = Number(m.awayScore);
    const bump = (team, against) => {
      if (!team || !out[team.id]) return;
      out[team.id].played++;
      out[team.id].conceded += against;
      if (against === 0) out[team.id].sheets++;
    };
    bump(home, as);
    bump(away, hs);
  }
  return out;
}

/**
 * Every player's match record and award points, highest first.
 *
 * This is the single source the four medals are read from, so a player can add
 * up their own row from the match log and get the same answer the site shows.
 * Ties break on points → goals → assists → name, which is deterministic: the
 * order never changes between two renders of identical data.
 */
export function playerStats(data) {
  const w = getPoints(data);
  const def = teamDefensive(data);
  const rows = new Map();

  for (const p of playersList(data)) {
    rows.set(p.id, {
      playerId: p.id,
      player: p,
      team: teamById(data, p.teamId),
      goals: 0,
      criticalGoals: 0,
      assists: 0,
      chances: 0,
      shots: 0,
      saves: 0,
      clearances: 0,
      ownGoals: 0,
      cleanSheets: 0,
      conceded: 0,
      points: 0,
    });
  }

  const at = (id) => (id ? rows.get(id) : null);

  for (const ev of allEvents(data)) {
    if (ev.type === "goal") {
      // An own goal is logged against the team that benefited, so it usually has
      // no scorer at all. Only a deliberately attributed one costs a player.
      if (ev.ownGoal) {
        const r = at(ev.scorerId);
        if (r) r.ownGoals++;
      } else {
        const r = at(ev.scorerId);
        if (r) {
          r.goals++;
          // Tracked separately from `goals` so the bonus is visible in the
          // ledger rather than hidden inside a total nobody can reproduce.
          if (ev.critical) r.criticalGoals++;
        }
      }
      const a = at(ev.assistId);
      if (a) a.assists++;
    } else if (ev.type === "save") {
      const r = at(ev.playerId);
      if (r) r.saves++;
    } else if (ev.type === "clearance") {
      const r = at(ev.playerId);
      if (r) r.clearances++;
    } else if (ev.type === "shot") {
      const r = at(ev.playerId);
      if (r) r.shots++;
    } else if (ev.type === "chance") {
      const r = at(ev.playerId);
      if (r) r.chances++;
    }
  }

  // Clean sheets belong to the whole back line, not just the keeper. Guests are
  // left out: they are not part of a squad's defensive record for the season.
  for (const r of rows.values()) {
    const d = def[r.player.teamId];
    if (!d || isSpecial(r.player)) continue;
    if (r.player.pos === "GK") {
      r.cleanSheets = d.sheets;
      r.conceded = d.conceded;
    } else if (r.player.pos === "DEF") {
      r.cleanSheets = d.sheets;
    }
  }

  for (const r of rows.values()) {
    r.points =
      r.goals * w.goal +
      r.criticalGoals * w.criticalGoal +
      r.assists * w.assist +
      r.chances * w.chance +
      r.shots * w.shot +
      r.saves * w.save +
      r.clearances * w.clearance +
      r.ownGoals * w.ownGoal +
      (r.player.pos === "GK"
        ? r.cleanSheets * w.cleanSheetGK + r.conceded * w.concededGK
        : r.player.pos === "DEF"
        ? r.cleanSheets * w.cleanSheetDEF
        : 0);
  }

  return [...rows.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.goals - a.goals ||
      b.assists - a.assists ||
      a.player.name.localeCompare(b.player.name)
  );
}

/** Did this player do anything worth a row in the ledger? */
export const hasRecord = (r) =>
  Boolean(
    r.points !== 0 ||
      r.goals ||
      r.assists ||
      r.chances ||
      r.shots ||
      r.saves ||
      r.clearances ||
      r.ownGoals
  );

/** Has anyone done anything yet? Used to keep empty tables off the page. */
export const hasMatchData = (data) => playerStats(data).some(hasRecord);

/** Top of a leaderboard, plus whether it is currently a tie. */
function leader(rows, key = "points") {
  const live = rows.filter((r) => r[key] > 0);
  if (!live.length) return null;
  const top = live[0];
  return { ...top, tied: live.filter((r) => r[key] === top[key]).length > 1 };
}

/** Where goals were struck from — feeds the pitch-zone chart. */
export function goalsByZone(data) {
  const counts = Object.fromEntries(ZONES.map(([k]) => [k, 0]));
  let unknown = 0;
  for (const ev of allEvents(data)) {
    if (ev.type !== "goal" || ev.ownGoal) continue;
    if (counts[ev.zone] != null) counts[ev.zone]++;
    else unknown++;
  }
  return { counts, unknown, total: Object.values(counts).reduce((n, v) => n + v, 0) };
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

/**
 * The four medals (deck Rule 6, plus Best Defender).
 *
 * All four read the same points table; they differ only in who is eligible and
 * what they are ranked on. Golden Boot stays a pure goal count — it is the one
 * award where the name promises exactly one thing.
 *
 * Every medal accepts a manual override from Settings (see MEDALS), and an
 * override wins over the computed leader — a referee, or management afterwards,
 * may see something the tally cannot. Overridden rows come back with
 * `picked: true` so the public card can say the award was assigned rather than
 * let it look like the arithmetic disagrees with itself.
 */
export function awards(data) {
  const all = playerStats(data);
  const s = getSettings(data);

  /** The overridden row for a medal, or null to fall back to the computation. */
  const override = (key) => {
    const id = s[key];
    const row = id ? all.find((r) => r.playerId === id) : null;
    return row ? { ...row, picked: true, tied: false } : null;
  };
  const computed = (row) => (row ? { ...row, picked: false } : null);

  const byGoals = all
    .filter((r) => r.goals > 0)
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.player.name.localeCompare(b.player.name));
  const topGoals = byGoals[0]?.goals || 0;
  const bootPick = override("goldenBootPlayerId");

  return {
    all,
    goldenBall: override("goldenBallPlayerId") || computed(leader(all)),
    // An array, because the Boot really can be shared. An override names one
    // player, so it collapses the tie by decree.
    goldenBoot: bootPick
      ? [bootPick]
      : byGoals.filter((r) => r.goals === topGoals).map((r) => ({ ...r, picked: false })),
    goldenGlove:
      override("goldenGlovePlayerId") ||
      computed(leader(all.filter((r) => r.player.pos === "GK" && !isSpecial(r.player)))),
    bestDefender:
      override("bestDefenderPlayerId") ||
      computed(leader(all.filter((r) => r.player.pos === "DEF" && !isSpecial(r.player)))),
  };
}

/* ------------------------------------------------------------------ auction */

/**
 * Per-team auction position: spend, remaining budget, squad counts and which
 * position categories the team is still allowed (or still required) to buy.
 */
/**
 * How many players this team is meant to buy.
 *
 * Normally the tournament-wide `squadSize`, but a team may carry its own number.
 * That is for the case where one squad legitimately ends up a player over or
 * under the standard size: its counter then reads against its own size (7/7)
 * instead of showing a permanent mismatch (7/6), while `extraPlayers` below
 * still records that it is off-standard so the UI can flag it.
 */
export function squadSizeOf(team, settings) {
  const own = Number(team?.squadSize);
  return Number.isFinite(own) && own > 0 ? own : Number(settings.squadSize);
}

/** Total places across all squads. Not `teams × squadSize` once a team differs. */
export function squadCapacity(data) {
  const s = getSettings(data);
  return teamsList(data).reduce((n, t) => n + squadSizeOf(t, s), 0);
}

export function auctionState(data) {
  const s = getSettings(data);
  const out = {};

  for (const t of teamsList(data)) {
    const squad = teamSquad(data, t.id);
    const specials = teamSpecials(data, t.id);
    const spentOnPlayers = squad.reduce((n, p) => n + Number(p.price || 0), 0);
    const jerseyCost = Number(t.jerseyCost || 0);
    const spent = spentOnPlayers + jerseyCost;
    const remaining = Number(s.budget) - spent;
    const size = squadSizeOf(t, s);
    const slotsLeft = size - squad.length;

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
      /** Guest players carried on top of the squad — free, and outside every rule. */
      specials,
      counts,
      max: { GK: Number(s.maxGK), DEF: s.maxPerCategory, MID: s.maxPerCategory, FWD: s.maxPerCategory },
      squadSize: size,
      /**
       * Players this team actually holds above the standard squad size — what
       * the UI flags in red. Measured against players held, not against the
       * team's own size, so raising a team's size before it has signed anyone
       * does not flag a squad that is still under-filled.
       */
      extraPlayers: Math.max(0, squad.length - Number(s.squadSize)),
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
  for (const p of auctionPlayers(data)) {
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
  return auctionPlayers(data).length === squadCapacity(data);
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
    const slotsOf = (t) => squadSizeOf(t, s) - bought[t.id];

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
      (t) => counts[t.id][pos] < min && squadSizeOf(t, s) - bought[t.id] > 0
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
  if (isSpecial(player))
    return {
      ok: false,
      error: `${player.name} is a special player — place them from the Special players panel, not through bidding.`,
    };
  if (!team || !st) return { ok: false, error: "Pick a team." };
  if (player.teamId)
    return { ok: false, error: `${player.name} is already sold to ${teamById(data, player.teamId)?.name || "a team"}.` };

  const p = Number(price);
  if (!Number.isFinite(p) || p < 0) return { ok: false, error: "Enter a valid price." };
  if (p < Number(s.basePrice))
    return { ok: false, error: `Below base price — minimum is ${bdt(s.basePrice)}.` };

  if (st.slotsLeft <= 0)
    return { ok: false, error: `${team.name} already has a full squad of ${st.squadSize}.` };

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

/**
 * Can this special player be placed with this team? Returns `{ ok, error }`.
 *
 * Deliberately almost no rules: a special is free and outside the squad limits,
 * so the only things that can go wrong are a bad id and a team that does not
 * exist. Passing `null` as the team means "take them back off the pitch".
 */
export function validateSpecial(data, playerId, teamId) {
  const player = playerById(data, playerId);
  if (!player) return { ok: false, error: "Unknown player." };
  if (!isSpecial(player))
    return { ok: false, error: `${player.name} is an auction player — sell them instead.` };
  if (teamId && !teamById(data, teamId)) return { ok: false, error: "Pick a team." };
  return { ok: true, error: null };
}

/**
 * The next free special-player id.
 *
 * Scans for a gap rather than counting, so removing s2 and adding another guest
 * reuses s2 instead of colliding with s3 — the seeded pool numbers `p01…` and
 * the specials `s1…` precisely so these two sequences can never meet.
 */
export function nextSpecialId(data) {
  const used = new Set(playersList(data).map((p) => p.id));
  let n = 1;
  while (used.has(`s${n}`)) n++;
  return `s${n}`;
}

/**
 * Can a new guest be added under this name? Returns `{ ok, error }`.
 *
 * The duplicate-name check is the one that matters on the day: the referee picks
 * a scorer from a list of names, so two players called "Rahim" on the same pitch
 * means goals land on whichever one happens to be first.
 */
export function validateNewSpecial(data, name, pos, teamId) {
  const nm = String(name || "").trim();
  if (!nm) return { ok: false, error: "A guest player needs a name." };
  if (nm.length > 40) return { ok: false, error: "That name is too long — 40 characters at most." };
  if (!POSITIONS.includes(pos)) return { ok: false, error: "Pick a position." };
  if (teamId && !teamById(data, teamId)) return { ok: false, error: "Pick a team." };

  const clash = playersList(data).find(
    (p) => String(p.name || "").trim().toLowerCase() === nm.toLowerCase()
  );
  if (clash)
    return {
      ok: false,
      error: `There is already a player called ${clash.name}. Add a surname or an initial so the referee can tell them apart.`,
    };

  return { ok: true, error: null };
}

/** How many logged match events name this player, in any role. */
export const playerEventCount = (data, playerId) =>
  playerId
    ? allEvents(data).filter(
        (ev) =>
          ev.scorerId === playerId || ev.assistId === playerId || ev.playerId === playerId
      ).length
    : 0;

/**
 * Can this special player be deleted outright? Returns `{ ok, error }`.
 *
 * Blocked once they appear in the match log, because deleting the player would
 * leave those events pointing at nobody — the goal would stay on the scoreboard
 * with no scorer. Take them off the team instead; that keeps the history intact.
 */
export function validateRemoveSpecial(data, playerId) {
  const player = playerById(data, playerId);
  if (!player) return { ok: false, error: "Unknown player." };
  if (!isSpecial(player))
    return { ok: false, error: `${player.name} is an auction player — unsell them instead.` };
  const n = playerEventCount(data, playerId);
  if (n)
    return {
      ok: false,
      error: `${player.name} is in the match log (${n} event${
        n === 1 ? "" : "s"
      }). Set them to "not playing" instead — deleting them would leave those events with no player.`,
    };
  return { ok: true, error: null };
}

/** Auction progress across all teams. */
export function auctionProgress(data) {
  const players = auctionPlayers(data);
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
