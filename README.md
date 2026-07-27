# WeGro Champions League 2026

Live scores, standings, squads and a full auction console for the WeGro Champions League —
**Saturday 1 August 2026, ChattoTurf, Bashundhara**.

- **Everyone** opens the site and watches scores update live. They cannot change anything.
- **One admin** signs in and controls the auction, the scores and the medals.

Static HTML/CSS/JavaScript. No build step, no dependencies to install, no framework.
Nothing is loaded from a CDN except the Firebase SDK, so the page still renders on bad
venue wifi.

**What's on it**

| Tab | What people see |
|---|---|
| Overview | Countdown to kick-off, venue, live match banner, leaderboard |
| Fixtures | All 7 matches; tap a finished one to see who scored |
| Standings | Full table with form guide, top two marked **Q** for the Final |
| Squads | The four squads, auction prices, budget meters, jersey colours |
| Stats & Awards | The three medals, plus charts: points, goal difference, golden boot race, and where the goals came from |
| Rules | The 7 tournament rules and the auction rules |

---

## Try it right now

You do not need Firebase to look around. From this folder:

```bash
python -m http.server 8080
```

Then open <http://localhost:8080>. Go to **Admin**, sign in with the passphrase `wegro2026`,
and press **Load tournament**.

This is **demo mode** — data is stored in your browser only, an orange banner says so on every
page, and nothing is secure. It exists so you can practise before the real thing. Do the Firebase
setup below to make it live for everyone.

> Open it through `http://localhost`, not by double-clicking `index.html`. Browsers block
> JavaScript modules on `file://` URLs.

---

## Step 1 — Firebase (about 10 minutes, free)

This is what makes scores live for everyone and makes the admin login real.

1. Go to <https://console.firebase.google.com> and sign in with your WeGro Google account.
2. **Add project** → name it `wegro-champions-league` → you can turn Google Analytics off →
   **Create project**.
3. On the project home page click the **web icon `</>`** → app nickname `wegro-cl` → **Register app**.
   Firebase shows you a `firebaseConfig` block. Leave that tab open.
4. Left sidebar → **Build → Realtime Database** → **Create Database** →
   choose the **Singapore (asia-southeast1)** location → start in **locked mode** → **Enable**.
5. Left sidebar → **Build → Authentication** → **Get started** → **Email/Password** → enable the
   first toggle → **Save**.
6. Still in Authentication → **Users** tab → **Add user**. Enter the admin email and a strong
   password. **This is the only account that will ever be able to change the tournament.**
7. Copy the **User UID** from that row (a long string like `k3Jf9...`). You need it in step 3.

### Step 2 — paste the config

Open **`js/config.js`** and paste the values from step 3 above:

```js
export const firebaseConfig = {
  apiKey: "AIza…",
  authDomain: "wegro-champions-league.firebaseapp.com",
  databaseURL: "https://wegro-champions-league-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "wegro-champions-league",
  storageBucket: "wegro-champions-league.firebasestorage.app",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef",
};
```

Make sure `databaseURL` is included — Firebase sometimes omits it from the snippet. You can copy
it from **Realtime Database → Data**, it is shown at the top.

The orange demo banner disappears as soon as this is filled in.

> **Are these keys secret? No.** A Firebase web config is an identifier, not a password. It is
> safe in a public repo — Google publishes these in their own documentation. What protects your
> data is the security rule in the next step.

### Step 3 — lock the database

In the Firebase console: **Realtime Database → Rules**. Replace everything with the contents of
**`database.rules.json`** from this folder, and swap `PASTE_YOUR_ADMIN_UID_HERE` for the UID you
copied in step 1.7. Press **Publish**.

That rule says: *anyone may read, only this one account may write.* It is enforced by Google's
servers, so it holds even if someone opens devtools and calls the database directly.

**Verify it works** — open the public site in a private window, open the browser console and run:

```js
await fetch("https://YOUR-DB.asia-southeast1.firebasedatabase.app/wegro/cl2026/matches/m1.json", {
  method: "PATCH", body: JSON.stringify({ homeScore: 99 })
}).then(r => r.text());
```

It must return a **`Permission denied`** error. If it returns `null` or the data, the rules did
not publish — go back and fix that before match day.

### Step 4 — load the tournament

Open `admin.html`, sign in with the email and password from step 1.6, and press
**Load tournament**. That writes the four teams, the 24-player auction pool, the six round-robin
fixtures and the Final.

