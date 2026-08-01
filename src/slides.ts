import type { SlideData, BgType, FormatId, FontId, SurfaceId, AccentId, PurposeId } from "./lib/types";

export const SLIDES: SlideData[] = [
  {
    type: "hook",
    text: "ChatGPT costs\n$20 a month.\nThis does the same.\nFree.",
    highlight: "Free",
    highlightStyle: "italic-box",
  },
  {
    type: "body",
    title: "1. ANY MODEL",
    text: "Ollama. OpenRouter.\nvLLM. llama.cpp.\nGitHub Copilot.\n\nSwap any time.",
    highlight: "Swap any time",
  },
  {
    type: "body",
    title: "2. COOKBOOK",
    text: "Scans your hardware.\nRecommends models.\nOne click to download.\n\nNo GPU panic.",
    highlight: "Scans your hardware",
  },
  {
    type: "body",
    title: "3. BLIND COMPARE",
    text: "Test 3 models\nside by side.\nNames hidden.\n\nNo brand bias.",
    highlight: "Names hidden",
  },
  {
    type: "body",
    title: "4. REAL AGENTS",
    text: "Shell access.\nReads files.\nSearches web.\nRemembers everything.\n\nNot just chat.",
    highlight: "Not just chat",
  },
  {
    type: "body",
    title: "5. WORKS ON PHONE",
    text: "Install as a PWA.\nFull AI workspace\nin your pocket.\n\nNo cloud. All yours.",
    highlight: "in your pocket",
  },
  {
    type: "cta",
    text: "Odysseus.\nFree on GitHub.\n\n27,000 stars\nin 7 days.\n\nFollow ↓",
    highlight: "Odysseus",
    highlightStyle: "italic-box",
    handle: "@yourhandle",
  },
];

export const DEFAULT_FONT: FontId = "minimal";
export const DEFAULT_SURFACE: SurfaceId = "nord";
export const DEFAULT_ACCENT: AccentId = "blue";
export const DEFAULT_PURPOSE: PurposeId = "carousel";
export const DEFAULT_BG: BgType = "blobs";
export const DEFAULT_FORMAT: FormatId = "tiktok-9x16";
