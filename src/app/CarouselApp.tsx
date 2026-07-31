"use client";

import { useRef, useState, useCallback, useEffect, ReactNode, createContext, useContext } from "react";
import { toPng, toJpeg } from "html-to-image";
import type { SlideData, BgType, StylePreset, FontId, SurfaceId, AccentId, PurposeId, FormatId } from "../lib/types";
import { FONT_STYLES, SURFACES, ACCENTS, composePreset, FORMAT_PRESETS } from "../lib/presets";
import { SLIDES, DEFAULT_FONT, DEFAULT_SURFACE, DEFAULT_ACCENT, DEFAULT_PURPOSE, DEFAULT_BG, DEFAULT_FORMAT } from "../slides";
import { BRAND } from "../brand";
import { loadUserKeys, saveUserKeys, maskKey, PROVIDERS, PROVIDER_LABEL, PROVIDER_HINT, PROVIDER_PLACEHOLDER, type UserKeys } from "../lib/userKeys";
import { VOICES, DEFAULT_VOICE, type VoiceId } from "../lib/voices";

function BrandFooter({ preset }: { preset: StylePreset }) {
  if (!BRAND.showFooter) return null;
  return (
    <div
      style={{
        position: "absolute",
        bottom: 24,
        left: 80,
        right: 80,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontFamily: preset.fontFamily,
        fontSize: 22,
        color: preset.textSecondary,
        opacity: 0.7,
        letterSpacing: "0.02em",
        zIndex: 3,
        pointerEvents: "none",
      }}
    >
      <span style={{ fontWeight: 600, color: preset.accentColor }}>{BRAND.handle}</span>
      <span>{BRAND.tagline}</span>
    </div>
  );
}

const CANVAS_W = FORMAT_PRESETS[DEFAULT_FORMAT].w;
const CANVAS_H = FORMAT_PRESETS[DEFAULT_FORMAT].h;

const CanvasSizeContext = createContext({ w: CANVAS_W, h: CANVAS_H });
function useCanvasSize() { return useContext(CanvasSizeContext); }

const FontScaleContext = createContext(1.0);
function useFontScale() { return useContext(FontScaleContext); }

type AlignT = "left" | "center" | "right";
const SlideAlignContext = createContext<AlignT>("center");
function useSlideAlign() { return useContext(SlideAlignContext); }
function alignToFlex(a: AlignT): "flex-start" | "center" | "flex-end" {
  return a === "left" ? "flex-start" : a === "right" ? "flex-end" : "center";
}

const SafeZoneContext = createContext(false);
function useSafeZone() { return useContext(SafeZoneContext); }

// Free-position offset for a slide's text block, in canvas px (1080-wide space)
type Offset = { x: number; y: number };
const SlideOffsetContext = createContext<Offset>({ x: 0, y: 0 });
function useSlideOffset() { return useContext(SlideOffsetContext); }

// Platform UI overlay zones for 1080x1920 (9:16). Worst-case = TikTok.
// Each platform covers different chunks. Show all three when overlay is on.
function SafeZoneOverlay() {
  const show = useSafeZone();
  if (!show) return null;
  const { w, h } = useCanvasSize();
  if (w !== 1080 || h !== 1920) return null; // only for 9:16
  // Approx clip rectangles (in 1080x1920 coords) — measured on real device screenshots
  const zones = [
    // TikTok (worst case): top header, bottom caption + nav, right action stack
    { name: "TikTok top", color: "#ff3b30", x: 0, y: 0, w: 1080, h: 280 },
    { name: "TikTok bottom", color: "#ff3b30", x: 0, y: 1240, w: 1080, h: 680 },
    { name: "TikTok actions", color: "#ff3b30", x: 820, y: 760, w: 260, h: 540 },
    // Instagram Reels (lighter overlay)
    { name: "IG top", color: "#ff9500", x: 0, y: 0, w: 1080, h: 200 },
    { name: "IG bottom", color: "#ff9500", x: 0, y: 1500, w: 1080, h: 420 },
    { name: "IG actions", color: "#ff9500", x: 880, y: 900, w: 200, h: 480 },
    // YouTube Shorts (lightest)
    { name: "YT top", color: "#ffcc00", x: 0, y: 0, w: 1080, h: 160 },
    { name: "YT bottom", color: "#ffcc00", x: 0, y: 1520, w: 1080, h: 400 },
  ];
  return (
    <>
      {zones.map((z, i) => (
        <div
          key={i}
          data-safezone="1"
          style={{
            position: "absolute",
            left: z.x,
            top: z.y,
            width: z.w,
            height: z.h,
            background: `${z.color}22`,
            border: `3px dashed ${z.color}`,
            pointerEvents: "none",
            zIndex: 999,
          }}
        />
      ))}
      <div
        data-safezone="1"
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          fontSize: 22,
          fontWeight: 800,
          color: "#fff",
          background: "rgba(0,0,0,0.7)",
          padding: "8px 14px",
          borderRadius: 8,
          zIndex: 1000,
          pointerEvents: "none",
        }}
      >
        SAFE ZONES: TikTok / IG / YT
      </div>
    </>
  );
}

// ============================================================
// ADAPTIVE FONT SIZE
// ============================================================

function getAdaptiveFontSize(text: string, type: "hook" | "body"): number {
  const chars = text.replace(/\n/g, "").length;
  const lines = text.split("\n").length;
  const maxLineLen = Math.max(...text.split("\n").map((l) => l.length));

  if (type === "hook") {
    let sizeByChars = 170;
    if (chars > 70) sizeByChars = 104;
    else if (chars > 50) sizeByChars = 120;
    else if (chars > 30) sizeByChars = 140;
    else if (chars > 20) sizeByChars = 156;

    let sizeByLines = 170;
    if (lines > 4) sizeByLines = 104;
    else if (lines > 3) sizeByLines = 120;
    else if (lines > 2) sizeByLines = 144;

    // Unbounded bold is wide (Cyrillic more so) — cap by longest explicit line
    // so long words don't overflow 920px content area (1080 − 80×2 padding).
    let sizeByMaxLine = 170;
    if (lines > 1) {
      if (maxLineLen > 14) sizeByMaxLine = 88;
      else if (maxLineLen > 12) sizeByMaxLine = 108;
      else if (maxLineLen > 10) sizeByMaxLine = 124;
      else if (maxLineLen > 8) sizeByMaxLine = 140;
    }

    return Math.min(sizeByChars, sizeByLines, sizeByMaxLine);
  }

  // body
  let sizeByChars = 88;
  if (chars > 160) sizeByChars = 48;
  else if (chars > 120) sizeByChars = 56;
  else if (chars > 80) sizeByChars = 64;
  else if (chars > 40) sizeByChars = 76;

  let sizeByLines = 88;
  if (lines > 6) sizeByLines = 48;
  else if (lines > 5) sizeByLines = 54;
  else if (lines > 4) sizeByLines = 62;
  else if (lines > 3) sizeByLines = 72;

  return Math.min(sizeByChars, sizeByLines);
}

// ============================================================
// DECORATIVE BLOBS
// ============================================================

function seededRandom(seed: number): () => number {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateBlobPath(
  rng: () => number,
  cx: number,
  cy: number,
  radius: number,
  points: number = 7
): string {
  const angleStep = (Math.PI * 2) / points;
  const pts: { x: number; y: number }[] = [];

  for (let i = 0; i < points; i++) {
    const angle = angleStep * i - Math.PI / 2;
    const r = radius * (0.7 + rng() * 0.6);
    pts.push({
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
    });
  }

  // Build smooth cubic bezier path through points
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < points; i++) {
    const curr = pts[i];
    const next = pts[(i + 1) % points];
    const prev = pts[(i - 1 + points) % points];
    const nextNext = pts[(i + 2) % points];

    const cp1x = curr.x + (next.x - prev.x) * 0.25;
    const cp1y = curr.y + (next.y - prev.y) * 0.25;
    const cp2x = next.x - (nextNext.x - curr.x) * 0.25;
    const cp2y = next.y - (nextNext.y - curr.y) * 0.25;

    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${next.x} ${next.y}`;
  }
  d += " Z";
  return d;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

// Corner zones where blobs can appear without overlapping text
const BLOB_ZONES = [
  { x: 0.1, y: 0.05 },   // top-left
  { x: 0.85, y: 0.05 },  // top-right
  { x: 0.05, y: 0.85 },  // bottom-left
  { x: 0.9, y: 0.8 },    // bottom-right
  { x: 0.85, y: 0.45 },  // mid-right
  { x: 0.05, y: 0.4 },   // mid-left
];

function SlideDecorations({
  slideIndex,
  preset,
}: {
  slideIndex: number;
  preset: StylePreset;
}) {
  const { w: CANVAS_W, h: CANVAS_H } = useCanvasSize();
  const rng = seededRandom(slideIndex * 7919 + 42);
  const blobCount = 1 + Math.floor(rng() * 2); // 1-2 blobs
  const { r, g, b } = hexToRgb(preset.accentColor);

  const blobs: ReactNode[] = [];

  for (let i = 0; i < blobCount; i++) {
    const zoneIdx = Math.floor(rng() * BLOB_ZONES.length);
    const zone = BLOB_ZONES[zoneIdx];
    const cx = zone.x * CANVAS_W + (rng() - 0.5) * 100;
    const cy = zone.y * CANVAS_H + (rng() - 0.5) * 100;
    const radius = 150 + rng() * 200;
    const opacity = 0.06 + rng() * 0.06;
    const rotation = rng() * 360;

    const path = generateBlobPath(rng, 0, 0, radius);

    blobs.push(
      <g
        key={i}
        transform={`translate(${cx}, ${cy}) rotate(${rotation})`}
      >
        <path
          d={path}
          fill={`rgba(${r}, ${g}, ${b}, ${opacity})`}
        />
      </g>
    );
  }

  return (
    <svg
      width={CANVAS_W}
      height={CANVAS_H}
      viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        pointerEvents: "none",
      }}
    >
      {blobs}
    </svg>
  );
}

// ============================================================
// BACKGROUND DECORATIONS (grid / noise / bignumber / glow / lines)
// ============================================================

function GridDecoration({ preset }: { preset: StylePreset }) {
  const { w: CANVAS_W, h: CANVAS_H } = useCanvasSize();
  const { r, g, b } = hexToRgb(preset.accentColor);
  return (
    <svg
      width={CANVAS_W}
      height={CANVAS_H}
      style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
    >
      <defs>
        <pattern id="dotgrid" width="60" height="60" patternUnits="userSpaceOnUse">
          <circle cx="30" cy="30" r="2.5" fill={`rgba(${r},${g},${b},0.14)`} />
        </pattern>
      </defs>
      <rect width={CANVAS_W} height={CANVAS_H} fill="url(#dotgrid)" />
    </svg>
  );
}

function LinesDecoration({ preset }: { preset: StylePreset }) {
  const { w: CANVAS_W, h: CANVAS_H } = useCanvasSize();
  const { r, g, b } = hexToRgb(preset.accentColor);
  return (
    <svg
      width={CANVAS_W}
      height={CANVAS_H}
      style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
    >
      <defs>
        <pattern
          id="diaglines"
          width="64"
          height="64"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-35)"
        >
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="64"
            stroke={`rgba(${r},${g},${b},0.08)`}
            strokeWidth="3"
          />
        </pattern>
      </defs>
      <rect width={CANVAS_W} height={CANVAS_H} fill="url(#diaglines)" />
    </svg>
  );
}

function PaperDecoration({ preset }: { preset: StylePreset }) {
  const { w: CANVAS_W, h: CANVAS_H } = useCanvasSize();
  const { r, g, b } = hexToRgb(preset.textColor);
  const lineColor = `rgba(${r},${g},${b},0.12)`;
  const marginColor = `rgba(${r},${g},${b},0.22)`;
  return (
    <svg
      width={CANVAS_W}
      height={CANVAS_H}
      style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
    >
      <defs>
        <pattern id="ruledlines" width={CANVAS_W} height="64" patternUnits="userSpaceOnUse">
          <line
            x1="0"
            y1="64"
            x2={CANVAS_W}
            y2="64"
            stroke={lineColor}
            strokeWidth="1.5"
          />
        </pattern>
      </defs>
      <rect width={CANVAS_W} height={CANVAS_H} fill="url(#ruledlines)" />
      <line
        x1="140"
        y1="0"
        x2="140"
        y2={CANVAS_H}
        stroke={marginColor}
        strokeWidth="2"
      />
    </svg>
  );
}

function NoiseDecoration({ slideIndex }: { slideIndex: number }) {
  const { w: CANVAS_W, h: CANVAS_H } = useCanvasSize();
  const id = `noise-${slideIndex}`;
  return (
    <svg
      width={CANVAS_W}
      height={CANVAS_H}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        pointerEvents: "none",
        mixBlendMode: "overlay",
        opacity: 0.6,
      }}
    >
      <filter id={id}>
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.85"
          numOctaves="2"
          seed={slideIndex + 1}
        />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width={CANVAS_W} height={CANVAS_H} filter={`url(#${id})`} />
    </svg>
  );
}

function BigNumberDecoration({
  slideIndex,
  preset,
}: {
  slideIndex: number;
  preset: StylePreset;
}) {
  const { r, g, b } = hexToRgb(preset.accentColor);
  return (
    <div
      style={{
        position: "absolute",
        right: -60,
        bottom: -280,
        fontSize: 960,
        fontFamily: preset.fontFamily,
        fontWeight: 900,
        color: `rgba(${r},${g},${b},0.055)`,
        lineHeight: 0.8,
        letterSpacing: "-0.06em",
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      {String(slideIndex + 1).padStart(2, "0")}
    </div>
  );
}

function GlowDecoration({
  slideIndex,
  preset,
}: {
  slideIndex: number;
  preset: StylePreset;
}) {
  const { r, g, b } = hexToRgb(preset.accentColor);
  // alternate corners by slide index
  const positions = [
    { top: -200, right: -200 },
    { bottom: -200, left: -200 },
    { top: -200, left: -200 },
    { bottom: -200, right: -200 },
  ];
  const pos = positions[slideIndex % positions.length];
  return (
    <div
      style={{
        position: "absolute",
        ...pos,
        width: 900,
        height: 900,
        background: `radial-gradient(circle, rgba(${r},${g},${b},0.22), transparent 65%)`,
        filter: "blur(60px)",
        pointerEvents: "none",
      }}
    />
  );
}

function SlideBackground({
  bgType,
  slideIndex,
  preset,
}: {
  bgType: BgType;
  slideIndex: number;
  preset: StylePreset;
}) {
  switch (bgType) {
    case "blobs":
      return <SlideDecorations slideIndex={slideIndex} preset={preset} />;
    case "grid":
      return <GridDecoration preset={preset} />;
    case "lines":
      return <LinesDecoration preset={preset} />;
    case "paper":
      return <PaperDecoration preset={preset} />;
    case "noise":
      return <NoiseDecoration slideIndex={slideIndex} />;
    case "bignumber":
      return <BigNumberDecoration slideIndex={slideIndex} preset={preset} />;
    case "glow":
      return <GlowDecoration slideIndex={slideIndex} preset={preset} />;
    case "none":
    default:
      return null;
  }
}

// ============================================================
// HELPERS — badge, highlight, text balance
// ============================================================

function renderWithHighlight(
  text: string,
  highlight: string | undefined,
  highlightColor: string,
  style: "default" | "italic-box" = "default"
): ReactNode {
  if (!highlight) return text;
  const escaped = highlight.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return parts.map((part, i) => {
    if (part.toLowerCase() !== highlight.toLowerCase()) {
      return <span key={i}>{part}</span>;
    }
    if (style === "italic-box") {
      return (
        <span
          key={i}
          style={{
            fontFamily: "var(--font-playfair), Georgia, serif",
            fontStyle: "italic",
            fontWeight: 700,
            background: highlightColor,
            color: "#ffffff",
            // no vertical padding — box matches line-box, horizontal breathing only
            padding: "0 0.22em",
            borderRadius: 6,
            textTransform: "none",
            letterSpacing: "-0.01em",
            whiteSpace: "nowrap",
            boxDecorationBreak: "clone",
            WebkitBoxDecorationBreak: "clone",
          }}
        >
          {part}
        </span>
      );
    }
    return (
      <span
        key={i}
        style={{ color: highlightColor, position: "relative" }}
      >
        {part}
      </span>
    );
  });
}

function Badge({ text, preset }: { text: string; preset: StylePreset }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 80,
        right: 80,
        fontFamily: preset.fontFamily,
        fontSize: 200,
        fontWeight: 900,
        color: preset.accentColor,
        lineHeight: 0.9,
        letterSpacing: "-0.04em",
        opacity: 0.95,
        pointerEvents: "none",
        zIndex: 2,
      }}
    >
      {text}
    </div>
  );
}