---

## Step 5 — deploy to Netlify

**The quick way** — go to <https://app.netlify.com/drop> and drag this whole folder onto the page.
Done, you get a URL immediately.

**The maintainable way** — push the folder to GitHub, then in Netlify:
**Add new site → Import an existing project** → pick the repo →
build command **empty**, publish directory **`.`** → **Deploy**.

Then **Site configuration → Change site name** to something like `wegro-champions-league`, giving
you `https://wegro-champions-league.netlify.app`. Add a custom domain under
**Domain management** if you want one.

`netlify.toml` already sets security headers and tells browsers never to cache the HTML/JS, so a
score change shows up immediately.

---

## Running the tournament

### Auction day — 28 July, 12:00 PM

Open **Admin → Auction** on a laptop, and put the public site's **Squads** tab on the projector.
Everything you sell appears there within a second.

For each player: pick them in the dropdown (or press **Select** in the pool), pick the winning
team, type the final bid, press **Sell player**. The `Base` / `+1…+5` / `Max` buttons under the
price box match the deck's bidding ladder.

The console refuses any sale that would break the rules, and says why:

- below the base price
- the team cannot afford it
- the team already has its maximum for that position (2, or 1 goalkeeper)
- **the bid would leave the team unable to buy its remaining players at base price** — the max
  legal bid is shown on every captain card
- **the sale would strand another team**

That last guard matters more than it sounds. With 24 players in four squads of six there is
**exactly one legal combination of squad shapes**:

| | Goalkeepers | Defenders | Midfielders | Forwards |
|---|---|---|---|---|
| One team | 1 | 2 | 2 | 1 |
| One team | 1 | 2 | 1 | 2 |
| Two teams | 1 | 1 | 2 | 2 |

Every team gets exactly one of the four goalkeepers. Only **two** teams can end up with two
defenders — so if three teams each buy two, the fourth can never field a legal squad. The console
blocks that sale and tells you which team you were about to strand. Watch the orange note above
the player pool: it warns as soon as a position becomes scarce.

**Jersey colours** (Rule 5) are at the bottom of the Auction tab. The cost comes out of the same
100 BDT budget and is included in every affordability check.

Every sale fires a full-screen **SOLD!** card and confetti on the admin laptop, and the
projector's Squads tab fills in live — budget meters draining as captains spend. The card
clears itself after ~2 seconds; you never have to click it away.

Made a mistake? **Unsell** puts the player back and refunds the exact amount.

### Match day — 1 August, 4:00 PM

**Matches tab.** Set a match to **Live** when it kicks off and **Full-time** when it ends. Only
full-time matches count towards the leaderboard. Type both scores and press **Save score**.

The **Final fills itself in** — once all six group matches are full-time, the top two teams on
the leaderboard drop into it automatically. You never pick the finalists by hand.

**Goals tab.** Log who scored, and the assist if there was one. This is what fills the Top Scorer
and Golden Ball tables on the public site.

The score and the scorer list are kept separate on purpose: during a 16-minute match, getting the
scoreline right matters more than getting every name. If they disagree, the Matches tab shows an
amber warning with both numbers, but it never blocks you.

Awarded a goal for lateness under Rule 4? Use **Add Rule 4 penalty goal** — it counts on the
scoreline without crediting a player.

**Medals.** Top Scorer and Best Goalkeeper are calculated automatically. Golden Ball is your pick
— set it in **Settings**.

---

## Adjusting the rules

**Settings** holds the budget, base price, raise limits, squad size and position limits. Your deck
disagrees with itself on the base price — the headline says 8 BDT, the sentence below says 10 BDT.
It ships as **10 BDT**; change it in Settings before the auction if 8 is correct.

**Danger** has three separate resets: clear scores only, reset the auction only, or wipe
everything. Each needs a typed confirmation.

---

## Files

```
index.html            public site
admin.html            admin console
css/theme.css         brand tokens + shared components  ← all colours live here
css/public.css        public site styling
css/admin.css         admin styling
js/config.js          ← THE ONLY FILE YOU EDIT to go live
js/backend.js         Firebase or demo-localStorage, behind one API
js/data.js            standings, stats and every auction rule (shared)
js/public.js          public rendering
js/admin.js           auth, matches, goals, settings
js/auction.js         auction console
js/charts.js          the charts (plain HTML/CSS bars — no charting library)
js/confetti.js        ~60 lines of canvas, self-cleaning
js/ui.js              small DOM helpers
assets/               logo, crest, captain photos, fonts, social image
database.rules.json   ← paste into Firebase to lock writes
netlify.toml          deploy + security headers
```

