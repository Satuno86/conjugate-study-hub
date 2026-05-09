# Conjugate Method Study Hub — Developer Handoff

**Version:** Post-swarm audit + login gate + magic link audit  
**Status:** ~97% production-ready  
**Prepared for:** Anna  
**Audit date:** 2026-05-09

---

## What This App Is

A Progressive Web App (PWA) for studying the Westside Barbell Conjugate Method — used for strength coach certification prep. Single-file architecture (one `index.html`, no build step, no external frameworks).

**Live features:**
- 105 questions across 10 sections (83 MC, 18 TF, 4 scenario)
- 8 study modes: Flashcards, Custom Quiz, Full Practice Test, Review Missed, Drill Weakest, Dashboard, Feedback, Lab
- 12 achievement badges with toast notifications
- Cross-device sync via base64-encoded JSON codes
- Dark mode, offline support (Service Worker v8), PWA installable

---

## Dev Setup

```bash
# Serve locally
python -m http.server 3000
# → http://localhost:3000

# Run Playwright tests
npm install
npx playwright install chromium
npm test
```

No build step. Edit `index.html` directly and reload.

---

## File Structure

```
index.html          Main app (everything: HTML + CSS + JS, ~4200 lines with JSDoc)
sw.js               Service Worker v8 (network-first HTML, cache-first assets)
manifest.json       PWA manifest (standalone, dark theme #1a1a2e)
icons/              PNG + SVG icons for PWA install
tests/app.spec.js   82 Playwright tests across 12 test groups
playwright.config.js Playwright configuration (Chromium + Mobile Chrome)
package.json        npm scripts for test runner
```

---

## Module Map

| Module | Lines (approx) | localStorage Key | Purpose |
|--------|---------------|-----------------|---------|
| `Store` | 1175–1289 | `conjugate_study_data` | Central state manager — all quiz data, streaks, badges |
| `BADGES` | 1010–1023 | via Store | 12 achievements with check functions |
| `FC` | 1433–1552 | — | Flashcard flip study |
| `QZ` | 1553–1914 | — | Custom quiz builder (section filter, focus modes, timer) |
| `FT` | 1918–2209 | — | Full 105-question practice test |
| `RV` | 2210–2343 | — | Review missed questions only |
| `DASH` | 2344–2812 | — | Analytics: scores, streaks, badges, heatmap, section health |
| `SV` | 2813–2935 | `conjugate_feedback_log` | Feedback survey + GitHub issue link |
| `LAB` | 2936–3437 | `conjugate_lab_data` `conjugate_lab_audit` | 5 WIP tool wireframes + feedback/star ratings |
| `SYNC` | 3438–3759 | `conjugate_sync_user` | Cross-device sync via base64 codes |
| `initApp` | 3760–3812 | — | Event wiring + service worker + stats init |

### Data Flow
```
QUESTIONS/SECTIONS/BADGES ──► FC, QZ, FT, RV (read-only)
FC / QZ / FT / RV ──────────► Store (write: miss, correct, session)
Store ───────────────────────► DASH (read all stats)
Store + LAB ─────────────────► SYNC (exported together)
SYNC ────────────────────────► Store (import: DESTRUCTIVE replace, no merge)
SV ──────────────────────────► conjugate_feedback_log (separate, NOT synced)
```

---

## Store Data Schema

```javascript
// localStorage key: 'conjugate_study_data'
{
  darkMode: false,
  missedQuestions: { [questionId]: missCount },  // removed when count reaches 0
  flaggedQuestions: { [questionId]: isoTimestamp },
  quizHistory: [                                 // trimmed to last 50 entries
    { date, score, total, mode, section, timeSeconds }
  ],
  studyStreak: { current, longest, lastDate },   // lastDate is YYYY-MM-DD local
  totalSessions: 0,
  _earnedBadges: []                              // cached list of earned badge IDs
}
```

---

## How to Add Questions

Questions live at lines ~876–995 in `index.html` inside the `QUESTIONS` array.

Each question:
```javascript
// Multiple choice
{ id: 106, s: 1, type: 'mc', q: "Question text?", opts: ["A","B","C","D"], ans: 2, exp: "Explanation." }
//  ^ unique int  ^ section 1-10             ^ answer index 0-3

// True/False
{ id: 107, s: 2, type: 'tf', q: "Statement.", ans: true, exp: "Explanation." }

// Scenario (self-assessed, not auto-graded)
{ id: 108, s: 8, type: 'scenario', q: "Design a program...", ans: 'sa', exp: "Sample answer." }
```

Rules:
- `id` must be unique integer (increment from highest existing)
- `s` is section number 1–10
- `exp` is required (shown after answering)
- After adding questions, bump SW cache version in `sw.js`: `CACHE_VERSION = 'v9'`

---

## How to Add Badges

