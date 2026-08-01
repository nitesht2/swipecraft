import { NextRequest, NextResponse } from "next/server";
import { noKeyMessage, readUserKeys, resolveKey, type UserKeys } from "@/lib/keys";
import { hooksSystemPrompt, type Voice } from "@/lib/voices";
import { resolveVoiceWithOverrides } from "@/lib/voicesServer";

// Returns 3 distinct hook-slide variants for A/B testing.
// Same key resolution as /api/generate (OpenRouter preferred, Anthropic fallback).

async function call(topic: string, userKeys: UserKeys, voice: Voice): Promise<string> {
  const orKey = resolveKey("openrouter", userKeys);
  const antKey = resolveKey("anthropic", userKeys);
  const user = `Topic: ${topic}\n\nWrite the 3 hook variants.`;
  if (orKey) {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${orKey}`, "HTTP-Referer": "http://localhost:3333", "X-Title": "swipecraft" },
      body: JSON.stringify({ model: process.env.OPENROUTER_MODEL || "x-ai/grok-4.3", max_tokens: 1500, messages: [{ role: "system", content: hooksSystemPrompt(voice) }, { role: "user", content: user }] }),
    });
    if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
    return (await res.json()).choices?.[0]?.message?.content || "";
  }
  if (antKey) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": antKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1500, system: hooksSystemPrompt(voice), messages: [{ role: "user", content: user }] }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
    return (await res.json()).content?.[0]?.text || "";
  }
  throw new Error(noKeyMessage(["openrouter", "anthropic"]));
}

export async function POST(req: NextRequest) {
  let topic = "";
  let body: unknown;
  try {
    body = await req.json();
    topic = String((body as { topic?: unknown })?.topic || "").trim();
  } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  if (!topic) return NextResponse.json({ error: "Topic is required" }, { status: 400 });
  const voice = resolveVoiceWithOverrides((body as { voice?: unknown })?.voice);

  const userKeys = readUserKeys(body);
  if (!resolveKey("openrouter", userKeys) && !resolveKey("anthropic", userKeys)) {
    return NextResponse.json({ error: noKeyMessage(["openrouter", "anthropic"]) }, { status: 400 });
  }

  let raw = "";
  try { raw = await call(topic, userKeys, voice); } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 }); }
  raw = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

  try {
    const parsed = JSON.parse(raw);
    // Same unwrap as /api/generate: models often wrap the array in an object.
    const hooks = Array.isArray(parsed) ? parsed : Object.values(parsed ?? {}).find(Array.isArray);
    if (!Array.isArray(hooks) || hooks.length === 0) return NextResponse.json({ error: "Unexpected shape", raw }, { status: 502 });
    return NextResponse.json({ hooks });
  } catch {
    return NextResponse.json({ error: "Failed to parse JSON", raw }, { status: 502 });
  }
}