function TitleDivider({ preset }: { preset: StylePreset }) {
  if (preset.titleDivider === false) return null;
  return (
    <div
      style={{
        width: 96,
        height: 4,
        background: preset.accentColor,
        opacity: 0.6,
        marginBottom: 64,
        position: "relative",
      }}
    />
  );
}

function SlideTitle({
  text,
  preset,
  highlight,
  highlightStyle,
  scale = 1.0,
}: {
  text: string;
  preset: StylePreset;
  highlight?: string;
  highlightStyle?: "default" | "italic-box";
  scale?: number;
}) {
  return (
    <div
      style={{
        fontFamily: preset.fontFamily,
        fontSize: Math.round((preset.titleFontSize ?? 44) * scale),
        fontWeight: preset.titleFontWeight ?? 800,
        color: preset.titleColor ?? preset.accentColor,
        textTransform: (preset.titleUppercase ?? true) ? "uppercase" : "none",
        letterSpacing: (preset.titleUppercase ?? true) ? "0.06em" : "-0.02em",
        lineHeight: 1.1,
        marginBottom: 28,
        position: "relative",
        textWrap: "balance" as const,
      }}
    >
      {renderWithHighlight(text, highlight, preset.highlightColor, highlightStyle)}
    </div>
  );
}

// ============================================================
// SLIDE COMPONENTS
// ============================================================

function SlideCounter({
  current,
  total,
  color,
}: {
  current: number;
  total: number;
  color: string;
}) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 60,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        gap: 8,
      }}
    >
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          style={{
            width: i === current ? 24 : 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: color,
            opacity: i === current ? 1 : 0.3,
            transition: "all 0.2s",
          }}
        />
      ))}
    </div>
  );
}

function SlideHook({
  data,
  preset,
  index,
  total,
  bgType,
}: {
  data: SlideData;
  preset: StylePreset;
  index: number;
  total: number;
  bgType: BgType;
}) {
  const { w: CANVAS_W, h: CANVAS_H } = useCanvasSize();
  const globalScale = useFontScale();
  const scale = globalScale * (data.fontScale ?? 1.0);
  const align = useSlideAlign();
  const off = useSlideOffset();
  return (
    <div
      style={{
        width: CANVAS_W,
        height: CANVAS_H,
        background: preset.bgGradient || preset.bg,
        position: "relative",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: alignToFlex(align),
        textAlign: align,
        padding: "320px 220px 680px 220px",
        fontFamily: preset.hookFontFamily || preset.fontFamily,
        boxSizing: "border-box",
      }}
    >
      <SlideBackground bgType={bgType} slideIndex={index} preset={preset} />
      <SafeZoneOverlay />
      {data.badge && <Badge text={data.badge} preset={preset} />}
      <div
        data-textblock="1"
        style={{
          fontSize: Math.round(getAdaptiveFontSize(data.text || "", "hook") * 1.35 * scale),
          fontWeight: 800,
          color: preset.textColor,
          lineHeight: data.highlightStyle === "italic-box" ? 1.12 : 1.02,
          whiteSpace: "pre-line",
          letterSpacing: "-0.03em",
          position: "relative",
          textWrap: "balance" as const,
          textAlign: "center",
          transform: `translate(${off.x}px, ${off.y}px)`,
        }}
      >
        {renderWithHighlight(data.text || "", data.highlight, preset.highlightColor, data.highlightStyle)}
      </div>
      {BRAND.showPageNumbers && <SlideCounter current={index} total={total} color={preset.accentColor} />}
      <BrandFooter preset={preset} />
    </div>
  );
}

function getPointsFontSize(points: Array<{ type: string; text: string }>): number {
  const count = points.length;
  const maxLen = Math.max(...points.map((p) => p.text.length));
  let byCount = 62;
  if (count >= 6) byCount = 44;
  else if (count >= 5) byCount = 48;
  else if (count >= 4) byCount = 54;
  else if (count >= 3) byCount = 58;
  let byLen = 62;
  if (maxLen > 50) byLen = 44;
  else if (maxLen > 40) byLen = 50;
  else if (maxLen > 30) byLen = 56;
  return Math.min(byCount, byLen);
}

function IconCheck({ size }: { size: number }) {
  const stroke = Math.max(1.5, size * 0.1);
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 13 9 18 20 7" />
    </svg>
  );
}

function IconCross({ size }: { size: number }) {
  const stroke = Math.max(1.5, size * 0.1);
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round">
      <line x1="5" y1="5" x2="19" y2="19" />
      <line x1="19" y1="5" x2="5" y2="19" />
    </svg>
  );
}

function SlideBody({
  data,
  preset,
  index,
  total,
  bgType,
}: {
  data: SlideData;
  preset: StylePreset;
  index: number;
  total: number;
  bgType: BgType;
}) {
  const { w: CANVAS_W, h: CANVAS_H } = useCanvasSize();
  const globalScale = useFontScale();
  const scale = globalScale * (data.fontScale ?? 1.0);
  const isCta = data.type === "cta";
  const align = useSlideAlign();
  const off = useSlideOffset();
  const shift = `translate(${off.x}px, ${off.y}px)`;
  return (
    <div
      style={{
        width: CANVAS_W,
        height: CANVAS_H,
        background: preset.bgGradient || preset.bg,
        position: "relative",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: alignToFlex(align),
        textAlign: align,
        padding: "320px 220px 680px 220px",
        fontFamily: preset.fontFamily,
        boxSizing: "border-box",
      }}
    >
      <SlideBackground bgType={bgType} slideIndex={index} preset={preset} />
      <SafeZoneOverlay />
      {data.badge && <Badge text={data.badge} preset={preset} />}
      {data.title && (
        <div data-textblock="1" style={{ transform: shift, display: "flex", flexDirection: "column", alignItems: alignToFlex(align) }}>
          <SlideTitle text={data.title} preset={preset} highlight={data.highlight} highlightStyle={data.highlightStyle} scale={scale} />
          <TitleDivider preset={preset} />
        </div>
      )}
      {data.points ? (
        <div style={{ display: "flex", flexDirection: "column", position: "relative" }}>
          {data.points.map((point, i) => {
            const fontSize = getPointsFontSize(data.points!);
            const iconSize = Math.round(fontSize * 0.65);
            const isFirstMinus = point.type === "minus" && (i === 0 || data.points![i - 1].type === "plus");
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: Math.round(fontSize * 0.45),
                  marginTop: isFirstMinus ? Math.round(fontSize * 0.9) : (i === 0 ? 0 : Math.round(fontSize * 0.3)),
                }}
              >
                <div style={{ flexShrink: 0, display: "flex", alignItems: "center", color: point.type === "plus" ? "#22c55e" : preset.textSecondary }}>
                  {point.type === "plus" ? <IconCheck size={iconSize} /> : <IconCross size={iconSize} />}
                </div>
                <span style={{ fontSize, fontWeight: 600, color: point.type === "plus" ? preset.textColor : preset.textSecondary, lineHeight: 1.25, letterSpacing: "-0.01em" }}>
                  {point.text}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div
          data-textblock="1"
          style={{
            fontSize: Math.round(getAdaptiveFontSize(data.text || "", "body") * scale * (isCta ? 1.25 : 1.0)),
            fontWeight: isCta ? 800 : (preset.bodyFontWeight ?? 600),
            color: preset.bodyColor ?? preset.textColor,
            lineHeight: preset.bodyLineHeight ?? 1.2,
            whiteSpace: "pre-line",
            letterSpacing: "-0.01em",
            position: "relative",
            textWrap: "balance" as const,
            transform: shift,
          }}
        >
          {renderWithHighlight(data.text || "", data.highlight, preset.highlightColor, data.highlightStyle)}
        </div>
      )}
      {data.handle && (
        <div
          style={{
            fontFamily: preset.fontFamily,
            fontSize: isCta ? 64 : 72,
            fontWeight: 800,
            color: preset.accentColor,
            marginTop: isCta ? 60 : 56,
            letterSpacing: "-0.02em",
            position: "relative",
            padding: isCta ? "12px 32px" : 0,
            border: isCta ? `3px solid ${preset.accentColor}` : "none",
            borderRadius: isCta ? 18 : 0,
            background: isCta ? `${preset.accentColor}15` : "transparent",
          }}
        >
          {data.handle}
        </div>
      )}
      <SlideCounter current={index} total={total} color={preset.accentColor} />
    </div>
  );
}

// ============================================================
// NEW SLIDE TYPES
// ============================================================

function SlideShell({
  children,
  preset,
  index,
  total,
  bgType,
  center,
}: {
  children: ReactNode;
  preset: StylePreset;
  index: number;
  total: number;
  bgType: BgType;
  center?: boolean;
}) {
  const { w: CANVAS_W, h: CANVAS_H } = useCanvasSize();
  return (
    <div
      style={{
        width: CANVAS_W,
        height: CANVAS_H,
        background: preset.bgGradient || preset.bg,
        position: "relative",
        display: "flex",
        flexDirection: "column",
        justifyContent: center ? "center" : "center",
        alignItems: "center",
        textAlign: "center",
        padding: "320px 220px 680px 220px",
        fontFamily: preset.fontFamily,
        boxSizing: "border-box",
      }}
    >
      <SlideBackground bgType={bgType} slideIndex={index} preset={preset} />
      <SafeZoneOverlay />
      {children}
      {BRAND.showPageNumbers && <SlideCounter current={index} total={total} color={preset.accentColor} />}
      <BrandFooter preset={preset} />
    </div>
  );
}

function SlideList({
  data,
  preset,
  index,
  total,
  bgType,
}: {
  data: SlideData;
  preset: StylePreset;
  index: number;
  total: number;
  bgType: BgType;
}) {
  const items = data.items || [];
  return (
    <SlideShell preset={preset} index={index} total={total} bgType={bgType}>
      {data.badge && <Badge text={data.badge} preset={preset} />}
      {data.title && (
        <>
          <SlideTitle text={data.title} preset={preset} highlight={data.highlight} highlightStyle={data.highlightStyle} />
          <TitleDivider preset={preset} />
        </>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 32, position: "relative" }}>
        {items.map((item, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 28,
            }}
          >
            <div
              style={{
                fontFamily: preset.fontFamily,
                fontSize: 48,
                fontWeight: 800,
                color: preset.highlightColor,
                lineHeight: 1,
                minWidth: 80,
              }}
            >
              {String(i + 1).padStart(2, "0")}
            </div>
            <div
              style={{
                fontSize: 46,
                fontWeight: 600,
                color: preset.textColor,
                lineHeight: 1.2,
                letterSpacing: "-0.01em",
                flex: 1,
                textWrap: "balance" as const,
              }}
            >
              {item}
            </div>
          </div>
        ))}
      </div>
    </SlideShell>
  );
}

