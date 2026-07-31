/* ==========================================================================
   Live auction console.

   Runs on auction day: sell each player to a captain, with every rule from the
   deck enforced before the write lands. The public Squads tab updates live, so
   this doubles as the projector view.
   ========================================================================== */

import { writeMany } from "./backend.js";
import { $, setHTML, show, toast } from "./ui.js";
import { celebrate } from "./confetti.js";
import * as D from "./data.js";

const e = D.escapeHtml;

/**
 * The projector moment. A full-screen SOLD card plus confetti, then it clears
 * itself — no click needed, because the auctioneer's hands are busy.
 */
function soldCelebration(player, team, price) {
  const el = document.createElement("div");
  el.className = "sold-overlay";
  el.innerHTML = `<div class="sold-card">
    <div class="stamp">SOLD!</div>
    <div class="who">${e(player.name)}</div>
    <div class="to">${e(player.pos)} → ${e(team.name)}</div>
    <div class="price">${price} BDT</div>
  </div>`;
  document.body.appendChild(el);
  celebrate("sale");
  setTimeout(() => {
    el.classList.add("is-out");
    setTimeout(() => el.remove(), 280);
  }, 1700);
}

let data = null;
let wired = false;
/** Team id whose card should flash on the next repaint, after a purchase. */
let justBought = null;

/* --------------------------------------------------------------- rendering */

export function renderAuction(next) {
  data = next;
  if (!wired) wire();

  const s = D.getSettings(data);
  show($("#auctionClosed"), !s.auctionOpen);

  paintSelects();
  paintProgress();
  paintCaptains();
  paintPool();
  paintSpecials();
  paintJerseys();
  paintLadder();
  validateNow();
  justBought = null; // the flash is a one-shot, not sticky state
}

function paintProgress() {
  const p = D.auctionProgress(data);
  $("#auctionProgress").textContent = `${p.sold} of ${p.total} sold · ${p.spend} BDT spent`;
}

/** Rebuild the dropdowns without losing what the auctioneer already picked. */
function paintSelects() {
  const playerSel = $("#sellPlayer");
  const teamSel = $("#sellTeam");
  const keepPlayer = playerSel.value;
  const keepTeam = teamSel.value;

  const available = D.auctionPlayers(data).filter((p) => !p.teamId);
  setHTML(
    playerSel,
    available.length
      ? D.POSITIONS.filter((pos) => available.some((p) => p.pos === pos))
          .map(
            (pos) =>
              `<optgroup label="${e(D.POSITION_LABEL[pos])} (${
                available.filter((p) => p.pos === pos).length
              } left)">` +
              available
                .filter((p) => p.pos === pos)
                .map((p) => `<option value="${e(p.id)}">${e(p.name)}</option>`)
                .join("") +
              `</optgroup>`
          )
          .join("")
      : `<option value="">— every player is sold —</option>`
  );
  if (available.some((p) => p.id === keepPlayer)) playerSel.value = keepPlayer;

  const st = D.auctionState(data);
  setHTML(
    teamSel,
    D.teamsList(data)
      .map((t) => {
        const x = st[t.id];
        return `<option value="${e(t.id)}"${x.complete ? " disabled" : ""}>${e(t.name)} — ${
          x.remaining
        } BDT, ${x.slotsLeft} slot${x.slotsLeft === 1 ? "" : "s"}${x.complete ? " (full)" : ""}</option>`;
      })
      .join("")
  );
  if (keepTeam && st[keepTeam] && !st[keepTeam].complete) teamSel.value = keepTeam;
  else {
    const firstOpen = D.teamsList(data).find((t) => !st[t.id].complete);
    if (firstOpen) teamSel.value = firstOpen.id;
  }
}

