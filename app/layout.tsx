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

const serif = Newsreader({
  subsets: ["latin"],
  variable: "--font-serif",
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

const THEME_INIT = `(function(){try{var s=localStorage.getItem("handlab-theme");if(s!=="dark"&&s!=="light"){s=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.dataset.theme=s;}catch(e){document.documentElement.dataset.theme="light";}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
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
