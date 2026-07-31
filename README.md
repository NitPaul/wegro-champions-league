# WeGro Champions League 2026

Live scores, standings, squads and a full auction console for the WeGro Champions League —
**Saturday 1 August 2026, ChattoTurf, Bashundhara**.

Fixtures, squads, rules and auction settings follow the *Updated WeGro Champions League 2026*
deck: 4 teams, a single round robin, then the top two meet in the Final.

- **Everyone** opens the site and watches scores update live. They cannot change anything.
- **One admin** signs in and controls the auction, the scores and the medals.

Static HTML/CSS/JavaScript. No build step, no dependencies to install, no framework.
The only external requests are the Firebase SDK and the venue map — fonts, styles and every
script are served from the site itself, so it still renders on bad venue wifi. The map sits in a
lazy-loaded iframe, so if it can't load, the scoreboard is unaffected and the "Open in Google
Maps" button still works.

**What's on it**

| Tab | What people see |
|---|---|
| Overview | The four captains, countdown to kick-off, venue map, live match with a running clock, leaderboard |
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

Sign-in is **Google**, so there is no admin password to set, leak or forget, and it inherits
whatever two-factor auth is already on your Google account.

1. Go to <https://console.firebase.google.com> and sign in with your WeGro Google account.
2. **Add project** → name it `wegro-champions-league` → you can turn Google Analytics off →
   **Create project**.
3. Left sidebar → **Build → Realtime Database** → **Create Database** →
   choose the **Singapore (asia-southeast1)** location → start in **locked mode** → **Enable**.
   *(Do this before step 5 — otherwise Firebase leaves `databaseURL` out of the config snippet.)*
4. Left sidebar → **Build → Authentication** → **Get started** → **Google** → enable it, pick a
   support email → **Save**. Optionally also enable **Email/Password** for a shared admin account
   — see *Adding a second admin* below, and use a different address from your Google one.
5. Back to **Project Overview** → click the **web icon `</>`** → nickname `wegro-cl` → leave
   "Also set up Firebase Hosting" unchecked → **Register app**. Copy the `firebaseConfig` block.

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

### Step 3 — find your UID, then lock everything to it

You cannot know your Google UID until you have signed in once, so the panel tells you.

1. Open `admin.html` and press **Sign in with Google**.
2. A gold **"One step left — lock this panel"** card appears at the top with your UID and a
   **Copy** button.
3. Paste that UID into **two** places:
   - `js/config.js` → `ADMIN_UIDS = ["your-uid-here"]`
   - `database.rules.json` → replace `PASTE_YOUR_ADMIN_UID_HERE`
4. In the Firebase console: **Realtime Database → Rules** → paste the whole contents of
   `database.rules.json` → **Publish**.
5. Redeploy (`git push`). The gold card disappears — the panel is now locked to you alone.

Until step 3 is done, any Google account can *open* the admin screen, but every change it tries
to save is rejected by the database. After step 3 they don't even get the screen.

That rule says: *anyone may read, only this one account may write.* It is enforced by Google's
servers, so it holds even if someone opens devtools and calls the database directly.

**Why there are no `.validate` rules.** An earlier draft type-checked scores, statuses and prices.
They were dropped deliberately: only one trusted account can write at all, so they added almost no
protection — while every one of them was a way for a legitimate write to fail at 6pm on match day
for a reason that takes ten minutes to diagnose at a turf. Fewer moving parts wins.

**Verify it works** — open the public site in a private window, open the browser console and run:

```js
await fetch("https://YOUR-DB.asia-southeast1.firebasedatabase.app/wegro/cl2026/matches/m1.json", {
  method: "PATCH", body: JSON.stringify({ homeScore: 99 })
}).then(r => r.text());
```

It must return a **`Permission denied`** error. If it returns `null` or the data, the rules did
not publish — go back and fix that before match day.

### Step 4 — load the tournament