function paintCaptains() {
  const s = D.getSettings(data);
  const st = D.auctionState(data);

  setHTML(
    $("#captainGrid"),
    D.teamsList(data)
      .map((t) => {
        const x = st[t.id];
        const low = x.remaining < Number(s.basePrice) && x.slotsLeft > 0;
        const chips = D.POSITIONS.map((pos) => {
          const n = x.counts[pos];
          const max = x.max[pos];
          const need = n < Number(s.minPerCategory) && x.slotsLeft > 0;
          const full = n >= max;
          return `<span class="chip ${need ? "need" : full ? "done" : ""}">${pos} ${n}/${max}</span>`;
        }).join("");

        return `<div class="cap ${x.complete ? "is-full" : ""} ${low ? "is-broke" : ""} ${
          t.id === justBought ? "just-bought" : ""
        }">
          <div class="cap__top">
            <img src="${e(t.captainPhoto)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'" />
            <div class="grow">
              <div class="cap__name">${e(t.name)}</div>
              <div class="faint">${e(t.captainName)}</div>
            </div>
          </div>
          <div class="cap__money">
            <b style="color:${x.remaining < 0 ? "#ff9166" : "var(--mint)"}">${x.remaining}</b>
            <span class="faint">BDT left of ${s.budget}</span>
          </div>
          <div class="faint">
            Squad ${x.squad.length}/${x.squadSize}${
              x.extraPlayers > 0
                ? ` <span class="flag-extra">+${x.extraPlayers} extra</span>`
                : ""
            } ·
            ${
              x.complete
                ? `<b style="color:var(--mint)">squad complete</b>`
                : `max bid now <b style="color:var(--gold)">${x.maxBid} BDT</b>`
            }
            ${x.jerseyCost ? ` · jersey ${x.jerseyCost} BDT` : ""}
          </div>
          ${
            x.specials.length
              ? `<div class="faint">+ ${x.specials
                  .map((p) => `${e(p.name)} <span class="flag-special">special</span>`)
                  .join(", ")}</div>`
              : ""
          }
          <div class="cap__chips">${chips}</div>
        </div>`;
      })
      .join("")
  );
}

function paintPool() {
  const hideSold = $("#hideSold").checked;
  const players = D.auctionPlayers(data);
  const advice = D.shapeAdvice(data);

  const note =
    advice &&
    D.POSITIONS.filter((pos) => advice[pos].tight && advice[pos].teamsNeeding > 0)
      .map(
        (pos) =>
          `<b>${pos}:</b> only ${advice[pos].left} left and ${advice[pos].teamsNeeding} team${
            advice[pos].teamsNeeding === 1 ? "" : "s"
          } still need one — these are now reserved.`
      )
      .join("<br />");

  setHTML(
    $("#poolList"),
    (note ? `<p class="scarce-note">${note}</p>` : "") +
      D.POSITIONS.map((pos) => {
        const rows = players.filter((p) => p.pos === pos && (!hideSold || !p.teamId));
        if (!rows.length) return "";
        const left = players.filter((p) => p.pos === pos && !p.teamId).length;
        return `<div class="pool__group">
          <h4>${e(D.POSITION_LABEL[pos])} · ${left} of ${
          players.filter((p) => p.pos === pos).length
        } available</h4>
          ${rows
            .map((p) => {
              const team = D.teamById(data, p.teamId);
              return `<div class="pool__row ${p.teamId ? "sold" : ""}">
                <span class="pos-tag ${e(p.pos)}">${e(p.pos)}</span>
                <span class="who">${e(p.name)}</span>
                ${
                  team
                    ? `<span class="to">${e(team.name)} · ${p.price} BDT</span>
                       <button class="btn btn--sm btn--danger" data-unsell="${e(p.id)}" type="button">Unsell</button>`
                    : `<button class="btn btn--sm" data-pick="${e(p.id)}" type="button">Select</button>`
                }
              </div>`;
            })
            .join("")}
        </div>`;
      }).join("")
  );
}

/**
 * Special players — the guests who sit outside the auction.
 *
 * Rebuilt only when something actually changed, because this panel holds a text
 * input: a live snapshot arriving mid-rename would otherwise wipe what is being
 * typed.
 */
let specialSig = "";

