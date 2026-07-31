#!/usr/bin/env bun
// Generate a 7-slide carousel from a topic using Claude API.
// Usage: bun run new "5 AI tools for students"
// Requires: ANTHROPIC_API_KEY env var

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const scriptDir = dirname(fileURLToPath(import.meta.url));

const topic = process.argv.slice(2).join(" ").trim();
if (!topic) {
  console.error("Usage: bun run new \"<topic>\"");
  console.error("Example: bun run new \"5 AI tools for students\"");
  process.exit(1);
}

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("ERROR: ANTHROPIC_API_KEY env var not set.");
  console.error("Set it: export ANTHROPIC_API_KEY=sk-ant-...");
  process.exit(1);
}

const BRAND_GUIDE = `
Brand: @quad_star — TikTok channel for AI tools and prompts that save time.
Voice: direct, actionable, Hormozi-hook style. No fluff. Specific outcomes.
No em dashes. No filler. No "amazing/transform/unleash" buzzwords.
Audience: general AI-curious users, not engineers.
Format: 7-slide carousel.
`;

const SYSTEM = `You are a TikTok carousel content writer for @quad_star.

${BRAND_GUIDE}

Generate exactly 7 slides as VALID JSON matching this schema:

[
  {
    "type": "hook",
    "text": "Catchy headline\\nwith line breaks",
    "highlight": "key phrase",
    "highlightStyle": "italic-box"
  },
  {
    "type": "body",
    "title": "SLIDE TITLE IN CAPS",
    "text": "Body copy with\\nline breaks.\\n\\nMax 5 lines.",
    "highlight": "key phrase"
  },
  // ... 5 body slides total
  {
    "type": "cta",
    "text": "Save this.\\nTap screenshot.\\nUse Monday.",
    "handle": "@quad_star"
  }
]

Rules:
- Hook slide: lead with the payoff (the WIN), highlight the number/result
- 5 body slides: one idea each, max 40 words
- CTA: behavioral (save/screenshot/follow), end with @quad_star handle
- Use \\n for line breaks
- highlight should be a phrase that appears verbatim in text or title
- No em dashes, no buzzwords
- Return JSON ONLY, no markdown fences, no commentary`;

console.log(`\nGenerating carousel for: "${topic}"\n`);

const res = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  },
  body: JSON.stringify({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Topic: ${topic}\n\nGenerate the 7-slide carousel JSON.`,
      },
    ],
  }),
});

if (!res.ok) {
  console.error(`API error: ${res.status} ${res.statusText}`);
  console.error(await res.text());
  process.exit(1);
}

const data = await res.json() as { content: { text: string }[] };
let raw = data.content[0].text.trim();
raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

let slides;
try {
  slides = JSON.parse(raw);
} catch (e) {
  console.error("Failed to parse JSON from Claude:");
  console.error(raw);
  process.exit(1);
}

if (!Array.isArray(slides) || slides.length < 5) {
  console.error("Expected array of 5+ slides, got:", slides);
  process.exit(1);
}

const slidesPath = resolve(scriptDir, "..", "src", "slides.ts");
const current = readFileSync(slidesPath, "utf-8");

const defaultsBlock = current.split("export const SLIDES")[0];
const exportsBlock = current.match(/export const DEFAULT_[\s\S]+$/)?.[0] ?? "";

const newSlidesTs = `${defaultsBlock}export const SLIDES: SlideData[] = ${JSON.stringify(slides, null, 2)};

${exportsBlock}`;

writeFileSync(slidesPath, newSlidesTs);

console.log(`Wrote ${slides.length} slides to src/slides.ts`);
console.log(`Preview: http://localhost:3333`);
console.log(`Topic: "${topic}"`);