Badges live at lines ~1010–1023 in `index.html`.

```javascript
{
  id: 'my_badge',
  name: 'Badge Name',
  icon: '🏅',
  desc: 'Short description shown in dashboard',
  check: function(data) {
    // data = Store.get() result
    return data.totalSessions >= 10; // your condition
  }
}
```

The `check()` function receives the full Store data object. It runs on every session completion via `checkNewBadges()`. Make it fast and pure.

---

## How to Deploy

1. **Static host** (Vercel, Netlify, GitHub Pages, Render) — just serve the root directory
2. **Required files:** `index.html`, `sw.js`, `manifest.json`, `icons/`
3. **HTTPS required** for service worker and PWA install prompt
4. **After updating `index.html`:** bump `CACHE_VERSION` in `sw.js` (e.g., `v8` → `v9`) to force cache refresh on all devices

**Deployment checklist:**
- [ ] All questions have unique IDs
- [ ] `sw.js` CACHE_VERSION bumped if content changed
- [ ] `manifest.json` icons resolve correctly
- [ ] App loads at root URL without errors (check browser console)
- [ ] Service worker registers (check DevTools > Application > Service Workers)
- [ ] Sync link generation works (test export + import on two devices)
- [ ] Dark mode persists on reload
- [ ] PWA installs from Chrome/Safari (check "Add to Home Screen")

---

## Known Issues & Technical Debt

### Bugs (fix before shipping)

| Severity | Issue | Location | Fix |
|----------|-------|----------|-----|
| HIGH | `_earnedBadges` not initialized in `Store._default()` — first run shows false-positive badge toasts for users with existing data | `index.html` ~line 1186 | Add `_earnedBadges: []` to `_default()` return object |
| HIGH | `SV.renderHistory()` — `JSON.parse()` has no try/catch — corrupted `conjugate_feedback_log` crashes the Survey page | ~line 2915 | Wrap in `try { ... } catch(e) { return; }` |
| HIGH | `initApp()` — no null-guards on `getElementById` calls — one missing DOM element breaks all subsequent event listener registrations | ~line 3764 | Add null check before each `addEventListener` call |
| MEDIUM | `SV` feedback log grows unbounded — no trim applied | ~line 2875 | Add `if (log.length > 500) log = log.slice(-500);` after push |
| MEDIUM | `toggleFlag()` returns stale `true` if `writeJSON()` fails (quota exceeded) — UI updates but data not persisted | ~line 1273 | Check `writeJSON()` return value before returning true |
| MEDIUM | Streak display shows stale value — `studyStreak.current` is not recalculated on page load, only on `recordSession()` — user sees "1 day streak" even if last study was a week ago | `updateStatsBar` | Recalculate streak currency on page load or display `longest` instead |
| LOW | Average score is equal-weighted — a 1/10 session (10%) weighs the same as 100/100 (100%) | `updateStatsBar` ~line 1301 | Optionally use `totalCorrect / totalQuestions` across all history |

### Gaps / Design Decisions (document, don't necessarily fix)

| Issue | Notes |
|-------|-------|
| SYNC import is fully destructive | No merge; completely replaces local data. User warned in confirm dialog, but no undo. |
| All 5 LAB tools are wireframe SVGs only | No interactive calculators yet. The wireframes preview the intended UX well. |
| `Drill Weakest` button requires section-specific quiz history | The button stays hidden unless the user has run a quiz filtered to a specific section. Missed questions from Full Test (which records `section: 'all'`) don't trigger it. |
| DASH with 0 sessions shows early state without badge grid | Intentional but may confuse users who expect to see locked badges immediately. |
| `DASH.sectionBreakdownHTML()` — bar fill shows "untouched %" but label shows "missed count" | Slightly confusing: a full green bar means few misses, but the label reads "X missed". Consider relabeling. |
| Firebase email quota (⚠️ action required) | Spark (free) plan allows **100 email sign-in links per day** across the whole project. Hitting the limit returns `auth/quota-exceeded` and blocks all new sign-ins until midnight Pacific. See Firebase section below for the fix. |
| Firebase Dynamic Links deprecation (no action needed) | Firebase console shows a warning about Dynamic Links shutting down — this only affects **mobile app** email links. Our web flow uses `firebaseapp.com/__/auth/action` which is unaffected. |
| Google OAuth hidden | Google sign-in methods are in the code but not surfaced in the UI. Magic link is the only visible auth path. |
| No keyboard shortcuts | Accessibility gap — no keyboard navigation beyond tab/enter for buttons. |
| No `beforeunload` listener | Data saves synchronously on each interaction, so this is fine in practice. |
| `FT` scenario questions not auto-graded | By design — shown with textarea, marked "skipped" in scoring. Self-assessment only. |

---

## Firebase Auth — Setup & Quota Fix