function paintSpecials() {
  const rows = D.specialPlayers(data);
  const teams = D.teamsList(data);

  const sig = JSON.stringify([
    rows.map((p) => [p.id, p.name, p.pos, p.teamId, D.playerEventCount(data, p.id) > 0]),
    teams.map((t) => [t.id, t.name]),
  ]);
  if (sig === specialSig) return;
  specialSig = sig;

  paintNewSpecial(teams);

  setHTML(
    $("#specialList"),
    !rows.length
      ? `<p class="faint" style="margin: 0">No guests yet. Anyone added above shows up here,
         and on the public Squads tab, the moment you save them.</p>`
      : rows
      .map((p) => {
        const team = D.teamById(data, p.teamId);
        return `<div class="special-row">
        <span class="pos-tag ${e(p.pos)}">${e(p.pos)}</span>
        <input class="input nm" value="${e(p.name)}" data-sname="${e(p.id)}"
               aria-label="Special player name" />
        <select class="input pos" data-spos="${e(p.id)}" aria-label="${e(p.name)} position">
          ${D.POSITIONS.map(
            (pos) =>
              `<option value="${pos}"${p.pos === pos ? " selected" : ""}>${e(
                D.POSITION_LABEL[pos]
              )}</option>`
          ).join("")}
        </select>
        <select class="input tm" data-steam="${e(p.id)}" aria-label="${e(p.name)} team">
          <option value="">— not playing —</option>
          ${teams
            .map(
              (t) =>
                `<option value="${e(t.id)}"${p.teamId === t.id ? " selected" : ""}>${e(t.name)}</option>`
            )
            .join("")}
        </select>
        <button class="btn btn--sm btn--primary" data-ssave="${e(p.id)}" type="button">Save</button>
        ${
          // Only offered while the player has no history — once they are in the
          // match log the only safe move is to take them off the team.
          D.validateRemoveSpecial(data, p.id).ok
            ? `<button class="btn btn--sm btn--danger" data-sdel="${e(p.id)}" type="button"
                 title="Remove ${e(p.name)} completely">Remove</button>`
            : ""
        }
        <span class="faint" style="flex-basis:100%">${
          team
            ? `Playing for <b>${e(team.name)}</b> — free, and doesn't use one of their ${
                D.auctionState(data)[team.id].squadSize
              } squad slots.`
            : "Not assigned — pick a team here if they turn up on the day."
        }</span>
      </div>`;
      })
      .join("")
  );
}

/** The add-a-guest row. Selects are rebuilt in step with the team names. */
function paintNewSpecial(teams) {
  const posSel = $("#newSpecialPos");
  const teamSel = $("#newSpecialTeam");
  const keepPos = posSel.value;
  const keepTeam = teamSel.value;

  setHTML(
    posSel,
    D.POSITIONS.map(
      (pos) => `<option value="${pos}">${e(D.POSITION_LABEL[pos])}</option>`
    ).join("")
  );
  posSel.value = D.POSITIONS.includes(keepPos) ? keepPos : "MID";

  setHTML(
    teamSel,
    `<option value="">— not playing yet —</option>` +
      teams.map((t) => `<option value="${e(t.id)}">${e(t.name)}</option>`).join("")
  );
  if (teams.some((t) => t.id === keepTeam)) teamSel.value = keepTeam;
}

function paintJerseys() {
  const st = D.auctionState(data);
  setHTML(
    $("#jerseyList"),
    D.teamsList(data)
      .map(
        (t) => `<div class="jersey-row">
        <span class="nm">${e(t.name)}</span>
        <input type="color" value="${e(t.jerseyColor || "#3fd9a4")}" data-jcolor="${e(t.id)}" aria-label="${e(t.name)} jersey colour" />
        <input class="input" type="text" placeholder="Colour name" value="${e(t.jerseyLabel || "")}" data-jlabel="${e(t.id)}" />
        <input class="input cost" type="number" min="0" step="1" placeholder="BDT" value="${
          t.jerseyCost || ""
        }" data-jcost="${e(t.id)}" aria-label="${e(t.name)} jersey cost" />
        <button class="btn btn--sm btn--primary" data-jsave="${e(t.id)}" type="button">Save</button>
        <span class="faint" style="flex-basis:100%">${st[t.id].remaining} BDT left after this</span>
      </div>`
      )
      .join("")
  );
}

function paintLadder() {
  const s = D.getSettings(data);
  const st = D.auctionState(data)[$("#sellTeam").value];
  const steps = [];
  for (let i = Number(s.minRaise); i <= Number(s.maxRaise); i++) steps.push(i);

  setHTML(
    $("#bidLadder"),
    `<span class="lbl">Bid</span>
     <button class="btn btn--sm" data-bid="base" type="button">Base ${s.basePrice}</button>
     ${steps.map((n) => `<button class="btn btn--sm" data-bid="${n}" type="button">+${n}</button>`).join("")}
     <button class="btn btn--sm btn--ghost" data-bid="max" type="button">Max ${st ? st.maxBid : 0}</button>`
  );
}