Open `admin.html`, sign in with Google, and press **Load tournament**. That writes the four
teams, the 25-player auction pool, the six round-robin fixtures and the Final — plus the chairman
as a [special player](#special-players), unassigned until someone puts him in a team.

---

## Step 5 — deploy to Netlify

**The quick way** — go to <https://app.netlify.com/drop> and drag this whole folder onto the page.
Done, you get a URL immediately.

**The maintainable way** — push the folder to GitHub, then in Netlify:
**Add new site → Import an existing project** → pick the repo →
build command **empty**, publish directory **`.`** → **Deploy**.

### ⚠ Then allow-list the domain, or Google sign-in breaks in production

Firebase trusts `localhost` out of the box but **not** your Netlify address. Until you add it,
sign-in works locally and fails on the live site.

Firebase console → **Authentication → Settings → Authorized domains → Add domain** →
`wegro-champions-league.netlify.app` (and your custom domain, if you add one).

If you skip it, the login screen says so in plain English rather than failing silently.

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

That last guard matters more than it sounds. The pool is 25 players and the four squads hold
24, so the shape is very nearly forced:

| | Goalkeepers | Defenders | Midfielders | Forwards |
|---|---|---|---|---|
| Every team | 1 | 1–2 | **2** | 1–2 |

Every team gets exactly one of the four goalkeepers, and — because there are eight midfielders
and only eight midfield slots — **exactly two midfielders**. The remaining three places are split
1–2 or 2–1 between defenders and forwards. Only two teams can end up with two defenders, so if
three teams each buy two, the fourth can never field a legal squad. The console blocks that sale
and tells you which team you were about to strand. Watch the orange note above the player pool: it
warns as soon as a position becomes scarce.

**If the pool is larger than the squads, someone goes unsold** — 25 players into 24 places leaves
one out, and it would be a defender or a forward (midfielders and goalkeepers are all forced in).
That is arithmetic, not a bug, so the console does not treat the last unsold player as an error.
The alternative is to let one squad carry the extra body: give that team a **squad size of 7** in
*Settings → Teams & captains*, which is what LEGACY runs. Its counter then reads 7/7 rather than a
permanent 7/6, with a red **+1 extra** badge so the difference stays visible.

**Jersey colours** (Rule 5) are at the bottom of the Auction tab. The cost comes out of the same
100 BDT budget and is included in every affordability check.

### Special players

Some people are not part of the auction at all — the chairman, for instance, who may or may not
turn up on the day, or a guest who walks in ten minutes before kick-off. They live in
**Auction → Special players**: set the name and position, pick a team from the dropdown (or
*— not playing —*), press **Save**. That is the whole flow, and it works at any point, including
during a match.

**A guest arrived?** Type their name in *A guest turned up?* at the top of that card, choose a
position and a team, and press **Add player** (or just hit Enter). They are on the pitch
immediately: the referee console lists them alongside the squad on the very next repaint, and the
public Squads tab shows them within about a second. You can add as many as you need.

Two small guards, both there for the referee's sake:

- **No two players may share a name.** The referee picks a scorer from a list of names, so a second
  "Rahim" means goals landing on whichever one happens to be first. Add a surname or an initial.
- **Remove only works while they have no history.** Once a guest appears anywhere in the match log
  — a goal, an assist, a save, anything — the **Remove** button disappears, because deleting them
  would leave those events pointing at nobody and a goal would sit on the scoreboard with no
  scorer. Set them to *— not playing —* instead; that takes them off the team and keeps the record
  intact.

A special player is deliberately outside every rule:

- **free** — never touches a captain's 100 BDT
- **takes no squad slot** — a full 6/6 squad stays 6/6, and no red *+extra* badge appears
- **counts against no position limit** — a team already holding two forwards can still take one
- **invisible to the auction** — not biddable, not in the pool, not counted in "25 of 25 sold"

So adding one can never make a legal squad illegal, and removing one can never break it either.
They appear in their own gold-dashed row at the foot of the squad on the public **Squads** tab,
marked `special` and priced `free`; while unassigned they are listed in a separate *Special
players* card so everyone can see they might still show up. They can be picked as a scorer or
assister in the Goals tab like anyone else, but they are never credited with a clean sheet — that
always goes to the squad's auction goalkeeper.

Every sale fires a full-screen **SOLD!** card and confetti on the admin laptop, and the
projector's Squads tab fills in live — budget meters draining as captains spend. The card
clears itself after ~2 seconds; you never have to click it away.

Made a mistake? **Unsell** puts the player back and refunds the exact amount.

### Match day — 1 August, 4:00 PM

**Use the ▶ Match day tab.** It is built so you look at one screen for the whole match and never
go hunting for a tab.

Pick the match, press **Kick off**, and the clock runs — two 8-minute halves with a 2-minute
break, exactly as Rule 1 says. It counts up and holds at `08:00`, showing stoppage separately
(`08:00 +1:23`) like a real football clock. **+1 min stoppage**, **Pause** and **Reset** are all
one tap, and **Add extra time** appears at full-time if the Final needs it.

Under the clock is the **logging pad**: one column per team, so a thumb never has to work out
which side a button belongs to. The referee's own instructions live in a collapsible
**📋 Referee — how to use this screen** panel at the top of the tab, together with the live points
table — so whoever is holding the phone has the whole brief on the same screen, with no separate
sheet to lose.

**A goal is four taps.** **GOAL** under the scoring team → **who scored** → **where on the pitch**
→ **who assisted**.

The important part is that *the scoreline is never held hostage*. The goal is written on the
**first** tap, together with the scorer, in a single write — so the two can never drift apart, and
a referee who gets pulled back into the match can press **Close** and still have a correct score.
The last two questions are pure enrichment and both have a **Skip**.

Step 2 is a **pitch diagram**, not a dropdown: the goal mouth at the top, the box on the row
beneath it, wings and long range below that, plus a **Penalty spot** cell that records the goal as
a penalty as well as a location. Step 3 lists the squad minus the scorer, because nobody assists
their own goal.

Didn't catch the scorer? Tap **Not sure**; the goal still counts and an **Add scorer** button waits
for you in the match log. There's an **Own goal** button too, which skips both follow-ups.

**Was it a critical goal?** The "where from" screen carries a **☆ Critical goal** switch — for the
opener, an equaliser, a winner, or anything in the Final. It is worth a bonus on top of the goal
(+3 by default). It is a *switch, not a step*: tapping it saves immediately and leaves the referee
exactly where they were, and it can be turned on or off later from the match log. So a judgement
call that deserves a moment's thought never has to be made in the two seconds after the ball
crosses the line — and it can never affect the scoreline, because the goal is already saved by the
time the switch appears.

**A save is one tap.** Press **SAVE** under the defending team — a squad has exactly one
goalkeeper, so there is nothing to disambiguate, and the keeper's name is printed on the button.
Saves happen constantly; making them a single tap is the difference between a log that gets kept
and one that gets abandoned by half-time.

**The other three are two taps each** — press the button, then the player:

| Button | What it means | Who is listed first |
|---|---|---|
| 🛡 **CLEARANCE** | a ball hacked off the line or out of the box | defenders |
| 🎯 **SHOT** | a shot **on target** that did not go in — saved, or off the frame | forwards, then midfielders |
| 🔑 **CHANCE** | the pass that should have been a goal but was not converted | midfielders, then forwards |

Sorting the likely candidates to the front is not cosmetic — it is what keeps a two-tap action at
two taps instead of a scan through the whole squad.

Under each team's buttons is a running count of all five actions — `⚽ 2 🧤 3 🛡 1 🎯 4 🔑 1` — with
anything still on zero dimmed, so what has actually happened this match reads at a glance.
Everything appears in the **Match log** at the bottom, newest first, with a **Remove** on every row
and a **☆ Critical** toggle on every goal. Removing a goal also takes it off the scoreline;
removing a save, shot or chance leaves the score alone.

Ending a period with **⏭** moves you on; ending the second half sets full-time, which is what
makes the result count towards the leaderboard.

**The clock is shared.** Everyone watching the public site sees the same running time on the live
match, ticking in real time — the database stores when the clock started rather than a ticking
number, so a whole match costs a handful of writes. Viewers' own device clocks are corrected
against Firebase's server time, so a phone set to the wrong time still shows the right match time.

**All matches tab** is the fallback: type scorelines directly for any match, fix a result after
the fact, or set a status by hand.

The **Final fills itself in** — once all six group matches are full-time, the top two teams on
the leaderboard drop into it automatically. You never pick the finalists by hand.

**Goals tab.** The slower fallback for the same job — pick a match, team, scorer and assist from
dropdowns. Use it to fix something after the fact; on the day, the Match day pad is faster.

The score and the scorer list are kept separate on purpose: during a 16-minute match, getting the
scoreline right matters more than getting every name. If they disagree, the Matches tab shows an
amber warning with both numbers, but it never blocks you.

Awarded a goal for lateness under Rule 4? Use **Add Rule 4 penalty goal** — it counts on the
scoreline without crediting a player.

### The four medals, and how the points work

Every action the referee logs is worth points, and **one table drives all four medals**. The
weights are editable in **Settings → Award points**, and they are published on the public Stats
tab, so a player can add up their own row from the match log and get the same answer the site
shows.

| Action | Points |
|---|---|
| Goal | **+5** |
| Critical goal — *bonus on top of the goal* | **+3** |
| Assist | **+3** |
| Chance created | **+2** |
| Shot on target | **+1** |
| Save | **+2** |
| Clearance | **+1** |
| Clean sheet — goalkeeper | **+5** |
| Clean sheet — defender | **+3** |
| Own goal | **−3** |
| Goal conceded — goalkeeper | **−1** |

| Medal | Who is eligible | Ranked on |
|---|---|---|
| 🏅 **Golden Ball** | everyone | total points |
| 👟 **Golden Boot** | everyone | goals only |
| 🧤 **Golden Glove** | goalkeepers | total points |
| 🛡 **Best Defender** | defenders | total points |

Four deliberate choices behind those numbers:

**The unglamorous jobs are paid well.** A keeper who makes eight saves behind a beaten defence
scores 16 and out-ranks a striker who taps in three for 15. That is the point — Golden Ball has to
be winnable from any position, or it is just the Golden Boot with a longer name. Saves are worth
double a clearance because a save is a goal prevented, while a clearance is a situation defused.

**A clean sheet belongs to the whole back line**, not just the keeper, so defenders get 3 for one
too. The keeper carries the risk as well: every goal conceded costs 1, which separates a keeper who
was genuinely untroubled from one who let in four and made a lot of saves doing it.

**The near misses are paid one step below the thing they nearly were.** A chance created is an
assist the striker wasted, so it earns 2 against the assist's 3; a shot on target is a goal the
keeper stopped, so it earns 1. Both are deliberately cheap, because they happen far more often than
goals — a big number there would drown out everything else. They are also the reason a midfielder
who creates all evening without a single goal or assist can still finish near the top.

**A critical goal is a bonus, not a replacement.** Mark one and it is worth 5 + 3 = 8, so the goal
that settles a match matters more than the fourth in a rout — without letting one moment outweigh a
keeper's entire evening. It stays visible as its own **★** column in the published ledger, so the
bonus is never hidden inside a total nobody can reproduce.

Golden Boot stays a pure goal count, because that is the one award whose name promises exactly one
thing. Ties are stated on the card rather than silently broken.

**Every medal can be re-assigned by hand.** **Settings → Who gets each medal** has one dropdown per
award. Leave a medal on *use the match log* and it updates itself all evening. Name a player instead
and that decision wins — a referee, or management afterwards, may see something a points table
cannot, or may simply decide the award belongs to someone else. Each dropdown shows who currently
holds the medal, so overruling it is an informed decision rather than a blind one, and the public
card then reads *organisers' pick* so nobody thinks the maths went wrong. You can change any of them
at any time, before or after the presentation.

Nothing is awarded until something has actually been logged, so the cards read **To be decided**
before kick-off rather than crowning whoever happens to sort first.

---

## Adding a second admin

More than one person can run the tournament — a backup in case you're unavailable, or a colleague
working the scoreboard while you referee. There's no limit.

There are two ways in, and the login screen offers both:

| | Best for |
|---|---|
| **Sign in with Google** | You. No password exists to leak or forget, and it inherits your Google 2FA. |
| **Email + password** | A shared "tournament account" you can hand to someone else, no Google account needed. |

### Setting up the shared email account

In Firebase: **Authentication → Sign-in method → Email/Password → Enable**, then
**Users → Add user** with the address and password you intend to share.

**Use an address that is not any admin's Google address.** Firebase keeps one account per email,
so the same address on both providers collides with `auth/account-exists-with-different-credential`.
A dedicated address like `tournament@…` avoids it entirely.

Then add that account's UID to `ADMIN_UIDS` and re-publish the rules (steps 2–4 below).

Worth knowing about a shared password: everyone using it shows up as the same person, so the
tournament can't tell who changed what, and taking access away from one person means changing the
password for everybody. For a scoreboard that's a fine trade — just make it a deliberate one.

### Adding anyone (either method)

1. **They sign in.** Send them the admin URL. They'll be refused — which is correct — but the
   refusal screen shows **their own ID** with a Copy button. They send you that.
2. **Add them to the list.** In `js/config.js`:
   ```js
   export const ADMIN_UIDS = ["your-uid", "their-uid"];
   ```
3. **Regenerate the rules** so the database agrees with the app:
   ```bash
   node tools/make-rules.mjs
   ```
   That rewrites `database.rules.json` and prints the block to paste into
   **Realtime Database → Rules → Publish**.
4. **Deploy** (`git push`). They can now sign in.

Always use the generator rather than hand-editing the rules. Two places have to agree on who the
admin is, and when they drift you get the confusing failure where the panel opens but nothing
saves.

To remove someone, delete their UID from `ADMIN_UIDS`, re-run the generator, re-publish, redeploy.
They lose access immediately — the database stops accepting their writes the moment you publish,
even before the site redeploys.

---

## Adjusting the rules

**Settings** holds the budget, base price, raise limits, squad size and position limits. These
ship set to the deck: 100 BDT budget, **8 BDT base price**, 1–5 BDT raises, 6 players per squad,
1 minimum and 2 maximum per position (goalkeepers capped at 1).

**Danger** has three separate resets: clear scores only, reset the auction only, or wipe
everything. Each needs a typed confirmation.

## Backup & restore

**Danger → Download backup** saves the whole tournament — teams, squads and prices, fixtures,
scores and goals — as a single JSON file.

**Restore from a file** puts it all back. It checks the file is really a tournament before
touching anything, and shows you what it contains next to what it's about to replace, so a
restore is never a blind leap.

Worth doing twice: **right after the auction** (that's the hour of work you least want to redo)
and **before kick-off**. If anything goes wrong mid-tournament you're one file away from where
you were.

## Why the match clock is server-stamped

The clock stores *when it started* rather than a ticking number — and that start time is written
by **Firebase's servers**, not by the admin's laptop.

This matters more than it sounds. Writing the device's own time while reading against server time
means the clock opens at whatever your machine's clock drift happens to be: a laptop running a
minute slow started every match at `01:00`. Since the timestamp now comes from the server, the
clock reads the same on the admin laptop and on every phone watching, no matter how wrong any of
those devices' clocks are.

## Link previews

Sharing the link in WhatsApp, Messenger, Facebook, Slack or X shows the crest, the four captains,
the date and the venue.

Those tags live in the `<head>` of `index.html` and **must use absolute URLs** — WhatsApp and
Facebook will not resolve a relative `og:image`, which is the usual reason a shared link appears
as bare text. If you move to a different domain, change the four absolute URLs at the top of
`index.html`; nothing else needs touching.

Previews are cached hard. After deploying, paste the URL into
[Facebook's Sharing Debugger](https://developers.facebook.com/tools/debug/) and press
**Scrape Again** to force WhatsApp and Messenger to re-read it.

Two messages that debugger shows are **not** problems:

- **"This URL hasn't been shared on Facebook before."** It just means there's no cached data yet.
  Press **Debug** and it fetches the page. Sometimes the first press returns a partial result —
  press again.
- **"Missing properties: fb:app_id."** That tag only associates the page with a Facebook App so
  share counts appear in Facebook Insights. It plays no part in rendering a preview. There's a
  commented-out slot for it in `index.html` if you ever create an app.

The check that actually matters is sending the link to yourself on WhatsApp and seeing the card.

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
js/live.js            match-day console: clock, one-tap goals, scorer picker
js/charts.js          the charts (plain HTML/CSS bars — no charting library)
js/confetti.js        ~60 lines of canvas, self-cleaning
js/ui.js              small DOM helpers
assets/               logo, crest, captain photos, fonts, social image
database.rules.json   ← paste into Firebase to lock writes
tools/make-rules.mjs  regenerates the rules from ADMIN_UIDS
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
- **Goals by pitch zone is magnitude over a map**, so it is sequential: one hue (mint) stepped
  light to dark, never a rainbow, laid out exactly like the referee's picker.
- **The two stacked charts** (saves vs clearances, chances vs shots) are the only two-series
  ones, so they are the only ones with a legend — and every segment is labelled too, so
  identity never rides on colour alone. They share one blue/gold pair rather than spending four
  hues on four series: each chart is read against its own legend, not against the other chart.
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

- [ ] Firebase project created, Realtime Database enabled, **Google** sign-in turned on
- [ ] `js/config.js` filled in — the orange demo banner is **gone** on both pages
- [ ] Signed in once, UID pasted into `ADMIN_UIDS` **and** `database.rules.json`, rules published
- [ ] The gold "one step left" card is gone from the admin panel
- [ ] Netlify domain added under **Authentication → Settings → Authorized domains**
- [ ] The four absolute URLs in `index.html` match the real domain, and the link previews
      correctly in a WhatsApp message to yourself
- [ ] Signed out and tried the admin page in a private window — you get the login screen
- [ ] The `Permission denied` test in Step 3 actually returns a denial
- [ ] Signed in as admin and pressed **Load tournament**
- [ ] Fixtures on the public site match the deck (M4 A–D, M5 B–D, M6 B–C)
- [ ] Site deployed to Netlify and opened on a phone, not just the laptop
- [ ] Laptop charged, and you know the venue wifi password

**Before 1 August, 4:00 PM — match day**

- [ ] **Download a backup** the moment the auction finishes
- [ ] Squads look right on the public **Squads** tab
- [ ] Auction closed in **Settings** (stops accidental edits mid-tournament)
- [ ] Kick-off time in **Settings** matches reality, so the countdown is honest
- [ ] Link shared — it previews with the crest in WhatsApp
- [ ] One practice run: set a match Live, save a score, log a goal, then **Clear** it
- [ ] Two minutes with the referee on a real phone: log one of each — goal, critical goal, save,
      clearance, shot, chance — then remove them all again

**During the tournament**

- [ ] Hand the referee the phone on **▶ Match day** and open the 📋 guide with them once
- [ ] Run every match from that tab — kick off, GOAL / SAVE / CLEARANCE / SHOT / CHANCE, end the half
- [ ] After the 6th group match, check the Final auto-filled with the right two teams
- [ ] Before the medals are handed out, open **Settings → Who gets each medal** and either leave all
      four on *use the match log* or name the winners yourself

## Troubleshooting

**"Permission denied" when I save as admin.** The UID in your database rules doesn't match the
Google account you signed in with. Firebase console → Authentication → Users → copy the UID →
paste it into `database.rules.json` → Publish. It must also be in `ADMIN_UIDS`.

**Google sign-in works locally but not on the live site.** The Netlify domain isn't on the
Firebase allow-list — see the ⚠ box in Step 5.

**"This browser blocked the popup."** Allow popups for the site, or sign in from a normal window
rather than an incognito one with strict blocking.

**A colleague can open the admin panel.** `ADMIN_UIDS` in `js/config.js` is still empty, so the
panel is in bootstrap mode. Their changes are still rejected by the database — but finish Step 3
to take the screen away too.

**The page is blank and the console says "Failed to resolve module".** You opened `index.html`
directly from disk. Serve it over HTTP (`python -m http.server 8080`).

**Scores don't update on other devices.** Check the orange demo banner isn't showing — in demo
mode nothing leaves the browser. If it isn't showing, confirm `databaseURL` is set in
`js/config.js`.

**The auction console won't let me sell someone.** Read the red message under the price box — it
names the exact rule and, for money problems, the maximum legal bid.

---

Organised by **WeGro** · [wegro.global](https://www.wegro.global/)
Developed by [NitPaul](https://github.com/NitPaul)
