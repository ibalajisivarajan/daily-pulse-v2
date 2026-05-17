# Daily Pulse — Test Plan

82 test cases · 10 sections · Updated: 2026-05-17

---

## Section 1: App Load (8)

| # | Test Case | Expected Result | Pass | Fail |
|---|-----------|-----------------|------|------|
| 1 | Open index.html with a local server | No JavaScript errors in console | ☐ | ☐ |
| 2 | First card renders immediately after stories load | Card 1 is visible on screen without scrolling | ☐ | ☐ |
| 3 | Inspect page scrollbars | No browser scrollbars visible on any axis | ☐ | ☐ |
| 4 | Check fonts in DevTools Network tab | Barlow Condensed and Nunito Sans both load | ☐ | ☐ |
| 5 | Inspect Network tab on load | `data/stories.json` is fetched once on DOMContentLoaded | ☐ | ☐ |
| 6 | Serve with `data/stories.json = []` | App shows empty state, no crash | ☐ | ☐ |
| 7 | Serve with `data/stories.json` containing invalid JSON | App catches error, shows empty feed, no crash | ☐ | ☐ |
| 8 | Watch loading screen | Loading screen fades out after stories are rendered | ☐ | ☐ |

---

## Section 2: Story Cards (19)

| # | Test Case | Expected Result | Pass | Fail |
|---|-----------|-----------------|------|------|
| 9  | Count rendered cards | 30 cards in feed (when JSON has 30 stories) | ☐ | ☐ |
| 10 | Inspect counter on first card | Shows "1 / 30" | ☐ | ☐ |
| 11 | Inspect counter on last card | Shows "30 / 30" | ☐ | ☐ |
| 12 | Inspect progress dots on a card | 6 dots visible on right edge, one is taller | ☐ | ☐ |
| 13 | Inspect photo div | Background image fills 100dvh × 100vw | ☐ | ☐ |
| 14 | Scroll to a card and watch photo | Photo gently zooms in (scale 1.05→1.0) when card enters view | ☐ | ☐ |
| 15 | View a story with `image: null` | Gradient background renders (no broken image icon) | ☐ | ☐ |
| 16 | Check all 5 gradient variants | Each gradient (1–5) renders as a distinct deep colour | ☐ | ☐ |
| 17 | Read headline text on a photo card | Headline is legible against the scrim | ☐ | ☐ |
| 18 | Inspect headline CSS | `text-transform: uppercase` applied, headline is all-caps | ☐ | ☐ |
| 19 | Load a story with a 200+ character title | Headline clipped at 4 lines with overflow hidden | ☐ | ☐ |
| 20 | Check meta row under headline | Source domain visible (e.g. "theverge.com") | ☐ | ☐ |
| 21 | Check time ago display | Shows "Xm ago", "Xh Xm ago", or "Xd ago" as appropriate | ☐ | ☐ |
| 22 | Check score display | 🔥 followed by formatted score (e.g. "🔥 2.3k") | ☐ | ☐ |
| 23 | Check comments display | 💬 followed by comment count | ☐ | ☐ |
| 24 | Inspect category badge | Badge visible with emoji and label (e.g. "🤖 AI") | ☐ | ☐ |
| 25 | View an AI story | Category badge is indigo (rgba 99,102,241) | ☐ | ☐ |
| 26 | View a Finance story | Category badge is emerald (rgba 16,185,129) | ☐ | ☐ |
| 27 | View a Geo story | Category badge is amber (rgba 245,158,11) | ☐ | ☐ |

---

## Section 3: Scroll (9)

| # | Test Case | Expected Result | Pass | Fail |
|---|-----------|-----------------|------|------|
| 28 | Swipe up on first card | Snaps cleanly to card 2, no partial stop | ☐ | ☐ |
| 29 | Swipe down on card 2 | Snaps back to card 1 | ☐ | ☐ |
| 30 | Fast flick upward | Stops at next single card (scroll-snap-stop: always) | ☐ | ☐ |
| 31 | Slow deliberate swipe | Smooth transition, no jank | ☐ | ☐ |
| 32 | Check first card for swipe hint | "↑ SWIPE UP" hint is visible within 3 seconds | ☐ | ☐ |
| 33 | Wait on first card | Swipe hint animates upward and fades out completely | ☐ | ☐ |
| 34 | Scroll to card 2, then back to card 1 | Swipe hint does NOT reappear on card 1 | ☐ | ☐ |
| 35 | Test on real iPhone Safari | Snap scroll works with no rubber-band bleed-through | ☐ | ☐ |
| 36 | Test on Chrome desktop | Scroll snap works with mouse wheel and trackpad | ☐ | ☐ |

---

## Section 4: Weather (9)

| # | Test Case | Expected Result | Pass | Fail |
|---|-----------|-----------------|------|------|
| 37 | Load app with geolocation not yet decided | Browser shows permission prompt | ☐ | ☐ |
| 38 | Allow geolocation | Weather pill updates to show temp and city | ☐ | ☐ |
| 39 | Check temperature value | Temperature is a rounded integer (no decimals) | ☐ | ☐ |
| 40 | Check city name | City or suburb name shown (e.g. "Surrey") | ☐ | ☐ |
| 41 | Check weather emoji | Matches current conditions (sunny/cloudy/rain/snow/storm) | ☐ | ☐ |
| 42 | Deny geolocation | Weather pill shows "📍 Enable location" | ☐ | ☐ |
| 43 | Deny geolocation and scroll | App loads and scrolls normally — geolocation never blocks load | ☐ | ☐ |
| 44 | Simulate geolocation timeout (DevTools) | App handles timeout gracefully, shows fallback text | ☐ | ☐ |
| 45 | Allow geolocation and scroll through all cards | Weather pill shows same text on every card simultaneously | ☐ | ☐ |