/* ------------------------------------------------------------- validation */

function validateNow() {
  const pid = $("#sellPlayer").value;
  const tid = $("#sellTeam").value;
  const raw = $("#sellPrice").value;
  const msg = $("#sellMsg");
  const btn = $("#sellBtn");
  const s = D.getSettings(data);

  if (!s.auctionOpen) {
    msg.className = "sell-msg err";
    msg.textContent = "The auction is closed — re-open it above to sell players.";
    btn.disabled = true;
    return;
  }
  if (!pid) {
    msg.className = "sell-msg ok";
    msg.textContent = "Every player has been sold. The squads are complete.";
    btn.disabled = true;
    return;
  }
  if (raw === "") {
    msg.className = "sell-msg";
    msg.textContent = `Enter the winning bid (base price is ${s.basePrice} BDT).`;
    btn.disabled = true;
    return;
  }

  const res = D.validateSale(data, pid, tid, Number(raw));
  const player = D.playerById(data, pid);
  const team = D.teamById(data, tid);

  if (res.ok) {
    msg.className = "sell-msg ok";
    msg.textContent = `✓ ${player.name} (${player.pos}) → ${team.name} for ${raw} BDT.`;
  } else {
    msg.className = "sell-msg err";
    msg.textContent = res.error;
  }
  btn.disabled = !res.ok;
}

/* ------------------------------------------------------------------ wiring */

