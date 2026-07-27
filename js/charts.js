/* ==========================================================================
   Charts.

   Deliberately built from HTML + CSS rather than SVG or a charting library:
   text stays crisp at any size, it reflows on a phone for free, hover and
   keyboard focus are native, and it adds zero kilobytes of dependency.

   Colour method (see the palette validated against this site's card surface
   #0B3B36, all four checks passing at >= 3:1):
     - Nominal categories (teams, players, positions) have no natural order, so
       every bar in a single-series chart wears ONE hue. Colouring bars by their
       own value would just re-encode what bar length already says.
     - Goal difference is polarity, not magnitude, so it gets the diverging pair:
       blue above the line, red below, with a neutral zero baseline. Green/red
       is the classic colour-blind trap and is avoided on purpose.
   Every value is directly labelled, so no number is trapped behind a tooltip.
   ========================================================================== */

import * as D from "./data.js";

const e = D.escapeHtml;

/* ------------------------------------------------------------------ tooltip */

let tipEl = null;
let tipAnchor = null;

function ensureTip() {
  if (!tipEl) {
    tipEl = document.createElement("div");
    tipEl.className = "chart-tip";
    tipEl.setAttribute("role", "tooltip");
    tipEl.hidden = true;
    document.body.appendChild(tipEl);
  }
  return tipEl;
}

function showTip(target) {
  const text = target.dataset.tip;
  if (!text) return;
  tipAnchor = target;
  const tip = ensureTip();
  tip.textContent = text;
  tip.hidden = false;
  const r = target.getBoundingClientRect();
  const t = tip.getBoundingClientRect();
  let left = r.left + r.width / 2 - t.width / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - t.width - 8));
  let top = r.top - t.height - 8;
  if (top < 8) top = r.bottom + 8;
  tip.style.left = `${left}px`;
  tip.style.top = `${top + window.scrollY}px`;
}

const hideTip = () => {
  if (tipEl) tipEl.hidden = true;
  tipAnchor = null;
};

/**
 * Bind once. Tooltips enhance the visible labels — they never gate a value.
 *
 * Pointer and keyboard are tracked as separate, independent sources. Mixing
 * them makes the tooltip flicker: tabbing to a row scrolls the page, which
 * fires pointer events for wherever the (stationary) mouse now happens to sit,
 * and those would otherwise dismiss the tooltip the keyboard just opened.
 */
export function initCharts() {
  let mode = null; // "pointer" | "key" | null

  const open = (target, source) => {
    mode = source;
    showTip(target);
  };
  const close = (source) => {
    if (mode !== source) return; // only the source that opened it may close it
    mode = null;
    hideTip();
  };

  document.addEventListener("pointerover", (ev) => {
    const t = ev.target.closest("[data-tip]");
    if (t) open(t, "pointer");
    else close("pointer");
  });
  document.addEventListener("pointerout", (ev) => {
    if (ev.target.closest("[data-tip]")) close("pointer");
  });

  document.addEventListener("focusin", (ev) => {
    const t = ev.target.closest("[data-tip]");
    if (t) open(t, "key");
    else close("key");
  });
  document.addEventListener("focusout", () => close("key"));

  // Keep a keyboard tooltip pinned to its row while the browser scrolls it into
  // view; a pointer tooltip is stale the moment the page moves under the cursor.
  window.addEventListener(
    "scroll",
    () => {
      if (!tipAnchor || tipEl?.hidden) return;
      if (mode === "key") showTip(tipAnchor);
      else close("pointer");
    },
    { passive: true }
  );
}

/* ------------------------------------------------------------------ helpers */

const empty = (msg) => `<p class="chart-empty">${e(msg)}</p>`;

/**
 * Charts animate in only the first time a container is filled. Re-animating on
 * every live score update would make the page twitch all evening.
 */
function wrap(id, inner, seen) {
  const fresh = !seen.has(id);
  seen.add(id);
  return `<div class="chart${fresh ? " chart--enter" : ""}">${inner}</div>`;
}

const painted = new Set();
export const resetChartAnimations = () => painted.clear();

/* -------------------------------------------------------------- simple bars */

/**
 * Single-series horizontal bars. One hue for every bar (nominal categories),
 * value direct-labelled at the tip.
 * rows: [{ key, label, sub, value, tip }]
 */
function barChart({ rows, max, tone = "mint", unit = "" }) {
  const top = Math.max(max ?? 0, ...rows.map((r) => r.value), 1);
  return `<div class="bars bars--${e(tone)}">${rows
    .map(
      (r) => `<div class="bar-row" tabindex="0" data-tip="${e(r.tip || `${r.label}: ${r.value}${unit}`)}">
        <span class="bar-label">${e(r.label)}${
        r.sub ? `<span class="bar-sub">${e(r.sub)}</span>` : ""
      }</span>
        <span class="bar-track">
          <span class="bar-fill${r.value === 0 ? " is-zero" : ""}" style="--pct:${
        (r.value / top) * 100
      }%"></span>
        </span>
        <span class="bar-value num">${r.value}${e(unit)}</span>
      </div>`
    )
    .join("")}</div>`;
}

/**
 * Diverging bars around a zero baseline — the form for polarity.
 * rows: [{ label, value, tip }]
 */
