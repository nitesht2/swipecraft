import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display, Unbounded, Space_Grotesk, JetBrains_Mono, Oswald, Caveat } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegistrar from "./ServiceWorkerRegistrar";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-inter",
});

const playfair = Playfair_Display({
  subsets: ["latin", "cyrillic"],
  variable: "--font-playfair",
});

const unbounded = Unbounded({
  subsets: ["latin", "cyrillic"],
  variable: "--font-unbounded",
  weight: ["400", "500", "700", "800", "900"],
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "cyrillic"],
  variable: "--font-jetbrains-mono",
  weight: ["400", "500", "700", "800"],
});

const oswald = Oswald({
  subsets: ["latin", "cyrillic"],
  variable: "--font-oswald",
  weight: ["400", "500", "600", "700"],
});

const caveat = Caveat({
  subsets: ["latin"],
  variable: "--font-caveat",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Swipecraft — Carousel Maker",
  description:
    "Write, style, and export social carousels. Projects are stored in this browser.",
  // Tells iOS to launch from the home screen without Safari's chrome. Android
  // reads the equivalent from manifest.ts.
  appleWebApp: {
    capable: true,
    title: "Swipecraft",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Paint into the notch/home-indicator area rather than letterboxing.
  viewportFit: "cover",
  themeColor: "#E5683C",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${playfair.variable} ${unbounded.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} ${oswald.variable} ${caveat.variable} font-sans antialiased`} style={{ background: "#F4EFE6", color: "#1A1714" }}>
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
