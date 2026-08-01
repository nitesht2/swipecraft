import { NextRequest, NextResponse } from "next/server";
import { noKeyMessage, readUserKeys, resolveKey } from "@/lib/keys";
import { slidesSystemPrompt, type Voice } from "@/lib/voices";
import { resolveVoiceWithOverrides } from "@/lib/voicesServer";

// Server-side LLM call. Keys come from the caller's browser (BYOK) or, when
// BYOK_ONLY is off, from .env.local. Provider order:
//   1. OpenRouter (default model: x-ai/grok-4.3, override with OPENROUTER_MODEL)
//   2. Anthropic (claude-sonnet-4-6)

async function callOpenRouter(apiKey: string, topic: string, voice: Voice): Promise<string> {
  const model = process.env.OPENROUTER_MODEL || "x-ai/grok-4.3";
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "http://localhost:3333",
      "X-Title": "swipecraft",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [
        { role: "system", content: slidesSystemPrompt(voice) },
        { role: "user", content: `Topic: ${topic}\n\nGenerate the 7-slide carousel JSON.` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

async function callAnthropic(apiKey: string, topic: string, voice: Voice): Promise<string> {
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
      system: slidesSystemPrompt(voice),
      messages: [{ role: "user", content: `Topic: ${topic}\n\nGenerate the 7-slide carousel JSON.` }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content?.[0]?.text || "";
}

export async function POST(req: NextRequest) {
  let topic: string;
  let body: unknown;
  try {
    body = await req.json();
    topic = String((body as { topic?: unknown })?.topic || "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!topic) {
    return NextResponse.json({ error: "Topic is required" }, { status: 400 });
  }
  const voice = resolveVoiceWithOverrides((body as { voice?: unknown })?.voice);

  const userKeys = readUserKeys(body);
  const orKey = resolveKey("openrouter", userKeys);
  const antKey = resolveKey("anthropic", userKeys);
  if (!orKey && !antKey) {
    return NextResponse.json({ error: noKeyMessage(["openrouter", "anthropic"]) }, { status: 400 });
  }

  let raw: string;
  try {
    raw = orKey ? await callOpenRouter(orKey, topic, voice) : await callAnthropic(antKey!, topic, voice);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }

  raw = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

  try {
    const parsed = JSON.parse(raw);
    // Models routinely wrap the array in an object even when told not to
    // ({"slides": [...]}, sometimes {"carousel": [...]}). The payload is fine,
    // so unwrap a lone array-valued property rather than failing the request.
    const slides = Array.isArray(parsed)
      ? parsed
      : Object.values(parsed ?? {}).find(Array.isArray);
    if (!Array.isArray(slides) || slides.length < 3) {
      return NextResponse.json({ error: "Model returned unexpected shape", raw }, { status: 502 });
    }
    return NextResponse.json({ slides });
  } catch {
    return NextResponse.json({ error: "Failed to parse model JSON", raw }, { status: 502 });
  }
}