function SlideStats({
  data,
  preset,
  index,
  total,
  bgType,
}: {
  data: SlideData;
  preset: StylePreset;
  index: number;
  total: number;
  bgType: BgType;
}) {
  const stats = data.stats || [];
  return (
    <SlideShell preset={preset} index={index} total={total} bgType={bgType}>
      {data.badge && <Badge text={data.badge} preset={preset} />}
      {data.title && (
        <>
          <SlideTitle text={data.title} preset={preset} highlight={data.highlight} highlightStyle={data.highlightStyle} />
          <TitleDivider preset={preset} />
        </>
      )}
      <div
        style={{
          display: "flex",
          flexDirection: stats.length > 2 ? "column" : "row",
          gap: 48,
          position: "relative",
        }}
      >
        {stats.map((stat, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div
              style={{
                fontFamily: preset.fontFamily,
                fontSize: stats.length > 2 ? 140 : 170,
                fontWeight: 900,
                color: preset.highlightColor,
                lineHeight: 0.9,
                letterSpacing: "-0.04em",
              }}
            >
              {stat.value}
            </div>
            <div
              style={{
                fontSize: 32,
                fontWeight: 500,
                color: preset.textSecondary,
                marginTop: 12,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {stat.label}
            </div>
          </div>
        ))}
      </div>
    </SlideShell>
  );
}

function SlideQuote({
  data,
  preset,
  index,
  total,
  bgType,
}: {
  data: SlideData;
  preset: StylePreset;
  index: number;
  total: number;
  bgType: BgType;
}) {
  return (
    <SlideShell preset={preset} index={index} total={total} bgType={bgType}>
      <div
        style={{
          fontFamily: preset.fontFamily,
          fontSize: 200,
          fontWeight: 900,
          color: preset.highlightColor,
          lineHeight: 0.7,
          marginBottom: 24,
          position: "relative",
        }}
      >
        “
      </div>
      <div
        style={{
          fontSize: 62,
          fontWeight: 600,
          color: preset.textColor,
          lineHeight: 1.2,
          letterSpacing: "-0.01em",
          whiteSpace: "pre-line",
          position: "relative",
          textWrap: "balance" as const,
        }}
      >
        {renderWithHighlight(data.text || "", data.highlight, preset.highlightColor, data.highlightStyle)}
      </div>
      {data.author && (
        <div
          style={{
            marginTop: 48,
            fontFamily: preset.fontFamily,
            fontSize: 32,
            fontWeight: 700,
            color: preset.accentColor,
            letterSpacing: "0.04em",
            position: "relative",
          }}
        >
          — {data.author}
          {data.role && (
            <span
              style={{ color: preset.textSecondary, fontWeight: 400, marginLeft: 12 }}
            >
              {data.role}
            </span>
          )}
        </div>
      )}
    </SlideShell>
  );
}

function SlideChecklist({
  data,
  preset,
  index,
  total,
  bgType,
}: {
  data: SlideData;
  preset: StylePreset;
  index: number;
  total: number;
  bgType: BgType;
}) {
  const items = data.items || [];
  return (
    <SlideShell preset={preset} index={index} total={total} bgType={bgType}>
      {data.badge && <Badge text={data.badge} preset={preset} />}
      {data.title && (
        <>
          <SlideTitle text={data.title} preset={preset} highlight={data.highlight} highlightStyle={data.highlightStyle} />
          <TitleDivider preset={preset} />
        </>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 28, position: "relative" }}>
        {items.map((item, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 28,
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 12,
                background: preset.highlightColor,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                color: preset.bg,
                fontSize: 34,
                fontWeight: 900,
                fontFamily: preset.fontFamily,
              }}
            >
              ✓
            </div>
            <div
              style={{
                fontSize: 44,
                fontWeight: 600,
                color: preset.textColor,
                lineHeight: 1.2,
                letterSpacing: "-0.01em",
                flex: 1,
              }}
            >
              {item}
            </div>
          </div>
        ))}
      </div>
    </SlideShell>
  );
}

function SlideProcess({
  data,
  preset,
  index,
  total,
  bgType,
}: {
  data: SlideData;
  preset: StylePreset;
  index: number;
  total: number;
  bgType: BgType;
}) {
  const steps = data.steps || [];
  return (
    <SlideShell preset={preset} index={index} total={total} bgType={bgType}>
      {data.badge && <Badge text={data.badge} preset={preset} />}
      {data.title && (
        <>
          <SlideTitle text={data.title} preset={preset} highlight={data.highlight} highlightStyle={data.highlightStyle} />
          <TitleDivider preset={preset} />
        </>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 36, position: "relative" }}>
        {steps.map((step, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 24 }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  background: preset.highlightColor,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: preset.bg,
                  fontFamily: preset.fontFamily,
                  fontWeight: 900,
                  fontSize: 32,
                }}
              >
                {i + 1}
              </div>
              {i < steps.length - 1 && (
                <div
                  style={{
                    width: 4,
                    height: 56,
                    background: preset.accentColor,
                    opacity: 0.3,
                    marginTop: 8,
                  }}
                />
              )}
            </div>
            <div style={{ flex: 1, paddingTop: 4 }}>
              <div
                style={{
                  fontFamily: preset.fontFamily,
                  fontSize: 36,
                  fontWeight: 700,
                  color: preset.accentColor,
                  letterSpacing: "0.02em",
                  marginBottom: 8,
                }}
              >
                {step.title}
              </div>
              {step.text && (
                <div
                  style={{
                    fontSize: 30,
                    fontWeight: 500,
                    color: preset.textSecondary,
                    lineHeight: 1.3,
                  }}
                >
                  {step.text}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </SlideShell>
  );
}

function SlideComparison({
  data,
  preset,
  index,
  total,
  bgType,
}: {
  data: SlideData;
  preset: StylePreset;
  index: number;
  total: number;
  bgType: BgType;
}) {
  const allItems = [...(data.leftItems || []), ...(data.rightItems || [])];
  const maxItems = Math.max(data.leftItems?.length || 0, data.rightItems?.length || 0);
  const maxItemLen = Math.max(0, ...allItems.map((i) => i.length));
  let itemSize = 48;
  if (maxItems >= 5 || maxItemLen > 48) itemSize = 34;
  else if (maxItems >= 4 || maxItemLen > 36) itemSize = 40;
  else if (maxItemLen > 26) itemSize = 44;
  const labelSize = 40;

  return (
    <SlideShell preset={preset} index={index} total={total} bgType={bgType}>
      {data.title && (
        <>
          <SlideTitle text={data.title} preset={preset} highlight={data.highlight} highlightStyle={data.highlightStyle} />
          <TitleDivider preset={preset} />
        </>
      )}
      <div style={{ display: "flex", gap: 32, position: "relative", flex: 1, alignItems: "stretch" }}>
        {[
          { label: data.leftLabel || "", items: data.leftItems || [], color: "#EF4444" },
          { label: data.rightLabel || "", items: data.rightItems || [], color: "#E5683C" },
        ].map((col, ci) => (
          <div
            key={ci}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: 20,
              padding: 36,
              border: `3px solid ${col.color}`,
              borderRadius: 16,
            }}
          >
            <div
              style={{
                fontFamily: preset.fontFamily,
                fontSize: labelSize,
                fontWeight: 800,
                color: col.color,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 16,
              }}
            >
              {col.label}
            </div>
            {col.items.map((item, i) => (
              <div
                key={i}
                style={{
                  fontSize: itemSize,
                  fontWeight: 500,
                  color: preset.textColor,
                  lineHeight: 1.25,
                }}
              >
                · {item}
              </div>
            ))}
          </div>
        ))}
      </div>
    </SlideShell>
  );
}

function SlideImage({
  data,
  preset,
  index,
  total,
  bgType,
}: {
  data: SlideData;
  preset: StylePreset;
  index: number;
  total: number;
  bgType: BgType;
}) {
  return (
    <SlideShell preset={preset} index={index} total={total} bgType={bgType}>
      {data.badge && <Badge text={data.badge} preset={preset} />}
      {data.title && (
        <>
          <SlideTitle text={data.title} preset={preset} highlight={data.highlight} highlightStyle={data.highlightStyle} />
          <TitleDivider preset={preset} />
        </>
      )}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          gap: 32,
          position: "relative",
          minHeight: 0,
        }}
      >
        {data.imageSrc && (
          <img
            src={data.imageSrc}
            alt={data.imageCaption || data.title || "slide image"}
            crossOrigin="anonymous"
            style={{
              maxWidth: "100%",
              maxHeight: data.imageCaption ? "78%" : "88%",
              objectFit: "contain",
              borderRadius: 18,
              boxShadow: "0 18px 60px rgba(0,0,0,0.22)",
              display: "block",
            }}
          />
        )}
        {data.imageCaption && (
          <div
            style={{
              fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
              fontSize: 38,
              fontWeight: 500,
              color: preset.textColor,
              letterSpacing: "-0.005em",
              textAlign: "left",
              lineHeight: 1.35,
              textWrap: "balance" as const,
              background: "#FFF8F0",
              border: `3px solid ${preset.accentColor}`,
              borderRadius: 18,
              padding: "32px 40px",
              maxWidth: "92%",
              boxShadow: `6px 6px 0 ${preset.accentColor}`,
            }}
          >
            {data.imageCaption}
          </div>
        )}
      </div>
    </SlideShell>
  );
}

function SlideEmoji({
  data,
  preset,
  index,
  total,
  bgType,
}: {
  data: SlideData;
  preset: StylePreset;
  index: number;
  total: number;
  bgType: BgType;
}) {
  return (
    <SlideShell preset={preset} index={index} total={total} bgType={bgType} center>
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center",
          position: "relative",
        }}
      >
        {data.emoji && (
          <div
            style={{
              fontSize: 360,
              lineHeight: 1,
              marginBottom: 48,
              // deliberately no fontFamily — let OS emoji font render in color
            }}
          >
            {data.emoji}
          </div>
        )}
        {data.title && (
          <div
            style={{
              fontFamily: preset.fontFamily,
              fontSize: preset.titleFontSize ?? 72,
              fontWeight: preset.titleFontWeight ?? 800,
              color: preset.titleColor ?? preset.textColor,
              textTransform: (preset.titleUppercase ?? true) ? "uppercase" : "none",
              letterSpacing: (preset.titleUppercase ?? true) ? "0.04em" : "-0.02em",
              lineHeight: 1.1,
              marginBottom: data.text ? 20 : 0,
              textWrap: "balance" as const,
            }}
          >
            {renderWithHighlight(data.title, data.highlight, preset.highlightColor, data.highlightStyle)}
          </div>
        )}
        {data.text && (
          <div
            style={{
              fontFamily: preset.fontFamily,
              fontSize: 56,
              fontWeight: 500,
              color: preset.textSecondary,
              lineHeight: 1.25,
              maxWidth: "88%",
              textWrap: "balance" as const,
              whiteSpace: "pre-line",
            }}
          >
            {data.text}
          </div>
        )}
      </div>
    </SlideShell>
  );
}

function SlideNumber({
  data,
  preset,
  index,
  total,
  bgType,
}: {
  data: SlideData;
  preset: StylePreset;
  index: number;
  total: number;
  bgType: BgType;
}) {
  const num = data.bigNumber || "";
  const size = num.length <= 2 ? 560 : num.length <= 4 ? 420 : 320;
  return (
    <SlideShell preset={preset} index={index} total={total} bgType={bgType} center>
      {data.badge && <Badge text={data.badge} preset={preset} />}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          position: "relative",
        }}
      >
        <div
          style={{
            fontFamily: preset.hookFontFamily || preset.fontFamily,
            fontSize: size,
            fontWeight: 900,
            color: preset.highlightColor,
            lineHeight: 0.9,
            letterSpacing: "-0.05em",
            marginBottom: 24,
          }}
        >
          {num}
        </div>
        {data.title && (
          <div
            style={{
              fontFamily: preset.fontFamily,
              fontSize: 64,
              fontWeight: 800,
              color: preset.textColor,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              textWrap: "balance" as const,
              marginBottom: data.text ? 16 : 0,
            }}
          >
            {renderWithHighlight(data.title, data.highlight, preset.highlightColor, data.highlightStyle)}
          </div>
        )}
        {data.text && (
          <div
            style={{
              fontFamily: preset.fontFamily,
              fontSize: 48,
              fontWeight: 500,
              color: preset.textSecondary,
              lineHeight: 1.25,
              whiteSpace: "pre-line",
              textWrap: "balance" as const,
            }}
          >
            {data.text}
          </div>
        )}
      </div>
    </SlideShell>
  );
}

function Slide({
  data,
  preset,
  index,
  total,
  bgType,
}: {
  data: SlideData;
  preset: StylePreset;
  index: number;
  total: number;
  bgType: BgType;
}) {
  switch (data.type) {
    case "hook":
      return <SlideHook data={data} preset={preset} index={index} total={total} bgType={bgType} />;
    case "list":
      return <SlideList data={data} preset={preset} index={index} total={total} bgType={bgType} />;
    case "stats":
      return <SlideStats data={data} preset={preset} index={index} total={total} bgType={bgType} />;
    case "quote":
      return <SlideQuote data={data} preset={preset} index={index} total={total} bgType={bgType} />;
    case "checklist":
      return <SlideChecklist data={data} preset={preset} index={index} total={total} bgType={bgType} />;
    case "process":
      return <SlideProcess data={data} preset={preset} index={index} total={total} bgType={bgType} />;
    case "comparison":
      return <SlideComparison data={data} preset={preset} index={index} total={total} bgType={bgType} />;
    case "image":
      return <SlideImage data={data} preset={preset} index={index} total={total} bgType={bgType} />;
    case "emoji":
      return <SlideEmoji data={data} preset={preset} index={index} total={total} bgType={bgType} />;
    case "number":
      return <SlideNumber data={data} preset={preset} index={index} total={total} bgType={bgType} />;
    case "body":
    case "cta":
    default:
      return <SlideBody data={data} preset={preset} index={index} total={total} bgType={bgType} />;
  }
}

