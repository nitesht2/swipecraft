import type { MetadataRoute } from "next";

// Next serves this at /manifest.webmanifest and links it from <head> automatically.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Swipecraft — Carousel Maker",
    short_name: "Swipecraft",
    description:
      "Write, style, and export social carousels. Projects are stored in this browser.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F4EFE6",
    theme_color: "#E5683C",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
