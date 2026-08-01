#!/usr/bin/env bun
// Generate a 7-slide carousel from a topic using Claude API.
// Usage: bun run new "5 AI tools for students"
// Requires: ANTHROPIC_API_KEY env var

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { DEFAULT_VOICE, resolveVoice, slidesSystemPrompt } from "../src/lib/voices";

const scriptDir = dirname(fileURLToPath(import.meta.url));

const topic = process.argv.slice(2).filter((a) => !a.startsWith("--")).join(" ").trim();
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

// Reuse the same voices the app uses, so CLI and UI stay in sync.
// Pick one with: bun run new "topic" --voice builder
const voiceArg = process.argv.find((a) => a.startsWith("--voice="))?.split("=")[1];
const voice = resolveVoice(voiceArg ?? DEFAULT_VOICE);
const SYSTEM = slidesSystemPrompt(voice);

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
