// ============================================================
// Server-side voice resolution.
//
// Loads the optional override file named by SWIPECRAFT_VOICES and merges it
// over the built-in voices from voices.ts. Keeping this separate matters:
// voices.ts is imported by the browser for the picker, so it cannot touch fs.
//
// Override file shape (all fields optional per voice):
//
//   {
//     "shortform":    { "handle": "@yourhandle", "guide": "..." },
//     "professional": { "handle": "Your Page",   "guide": "..." },
//     "builder":      { "handle": "@yourhandle", "guide": "..." }
//   }
//
// Only handle and guide are read. Names stay fixed so the picker labels in
// the browser always match what the server actually used.
// ============================================================

import { readFileSync } from "fs";

import { resolveVoice, VOICES, type Voice, type VoiceId } from "./voices";

type Override = Partial<Pick<Voice, "handle" | "guide">>;

let cache: Record<string, Override> | null = null;

function loadOverrides(): Record<string, Override> {
  if (cache) return cache;

  const path = process.env.SWIPECRAFT_VOICES?.trim();
  if (!path) return (cache = {});

  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      console.warn(`SWIPECRAFT_VOICES: ${path} is not a JSON object, ignoring.`);
      return (cache = {});
    }

    const out: Record<string, Override> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!(id in VOICES)) {
        console.warn(`SWIPECRAFT_VOICES: unknown voice "${id}", ignoring.`);
        continue;
      }
      if (!value || typeof value !== "object") continue;
      const v = value as Record<string, unknown>;
      const entry: Override = {};
      if (typeof v.handle === "string" && v.handle.trim()) entry.handle = v.handle.trim();
      if (typeof v.guide === "string" && v.guide.trim()) entry.guide = v.guide.trim();
      out[id] = entry;
    }
    return (cache = out);
  } catch (e) {
    // A broken override must not take the AI routes down. Fall back loudly.
    console.warn(
      `SWIPECRAFT_VOICES: could not read ${path}, using built-in voices. ${
        e instanceof Error ? e.message : String(e)
      }`
    );
    return (cache = {});
  }
}

/** Resolve a request's voice id, with any local override applied. */
export function resolveVoiceWithOverrides(id: unknown): Voice {
  const base = resolveVoice(id);
  const override = loadOverrides()[base.id as VoiceId];
  return override ? { ...base, ...override } : base;
}
