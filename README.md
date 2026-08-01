# Swipecraft

> A short-form carousel studio for TikTok / Instagram Reels / YouTube Shorts. Platform-safe layout, tabbed in-browser editor, per-slide typography + alignment, AI content generation, carousel library, and one-click ZIP export.

Self-hosted, no accounts, no database. Your carousels live in your browser.

![Format](https://img.shields.io/badge/format-9:16%20vertical-E5683C)
![Stack](https://img.shields.io/badge/stack-Next.js%2015%20%2B%20Bun-black)
![License](https://img.shields.io/badge/license-MIT-green)

---

## What This Is

**Swipecraft** is a self-hosted carousel editor. It started as a fork of [itchernetski/threads-carousel-claude-skill](https://github.com/itchernetski/threads-carousel-claude-skill) (MIT) and has been substantially extended into its own tool:

**In-browser editing (no code required)**
- **Project sidebar** — every carousel is a named project: create, switch, duplicate, rename, delete, mark as posted. Autosaved to localStorage.
- **Tabbed editor** — Content / Style / Layout tabs instead of a wall of controls
- **Click-to-edit** — ✎ on any slide opens an edit panel (text / title / highlight / handle) with prev/next nav
- **Slide management** — add, delete, duplicate, and reorder slides directly in the editor (no fixed 7-slide limit)
- **AI Generate** — type a topic, get 7 slides; supports OpenRouter (Grok default) or Anthropic, key stays server-side
- **A/B hook generator** — get 3 distinct hook variants (confession / contrarian / open-loop), click one to apply to slide 1
- **Per-slide AI images** — in the edit panel, describe an image and it generates + inserts an image slide (OpenAI gpt-image-1)

**Insights + publishing**
- **Analytics tracker** — log views / saves / comments per carousel; the 📊 Stats panel ranks by save rate so you make more of what works
- **Schedule via Postiz** — render all slides and push to a connected Postiz channel on a schedule (requires a running Postiz + POSTIZ_API_KEY)

**Layout + platform safety**
- **Platform-safe defaults** — content stays clear of TikTok/IG/YT UI overlays
- **Visual safe-zone overlay** — toggle a debug layer showing where platform UI covers content (never bakes into exports)
- **Drag to position** — grab a slide's text and move it anywhere on the canvas (Canva-style free positioning); ⊕ resets it
- **Per-slide font scale + alignment** — granular control via overlay on each slide
- **Global font size slider** — scale all slides together (0.5x ↔ 2.0x)

**Export + brand**
- **One-click ZIP** — Export ZIP bundles all slides into a single date-stamped download
- **All Formats export** — one click renders the same carousel at TikTok 9:16 + Instagram 4:5 + Square 1:1, foldered in a single zip
- **CTA reveal styling** — last slide gets a distinct visual treatment (glow + bordered handle)
- **Brand config** — single source of truth in `src/brand.ts`, footer renders on every slide
- **CLI tools** — `bun run new "topic"`, `bun run img <path>`, `bun run pack <name>` for terminal-driven workflows

---

## Quick Start

```bash
git clone https://github.com/nitesht2/swipecraft.git
cd swipecraft
bun install
bun dev --port 3333
# open http://localhost:3333
```

Everything is editable in the browser. To enable the AI features, copy `.env.example` to `.env.local` and fill in what you need:

```bash
cp .env.example .env.local
```

```bash
# AI text (pick one; OpenRouter is checked first)
OPENROUTER_API_KEY=sk-or-...
# OPENROUTER_MODEL=x-ai/grok-4.3        # optional, this is the default
# ANTHROPIC_API_KEY=sk-ant-...          # fallback if no OpenRouter key

# AI images (optional — per-slide image gen)
OPENAI_API_KEY=sk-...

# Scheduling (local only — see the warning below)
ENABLE_POSTIZ=1
POSTIZ_API_KEY=...
```

Restart the dev server after editing `.env.local`. Without keys, the editor and all export features still work; only the AI/schedule buttons need them.

You can also skip `.env.local` entirely and paste keys into the **🔑 Keys** panel in the app. Those live in your browser's localStorage, are sent with each request, and are never stored server-side. A key pasted there always wins over the one in `.env.local`.

---

## Hosting It For Other People

Two settings decide whether this is safe to expose. Both matter.

**`BYOK_ONLY=1`** — makes the server ignore its own AI keys completely, so every request must carry the caller's own key from the Keys panel. Without it, a public instance bills every visitor's generations to you.

**Leave `ENABLE_POSTIZ` unset** — `/api/post` publishes to *your* connected social accounts. It is disabled by default and returns 403. Only turn it on for a local instance nobody else can reach. Never set it on a public deployment.

```bash
# Public deployment
BYOK_ONLY=1
# ENABLE_POSTIZ intentionally unset
```

There is still no per-user rate limiting, so put the deployment behind your host's rate limits or a proxy if you expect real traffic. Note also that BYOK means visitors send their key through your server on the way to the provider, so tell them whose instance they are trusting.

Carousels are stored per browser in localStorage. There are no accounts and no database, so each visitor's projects stay on their own machine.

**Mobile:** the editor is responsive. Below 900px the project sidebar becomes a drawer. The app also ships a web manifest and service worker, so a hosted instance can be installed to a phone home screen and opened offline.

---

## Daily Workflow

### Option A: Hand-write the carousel

```bash
# 1. Edit content
$EDITOR src/slides.ts

# 2. Preview live at http://localhost:3333
# 3. Click "Export All" — 7 PNGs download

# 4. Bundle into named folder + zip + reveal in Finder
bun run pack my-carousel
# → ~/Downloads/my-carousel/ (7 PNGs)
# → ~/Downloads/my-carousel.zip
```

### Option B: AI generator (Claude API)

```bash
export ANTHROPIC_API_KEY=sk-ant-...
bun run new "5 ChatGPT prompts for taxes"
# Claude writes 7 slides → src/slides.ts updated
# Refresh http://localhost:3333

# Then same export + pack as Option A
bun run pack ai-taxes
```

### Upload

AirDrop the zip to your phone → unzip → open TikTok mobile app → **+** → **Upload** → **Photos** → select 7 in order → caption + post.

---

## Browser Toolbar Controls

Top-level controls (apply to all slides):

| Row | Purpose |
|---|---|
| **Format** | TikTok 9:16, Threads 4:5, Square, LinkedIn, Story, Wide 16:9 |
| **Mode** | Carousel / Presentation |
| **Safe Zones** | Toggle TikTok / IG / YT UI overlay debug layer |
| **Font Size** | Global slider 0.5x ↔ 2.0x + reset |
| **Font** | Minimal / Editorial / Clean / Mono / Condensed |
| **Surface** | 12 backgrounds (Dark, White, Light, Paper, Gradient, Pastel, Neon, Ember, plus Mocha, Latte, Rosé Pine and Nord adapted from their MIT palettes) |
| **Accent** | 11 pop colors |
| **Background** | None, Blobs, Grid, Lines, Ruled, Noise, Bignumber, Glow |

### Per-slide overlay (top-right of each slide preview)

| Button | Action |
|---|---|
| **−** | Shrink this slide's font |
| `1.05x` | Current per-slide scale (visible only when modified) |
| **+** | Grow this slide's font |
| **↺** | Reset this slide to 1.00x (only appears when modified) |
| **⬇** | Export this single slide as PNG |
| **⬅** | Align text left |
| **⬌** | Align text center (default) |
| **➡** | Align text right |

Final font size = `global slider × per-slide × (data.fontScale override)`

---

## Brand Config

The footer on every slide and the handle stamped on CTA slides come from `src/brand.ts`, which reads `.env.local` so your own brand never lands in version control:

```bash
NEXT_PUBLIC_BRAND_NAME=Your Brand
NEXT_PUBLIC_BRAND_HANDLE=@yourhandle
NEXT_PUBLIC_BRAND_TAGLINE=Your one-line tagline.
NEXT_PUBLIC_BRAND_LOGO=/images/logo.png   # optional
NEXT_PUBLIC_BRAND_SHOW_FOOTER=1
NEXT_PUBLIC_BRAND_SHOW_PAGE_NUMBERS=0
```

These are inlined into the client bundle at build time, so keep secrets out of them. Unset values fall back to neutral placeholders.

## Brand Voices

AI generation ships three voices, named by register rather than by brand: **Short-form** (punchy, general feed), **Professional** (plain and credible, desk audience), and **Builder** (blunt, receipts-first). Pick one next to the Generate button, or pass `--voice builder` to the CLI generator.

Each carries a shared set of craft rules: banned buzzwords and hedges, banned constructions (negative parallelism, rule of three, rhetorical Q&A, false suspense), and a hard rule against inventing statistics.

To write in your own brand voice without committing it, point `SWIPECRAFT_VOICES` at a JSON file:

```bash
SWIPECRAFT_VOICES=/path/to/voices.json
```

```json
{
  "shortform":    { "handle": "@yourhandle", "guide": "Who is speaking, to whom, in what register." },
  "professional": { "handle": "Your Page",   "guide": "..." },
  "builder":      { "handle": "@yourhandle", "guide": "..." }
}
```

Only `handle` and `guide` are read, and only server-side. Picker labels stay fixed so the browser always matches what the server used. A missing or malformed file logs a warning and falls back to the built-in voices.

Footer renders automatically on every slide unless `showFooter: false`.

---

## Slide Defaults

`src/slides.ts` — change these to set defaults that load on every page refresh:

```ts
export const DEFAULT_FONT: FontId       = "minimal";   // Unbounded
export const DEFAULT_SURFACE: SurfaceId = "pastel";    // lavender
export const DEFAULT_ACCENT: AccentId   = "violet";    // accent pop
export const DEFAULT_PURPOSE: PurposeId = "carousel";
export const DEFAULT_BG: BgType         = "blobs";     // organic shapes
export const DEFAULT_FORMAT: FormatId   = "tiktok-9x16";
```

Override per-slide by adding `fontScale: 0.85` (or any number) to any slide object in the SLIDES array.

---

## Platform Safe Zones

Visual debug overlay toggle (Safe Zones button in toolbar). When ON, each slide preview shows:

- 🔴 **Red dashed** = TikTok blocked areas (top header, bottom caption + nav, right action stack)
- 🟠 **Orange dashed** = Instagram Reels overlay
- 🟡 **Yellow dashed** = YouTube Shorts overlay

If your text falls inside a red zone → it'll be covered by TikTok UI when posted. Move/shrink it.

Default padding (`320px 220px 680px 220px`) keeps content inside TikTok-safe area at 1.0x font scale. Bigger scales may push text into unsafe zones — toggle Safe Zones to verify.

Safe zone overlay **never bakes into exported PNGs** (filtered out via `data-safezone` attribute).

---

## CTA Reveal Slide

Slide type `cta` gets distinct visual treatment automatically:

- **TAP TO FOLLOW** eyebrow text + accent color dot at top
- Highlighted reveal phrase (use `highlight: "Tool Name"` + `highlightStyle: "italic-box"`)
- **@handle** rendered at 110px in a bordered, glowing box
- Radial accent glow background

Example:

```ts
{
  type: "cta",
  text: "It is Hermes Agent.\nBy Nous Research.\n\nFree. Open source.\n\nFollow ↓",
  highlight: "Hermes Agent",
  highlightStyle: "italic-box",
  handle: "@yourhandle",
}
```

---

## Scripts

```bash
bun dev                       # preview at localhost:3333
bun dev --port 3334           # second instance for A/B
bun run new "topic"           # AI-generate 7 slides via Claude API
bun run img <path>            # copy image to public/images/
bun run pack <name>           # bundle latest exported PNGs into folder + zip
bun run build                 # production build
```

### `bun run new` requirements

- `ANTHROPIC_API_KEY` env var set
- Uses `claude-sonnet-4-6` model
- ~$0.01 per generation

### `bun run pack` behavior

- Finds PNGs in `~/Downloads/` matching `0X-(hook|body|cta|image|...).png` from the last 30 seconds
- Handles Chrome duplicate naming `01-hook (2).png` automatically
- Strips suffix, moves into `~/Downloads/<name>/`
- Creates `~/Downloads/<name>.zip`
- Opens Finder window at the zip

---

## Project Structure

```
swipecraft/
├── src/
│   ├── app/
│   │   ├── CarouselApp.tsx       # main render engine — toolbar, slides, export
│   │   ├── layout.tsx            # Next.js layout + font loading
│   │   └── page.tsx              # entry point
│   ├── lib/
│   │   ├── presets.ts            # font/surface/accent/format presets
│   │   └── types.ts              # SlideData + StylePreset types
│   ├── brand.ts                  # brand config (handle, tagline, footer toggles)
│   └── slides.ts                 # SLIDES array + DEFAULTS (edit this for new carousels)
├── public/
│   └── images/                   # PNG/JPG/SVG referenced by image slides
├── scripts/
│   ├── new-carousel.ts           # AI generator (Claude API)
│   ├── add-image.ts              # image upload helper
│   └── pack.ts                   # bundle exported PNGs into folder + zip
├── package.json
└── README.md
```

---

## Stack

| Layer | Tech |
|---|---|
| Engine | Next.js 15 + React 19 + TypeScript |
| Render | html-to-image for PNG export, jspdf for PDF |
| Fonts | Google Fonts (Unbounded, Playfair Display, Inter, Space Grotesk, JetBrains Mono, Oswald, Caveat) |
| AI gen | Anthropic Claude Sonnet 4.6 via REST API |
| Runtime | Bun (works with Node too) |

---

## Credits & Attribution

Swipecraft is built on the shoulders of open source. With gratitude:

- **Original rendering engine:** [itchernetski/threads-carousel-claude-skill](https://github.com/itchernetski/threads-carousel-claude-skill) by itchernetski (MIT License). The slide-rendering core, preset system, and html-to-image export pipeline originate from this project. Swipecraft extends it with the tabbed editor, click-to-edit panel, carousel library, AI generation API route, safe-zone overlay, per-slide controls, and the Swipecraft visual identity.
- **AI generate UX inspiration:** [FranciscoMoretti/carousel-generator](https://github.com/FranciscoMoretti/carousel-generator)
- **Design rules applied:** [pbakaus/impeccable](https://github.com/pbakaus/impeccable)
- **Illustration style reference:** [helloianneo/ian-xiaohei-illustrations](https://github.com/helloianneo/ian-xiaohei-illustrations)

---

## License

MIT. The original engine is MIT-licensed and that license is preserved in [`LICENSE`](./LICENSE). Swipecraft's additions are also released under MIT. Fork it, ship it.
