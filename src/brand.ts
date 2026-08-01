// ============================================================
// BRAND CONFIG
// ============================================================
// The footer that renders on every slide, and the handle stamped on CTA
// slides. The defaults below are placeholders so a fresh clone runs and
// looks sane without editing code.
//
// To use your own brand without committing it, set these in .env.local
// (gitignored). They are read at build time and inlined into the client
// bundle, which is why they carry the NEXT_PUBLIC_ prefix — keep secrets
// out of them.
//
//   NEXT_PUBLIC_BRAND_NAME=Acme Labs
//   NEXT_PUBLIC_BRAND_HANDLE=@acmelabs
//   NEXT_PUBLIC_BRAND_TAGLINE=Tools that ship.
//   NEXT_PUBLIC_BRAND_LOGO=/images/logo.png
//   NEXT_PUBLIC_BRAND_SHOW_FOOTER=1
//   NEXT_PUBLIC_BRAND_SHOW_PAGE_NUMBERS=0
// ============================================================

export interface BrandConfig {
  /** Display name. Used by templates and the CLI generator. */
  name: string;
  /** Rendered in the footer and stamped on CTA slides. */
  handle: string;
  /** Optional logo path under /public. Empty renders no logo. */
  logoSrc: string;
  showFooter: boolean;
  showPageNumbers: boolean;
  /** One short line under the handle. Renders small. */
  tagline: string;
}

/** Env values are strings. Treat only an explicit falsy value as false. */
function flag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  const v = value.trim().toLowerCase();
  return !(v === "0" || v === "false" || v === "no");
}

export const BRAND: BrandConfig = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME?.trim() || "Your Brand",
  handle: process.env.NEXT_PUBLIC_BRAND_HANDLE?.trim() || "@yourhandle",
  logoSrc: process.env.NEXT_PUBLIC_BRAND_LOGO?.trim() || "",
  showFooter: flag(process.env.NEXT_PUBLIC_BRAND_SHOW_FOOTER, true),
  showPageNumbers: flag(process.env.NEXT_PUBLIC_BRAND_SHOW_PAGE_NUMBERS, false),
  tagline:
    process.env.NEXT_PUBLIC_BRAND_TAGLINE?.trim() || "Your one-line tagline.",
};
