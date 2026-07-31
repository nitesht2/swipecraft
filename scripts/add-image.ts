#!/usr/bin/env bun
// Copy an image file into public/images/ with safe lowercase filename.
// Usage: bun run img /path/to/my-screenshot.png
// Or:    bun run img /path/to/screenshot.png renamed.png

import { copyFileSync, existsSync, mkdirSync } from "fs";
import { resolve, basename, extname, dirname } from "path";
import { fileURLToPath } from "url";

const scriptDir = dirname(fileURLToPath(import.meta.url));

const src = process.argv[2];
const overrideName = process.argv[3];

if (!src) {
  console.error("Usage: bun run img <source-path> [target-name]");
  console.error("Example: bun run img ~/Desktop/screenshot.png");
  process.exit(1);
}

if (!existsSync(src)) {
  console.error(`File not found: ${src}`);
  process.exit(1);
}

const imagesDir = resolve(scriptDir, "..", "public", "images");
if (!existsSync(imagesDir)) mkdirSync(imagesDir, { recursive: true });

const ext = extname(src).toLowerCase();
const safeName =
  overrideName ||
  basename(src, extname(src))
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") + ext;

const dest = resolve(imagesDir, safeName);
copyFileSync(src, dest);

console.log(`Copied to: public/images/${safeName}`);
console.log(`Use in slides.ts as: imageSrc: "/images/${safeName}"`);
