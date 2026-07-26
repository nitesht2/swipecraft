import { NextRequest, NextResponse } from "next/server";

// Returns 3 distinct hook-slide variants for A/B testing.
// Reuses the same provider env as /api/generate (OpenRouter preferred, Anthropic fallback).

const SYSTEM = `You write scroll-stopping TikTok carousel HOOK slides for @quad_star (AI tools / prompts channel).

Return exactly 3 DISTINCT hook variants as VALID JSON:

[
  { "text": "Line one\\nLine two\\nLine three", "highlight": "key phrase", "style": "confession" },
  { "text": "...", "highlight": "...", "style": "contrarian" },
  { "text": "...", "highlight": "...", "style": "open-loop" }
]

Rules:
- Each hook: max 3 short lines, payoff first, a number where possible
- Use 3 different angles: confession (personal + specific number), contrarian (challenge a belief), open-loop (tease a reveal)
- highlight must appear VERBATIM in that hook's text
- No em dashes. No buzzwords (streamline/unleash/supercharge/transform/leverage).
- Only claim facts present in the topic brief.
- Return JSON ONLY. No fences. No commentary.`;

async function call(topic: string): Promise<string> {
  const orKey = process.env.OPENROUTER_API_KEY;
  const antKey = process.env.ANTHROPIC_API_KEY;
  const user = `Topic: ${topic}\n\nWrite the 3 hook variants.`;
  if (orKey) {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${orKey}`, "HTTP-Referer": "http://localhost:3333", "X-Title": "swipecraft" },
      body: JSON.stringify({ model: process.env.OPENROUTER_MODEL || "x-ai/grok-4.1-fast", max_tokens: 1500, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }] }),
    });
    if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
    return (await res.json()).choices?.[0]?.message?.content || "";
  }
  if (antKey) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": antKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1500, system: SYSTEM, messages: [{ role: "user", content: user }] }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
    return (await res.json()).content?.[0]?.text || "";
  }
  throw new Error("No API key set. Add OPENROUTER_API_KEY or ANTHROPIC_API_KEY to .env.local.");
}

export async function POST(req: NextRequest) {
  let topic = "";
  try { topic = String((await req.json()).topic || "").trim(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  if (!topic) return NextResponse.json({ error: "Topic is required" }, { status: 400 });

  let raw = "";
  try { raw = await call(topic); } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 }); }
  raw = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

  try {
    const hooks = JSON.parse(raw);
    if (!Array.isArray(hooks) || hooks.length === 0) return NextResponse.json({ error: "Unexpected shape", raw }, { status: 502 });
    return NextResponse.json({ hooks });
  } catch {
    return NextResponse.json({ error: "Failed to parse JSON", raw }, { status: 502 });
  }
}