// ============================================================
// PREVIEW + EXPORT
// ============================================================

function SlidePreview({
  data,
  preset,
  index,
  total,
  bgType,
  onDrag,
}: {
  data: SlideData;
  preset: StylePreset;
  index: number;
  total: number;
  bgType: BgType;
  onDrag?: (dxCanvas: number, dyCanvas: number) => void;
}) {
  const { w: CANVAS_W, h: CANVAS_H } = useCanvasSize();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const scaleRef = useRef(1);
  scaleRef.current = scale;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const parent = el.parentElement;
    if (!parent) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const parentW = entry.contentRect.width;
        setScale(parentW / CANVAS_W);
      }
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, [CANVAS_W]);

  // Drag the text block to reposition it freely (Canva-style)
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!onDrag) return;
    const target = e.target as HTMLElement;
    if (!target.closest('[data-textblock="1"]')) return; // only when grabbing the text
    e.preventDefault();
    e.stopPropagation();
    let lastX = e.clientX, lastY = e.clientY;
    const move = (ev: PointerEvent) => {
      const s = scaleRef.current || 1;
      const dx = (ev.clientX - lastX) / s;
      const dy = (ev.clientY - lastY) / s;
      lastX = ev.clientX; lastY = ev.clientY;
      onDrag(dx, dy);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [onDrag]);

  return (
    <div
      className="slide-preview-wrapper"
      onPointerDown={onPointerDown}
      style={{
        width: "100%",
        aspectRatio: `${CANVAS_W}/${CANVAS_H}`,
        overflow: "hidden",
        borderRadius: 12,
        position: "relative",
        cursor: onDrag ? "grab" : "default",
      }}
    >
      <div
        ref={containerRef}
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          width: CANVAS_W,
          height: CANVAS_H,
        }}
      >
        <Slide data={data} preset={preset} index={index} total={total} bgType={bgType} />
      </div>
    </div>
  );
}

// ============================================================
// I18N
// ============================================================

type Lang = "en" | "ru";

const T = {
  en: {
    appTitle: "Swipecraft",
    rowFont: "Font",
    rowSurface: "Surface",
    rowAccent: "Accent",
    rowBg: "Background",
    rowMode: "Mode",
    rowFormat: "Format",
    btnPdf: "Export PDF",
    btnAll: "Export All",
    statusDone: "Done!",
    statusExport: (i: number, n: number) => `Exporting ${i}/${n}...`,
    statusPdf: (i: number, n: number) => `PDF ${i}/${n}...`,
    footer: (w: number, h: number, n: number) =>
      `${w}×${h}px — ${n} slides — Click a slide to export individually`,
    modes: { carousel: "Carousel", presentation: "Presentation" } as Record<PurposeId, string>,
    bgs: {
      none: "None", blobs: "Blobs", grid: "Grid", lines: "Lines",
      noise: "Noise", bignumber: "Bignumber", glow: "Glow", paper: "Ruled",
    } as Record<BgType, string>,
    surfaces: {
      dark: "Dark", white: "White", light: "Light", paper: "Paper",
      gradient: "Gradient", pastel: "Pastel", neon: "Neon", ember: "Ember",
      // Palette names are proper nouns, so they stay untranslated in every locale.
      mocha: "Mocha", latte: "Latte", rosepine: "Rosé Pine", nord: "Nord",
    } satisfies Record<SurfaceId, string>,
    accents: {
      yellow: "Yellow", red: "Red", teal: "Teal", coral: "Coral",
      orange: "Orange", violet: "Violet", lime: "Lime", blue: "Blue",
      fuchsia: "Fuchsia", pink: "Pink", amber: "Amber",
    } as Record<AccentId, string>,
  },
  ru: {
    appTitle: "Swipecraft",
    rowFont: "Шрифт",
    rowSurface: "Фон",
    rowAccent: "Акцент",
    rowBg: "Декор",
    rowMode: "Режим",
    rowFormat: "Формат",
    btnPdf: "PDF",
    btnAll: "PNG",
    statusDone: "Готово!",
    statusExport: (i: number, n: number) => `Экспорт ${i}/${n}...`,
    statusPdf: (i: number, n: number) => `PDF ${i}/${n}...`,
    footer: (w: number, h: number, n: number) =>
      `${w}×${h}px — ${n} слайдов — Нажми на слайд для экспорта`,
    modes: { carousel: "Карусель", presentation: "Презентация" } as Record<PurposeId, string>,
    bgs: {
      none: "Нет", blobs: "Пятна", grid: "Сетка", lines: "Линии",
      noise: "Шум", bignumber: "Номер", glow: "Свечение", paper: "Линейка",
    } as Record<BgType, string>,
    surfaces: {
      dark: "Тёмный", white: "Белый", light: "Светлый", paper: "Бумага",
      gradient: "Градиент", pastel: "Пастель", neon: "Неон", ember: "Уголь",
      mocha: "Mocha", latte: "Latte", rosepine: "Rosé Pine", nord: "Nord",
    } satisfies Record<SurfaceId, string>,
    accents: {
      yellow: "Жёлтый", red: "Красный", teal: "Бирюза", coral: "Коралл",
      orange: "Оранж", violet: "Фиолет", lime: "Лайм", blue: "Синий",
      fuchsia: "Фуксия", pink: "Розовый", amber: "Янтарь",
    } as Record<AccentId, string>,
  },
} as const;

// ============================================================
// MAIN PAGE
// ============================================================

const LIB_KEY = "qsc-library";
const CURRENT_KEY = "qsc-current";
const PROJECTS_KEY = "qsc-projects";
const ACTIVE_KEY = "qsc-active-id";
const STYLE_KEY = "qsc-style";
const VOICE_KEY = "swipecraft:voice";

// Style is global (shared across every project), not per-carousel — matching
// how it behaves today. Each field falls back to its DEFAULT_* constant if
// missing, so adding a new field here later never breaks an older save.
type SavedStyle = {
  fontId?: FontId;
  surfaceId?: SurfaceId;
  accentId?: AccentId;
  bgType?: BgType;
};

type LibraryEntry = { name: string; savedAt: number; slides: SlideData[] };
type Metrics = { views?: number; saves?: number; comments?: number; postedAt?: number };
type Project = {
  id: string;
  name: string;
  status: "draft" | "posted";
  createdAt: number;
  updatedAt: number;
  slides: SlideData[];
  metrics?: Metrics;
};

