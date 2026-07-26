// Caller-supplied API keys, held in this browser only.
//
// They are attached to each AI request and forwarded straight to the provider.
// Nothing is written to disk or to a database on the server side.

export type Provider = "openrouter" | "anthropic" | "openai";
export type UserKeys = Partial<Record<Provider, string>>;

export const PROVIDERS: Provider[] = ["openrouter", "anthropic", "openai"];

export const PROVIDER_LABEL: Record<Provider, string> = {
  openrouter: "OpenRouter",
  anthropic: "Anthropic",
  openai: "OpenAI",
};

export const PROVIDER_HINT: Record<Provider, string> = {
  openrouter: "Slide and hook generation",
  anthropic: "Alternative for slides and hooks",
  openai: "AI slide images (gpt-image-1)",
};

export const PROVIDER_PLACEHOLDER: Record<Provider, string> = {
  openrouter: "sk-or-...",
  anthropic: "sk-ant-...",
  openai: "sk-...",
};

const STORAGE_KEY = "swipecraft:apiKeys";

export function loadUserKeys(): UserKeys {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: UserKeys = {};
    for (const p of PROVIDERS) {
      const v = (parsed as Record<string, unknown>)[p];
      if (typeof v === "string" && v.trim()) out[p] = v.trim();
    }
    return out;
  } catch {
    return {};
  }
}

export function saveUserKeys(keys: UserKeys): void {
  if (typeof window === "undefined") return;
  const clean: UserKeys = {};
  for (const p of PROVIDERS) {
    const v = keys[p];
    if (typeof v === "string" && v.trim()) clean[p] = v.trim();
  }
  try {
    if (Object.keys(clean).length === 0) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch {
    // Private browsing or a full quota. The keys just do not persist.
  }
}

/** Show enough of a saved key to recognise it, never the whole thing. */
export function maskKey(key: string): string {
  if (key.length <= 10) return "•".repeat(key.length);
  return `${key.slice(0, 6)}${"•".repeat(8)}${key.slice(-4)}`;
}