### Project
- **Project ID:** `conjugate-method-study`
- **Owner:** Auston (auston@tab3r.com)
- **Console:** https://console.firebase.google.com/project/conjugate-method-study
- **Plan:** Spark (free) — **quota risk for production use**

### How the magic link flow works
1. User enters email on the login screen → app calls `LAB.sendMagicLink()`
2. Firebase sends an email from `noreply@conjugate-method-study.firebaseapp.com`
3. User clicks "Sign in to conjugate-method-study" link in the email
4. Firebase redirects to `https://conjugate-method-study.firebaseapp.com/__/auth/action?...`
5. Firebase redirects to `http://[your-domain]/?apiKey=...&oobCode=...&mode=signIn`
6. App's `checkMagicLinkReturn()` detects these URL params, calls `signInWithEmailLink()`
7. `onAuthStateChanged` fires → `showAppAuth(user)` → app unlocks

### ⚠️ Quota limit (fix before real users)

| Plan | Daily email limit | Cost |
|------|-----------------|------|
| Spark (current) | **100 emails/day** per project — resets midnight Pacific | Free |
| Blaze (pay-as-you-go) | 10,000/month free, then $0.0012 per email | ~$0 for small apps |

**Tested and confirmed:** 5 sends succeeded, 6th returned `auth/quota-exceeded`. The quota is shared across all users — if 100 people try to sign in on the same day, later users are blocked.

### Fix option 1: Upgrade to Blaze (recommended, ~free)
1. Go to https://console.firebase.google.com/project/conjugate-method-study/usage/details
2. Click **Upgrade** → select **Blaze** → add a billing account
3. Set a **budget alert** at $1/month — you'll get an email if costs spike
4. 10,000 email sign-ins/month costs nothing. At $0.0012/email you'd need 833 sign-ins/day before paying a cent.

### Fix option 2: Custom SMTP (no Firebase billing needed)
Configure Firebase Auth to send through your own email provider (SendGrid, Mailgun, Postmark, etc.). Free tiers on those services are generous (SendGrid: 100 emails/day free, Mailgun: 1,000/month free).

Steps:
1. In Firebase Console → Authentication → Templates → click the pencil on "Email link" template
2. At the bottom, click **"Customize action URL"** and set your own SMTP settings
3. Or use **Firebase Extensions** → "Trigger Email" extension with your SMTP credentials

### Authorized domains
The magic link's `continueUrl` must be in Firebase's authorized domain list:
- `localhost` — already authorized (for dev)
- Your production domain (e.g. `conjugate-study-hub.vercel.app`) — **must be added manually**

To add: Firebase Console → Authentication → Settings → Authorized domains → Add domain

### Config location in code
`index.html` — search for `_FIREBASE_CONFIG` (~line 3182). The `apiKey` is a **public identifier** (safe to commit — it scopes API calls to your project, not a secret).

---

## Test Coverage

82 Playwright tests in `tests/app.spec.js` covering:

- App Shell (load, dark mode, stats bar, service worker)
- Flashcards (flip, mark, results)
- Custom Quiz (setup, filter chips, slider, answer logic, timer, results)
- Full Test (structure, scoring, section breakdown, reset)
- Review Missed (pool construction, answer, completion)
- Dashboard (SVG charts, badges, section health, diagrams)
- SYNC (modal, round-trip encode/decode, import confirm)
- Badges (first_rep, pr_day, passing, streak_3)
- Survey (submit, localStorage, history)
- LAB (expand, star rating, comment, idea)
- Store persistence
- Responsive layout

Run: `npm install && npx playwright install chromium && npm test`

---

## JSDoc Coverage

All key objects have JSDoc block comments in `index.html`:
`BADGES`, `getEarnedBadges`, `checkNewBadges`, `fireConfetti`, `animateCount`, `Store`, `updateStatsBar`, `FC`, `QZ`, `FT`, `RV`, `DASH`, `SV`, `LAB`, `SYNC`, `initApp`

Plus a file-level module map comment at the top of the `<script>` block.

---

## Architecture Decisions Worth Knowing

- **Single-file app** — no build pipeline is intentional. Easy to deploy, inspect, and modify without toolchain setup.
- **Vanilla JS** — no React/Vue/etc. State is module-scoped variables + localStorage. `Store.save()` is synchronous.
- **localStorage only** — no backend, no user accounts. SYNC codes are the sharing mechanism.
- **Service Worker v8** — network-first for HTML (fast updates), cache-first for static assets. Bump version number to force cache refresh.
- **Streak uses local date** (not UTC) — avoids midnight-timezone issues. `localDateStr()` at ~line 1337.
- **quizHistory trimmed to 50 entries** — prevents unbounded localStorage growth.
- **Question IDs are stable integers** — `missedQuestions` and `flaggedQuestions` use these as keys. Don't re-use or reorder IDs.