export default function CarouselPage() {
  const [lang, setLang] = useState<Lang>("en");
  const t = T[lang];
  // ---- Projects: every carousel is a named project, persisted to localStorage ----
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [slides, setSlides] = useState<SlideData[]>(SLIDES);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      let loaded: Project[] = [];
      const raw = localStorage.getItem(PROJECTS_KEY);
      if (raw) loaded = JSON.parse(raw);

      // Migrate pre-sidebar storage (qsc-library entries + qsc-current draft)
      if (loaded.length === 0) {
        try {
          const oldLib = localStorage.getItem(LIB_KEY);
          if (oldLib) {
            const entries: LibraryEntry[] = JSON.parse(oldLib);
            loaded = entries.map((e) => ({
              id: `mig-${e.savedAt}`,
              name: e.name,
              status: "draft" as const,
              createdAt: e.savedAt,
              updatedAt: e.savedAt,
              slides: e.slides,
            }));
          }
          const oldCurrent = localStorage.getItem(CURRENT_KEY);
          if (oldCurrent) {
            const cur = JSON.parse(oldCurrent);
            if (Array.isArray(cur) && cur.length > 0) {
              loaded.unshift({ id: "mig-current", name: "Working draft", status: "draft", createdAt: Date.now(), updatedAt: Date.now(), slides: cur });
            }
          }
        } catch {}
      }

      if (loaded.length === 0) {
        loaded = [{ id: "p-default", name: "My first carousel", status: "draft", createdAt: Date.now(), updatedAt: Date.now(), slides: SLIDES }];
      }

      const savedActive = localStorage.getItem(ACTIVE_KEY);
      const active = loaded.find((p) => p.id === savedActive) ?? loaded[0];
      setProjects(loaded);
      setActiveId(active.id);
      setSlides(active.slides);
    } catch {}
    setHydrated(true);
  }, []);

  // Sync working slides into the active project + persist everything
  useEffect(() => {
    if (!hydrated || !activeId) return;
    setProjects((prev) => {
      const next = prev.map((p) => (p.id === activeId ? { ...p, slides, updatedAt: Date.now() } : p));
      try {
        localStorage.setItem(PROJECTS_KEY, JSON.stringify(next));
        localStorage.setItem(ACTIVE_KEY, activeId);
      } catch {}
      return next;
    });
  }, [slides, hydrated, activeId]);

  const switchProject = useCallback((id: string) => {
    setProjects((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) {
        setActiveId(id);
        setSlides(target.slides);
        try { localStorage.setItem(ACTIVE_KEY, id); } catch {}
      }
      return prev;
    });
  }, []);

  const newProject = useCallback(() => {
    const name = window.prompt("New carousel name:", "Untitled carousel");
    if (!name?.trim()) return;
    const p: Project = { id: `p-${Date.now()}`, name: name.trim(), status: "draft", createdAt: Date.now(), updatedAt: Date.now(), slides: SLIDES };
    setProjects((prev) => [p, ...prev]);
    setActiveId(p.id);
    setSlides(p.slides);
  }, []);

  // Carousels handed over by the MCP server. Polled so one written mid-session shows up
  // without a reload; silently no-ops when the inbox route is disabled.
  type InboxItem = { id: string; name: string; slides: SlideData[]; createdAt: number };
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const refreshInbox = useCallback(async () => {
    try {
      const res = await fetch("/api/inbox");
      if (!res.ok) return setInbox([]);
      const data = await res.json();
      setInbox(Array.isArray(data.carousels) ? data.carousels : []);
    } catch {
      setInbox([]);
    }
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    refreshInbox();
    const t = setInterval(refreshInbox, 15000);
    return () => clearInterval(t);
  }, [hydrated, refreshInbox]);

  const importFromInbox = useCallback(async (item: InboxItem) => {
    const p: Project = {
      id: `p-${Date.now()}`,
      name: item.name,
      status: "draft",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      slides: item.slides,
    };
    setProjects((prev) => [p, ...prev]);
    setActiveId(p.id);
    setSlides(p.slides);
    // Drop it from the inbox only after it is safely in local state.
    try { await fetch(`/api/inbox?id=${encodeURIComponent(item.id)}`, { method: "DELETE" }); } catch {}
    setInbox((prev) => prev.filter((i) => i.id !== item.id));
  }, []);

  const duplicateProject = useCallback((id: string) => {
    setProjects((prev) => {
      const src = prev.find((p) => p.id === id);
      if (!src) return prev;
      const copy: Project = { ...src, id: `p-${Date.now()}`, name: `${src.name} copy`, status: "draft", createdAt: Date.now(), updatedAt: Date.now() };
      setActiveId(copy.id);
      setSlides(copy.slides);
      return [copy, ...prev];
    });
  }, []);

  const renameProject = useCallback((id: string) => {
    setProjects((prev) => {
      const target = prev.find((p) => p.id === id);
      const name = window.prompt("Rename carousel:", target?.name ?? "");
      if (!name?.trim()) return prev;
      const next = prev.map((p) => (p.id === id ? { ...p, name: name.trim() } : p));
      try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const deleteProject = useCallback((id: string) => {
    if (!window.confirm("Delete this carousel? This cannot be undone.")) return;
    setProjects((prev) => {
      let next = prev.filter((p) => p.id !== id);
      if (next.length === 0) {
        next = [{ id: `p-${Date.now()}`, name: "My first carousel", status: "draft", createdAt: Date.now(), updatedAt: Date.now(), slides: SLIDES }];
      }
      if (id === activeId) {
        setActiveId(next[0].id);
        setSlides(next[0].slides);
      }
      try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [activeId]);

  const toggleStatus = useCallback((id: string) => {
    setProjects((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, status: (p.status === "posted" ? "draft" : "posted") as Project["status"] } : p));
      try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const setMetric = useCallback((id: string, key: keyof Metrics, value: number) => {
    setProjects((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, metrics: { ...p.metrics, [key]: value } } : p));
      try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const activeProject = projects.find((p) => p.id === activeId);

  // Project drawer. Only has an effect under the mobile breakpoint in globals.css;
  // on desktop the sidebar is always visible and this stays inert.
  // Starts false on both server and client, so there is nothing to mismatch on hydration.
  const [navOpen, setNavOpen] = useState(false);

  // Stats / analytics modal
  const [showStats, setShowStats] = useState(false);

  // Schedule (Postiz) modal
  const [showSchedule, setShowSchedule] = useState(false);

  // API keys, kept in this browser only. Empty on the server render so hydration matches.
  const [showKeys, setShowKeys] = useState(false);
  const [savedKeys, setSavedKeys] = useState<UserKeys>({});
  const [keyDraft, setKeyDraft] = useState<UserKeys>({});
  useEffect(() => { setSavedKeys(loadUserKeys()); }, []);
  const openKeySettings = useCallback(() => {
    setKeyDraft({});
    setShowKeys(true);
  }, []);
  const commitKeys = useCallback(() => {
    // A blank field leaves the stored key alone. Clearing is done per row.
    const next: UserKeys = { ...savedKeys };
    for (const p of PROVIDERS) {
      const typed = keyDraft[p]?.trim();
      if (typed) next[p] = typed;
    }
    saveUserKeys(next);
    setSavedKeys(next);
    setKeyDraft({});
    setShowKeys(false);
  }, [keyDraft, savedKeys]);
  const clearKey = useCallback((p: (typeof PROVIDERS)[number]) => {
    const next: UserKeys = { ...savedKeys };
    delete next[p];
    saveUserKeys(next);
    setSavedKeys(next);
    setKeyDraft((d) => ({ ...d, [p]: "" }));
  }, [savedKeys]);
  const [scheduleCaption, setScheduleCaption] = useState("");
  const [scheduleWhen, setScheduleWhen] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [scheduleMsg, setScheduleMsg] = useState("");

  // Edit panel
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // AI generation
  const [genTopic, setGenTopic] = useState("");
  // Which brand voice the AI writes in. Starts at the default on both server
  // and client; the saved choice is restored after hydration, like the style.
  const [voiceId, setVoiceId] = useState<VoiceId>(DEFAULT_VOICE);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const generateWithAI = useCallback(async () => {
    const topic = genTopic.trim();
    if (!topic || generating) return;
    setGenerating(true);
    setGenError("");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, voice: voiceId, keys: loadUserKeys() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSlides(data.slides);
      setGenTopic("");
    } catch (e) {
      setGenError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }, [genTopic, generating, voiceId]);

  // A/B hook generator
  type HookVariant = { text: string; highlight?: string; style?: string };
  const [hookVariants, setHookVariants] = useState<HookVariant[] | null>(null);
  const [hooking, setHooking] = useState(false);
  const generateHooks = useCallback(async () => {
    const topic = genTopic.trim();
    if (!topic || hooking) return;
    setHooking(true);
    setGenError("");
    setHookVariants(null);
    try {
      const res = await fetch("/api/hooks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic, voice: voiceId, keys: loadUserKeys() }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setHookVariants(data.hooks);
    } catch (e) {
      setGenError(e instanceof Error ? e.message : String(e));
    } finally {
      setHooking(false);
    }
  }, [genTopic, hooking, voiceId]);
  const applyHook = useCallback((h: HookVariant) => {
    setSlides((prev) => {
      const next = [...prev];
      const newHook: SlideData = { type: "hook", text: h.text, highlight: h.highlight, highlightStyle: "italic-box" };
      if (next[0]?.type === "hook") next[0] = newHook;
      else next.unshift(newHook);
      return next;
    });
    setHookVariants(null);
  }, []);

  // Per-slide AI image generation
  const [imgPrompt, setImgPrompt] = useState("");
  const [imgLoading, setImgLoading] = useState(false);
  const [imgError, setImgError] = useState("");
  const generateImageForSlide = useCallback(async (i: number) => {
    const prompt = imgPrompt.trim();
    if (!prompt || imgLoading) return;
    setImgLoading(true);
    setImgError("");
    try {
      const res = await fetch("/api/image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, keys: loadUserKeys() }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSlides((prev) => {
        const next = [...prev];
        const imgSlide: SlideData = { type: "image", imageSrc: data.dataUrl, title: prev[i]?.title, imageCaption: prompt };
        next.splice(i + 1, 0, imgSlide);
        return next;
      });
      setImgPrompt("");
    } catch (e) {
      setImgError(e instanceof Error ? e.message : String(e));
    } finally {
      setImgLoading(false);
    }
  }, [imgPrompt, imgLoading]);

  const [fontId, setFontId] = useState<FontId>(DEFAULT_FONT);
  const [surfaceId, setSurfaceId] = useState<SurfaceId>(DEFAULT_SURFACE);
  const [accentId, setAccentId] = useState<AccentId>(DEFAULT_ACCENT);
  const [purposeId, setPurposeId] = useState<PurposeId>(DEFAULT_PURPOSE);
  const [formatId, setFormatId] = useState<FormatId>(DEFAULT_FORMAT);
  const [bgType, setBgType] = useState<BgType>(DEFAULT_BG);

  // Restore the last-used style once, after hydration (avoids an SSR mismatch —
  // the server always renders the DEFAULT_* values, localStorage only exists
  // client-side). Runs once: `hydrated` flips true→ only, never back.
  useEffect(() => {
    if (!hydrated) return;
    try {
      const raw = localStorage.getItem(STYLE_KEY);
      if (!raw) return;
      const saved: SavedStyle = JSON.parse(raw);
      if (saved.fontId) setFontId(saved.fontId);
      if (saved.surfaceId) setSurfaceId(saved.surfaceId);
      if (saved.accentId) setAccentId(saved.accentId);
      if (saved.bgType) setBgType(saved.bgType);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // Persist on every change so a reload keeps whatever was last picked.
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STYLE_KEY, JSON.stringify({ fontId, surfaceId, accentId, bgType }));
    } catch {}
  }, [hydrated, fontId, surfaceId, accentId, bgType]);

  // Voice lives in its own key: it is a content choice, not a visual style,
  // and clearing one should not wipe the other.
  useEffect(() => {
    if (!hydrated) return;
    try {
      const saved = localStorage.getItem(VOICE_KEY);
      if (saved && saved in VOICES) setVoiceId(saved as VoiceId);
    } catch {}
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(VOICE_KEY, voiceId); } catch {}
  }, [hydrated, voiceId]);
  const [fontScale, setFontScale] = useState<number>(1.0);
  const [slideScales, setSlideScales] = useState<Record<number, number>>({});
  const [slideAligns, setSlideAligns] = useState<Record<number, AlignT>>({});
  const [slideOffsets, setSlideOffsets] = useState<Record<number, Offset>>({});
  const nudgeOffset = useCallback((i: number, dx: number, dy: number) => {
    setSlideOffsets((prev) => {
      const cur = prev[i] ?? { x: 0, y: 0 };
      return { ...prev, [i]: { x: cur.x + dx, y: cur.y + dy } };
    });
  }, []);
  const resetOffset = useCallback((i: number) => {
    setSlideOffsets((prev) => { const n = { ...prev }; delete n[i]; return n; });
  }, []);
  const [showSafeZones, setShowSafeZones] = useState(false);
  const [activeTab, setActiveTab] = useState<"content" | "style" | "layout">("content");
  const setSlideAlign = useCallback((i: number, a: AlignT) => {
    setSlideAligns((prev) => ({ ...prev, [i]: a }));
  }, []);
  const adjustSlideScale = useCallback((i: number, delta: number) => {
    setSlideScales((prev) => {
      const current = prev[i] ?? 1.0;
      const next = Math.max(0.5, Math.min(2.0, +(current + delta).toFixed(2)));
      return { ...prev, [i]: next };
    });
  }, []);
  const resetSlideScale = useCallback((i: number) => {
    setSlideScales((prev) => {
      const next = { ...prev };
      delete next[i];
      return next;
    });
  }, []);

  // ---- Slide management: add / delete / duplicate / reorder ----
  // Per-slide scale/align maps are index-keyed, so clear them when slide order changes.
  const clearOverrides = useCallback(() => {
    setSlideScales({});
    setSlideAligns({});
    setSlideOffsets({});
  }, []);
  const addSlideAfter = useCallback((i: number) => {
    setSlides((prev) => {
      const blank: SlideData = { type: "body", title: "NEW SLIDE", text: "Tap the edit button\nto write this slide." };
      const next = [...prev];
      next.splice(i + 1, 0, blank);
      return next;
    });
    clearOverrides();
  }, [clearOverrides]);
  const deleteSlide = useCallback((i: number) => {
    setSlides((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));
    clearOverrides();
  }, [clearOverrides]);
  const duplicateSlide = useCallback((i: number) => {
    setSlides((prev) => {
      const next = [...prev];
      next.splice(i + 1, 0, { ...prev[i] });
      return next;
    });
    clearOverrides();
  }, [clearOverrides]);
  const moveSlide = useCallback((i: number, dir: -1 | 1) => {
    setSlides((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    clearOverrides();
  }, [clearOverrides]);

  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState("");
  const langRef = useRef<Lang>("en");
  langRef.current = lang;
  const offscreenRefs = useRef<(HTMLDivElement | null)[]>([]);

  const canvasW = FORMAT_PRESETS[formatId].w;
  const canvasH = FORMAT_PRESETS[formatId].h;
  const preset = composePreset(FONT_STYLES[fontId], SURFACES[surfaceId], ACCENTS[accentId], purposeId);

  // Live dims via ref so capture stays correct when format changes mid multi-format export
  const dimsRef = useRef({ w: canvasW, h: canvasH, bg: preset.bg });
  dimsRef.current = { w: canvasW, h: canvasH, bg: preset.bg };

  const captureSlide = useCallback(
    async (index: number): Promise<string | null> => {
      const el = offscreenRefs.current[index];
      if (!el) return null;

      el.style.opacity = "1";
      el.style.zIndex = "-1";
      await new Promise<void>((r) => requestAnimationFrame(() => r()));

      const opts = {
        width: dimsRef.current.w,
        height: dimsRef.current.h,
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: dimsRef.current.bg,
        skipFonts: true,
        filter: (node: HTMLElement) => {
          if (node.tagName === "LINK") {
            const rel = (node as HTMLLinkElement).rel;
            if (rel === "stylesheet" || rel === "preload") return false;
          }
          if (node.tagName === "STYLE") {
            const sheet = (node as HTMLStyleElement).sheet;
            try { sheet && sheet.cssRules; } catch { return false; }
          }
          // Skip safe-zone preview overlays from export
          if (node.dataset && node.dataset.safezone === "1") return false;
          return true;
        },
      };

      // Double-call: first warms fonts/images, second captures
      await toPng(el, opts);
      await new Promise((r) => setTimeout(r, 120));
      const dataUrl = await toPng(el, opts);

      el.style.opacity = "0";
      el.style.zIndex = "-1";
      return dataUrl;
    },
    []
  );

  // One click → same carousel at TikTok 9:16 + IG 4:5 + Square 1:1, foldered in one zip
  const exportAllFormats = useCallback(async () => {
    const TARGETS: { id: FormatId; folder: string }[] = [
      { id: "tiktok-9x16", folder: "tiktok-9x16" },
      { id: "threads-4x5", folder: "instagram-4x5" },
      { id: "instagram-square", folder: "square-1x1" },
    ];
    setExporting(true);
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    const prevFormat = formatId;
    try {
      for (const target of TARGETS) {
        setFormatId(target.id);
        // Let React re-render offscreen slides at the new canvas size
        await new Promise((r) => setTimeout(r, 700));
        for (let i = 0; i < slides.length; i++) {
          setExportStatus(`${target.folder} ${i + 1}/${slides.length}`);
          const dataUrl = await captureSlide(i);
          if (!dataUrl) continue;
          zip.file(
            `${target.folder}/${String(i + 1).padStart(2, "0")}-${slides[i].type}.png`,
            dataUrl.split(",")[1],
            { base64: true }
          );
          await new Promise((r) => setTimeout(r, 100));
        }
      }
      setExportStatus("Zipping...");
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const d = new Date();
      const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
      link.download = `carousel-all-formats-${stamp}.zip`;
      link.href = url;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportStatus("Done!");
    } finally {
      setFormatId(prevFormat);
      setExporting(false);
      setTimeout(() => setExportStatus(""), 2000);
    }
  }, [captureSlide, slides, formatId]);

  const exportSlide = useCallback(
    async (index: number) => {
      const dataUrl = await captureSlide(index);
      if (!dataUrl) return;
      const link = document.createElement("a");
      link.download = `${String(index + 1).padStart(2, "0")}-${slides[index].type}.png`;
      link.href = dataUrl;
      link.click();
    },
    [captureSlide, slides]
  );

  const exportAll = useCallback(async () => {
    setExporting(true);
    const tl = T[langRef.current];
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    for (let i = 0; i < slides.length; i++) {
      setExportStatus(tl.statusExport(i + 1, slides.length));
      const dataUrl = await captureSlide(i);
      if (!dataUrl) continue;
      const base64 = dataUrl.split(",")[1];
      const filename = `${String(i + 1).padStart(2, "0")}-${slides[i].type}.png`;
      zip.file(filename, base64, { base64: true });
      await new Promise((r) => setTimeout(r, 120));
    }
    setExportStatus("Zipping...");
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = `${new Date().getFullYear()}${String(new Date().getMonth()+1).padStart(2,"0")}${String(new Date().getDate()).padStart(2,"0")}`;
    link.download = `carousel-${stamp}.zip`;
    link.href = url;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExportStatus(tl.statusDone);
    setExporting(false);
    setTimeout(() => setExportStatus(""), 2000);
  }, [captureSlide, slides]);

  const submitSchedule = useCallback(async () => {
    if (scheduling) return;
    setScheduling(true);
    setScheduleMsg("Rendering slides...");
    try {
      const imagesBase64: string[] = [];
      for (let i = 0; i < slides.length; i++) {
        const dataUrl = await captureSlide(i);
        if (dataUrl) imagesBase64.push(dataUrl);
        await new Promise((r) => setTimeout(r, 80));
      }
      setScheduleMsg("Sending to Postiz...");
      const res = await fetch("/api/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imagesBase64, caption: scheduleCaption, scheduleISO: scheduleWhen ? new Date(scheduleWhen).toISOString() : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setScheduleMsg(`Scheduled for ${new Date(data.scheduledFor).toLocaleString()} via channel ${data.integrationId}.`);
      if (activeId) toggleStatus(activeId);
    } catch (e) {
      setScheduleMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setScheduling(false);
    }
  }, [scheduling, slides, captureSlide, scheduleCaption, scheduleWhen, activeId, toggleStatus]);

  const exportPdf = useCallback(async () => {
    setExporting(true);
    const isLandscape = canvasW > canvasH;
    const orientation = isLandscape ? "landscape" : "portrait";
    const { default: jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ orientation, unit: "px", format: [canvasW, canvasH], hotfixes: ["px_scaling"] });
    // skipFonts matches captureSlide's proven pattern above: the browser has
    // already painted these slides with their fonts loaded, so html-to-image
    // doesn't need to re-fetch and re-embed every font file per slide. Cuts
    // real, wasted work regardless of environment; it is not a full fix for
    // multi-minute exports seen under some browser extensions (ad blockers,
    // privacy/canvas-fingerprint tools), which can still throttle the canvas
    // rasterization itself — that is environment-specific, not fixable here.
    const jpegOpts = { width: canvasW, height: canvasH, pixelRatio: 2, cacheBust: true, backgroundColor: preset.bg, quality: 0.92, skipFonts: true };

    const tl = T[langRef.current];
    for (let i = 0; i < slides.length; i++) {
      setExportStatus(tl.statusPdf(i + 1, slides.length));
      const el = offscreenRefs.current[i];
      if (!el) continue;

      el.style.opacity = "1";
      el.style.zIndex = "-1";
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      await toJpeg(el, jpegOpts); // warm up
      await new Promise((r) => setTimeout(r, 120));
      const dataUrl = await toJpeg(el, jpegOpts);
      el.style.opacity = "0";
      el.style.zIndex = "-1";

      if (i > 0) pdf.addPage([canvasW, canvasH], orientation);
      pdf.addImage(dataUrl, "JPEG", 0, 0, canvasW, canvasH);
      await new Promise((r) => setTimeout(r, 200));
    }

    // Distinct per project + date so repeated exports don't collide as
    // "slides.pdf", "slides (1).pdf", "slides (2).pdf" with no way to tell
    // them apart — that was silently producing duplicate-looking downloads.
    const d = new Date();
    const dateStamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    const slug = (activeProject?.name || "carousel").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "carousel";
    pdf.save(`${slug}-${dateStamp}.pdf`);
    setExportStatus(T[langRef.current].statusDone);
    setExporting(false);
    setTimeout(() => setExportStatus(""), 2000);
  }, [preset.bg, canvasW, canvasH, slides, activeProject]);

  return (
    <CanvasSizeContext.Provider value={{ w: canvasW, h: canvasH }}>
    <FontScaleContext.Provider value={fontScale}>
    <div suppressHydrationWarning className="sc-shell" style={{ minHeight: "100vh", display: "flex" }}>
      {/* Drawer toggle + backdrop. Both are display:none above the mobile breakpoint. */}
      <button
        className="sc-menu-btn tb-btn"
        onClick={() => setNavOpen((v) => !v)}
        aria-label={navOpen ? "Close projects" : "Open projects"}
        aria-expanded={navOpen}
      >
        {navOpen ? "✕" : "☰"}
      </button>
      <div
        className="sc-backdrop"
        data-open={navOpen}
        onClick={() => setNavOpen(false)}
        aria-hidden="true"
      />

      {/* ---- Project Sidebar ---- */}
      <aside className="sc-sidebar" data-open={navOpen} style={{ width: 248, flexShrink: 0, borderRight: "1px solid #E2DACB", background: "#FBF8F2", padding: "20px 14px", display: "flex", flexDirection: "column", gap: 10, position: "sticky", top: 0, height: "100vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 6px" }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: "#8A8378", letterSpacing: "0.08em", textTransform: "uppercase" }}>Projects</span>
          <button
            onClick={() => { newProject(); setNavOpen(false); }}
            title="New carousel"
            className="tb-btn"
            style={{ width: 26, height: 26, borderRadius: 7, border: "none", background: "#E5683C", color: "#fff", cursor: "pointer", fontSize: 16, fontWeight: 700, lineHeight: 1 }}
          >+</button>
        </div>

        {inbox.length > 0 && (
          <div style={{ border: "1px solid #E5683C", borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", gap: 8, background: "#FFF4EF" }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: "#E5683C", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              From Claude · {inbox.length}
            </span>
            {inbox.map((item) => (
              <button
                key={item.id}
                onClick={() => { importFromInbox(item); setNavOpen(false); }}
                className="tb-btn"
                title={`Import "${item.name}" as a new project`}
                style={{ textAlign: "left", padding: "7px 9px", borderRadius: 7, border: "1px solid #E2DACB", background: "#fff", cursor: "pointer" }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: "#1A1714" }}>{item.name}</div>
                <div style={{ fontSize: 10, color: "#8A8378", marginTop: 2 }}>{item.slides.length} slides · click to import</div>
              </button>
            ))}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {projects.map((p) => {
            const isActive = p.id === activeId;
            return (
              <div
                key={p.id}
                onClick={() => { switchProject(p.id); setNavOpen(false); }}
                style={{
                  borderRadius: 10,
                  padding: "10px 10px 8px",
                  cursor: "pointer",
                  background: isActive ? "#FFFFFF" : "transparent",
                  border: isActive ? "1px solid #E5683C" : "1px solid transparent",
                  boxShadow: isActive ? "0 1px 4px rgba(229,104,60,0.15)" : "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: p.status === "posted" ? "#3F9C5C" : "#C4BCAE" }} title={p.status} />
                  <span style={{ fontSize: 13, fontWeight: isActive ? 700 : 500, color: "#1A1714", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                    {p.name}
                  </span>
                </div>
                <div style={{ fontSize: 10.5, color: "#8A8378", marginTop: 3, marginLeft: 13 }}>
                  {p.slides.length} slides · {new Date(p.updatedAt).toLocaleDateString()}
                </div>
                <div style={{ display: "flex", gap: 3, marginTop: 6, marginLeft: 10 }}>
                  {[
                    { icon: "✎", title: "Rename", fn: () => renameProject(p.id) },
                    { icon: "⧉", title: "Duplicate", fn: () => duplicateProject(p.id) },
                    { icon: p.status === "posted" ? "↩" : "✓", title: p.status === "posted" ? "Mark as draft" : "Mark as posted", fn: () => toggleStatus(p.id) },
                    { icon: "✕", title: "Delete", fn: () => deleteProject(p.id) },
                  ].map((a) => (
                    <button
                      key={a.title}
                      title={a.title}
                      onClick={(e) => { e.stopPropagation(); a.fn(); }}
                      style={{ width: 24, height: 24, borderRadius: 6, border: "1px solid #E2DACB", background: "#FFFFFF", color: a.icon === "✕" ? "#C2402A" : "#5C564C", cursor: "pointer", fontSize: 11, padding: 0 }}
                    >{a.icon}</button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: "auto", padding: "10px 6px 0", fontSize: 10.5, color: "#B0A998", lineHeight: 1.5 }}>
          {activeProject ? `Editing: ${activeProject.name}` : ""}
          <br />Autosaved locally.
        </div>
      </aside>

      {/* ---- Main column ---- */}
      <div className="sc-main" style={{ flex: 1, minWidth: 0, padding: 32 }}>
      {/* Toolbar */}
      <div style={{ marginBottom: 32, background: "#FBF8F2", border: "1px solid #E2DACB", borderRadius: 16, padding: 24, boxShadow: "0 1px 3px rgba(26,23,20,0.06)" }}>
        {/* Title + Export + Lang toggle */}
        <div className="sc-titlebar" style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: "#E5683C", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 20, fontFamily: "var(--font-playfair)" }}>S</div>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: "-0.02em", color: "#1A1714" } as React.CSSProperties}>{t.appTitle}</h1>
              <div style={{ fontSize: 11, color: "#8A8378", marginTop: 2 }}>
                {FORMAT_PRESETS[formatId].name} — {canvasW}×{canvasH}
              </div>
            </div>
          </div>
          <div className="sc-actions" style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={openKeySettings} title="API keys for AI generation" style={{ padding: "8px 16px", minHeight: 36, borderRadius: 8, border: "1px solid #D8D0C0", background: "transparent", color: "#2E2A24", cursor: "pointer", fontSize: 13, fontWeight: 600 }} className="tb-btn">
              🔑 Keys
            </button>
            <button onClick={() => setShowStats(true)} title="View analytics across all carousels" style={{ padding: "8px 16px", minHeight: 36, borderRadius: 8, border: "1px solid #D8D0C0", background: "transparent", color: "#2E2A24", cursor: "pointer", fontSize: 13, fontWeight: 600 }} className="tb-btn">
              📊 Stats
            </button>
            <button onClick={() => { setScheduleMsg(""); setShowSchedule(true); }} title="Schedule this carousel via Postiz" style={{ padding: "8px 16px", minHeight: 36, borderRadius: 8, border: "1px solid #D8D0C0", background: "transparent", color: "#2E2A24", cursor: "pointer", fontSize: 13, fontWeight: 600 }} className="tb-btn">
              🗓 Schedule
            </button>
            <button onClick={exportPdf} disabled={exporting} title="Download all slides as a single PDF" style={{ padding: "8px 16px", minHeight: 36, borderRadius: 8, border: "1px solid #D8D0C0", background: "transparent", color: exporting ? "#8A8378" : "#2E2A24", cursor: exporting ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600 }} className="tb-btn">
              ⬇ PDF
            </button>
            <button onClick={exportAllFormats} disabled={exporting} title="Export TikTok 9:16 + Instagram 4:5 + Square 1:1 in one zip" style={{ padding: "8px 16px", minHeight: 36, borderRadius: 8, border: "1px solid #E5683C", background: "transparent", color: exporting ? "#8A8378" : "#E5683C", cursor: exporting ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 700 }} className="tb-btn">
              All Formats
            </button>
            <button onClick={exportAll} disabled={exporting} style={{ padding: "8px 24px", minWidth: 130, minHeight: 36, borderRadius: 8, border: "none", background: exporting ? "#EBE5D9" : "#E5683C", color: exporting ? "#8A8378" : "#fff", cursor: exporting ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums" }} className="tb-btn">
              {exporting ? exportStatus : "Export ZIP"}
            </button>
          </div>
        </div>

        {/* 5-row axis toolbar — order: Format → Mode → Font → Color → Background */}
        {/* key={lang} causes remount → tbFadeIn animation plays on language switch */}
        <div key={lang} className="tb-lang-fade" style={{ display: "flex", flexDirection: "column", gap: 8 }}>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 2, marginBottom: 6, borderBottom: "1px solid #E2DACB" }}>
            {([["content", "Content"], ["style", "Style"], ["layout", "Layout"]] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className="tb-btn"
                style={{
                  padding: "10px 24px",
                  border: "none",
                  borderBottom: activeTab === id ? "3px solid #E5683C" : "3px solid transparent",
                  background: "transparent",
                  color: activeTab === id ? "#1A1714" : "#8A8378",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: "0.02em",
                }}
              >
                {label}
              </button>
            ))}
          </div>


          {activeTab === "layout" && (<>
          {/* Format */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: "#8A8378", width: 90, flexShrink: 0 }}>{t.rowFormat}</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {Object.values(FORMAT_PRESETS).map((f) => (
                <button key={f.id} onClick={() => setFormatId(f.id)} title={f.platform} style={{ padding: "9px 14px", minHeight: 36, borderRadius: 8, border: formatId === f.id ? "2px solid #06B6D4" : "1px solid #D8D0C0", background: formatId === f.id ? "#E5683C" : "transparent", color: formatId === f.id ? "#fff" : "#2E2A24", cursor: "pointer", fontSize: 12, fontWeight: 500 }} className="tb-btn">
                  {f.name}
                </button>
              ))}
            </div>
          </div>
          </>)}

          {activeTab === "layout" && (<>
          {/* Mode */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: "#8A8378", width: 90, flexShrink: 0 }}>{t.rowMode}</span>
            <div style={{ display: "flex", gap: 6 }}>
              {(["carousel", "presentation"] as PurposeId[]).map((p) => (
                <button key={p} onClick={() => setPurposeId(p)} style={{ padding: "9px 14px", minWidth: 110, minHeight: 36, borderRadius: 8, border: purposeId === p ? "2px solid #F59E0B" : "1px solid #D8D0C0", background: purposeId === p ? "#E5683C" : "transparent", color: purposeId === p ? "#fff" : "#2E2A24", cursor: "pointer", fontSize: 12, fontWeight: 500 }} className="tb-btn">
                  {t.modes[p]}
                </button>
              ))}
            </div>
          </div>
          </>)}

          {activeTab === "style" && (<>
          {/* Font */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: "#8A8378", width: 90, flexShrink: 0 }}>{t.rowFont}</span>
            <div style={{ display: "flex", gap: 6 }}>
              {Object.values(FONT_STYLES).map((f) => (
                <button key={f.id} onClick={() => setFontId(f.id)} style={{ padding: "9px 14px", minHeight: 36, borderRadius: 8, border: fontId === f.id ? "2px solid #6366F1" : "1px solid #D8D0C0", background: fontId === f.id ? "#E5683C" : "transparent", color: fontId === f.id ? "#fff" : "#2E2A24", cursor: "pointer", fontSize: 12, fontWeight: 500 }} className="tb-btn">
                  {f.name}
                </button>
              ))}
            </div>
          </div>
          </>)}

          {activeTab === "content" && (<>
          {/* AI Generate + Library */}
          <div className="sc-genrow" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: "#8A8378", width: 90, flexShrink: 0 }}>AI Generate</span>
            <div style={{ display: "flex", gap: 8, flex: 1, minWidth: 0, maxWidth: 720, alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="text"
                value={genTopic}
                onChange={(e) => setGenTopic(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") generateWithAI(); }}
                placeholder='Topic, e.g. "5 ChatGPT prompts for job hunting"'
                disabled={generating}
                style={{ flex: "1 1 180px", minWidth: 0, padding: "9px 14px", minHeight: 36, borderRadius: 8, border: "1px solid #D8D0C0", background: "#FFFFFF", color: "#1A1714", fontSize: 13, outline: "none" }}
              />
              <button
                onClick={generateWithAI}
                disabled={generating || !genTopic.trim()}
                style={{ padding: "9px 18px", minHeight: 36, borderRadius: 8, border: "none", background: generating ? "#444" : "#E5683C", color: "#fff", cursor: generating ? "wait" : "pointer", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}
                className="tb-btn"
              >
                {generating ? "Writing..." : "✦ Generate"}
              </button>
              <select
                value={voiceId}
                onChange={(e) => setVoiceId(e.target.value as VoiceId)}
                title={VOICES[voiceId].hint}
                aria-label="Brand voice"
                style={{ padding: "9px 10px", minHeight: 36, borderRadius: 8, border: "1px solid #D8D0C0", background: "#FFFFFF", color: "#2E2A24", cursor: "pointer", fontSize: 13, fontWeight: 600, maxWidth: 190 }}
              >
                {Object.values(VOICES).map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
              <button
                onClick={generateHooks}
                disabled={hooking || !genTopic.trim()}
                title="Generate 3 hook variants to A/B test"
                style={{ padding: "9px 14px", minHeight: 36, borderRadius: 8, border: "1px solid #D8D0C0", background: "transparent", color: "#2E2A24", cursor: hooking ? "wait" : "pointer", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}
                className="tb-btn"
              >
                {hooking ? "..." : "A/B Hooks"}
              </button>
            </div>
          </div>
          {genError && (
            <div style={{ marginLeft: 100, fontSize: 12, color: "#C2402A" }}>
              {genError}
            </div>
          )}
          {hookVariants && (
            <div style={{ marginLeft: 100, display: "flex", flexDirection: "column", gap: 8, maxWidth: 760 }}>
              <span style={{ fontSize: 11, color: "#8A8378", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>Pick a hook (replaces slide 1)</span>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {hookVariants.map((h, idx) => (
                  <button
                    key={idx}
                    onClick={() => applyHook(h)}
                    className="tb-btn"
                    style={{ flex: "1 1 220px", textAlign: "left", padding: 12, borderRadius: 10, border: "1px solid #D8D0C0", background: "#FFFFFF", cursor: "pointer" }}
                  >
                    <div style={{ fontSize: 10, color: "#E5683C", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{h.style || `Variant ${idx + 1}`}</div>
                    <div style={{ fontSize: 14, color: "#1A1714", fontWeight: 700, lineHeight: 1.3, whiteSpace: "pre-line" }}>{h.text}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
          </>)}

          {activeTab === "layout" && (<>
          {/* Safe Zone Toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: "#8A8378", width: 90, flexShrink: 0 }}>Safe Zones</span>
            <button
              onClick={() => setShowSafeZones((v) => !v)}
              style={{
                padding: "9px 14px",
                minHeight: 36,
                borderRadius: 8,
                border: showSafeZones ? "2px solid #6366F1" : "1px solid #D8D0C0",
                background: showSafeZones ? "#E5683C" : "transparent",
                color: "#fff",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 500,
              }}
              title="Toggle TikTok / IG / YT safe-zone overlay"
            >
              {showSafeZones ? "Hide" : "Show"} TikTok / IG / YT zones
            </button>
          </div>
          </>)}

          {activeTab === "layout" && (<>
          {/* Font Size Slider */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: "#8A8378", width: 90, flexShrink: 0 }}>Font Size</span>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, maxWidth: 500 }}>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.05}
                value={fontScale}
                onChange={(e) => setFontScale(parseFloat(e.target.value))}
                style={{ flex: 1, cursor: "pointer", accentColor: "#E5683C" }}
              />
              <span style={{ fontSize: 12, color: "#1A1714", minWidth: 56, fontVariantNumeric: "tabular-nums" }}>
                {fontScale.toFixed(2)}x
              </span>
              <button
                onClick={() => setFontScale(1.0)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: "1px solid #D8D0C0",
                  background: "transparent",
                  color: "#888",
                  cursor: "pointer",
                  fontSize: 11,
                }}
                title="Reset to 1.00x"
              >
                Reset
              </button>
            </div>
          </div>
          </>)}

          {activeTab === "style" && (<>
          {/* Surface (bg + text) */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: "#8A8378", width: 90, flexShrink: 0 }}>{t.rowSurface}</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {Object.values(SURFACES).map((s) => (
                <button key={s.id} onClick={() => setSurfaceId(s.id)} style={{ padding: "9px 14px", minHeight: 36, borderRadius: 8, border: surfaceId === s.id ? "2px solid #6366F1" : "1px solid #D8D0C0", background: surfaceId === s.id ? "#E5683C" : "transparent", color: surfaceId === s.id ? "#fff" : "#2E2A24", cursor: "pointer", fontSize: 12, fontWeight: 500 }} className="tb-btn">
                  {t.surfaces[s.id]}
                </button>
              ))}
            </div>
          </div>
          </>)}

          {activeTab === "style" && (<>
          {/* Accent (pop color) */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: "#8A8378", width: 90, flexShrink: 0 }}>{t.rowAccent}</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {Object.values(ACCENTS).map((a) => (
                <button
                  key={a.id}
                  onClick={() => setAccentId(a.id)}
                  title={t.accents[a.id]}
                  style={{
                    padding: "9px 14px",
                    minHeight: 36,
                    borderRadius: 8,
                    border: accentId === a.id ? `2px solid ${a.color}` : "1px solid #D8D0C0",
                    background: accentId === a.id ? a.color : "transparent",
                    color: accentId === a.id ? "#000" : "#2E2A24",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                  className="tb-btn"
                >
                  {t.accents[a.id]}
                </button>
              ))}
            </div>
          </div>
          </>)}

          {activeTab === "style" && (<>
          {/* Background */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: "#8A8378", width: 90, flexShrink: 0 }}>{t.rowBg}</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(["none", "blobs", "grid", "lines", "paper", "noise", "bignumber", "glow"] as BgType[]).map((bg) => (
                <button key={bg} onClick={() => setBgType(bg)} style={{ padding: "9px 12px", minHeight: 36, borderRadius: 8, border: bgType === bg ? "2px solid #22C55E" : "1px solid #D8D0C0", background: bgType === bg ? "#E5683C" : "transparent", color: bgType === bg ? "#fff" : "#2E2A24", cursor: "pointer", fontSize: 12, fontWeight: 500 }} className="tb-btn">
                  {t.bgs[bg]}
                </button>
              ))}
            </div>
          </div>
          </>)}

        </div>
      </div>

      {/* Preview Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 20,
        }}
      >
        {slides.map((slide, i) => (
          <div key={i} className="slide-shell" style={{ position: "relative" }}>
            <div className="slide-card">
              <FontScaleContext.Provider value={fontScale * (slideScales[i] ?? 1.0)}>
                <SlideAlignContext.Provider value={slideAligns[i] ?? "center"}>
                  <SafeZoneContext.Provider value={showSafeZones}>
                    <SlideOffsetContext.Provider value={slideOffsets[i] ?? { x: 0, y: 0 }}>
                      <SlidePreview
                        data={slide}
                        preset={preset}
                        index={i}
                        total={slides.length}
                        bgType={bgType}
                        onDrag={(dx, dy) => nudgeOffset(i, dx, dy)}
                      />
                    </SlideOffsetContext.Provider>
                  </SafeZoneContext.Provider>
                </SlideAlignContext.Provider>
              </FontScaleContext.Provider>
            </div>
            <div
              className="slide-tools"
              style={{
                position: "absolute",
                top: 8,
                right: 8,
                display: "flex",
                gap: 4,
                background: "rgba(251,248,242,0.95)",
                padding: 4,
                borderRadius: 8,
                boxShadow: "0 2px 8px rgba(26,23,20,0.12)",
                zIndex: 5,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={(e) => { e.stopPropagation(); adjustSlideScale(i, -0.05); }}
                style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #D8D0C0", background: "#FFFFFF", color: "#1A1714", cursor: "pointer", fontSize: 14, fontWeight: 700 }}
                title="Smaller font for this slide"
              >−</button>
              <div style={{ fontSize: 10, color: "#8A8378", display: "flex", alignItems: "center", minWidth: 38, justifyContent: "center", fontVariantNumeric: "tabular-nums" }}>
                {(slideScales[i] ?? 1.0).toFixed(2)}x
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); adjustSlideScale(i, 0.05); }}
                style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #D8D0C0", background: "#FFFFFF", color: "#1A1714", cursor: "pointer", fontSize: 14, fontWeight: 700 }}
                title="Bigger font for this slide"
              >+</button>
              {slideScales[i] !== undefined && (
                <button
                  onClick={(e) => { e.stopPropagation(); resetSlideScale(i); }}
                  style={{ height: 28, padding: "0 8px", borderRadius: 6, border: "1px solid #D8D0C0", background: "#FFFFFF", color: "#8A8378", cursor: "pointer", fontSize: 10 }}
                  title="Reset this slide"
                >↺</button>
              )}
              <div style={{ width: 1, background: "#E2DACB", margin: "0 4px" }} />
              <button
                onClick={(e) => { e.stopPropagation(); setEditingIndex(i); }}
                style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #E5683C", background: "#E5683C", color: "#fff", cursor: "pointer", fontSize: 13 }}
                title="Edit this slide's text"
              >✎</button>
              <button
                onClick={(e) => { e.stopPropagation(); !exporting && exportSlide(i); }}
                disabled={exporting}
                style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #E5683C", background: "#E5683C", color: "#fff", cursor: exporting ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 700 }}
                title="Export this slide as PNG"
              >⬇</button>
              <div style={{ width: 1, background: "#E2DACB", margin: "0 4px" }} />
              {(["left", "center", "right"] as AlignT[]).map((a) => {
                const isActive = (slideAligns[i] ?? "center") === a;
                const icon = a === "left" ? "⬅" : a === "right" ? "➡" : "⬌";
                return (
                  <button
                    key={a}
                    onClick={(e) => { e.stopPropagation(); setSlideAlign(i, a); }}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      border: isActive ? "1px solid #E5683C" : "1px solid #D8D0C0",
                      background: isActive ? "#E5683C" : "#FFFFFF",
                      color: isActive ? "#fff" : "#2E2A24",
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                    title={`Align ${a}`}
                  >
                    {icon}
                  </button>
                );
              })}
            </div>

            {/* Structural ops strip (bottom-left of each slide) */}
            <div
              className="slide-tools"
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "absolute",
                bottom: 8,
                left: 8,
                display: "flex",
                gap: 4,
                background: "rgba(251,248,242,0.95)",
                padding: 4,
                borderRadius: 8,
                boxShadow: "0 2px 8px rgba(26,23,20,0.12)",
                zIndex: 5,
              }}
            >
              {[
                { icon: "←", title: "Move left", fn: () => moveSlide(i, -1), disabled: i === 0 },
                { icon: "→", title: "Move right", fn: () => moveSlide(i, 1), disabled: i === slides.length - 1 },
                { icon: "⧉", title: "Duplicate slide", fn: () => duplicateSlide(i), disabled: false },
                { icon: "+", title: "Add slide after", fn: () => addSlideAfter(i), disabled: false },
                { icon: "⊕", title: "Reset text position", fn: () => resetOffset(i), disabled: !slideOffsets[i] },
                { icon: "🗑", title: "Delete slide", fn: () => deleteSlide(i), disabled: slides.length <= 1, danger: true },
              ].map((op) => (
                <button
                  key={op.title}
                  title={op.title}
                  disabled={op.disabled}
                  onClick={(e) => { e.stopPropagation(); op.fn(); }}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    border: `1px solid ${op.danger ? "#E7C3BA" : "#D8D0C0"}`,
                    background: "#FFFFFF",
                    color: op.disabled ? "#C4BCAE" : op.danger ? "#C2402A" : "#2E2A24",
                    cursor: op.disabled ? "default" : "pointer",
                    fontSize: 13,
                    padding: 0,
                  }}
                >
                  {op.icon}
                </button>
              ))}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "#8A8378",
                marginTop: 8,
                textAlign: "center",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {i + 1}/{slides.length} — {slide.type}
            </div>
          </div>
        ))}
      </div>

      {/* Offscreen slides for export — always rendered at (0,0), invisible via opacity */}
      {slides.map((slide, i) => (
        <div
          key={`export-${i}`}
          ref={(el) => {
            offscreenRefs.current[i] = el;
          }}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: canvasW,
            height: canvasH,
            opacity: 0,
            pointerEvents: "none",
            zIndex: -1,
            fontFamily: preset.fontFamily,
          }}
        >
          <FontScaleContext.Provider value={fontScale * (slideScales[i] ?? 1.0)}>
            <SlideAlignContext.Provider value={slideAligns[i] ?? "center"}>
              <SlideOffsetContext.Provider value={slideOffsets[i] ?? { x: 0, y: 0 }}>
                <Slide data={slide} preset={preset} index={i} total={slides.length} bgType={bgType} />
              </SlideOffsetContext.Provider>
            </SlideAlignContext.Provider>
          </FontScaleContext.Provider>
        </div>
      ))}

      {/* Info */}
      <div
        style={{
          marginTop: 32,
          fontSize: 13,
          color: "#666",
          textAlign: "center",
        }}
      >
        {t.footer(canvasW, canvasH, slides.length)}
      </div>

      {/* Schedule (Postiz) modal */}
      {/* API key settings. Keys stay in this browser and are sent per request. */}
      {showKeys && (
        <div onClick={() => setShowKeys(false)} style={{ position: "fixed", inset: 0, background: "rgba(26,23,20,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 560, maxWidth: "92vw", maxHeight: "85vh", overflowY: "auto", background: "#FBF8F2", border: "1px solid #E2DACB", borderRadius: 16, padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: 16, color: "#1A1714" }}>API keys</h3>
              <button onClick={() => setShowKeys(false)} style={{ border: "none", background: "transparent", color: "#8A8378", fontSize: 18, cursor: "pointer" }}>✕</button>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: "#8A8378", lineHeight: 1.5 }}>
              Your keys are stored in this browser and sent with each AI request so it runs on your own account. They are never saved on the server. Anyone with access to this browser profile can read them, so use a key you can revoke.
            </p>
            {PROVIDERS.map((p) => (
              <label key={p} style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#8A8378" }}>
                <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <span>{PROVIDER_LABEL[p]}</span>
                  {savedKeys[p] && (
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <code style={{ fontSize: 11, color: "#3F7A4F" }}>{maskKey(savedKeys[p]!)}</code>
                      <button type="button" onClick={() => clearKey(p)} style={{ border: "none", background: "transparent", color: "#C2402A", fontSize: 11, cursor: "pointer", padding: 0 }}>Remove</button>
                    </span>
                  )}
                </span>
                <input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={keyDraft[p] ?? ""}
                  onChange={(e) => setKeyDraft((d) => ({ ...d, [p]: e.target.value }))}
                  placeholder={savedKeys[p] ? "Saved. Type to replace." : PROVIDER_PLACEHOLDER[p]}
                  style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #D8D0C0", background: "#FFFFFF", color: "#1A1714", fontSize: 13, fontFamily: "ui-monospace, monospace" }}
                />
                <span style={{ fontSize: 11, color: "#A39A8C" }}>{PROVIDER_HINT[p]}</span>
              </label>
            ))}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => setShowKeys(false)} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #D8D0C0", background: "transparent", color: "#2E2A24", cursor: "pointer", fontSize: 13 }}>Cancel</button>
              <button onClick={commitKeys} style={{ padding: "8px 22px", borderRadius: 8, border: "none", background: "#E5683C", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {showSchedule && (
        <div onClick={() => !scheduling && setShowSchedule(false)} style={{ position: "fixed", inset: 0, background: "rgba(26,23,20,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 520, maxWidth: "92vw", background: "#FBF8F2", border: "1px solid #E2DACB", borderRadius: 16, padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: 16, color: "#1A1714" }}>Schedule via Postiz</h3>
              <button onClick={() => !scheduling && setShowSchedule(false)} style={{ border: "none", background: "transparent", color: "#8A8378", fontSize: 18, cursor: "pointer" }}>✕</button>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: "#8A8378" }}>
              Renders all {slides.length} slides and sends them to your first connected Postiz channel. Requires a running Postiz with POSTIZ_API_KEY set in .env.local.
            </p>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#8A8378" }}>
              Caption
              <textarea value={scheduleCaption} onChange={(e) => setScheduleCaption(e.target.value)} rows={4} placeholder="Your caption + hashtags" style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #D8D0C0", background: "#FFFFFF", color: "#1A1714", fontSize: 14, resize: "vertical", fontFamily: "inherit" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#8A8378" }}>
              When (leave blank = ~5 min from now)
              <input type="datetime-local" value={scheduleWhen} onChange={(e) => setScheduleWhen(e.target.value)} style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #D8D0C0", background: "#FFFFFF", color: "#1A1714", fontSize: 14 }} />
            </label>
            {scheduleMsg && <div style={{ fontSize: 13, color: scheduleMsg.startsWith("Error") ? "#C2402A" : "#3F7A4F" }}>{scheduleMsg}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => !scheduling && setShowSchedule(false)} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #D8D0C0", background: "transparent", color: "#2E2A24", cursor: "pointer", fontSize: 13 }}>Cancel</button>
              <button onClick={submitSchedule} disabled={scheduling} style={{ padding: "8px 22px", borderRadius: 8, border: "none", background: scheduling ? "#EBE5D9" : "#E5683C", color: scheduling ? "#8A8378" : "#fff", cursor: scheduling ? "wait" : "pointer", fontSize: 13, fontWeight: 700 }}>
                {scheduling ? "Working..." : "Schedule"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats / analytics modal */}
      {showStats && (
        <div onClick={() => setShowStats(false)} style={{ position: "fixed", inset: 0, background: "rgba(26,23,20,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 760, maxWidth: "94vw", maxHeight: "85vh", overflowY: "auto", background: "#FBF8F2", border: "1px solid #E2DACB", borderRadius: 16, padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <h3 style={{ margin: 0, fontSize: 16, color: "#1A1714" }}>Carousel Analytics</h3>
              <button onClick={() => setShowStats(false)} style={{ border: "none", background: "transparent", color: "#8A8378", fontSize: 18, cursor: "pointer" }}>✕</button>
            </div>
            <p style={{ margin: "0 0 16px", fontSize: 12, color: "#8A8378" }}>
              Enter the numbers from each platform after posting. Save rate (saves ÷ views) is the strongest signal for what to make more of.
            </p>
            {(() => {
              const ranked = [...projects].sort((a, b) => ((b.metrics?.saves ?? 0) / Math.max(1, b.metrics?.views ?? 1)) - ((a.metrics?.saves ?? 0) / Math.max(1, a.metrics?.views ?? 1)));
              const totals = projects.reduce((acc, p) => ({ views: acc.views + (p.metrics?.views ?? 0), saves: acc.saves + (p.metrics?.saves ?? 0), comments: acc.comments + (p.metrics?.comments ?? 0) }), { views: 0, saves: 0, comments: 0 });
              const numStyle = { width: 78, padding: "6px 8px", borderRadius: 6, border: "1px solid #D8D0C0", background: "#FFFFFF", color: "#1A1714", fontSize: 13, textAlign: "right" as const, fontVariantNumeric: "tabular-nums" as const };
              return (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px 90px 70px", gap: 8, alignItems: "center", fontSize: 11, fontWeight: 700, color: "#8A8378", textTransform: "uppercase", letterSpacing: "0.04em", padding: "0 4px 8px" }}>
                    <span>Carousel</span><span style={{ textAlign: "right" }}>Views</span><span style={{ textAlign: "right" }}>Saves</span><span style={{ textAlign: "right" }}>Comments</span><span style={{ textAlign: "right" }}>Save %</span>
                  </div>
                  {ranked.map((p) => {
                    const v = p.metrics?.views ?? 0, s = p.metrics?.saves ?? 0;
                    const rate = v > 0 ? ((s / v) * 100).toFixed(1) : "—";
                    return (
                      <div key={p.id} style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px 90px 70px", gap: 8, alignItems: "center", padding: "7px 4px", borderTop: "1px solid #EFE8DB" }}>
                        <span style={{ fontSize: 13, color: "#1A1714", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", marginRight: 7, background: p.status === "posted" ? "#3F9C5C" : "#C4BCAE" }} />
                          {p.name}
                        </span>
                        <input type="number" min={0} value={p.metrics?.views ?? ""} placeholder="0" onChange={(e) => setMetric(p.id, "views", Math.max(0, parseInt(e.target.value) || 0))} style={numStyle} />
                        <input type="number" min={0} value={p.metrics?.saves ?? ""} placeholder="0" onChange={(e) => setMetric(p.id, "saves", Math.max(0, parseInt(e.target.value) || 0))} style={numStyle} />
                        <input type="number" min={0} value={p.metrics?.comments ?? ""} placeholder="0" onChange={(e) => setMetric(p.id, "comments", Math.max(0, parseInt(e.target.value) || 0))} style={numStyle} />
                        <span style={{ textAlign: "right", fontSize: 13, fontWeight: 700, color: rate === "—" ? "#C4BCAE" : "#E5683C", fontVariantNumeric: "tabular-nums" }}>{rate === "—" ? "—" : `${rate}%`}</span>
                      </div>
                    );
                  })}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px 90px 70px", gap: 8, padding: "10px 4px 0", borderTop: "2px solid #E2DACB", marginTop: 4, fontSize: 13, fontWeight: 700, color: "#1A1714" }}>
                    <span>Total</span>
                    <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{totals.views.toLocaleString()}</span>
                    <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{totals.saves.toLocaleString()}</span>
                    <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{totals.comments.toLocaleString()}</span>
                    <span style={{ textAlign: "right", color: "#E5683C" }}>{totals.views > 0 ? `${((totals.saves / totals.views) * 100).toFixed(1)}%` : "—"}</span>
                  </div>
                  {ranked[0]?.metrics?.views ? (
                    <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: "#FFF3EC", border: "1px solid #F2D3C4", fontSize: 13, color: "#7A3A22" }}>
                      🏆 Top by save rate: <strong>{ranked[0].name}</strong>. Make more like this one.
                    </div>
                  ) : null}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Edit panel modal */}
      {editingIndex !== null && slides[editingIndex] && (
        <div
          onClick={() => setEditingIndex(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: 520, maxWidth: "92vw", maxHeight: "85vh", overflowY: "auto", background: "#FBF8F2", border: "1px solid #E2DACB", borderRadius: 16, padding: 24, display: "flex", flexDirection: "column", gap: 14 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: 15, color: "#1A1714" }}>
                Edit slide {editingIndex + 1}/{slides.length} — {slides[editingIndex].type}
              </h3>
              <button onClick={() => setEditingIndex(null)} style={{ border: "none", background: "transparent", color: "#8A8378", fontSize: 18, cursor: "pointer" }}>✕</button>
            </div>

            {slides[editingIndex].type === "body" && (
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#8A8378" }}>
                Title
                <input
                  type="text"
                  value={slides[editingIndex].title ?? ""}
                  onChange={(e) => setSlides((prev) => prev.map((s, idx) => idx === editingIndex ? { ...s, title: e.target.value } : s))}
                  style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #D8D0C0", background: "#FFFFFF", color: "#1A1714", fontSize: 14 }}
                />
              </label>
            )}

            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#8A8378" }}>
              Text (one line per row)
              <textarea
                value={slides[editingIndex].text ?? ""}
                onChange={(e) => setSlides((prev) => prev.map((s, idx) => idx === editingIndex ? { ...s, text: e.target.value } : s))}
                rows={7}
                style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #D8D0C0", background: "#FFFFFF", color: "#1A1714", fontSize: 14, fontFamily: "inherit", resize: "vertical", lineHeight: 1.5 }}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#8A8378" }}>
              Highlight (must appear in the text above)
              <input
                type="text"
                value={slides[editingIndex].highlight ?? ""}
                onChange={(e) => setSlides((prev) => prev.map((s, idx) => idx === editingIndex ? { ...s, highlight: e.target.value || undefined } : s))}
                style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #D8D0C0", background: "#FFFFFF", color: "#1A1714", fontSize: 14 }}
              />
            </label>

            {slides[editingIndex].type === "cta" && (
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#8A8378" }}>
                Handle
                <input
                  type="text"
                  value={slides[editingIndex].handle ?? ""}
                  onChange={(e) => setSlides((prev) => prev.map((s, idx) => idx === editingIndex ? { ...s, handle: e.target.value } : s))}
                  style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #D8D0C0", background: "#FFFFFF", color: "#1A1714", fontSize: 14 }}
                />
              </label>
            )}

            {/* AI image — inserts a generated image slide after this one */}
            <div style={{ borderTop: "1px solid #EFE8DB", paddingTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 12, color: "#8A8378", fontWeight: 600 }}>✦ AI image (adds a new image slide after this one)</span>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  value={imgPrompt}
                  onChange={(e) => setImgPrompt(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") generateImageForSlide(editingIndex); }}
                  placeholder='Describe the image, e.g. "a robot reading email"'
                  disabled={imgLoading}
                  style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid #D8D0C0", background: "#FFFFFF", color: "#1A1714", fontSize: 13 }}
                />
                <button
                  onClick={() => generateImageForSlide(editingIndex)}
                  disabled={imgLoading || !imgPrompt.trim()}
                  style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: imgLoading ? "#EBE5D9" : "#A855F7", color: imgLoading ? "#8A8378" : "#fff", cursor: imgLoading ? "wait" : "pointer", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}
                >{imgLoading ? "Drawing..." : "Generate"}</button>
              </div>
              {imgError && <span style={{ fontSize: 12, color: "#C2402A" }}>{imgError}</span>}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 4 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => { if (editingIndex > 0) setEditingIndex(editingIndex - 1); }}
                  disabled={editingIndex === 0}
                  style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #D8D0C0", background: "transparent", color: editingIndex === 0 ? "#C4BCAE" : "#2E2A24", cursor: editingIndex === 0 ? "default" : "pointer", fontSize: 13 }}
                >← Prev</button>
                <button
                  onClick={() => { if (editingIndex < slides.length - 1) setEditingIndex(editingIndex + 1); }}
                  disabled={editingIndex === slides.length - 1}
                  style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #D8D0C0", background: "transparent", color: editingIndex === slides.length - 1 ? "#C4BCAE" : "#2E2A24", cursor: editingIndex === slides.length - 1 ? "default" : "pointer", fontSize: 13 }}
                >Next →</button>
              </div>
              <button
                onClick={() => setEditingIndex(null)}
                style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#E5683C", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
              >Done</button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
    </FontScaleContext.Provider>
    </CanvasSizeContext.Provider>
  );
}