function wire() {
  wired = true;

  for (const id of ["#sellPlayer", "#sellTeam", "#sellPrice"]) {
    $(id).addEventListener("input", () => {
      if (id === "#sellTeam") paintLadder();
      validateNow();
    });
  }

  $("#hideSold").addEventListener("change", paintPool);

  $("#bidLadder").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-bid]");
    if (!b) return;
    const s = D.getSettings(data);
    const st = D.auctionState(data)[$("#sellTeam").value];
    const price = $("#sellPrice");
    const cur = Number(price.value || 0);
    const kind = b.dataset.bid;
    if (kind === "base") price.value = s.basePrice;
    else if (kind === "max") price.value = st ? st.maxBid : 0;
    else price.value = Math.max(Number(s.basePrice), cur || Number(s.basePrice)) + Number(kind);
    validateNow();
  });

  $("#sellBtn").addEventListener("click", async () => {
    const pid = $("#sellPlayer").value;
    const tid = $("#sellTeam").value;
    const price = Number($("#sellPrice").value);
    const res = D.validateSale(data, pid, tid, price);
    if (!res.ok) return toast(res.error, "err");

    const player = D.playerById(data, pid);
    const team = D.teamById(data, tid);
    $("#sellBtn").disabled = true;
    try {
      await writeMany({
        [`players/${pid}/teamId`]: tid,
        [`players/${pid}/price`]: price,
      });
      soldCelebration(player, team, price);
      justBought = tid;
      $("#sellPrice").value = "";
    } catch (err) {
      toast(`Could not save: ${err.message}`, "err");
      $("#sellBtn").disabled = false;
    }
  });

  // Pool row actions
  $("#poolList").addEventListener("click", async (ev) => {
    const pick = ev.target.closest("[data-pick]");
    if (pick) {
      $("#sellPlayer").value = pick.dataset.pick;
      $("#sellPrice").focus();
      validateNow();
      $("#sellPlayer").scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const un = ev.target.closest("[data-unsell]");
    if (!un) return;
    const p = D.playerById(data, un.dataset.unsell);
    const team = D.teamById(data, p?.teamId);
    if (!confirm(`Return ${p.name} to the pool and refund ${p.price} BDT to ${team?.name}?`)) return;
    try {
      await writeMany({
        [`players/${p.id}/teamId`]: null,
        [`players/${p.id}/price`]: null,
      });
      toast(`${p.name} returned to the pool.`);
    } catch (err) {
      toast(`Could not save: ${err.message}`, "err");
    }
  });

  // A guest who turned up on the day — added straight into a team, for free.
  $("#addSpecial").addEventListener("click", async () => {
    const nameEl = $("#newSpecialName");
    const name = nameEl.value.trim();
    const pos = $("#newSpecialPos").value;
    const teamId = $("#newSpecialTeam").value || null;

    const res = D.validateNewSpecial(data, name, pos, teamId);
    if (!res.ok) return toast(res.error, "err");

    const id = D.nextSpecialId(data);
    try {
      await writeMany({
        [`players/${id}`]: { id, name, pos, teamId, price: 0, special: true },
      });
      const team = D.teamById(data, teamId);
      toast(
        team
          ? `${name} added to ${team.name} — free, and outside the squad limits.`
          : `${name} added. Pick a team when you know who they are playing for.`
      );
      nameEl.value = "";
      nameEl.focus();
      if (teamId) justBought = teamId;
    } catch (err) {
      toast(`Could not save: ${err.message}`, "err");
    }
  });

  // Enter in the name box adds the guest, so this is a one-handed job.
  $("#newSpecialName").addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      $("#addSpecial").click();
    }
  });

  // Special players — name, position and which team they turn out for.
  $("#specialList").addEventListener("click", async (ev) => {
    const del = ev.target.closest("[data-sdel]");
    if (del) {
      const p = D.playerById(data, del.dataset.sdel);
      const res = D.validateRemoveSpecial(data, del.dataset.sdel);
      if (!res.ok) return toast(res.error, "err");
      if (!confirm(`Remove ${p.name} from the tournament completely?`)) return;
      try {
        await writeMany({ [`players/${p.id}`]: null });
        toast(`${p.name} removed.`);
      } catch (err) {
        toast(`Could not save: ${err.message}`, "err");
      }
      return;
    }

    const b = ev.target.closest("[data-ssave]");
    if (!b) return;
    const id = b.dataset.ssave;
    const name = $(`[data-sname="${id}"]`).value.trim();
    const pos = $(`[data-spos="${id}"]`).value;
    const teamId = $(`[data-steam="${id}"]`).value || null;
    if (!name) return toast("A special player still needs a name.", "err");

    const res = D.validateSpecial(data, id, teamId);
    if (!res.ok) return toast(res.error, "err");

    const wasOn = D.playerById(data, id)?.teamId || null;
    try {
      await writeMany({
        [`players/${id}/name`]: name,
        [`players/${id}/pos`]: pos,
        [`players/${id}/teamId`]: teamId,
        [`players/${id}/price`]: 0, // free, always — never touches a budget
      });
      const team = D.teamById(data, teamId);
      toast(team ? `${name} added to ${team.name}.` : `${name} saved — not assigned to a team.`);
      if (teamId && teamId !== wasOn) justBought = teamId;
    } catch (err) {
      toast(`Could not save: ${err.message}`, "err");
    }
  });

  // Jersey purchase
  $("#jerseyList").addEventListener("click", async (ev) => {
    const b = ev.target.closest("[data-jsave]");
    if (!b) return;
    const tid = b.dataset.jsave;
    const root = b.closest(".jersey-row");
    const color = root.querySelector("[data-jcolor]").value;
    const label = root.querySelector("[data-jlabel]").value.trim();
    const cost = Number(root.querySelector("[data-jcost]").value || 0);
    const s = D.getSettings(data);
    const st = D.auctionState(data)[tid];
    const team = D.teamById(data, tid);

    if (!Number.isFinite(cost) || cost < 0) return toast("Enter a valid jersey cost.", "err");

    // Same money guard as a player sale: the squad still has to be affordable.
    const remainingAfter = Number(s.budget) - st.spentOnPlayers - cost;
    const floor = st.slotsLeft * Number(s.basePrice);
    if (remainingAfter < floor)
      return toast(
        `Too expensive — ${team.name} still needs ${st.slotsLeft} player${
          st.slotsLeft === 1 ? "" : "s"
        } (${floor} BDT minimum). Jersey can cost at most ${Math.max(
          0,
          Number(s.budget) - st.spentOnPlayers - floor
        )} BDT.`,
        "err"
      );

    try {
      await writeMany({
        [`teams/${tid}/jerseyColor`]: color,
        [`teams/${tid}/jerseyLabel`]: label || null,
        [`teams/${tid}/jerseyCost`]: cost,
      });
      toast(`${team.name} jersey saved.`);
    } catch (err) {
      toast(`Could not save: ${err.message}`, "err");
    }
  });

  $("#reopenAuction").addEventListener("click", async () => {
    try {
      await writeMany({ "settings/auctionOpen": true });
      toast("Auction re-opened.");
    } catch (err) {
      toast(`Could not save: ${err.message}`, "err");
    }
  });
}
