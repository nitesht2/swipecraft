// Key resolution for the AI routes.
//
// Local / self-hosted: keys come from .env.local and visitors need nothing.
// Public deploy: set BYOK_ONLY=1. Server keys are then ignored completely and every
// request must carry the caller's own key, so there is no shared budget to drain.

export type Provider = "openrouter" | "anthropic" | "openai";

const ENV_VAR: Record<Provider, string> = {
  openrouter: "OPENROUTER_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
};

const PROVIDERS: Provider[] = ["openrouter", "anthropic", "openai"];

export type UserKeys = Partial<Record<Provider, string>>;

export function byokOnly(): boolean {
  const v = (process.env.BYOK_ONLY || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Pull caller-supplied keys off a request body without trusting its shape. */
export function readUserKeys(body: unknown): UserKeys {
  const raw = (body as { keys?: unknown } | null)?.keys;
  if (!raw || typeof raw !== "object") return {};
  const out: UserKeys = {};
  for (const p of PROVIDERS) {
    const v = (raw as Record<string, unknown>)[p];
    if (typeof v === "string" && v.trim()) out[p] = v.trim();
  }
  return out;
}

/** Caller's own key wins. Server env is a fallback only while BYOK_ONLY is off. */
export function resolveKey(provider: Provider, userKeys: UserKeys): string | null {
  const supplied = userKeys[provider];
  if (supplied) return supplied;
  if (byokOnly()) return null;
  return process.env[ENV_VAR[provider]]?.trim() || null;
}

export function noKeyMessage(providers: Provider[]): string {
  if (byokOnly()) {
    return "This instance needs your own API key. Open Settings and paste one to continue.";
  }
  const names = providers.map((p) => ENV_VAR[p]).join(" or ");
  return `No API key available. Add ${names} to .env.local and restart, or paste a key in Settings.`;
}
