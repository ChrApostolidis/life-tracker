# Demo media

Screen recordings referenced by the main `README.md`'s [Demos](../../README.md#demos) section. Nothing here yet — this is where the files go once recorded.

## Format

- **GIF, not video, for anything embedded via `![alt](path)`** — GitHub's markdown renderer autoplays `.gif` files inline but does not render `<video>` tags or play `.mp4`/`.mov` from a relative path. Keep clips short (10–20s) and under a few MB; a 1000–1200px-wide capture at 12–15fps is plenty for UI text to stay legible without bloating the repo.
- **If a clip genuinely needs to be a video** (e.g. it's long, or a GIF's color/frame-rate compression makes small UI text unreadable): don't commit an `.mp4` here — drag it directly into a GitHub PR/issue/README edit box on github.com instead. GitHub uploads it to `https://github.com/<org>/<repo>/assets/...` and gives you a URL that autoplays inline in rendered markdown. Paste that URL into the README in place of the local path.
- Name files exactly as referenced in the main README's Demos table (`capture-loop.gif`, `voice-capture.gif`, `habit-sync.gif`, `level-up.gif`, `year-in-pixels.gif`, `books-pipeline.gif`) so the existing links resolve without further edits.

## Recording tips

- Record at the app's actual dark theme, desktop width (~1280px) unless the clip is specifically demonstrating mobile/responsive behavior.
- Trim dead air at the start/end — the loop should read as intentional, not like a screen recording that was cut wherever.
- For clips involving typed input (capture, voice confirm), type at a natural pace rather than pasting instantly — the point is to show the interaction, not just the end state.



There's no hosted preview of this app — it's a single-user, no-auth deploy on a home tailnet, so a link-and-click demo isn't an option. Short GIFs are the substitute. Each slot below is a specific ~10–20s clip rather than one generic screen recording, since a single "here's the app" tour undersells the parts that actually differentiate it from a plain todo list.

Drop recordings into `docs/media/` using the filenames below and they'll render inline (GitHub autoplays GIFs in a rendered README). See [`docs/media/README.md`](docs/media/README.md) for format notes.

| Clip | What it shows | Why it's worth its own slot |
|---|---|---|
| **Capture loop** — `docs/media/capture-loop.gif` | `Cmd/Ctrl+K` → type a task with a date in it → it lands on the right day in Week view | The core pitch: idea to scheduled item in one keystroke, no form |
| **Voice capture** — `docs/media/voice-capture.gif` | Tap the mic, speak a task (English or Greek), watch it transcribe live into the confirm modal | The single most "wait, it does *that*?" moment in the app |
| **One habit, three surfaces** — `docs/media/habit-sync.gif` | Check a habit off the Home card, cut to `/today` then `/habits` — already checked, no reload | Proves the app is one coherent state, not three separate pages bolted together |
| **Leveling up** — `docs/media/level-up.gif` | Complete a task → cut to `/stats` → XP bar filling, an achievement unlocking | The "why this over a plain todo app" hook — this is the gamification payoff |
| **Year-in-pixels** — `docs/media/year-in-pixels.gif` | Scroll/hover the year heatmap, a GitHub-contribution-graph-style reveal | Cheap to record, good README thumbnail material |
| **Books pipeline** — `docs/media/books-pipeline.gif` | Search a real book → add as "Want it" → drag through wishlist → owned → reading → finished, watch the dates auto-stamp | Shows a whole feature's business logic (the auto-stamp rule) in one continuous action, not just UI |

**If you only record one:** capture → voice → habit-check propagating live → stats level-up, stitched into a single ~20s clip in that order. It hits capture-first, the most novel input method, cross-page state consistency, and the gamification hook without needing narration.

Two extra frames worth the effort if you want something beyond a straight feature tour:
- A **before/after**: a cluttered "5 apps" collage → the single dashboard. Cheesy, but it's the actual "why this exists" pitch in one image.
- A **dark-mode-only callout**: a beat where the frame is just the palette/typography with nothing else happening — screenshots of this app read as "a todo app" unless the aesthetic gets a second to itself.

---