function divergingChart({ rows, unit = "" }) {
  const span = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  return `<div class="diverge">${rows
    .map((r) => {
      const pct = (Math.abs(r.value) / span) * 50;
      const pos = r.value >= 0;
      return `<div class="bar-row" tabindex="0" data-tip="${e(r.tip || `${r.label}: ${r.value > 0 ? "+" : ""}${r.value}${unit}`)}">
        <span class="bar-label">${e(r.label)}</span>
        <span class="diverge-track">
          <span class="diverge-zero" aria-hidden="true"></span>
          <span class="diverge-fill ${pos ? "is-pos" : "is-neg"}" style="--pct:${pct}%"></span>
        </span>
        <span class="bar-value num ${pos ? "is-pos" : "is-neg"}">${r.value > 0 ? "+" : ""}${r.value}</span>
      </div>`;
    })
    .join("")}
    <div class="diverge-legend">
      <span><i class="key key--pos"></i> Positive</span>
      <span><i class="key key--neg"></i> Negative</span>
    </div>
  </div>`;
}

/** A ratio against a fixed limit — a meter, not a chart. */
function meter({ label, sub, used, limit, tip }) {
  const pct = Math.max(0, Math.min(100, (used / limit) * 100));
  const over = used > limit;
  return `<div class="meter" tabindex="0" data-tip="${e(tip)}">
    <div class="meter-head"><b>${e(label)}</b><span class="num">${used} / ${limit}</span></div>
    <div class="meter-track"><i class="${over ? "is-over" : ""}" style="--pct:${pct}%"></i></div>
    <div class="meter-sub">${e(sub)}</div>
  </div>`;
}

/* -------------------------------------------------------------- the charts */

export function renderCharts(data) {
  const table = D.standings(data);
  const anyPlayed = D.matchesList(data).some(D.isPlayed);

  /* 1 — Points. Magnitude across nominal categories: one hue for every bar. */
  setChart(
    "chartPoints",
    anyPlayed
      ? barChart({
          tone: "mint",
          unit: "",
          rows: table.map((r) => ({
            key: r.teamId,
            label: r.team.name,
            sub: `${r.won}W ${r.drawn}D ${r.lost}L`,
            value: r.points,
            tip: `${r.team.name} — ${r.points} point${r.points === 1 ? "" : "s"} from ${r.played} match${
              r.played === 1 ? "" : "es"
            } (${r.won}W ${r.drawn}D ${r.lost}L)`,
          })),
        })
      : empty("Points appear here as results come in.")
  );

  /* 2 — Goal difference. Polarity, so the diverging pair with a zero baseline. */
  setChart(
    "chartGD",
    anyPlayed
      ? divergingChart({
          rows: table.map((r) => ({
            label: r.team.name,
            value: r.goalDiff,
            tip: `${r.team.name} — scored ${r.goalsFor}, conceded ${r.goalsAgainst}, difference ${
              r.goalDiff > 0 ? "+" : ""
            }${r.goalDiff}`,
          })),
        })
      : empty("Goal difference decides level teams (Rule 7).")
  );

  /* 3 — Top scorers. Single series, so no legend: the title names it. */
  const scorers = D.topScorers(data).slice(0, 8);
  setChart(
    "chartScorers",
    scorers.length
      ? barChart({
          tone: "gold",
          rows: scorers.map((r) => ({
            key: r.playerId,
            label: r.player.name,
            sub: r.team?.name || "",
            value: r.value,
            tip: `${r.player.name} (${r.team?.name || "unsold"}) — ${r.value} goal${
              r.value === 1 ? "" : "s"
            }`,
          })),
        })
      : empty("No goals logged yet.")
  );

  /* 4 — Where the goals came from. */
  const byPos = D.goalsByPosition(data);
  const totalPos = byPos.reduce((n, r) => n + r.value, 0);
  setChart(
    "chartPositions",
    totalPos
      ? barChart({
          tone: "blue",
          rows: byPos.map((r) => ({
            key: r.pos,
            label: r.label,
            value: r.value,
            tip: `${r.label} — ${r.value} of ${totalPos} goals (${Math.round(
              (r.value / totalPos) * 100
            )}%)`,
          })),
        })
      : empty("Goals are grouped by the scorer's position once they're logged.")
  );

  /* 5 — Auction spend. A ratio against a fixed limit per team. */
  const s = D.getSettings(data);
  const st = D.auctionState(data);
  setChart(
    "chartSpend",
    `<div class="meters">${D.teamsList(data)
      .map((t) => {
        const x = st[t.id];
        return meter({
          label: t.name,
          sub: `${x.squad.length}/${s.squadSize} players${
            x.jerseyCost ? ` · ${x.jerseyCost} BDT jersey` : ""
          } · ${x.remaining} BDT left`,
          used: x.spent,
          limit: Number(s.budget),
          tip: `${t.name} — spent ${x.spent} of ${s.budget} BDT on ${x.squad.length} player${
            x.squad.length === 1 ? "" : "s"
          }${x.jerseyCost ? ` and a ${x.jerseyCost} BDT jersey` : ""}`,
        });
      })
      .join("")}</div>`
  );
}

function setChart(id, inner) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = wrap(id, inner, painted);
}