Standings, top scorers, clean sheets and every budget number are **calculated from the match and
auction records every time they are shown** — nothing aggregate is stored, so the numbers can
never drift out of sync with the results.

### About the charts

Deliberately **no charting library** — the charts are HTML and CSS bars. That keeps text
crisp at any size, makes them reflow on a phone for free, gives hover and keyboard focus
for nothing, and adds zero kilobytes of dependency. The whole site is ~40 KB of JS.

The colours follow a method rather than taste, and the palette was machine-checked against
this site's card colour (all slots clear 3:1 contrast; worst colour-blind separation ΔE 8.4,
above the 8.0 target):

- **Teams and players have no natural order**, so single-series charts use *one* colour for
  every bar. Colouring bars by their own size would just repeat what bar length already says.
- **Goal difference is the one chart showing polarity**, so it gets a diverging pair —
  blue above the line, red below, with a neutral zero baseline. Green-vs-red is the classic
  colour-blind trap and is avoided on purpose.
- **Every value is printed next to its bar**, so nothing is trapped behind a tooltip. The
  tooltips add detail and work with the keyboard as well as the mouse.

### Motion

All animation is transform- and opacity-only, so it runs on the GPU and never blocks the
scoreboard. Charts animate the first time you open a tab, not on every live score update —
otherwise the page would twitch all evening. A scoreline pulses when it changes. Confetti
is capped, self-cleaning, and stops its animation frame the moment the last piece lands.

Everything respects `prefers-reduced-motion`: if a viewer has that switched on, the
animations and the confetti simply don't run.

### Changing the look

Every colour is a CSS custom property at the top of `css/theme.css`. Change `--wg-green`,
`--wg-orange`, `--bg` and the rest there and both pages follow. The greens and orange are sampled
from `logo.png`; the deep teal, mint and gold come from the tournament deck.

### Running it again next year

Change `DB_PATH` in `js/config.js` from `wegro/cl2026` to `wegro/cl2027`. You get a fresh, empty
tournament under the same Firebase project and the same security rule, with 2026 preserved.

---

## Go-live checklist

Work down this list once. Everything above the line must be done **before the auction**.

**Before 28 July, 12:00 PM — the auction**

- [ ] Firebase project created, Realtime Database enabled, Email/Password turned on
- [ ] The single admin user created; its **UID** pasted into the database rules and published
- [ ] `js/config.js` filled in — the orange demo banner is **gone** on both pages
- [ ] The `Permission denied` test in Step 3 actually returns a denial
- [ ] Signed in as admin and pressed **Load tournament**
- [ ] Base price confirmed as 8 or 10 BDT in **Settings**
- [ ] Site deployed to Netlify and opened on a phone, not just the laptop
- [ ] Laptop charged, and you know the venue wifi password

**Before 1 August, 4:00 PM — match day**

- [ ] Squads look right on the public **Squads** tab
- [ ] Auction closed in **Settings** (stops accidental edits mid-tournament)
- [ ] Kick-off time in **Settings** matches reality, so the countdown is honest
- [ ] Link shared — it previews with the crest in WhatsApp
- [ ] One practice run: set a match Live, save a score, log a goal, then **Clear** it

**During the tournament**

- [ ] Set each match **Live** at kick-off, **Full-time** at the whistle
- [ ] After the 6th group match, check the Final auto-filled with the right two teams
- [ ] Pick the **Golden Ball** in Settings before the medals are handed out

## Troubleshooting

**"Permission denied" when I save as admin.** The UID in your database rules doesn't match the
account you signed in with. Firebase console → Authentication → Users → copy the UID → paste into
the rules → Publish.

**The page is blank and the console says "Failed to resolve module".** You opened `index.html`
directly from disk. Serve it over HTTP (`python -m http.server 8080`).

**Scores don't update on other devices.** Check the orange demo banner isn't showing — in demo
mode nothing leaves the browser. If it isn't showing, confirm `databaseURL` is set in
`js/config.js`.

**The auction console won't let me sell someone.** Read the red message under the price box — it
names the exact rule and, for money problems, the maximum legal bid.

---

Organised by **WeGro** · [wegro.global](https://www.wegro.global/)
