import type { Metadata } from "next";
import { Geist, Newsreader, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "../tokens.css";
import "../components/bits/bits.css";
import "./globals.css";

const sans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
});

// Newsreader is a 60KB decorative face used only by the 404 page, the VR fatal
// message and the (currently redirected) physics/chemistry viewer. It is never
// rendered on the lab route, so preloading it put 60KB on the critical path
// for a font nobody sees. preload:false still delivers it for the pages that
// do use it — the browser fetches the woff2 on first use, not on parse.
const serif = Newsreader({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
  preload: false,
});

const mono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

const ICON_SVG =
  "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2032%2032'%3E%3Crect%20width='32'%20height='32'%20rx='7'%20fill='%2308090d'/%3E%3Ccircle%20cx='16'%20cy='16'%20r='8'%20fill='%234da3ff'/%3E%3Ccircle%20cx='16'%20cy='16'%20r='12'%20fill='none'%20stroke='%234da3ff'%20stroke-width='2'%20opacity='.6'/%3E%3C/svg%3E";

export const metadata: Metadata = {
  title: "HANDLAB — 3D Hand Cursor",
  description:
    "Webcam hand tracking → floating 3D cursor (x / y / z). Move your index finger, pinch to click, grab and place objects in 3D space.",
  icons: { icon: ICON_SVG },
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FCFCF9" },
    { media: "(prefers-color-scheme: dark)", color: "#100E12" },
  ],
};

// NOTE: scheme allow-list + 0.35 luminance threshold duplicated from
// lib/theme.ts (isAccentName, ACCENT_INK_THRESHOLD). Update both when adding
// a preset or tuning ink. Inline because the blocking script cannot import TS.
const THEME_INIT = `(function(){try{var t=localStorage.getItem("handlab-theme");if(t!=="dark"&&t!=="light"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.dataset.theme=t;var ok=["teal","violet","forest","amber","rose","blue","custom"];var s=localStorage.getItem("handlab-scheme");if(ok.indexOf(s)<0){s="teal";}document.documentElement.dataset.accent=s;if(s==="custom"){var c=localStorage.getItem("handlab-accent-custom");if(!/^#[0-9a-fA-F]{6}$/.test(c||"")){c="#016A71";}var st=document.documentElement.style;st.setProperty("--color-accent",c);st.setProperty("--color-focus",c);st.setProperty("--color-accent-2","color-mix(in oklch, "+c+" 72%, white)");var n=parseInt(c.slice(1),16),r=((n>>16)&255)/255,g=((n>>8)&255)/255,b=(n&255)/255,f=function(v){return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);},lum=0.2126*f(r)+0.7152*f(g)+0.0722*f(b);st.setProperty("--color-accent-ink",lum>0.35?"#27251E":"#FCFCF9");}}catch(e){document.documentElement.dataset.theme="light";document.documentElement.dataset.accent="teal";}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="light" data-accent="teal" suppressHydrationWarning className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