---

## Section 5: Date & Time (4)

| # | Test Case | Expected Result | Pass | Fail |
|---|-----------|-----------------|------|------|
| 46 | Check date pill | Shows correct day name (e.g. "Saturday") | ☐ | ☐ |
| 47 | Check date pill | Shows correct date (e.g. "May 17") | ☐ | ☐ |
| 48 | Check timezone | Date reflects browser's local timezone, not UTC | ☐ | ☐ |
| 49 | Wait past midnight with app open | Date pill updates to new day without reload | ☐ | ☐ |

---

## Section 6: Pull (3)

| # | Test Case | Expected Result | Pass | Fail |
|---|-----------|-----------------|------|------|
| 50 | From card 1, pull down with finger >80px | Feed re-fetches stories.json | ☐ | ☐ |
| 51 | Inspect Network tab during pull-to-refresh | Request URL includes `?t=<timestamp>` cache buster | ☐ | ☐ |
| 52 | After pull-to-refresh completes | Feed scrolls back to card 1 | ☐ | ☐ |

---

## Section 7: Read Button (5)

| # | Test Case | Expected Result | Pass | Fail |
|---|-----------|-----------------|------|------|
| 53 | Tap "Read →" button | Button responds to tap (no dead zone) | ☐ | ☐ |
| 54 | Tap "Read →" on a story with a URL | Article opens in a new tab | ☐ | ☐ |
| 55 | Inspect href on "Read →" | URL matches `story.url` from stories.json | ☐ | ☐ |
| 56 | Tap Save (bookmark) button | No crash; toast or clipboard action fires | ☐ | ☐ |
| 57 | Tap Share button | No crash; native share sheet or clipboard fallback fires | ☐ | ☐ |

---

## Section 8: GitHub Actions (9)

| # | Test Case | Expected Result | Pass | Fail |
|---|-----------|-----------------|------|------|
| 58 | Trigger workflow manually via Actions tab | Workflow runs successfully | ☐ | ☐ |
| 59 | Check commit after workflow run | Commit message contains "[skip ci]" | ☐ | ☐ |
| 60 | Inspect committed stories.json | File is valid JSON (parseable) | ☐ | ☐ |
| 61 | Count stories in committed file | Array has up to 30 items | ☐ | ☐ |
| 62 | Inspect `image` field on each story | Value is a valid HTTPS URL string or null | ☐ | ☐ |
| 63 | Inspect `gradient` field on each story | Value is an integer 1–5 | ☐ | ☐ |
| 64 | Run workflow twice with no HN changes | Second run does NOT create a new commit | ☐ | ☐ |
| 65 | Wait 2 hours after last commit | Cron fires and updates stories if content changed | ☐ | ☐ |
| 66 | Simulate HN API down (mock 500) | Workflow exits with non-zero code; stories.json not corrupted | ☐ | ☐ |

---

## Section 9: Performance (8)

| # | Test Case | Expected Result | Pass | Fail |
|---|-----------|-----------------|------|------|
| 67 | Load app on fast connection | First card visible within 1 second | ☐ | ☐ |
| 68 | Check for layout shift after fonts load | No headline or badge reflow (CLS ≈ 0) | ☐ | ☐ |
| 69 | Open on iPhone 14 (390×844) | All card elements fit within the viewport | ☐ | ☐ |
| 70 | Open on iPhone SE (375×667) | Headline clips correctly; no elements overflow | ☐ | ☐ |
| 71 | Rotate iPhone to landscape | Card fills landscape viewport; no elements overflow | ☐ | ☐ |
| 72 | Check for horizontal scroll | No horizontal scrollbar; body does not overflow X | ☐ | ☐ |
| 73 | Scroll through 10 cards quickly | No dropped frames or blank cards | ☐ | ☐ |
| 74 | Open on slow 3G (DevTools throttle) | App renders first card; images load progressively | ☐ | ☐ |

---

## Section 10: Edge Cases (8)

| # | Test Case | Expected Result | Pass | Fail |
|---|-----------|-----------------|------|------|
| 75 | Story with `url: null` in stories.json | Card renders without crash; Read → links to HN thread | ☐ | ☐ |
| 76 | Story with a 200-character title | Headline renders up to 4 lines, remainder hidden | ☐ | ☐ |
| 77 | Story from an unknown domain (e.g. obscure blog) | Category badge shows "💻 Tech" | ☐ | ☐ |
| 78 | Story with `score: 0` | Displays "🔥 0", not "🔥 undefined" | ☐ | ☐ |
| 79 | Story with `comments: null` | Displays "💬 0", not "💬 null" | ☐ | ☐ |
| 80 | Story with `time` from 30 days ago | Time-ago shows "30d ago" | ☐ | ☐ |
| 81 | Story with `time: 0` | Does not crash; shows a fallback time string | ☐ | ☐ |
| 82 | All stories have `image: null` | Every card shows a gradient background; no broken images | ☐ | ☐ |
