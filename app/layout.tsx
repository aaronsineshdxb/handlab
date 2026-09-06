import type { Metadata } from "next";
import { Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const space = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-space",
});

const plex = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex",
});

const ICON_SVG =
  "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2032%2032'%3E%3Crect%20width='32'%20height='32'%20rx='7'%20fill='%2308090d'/%3E%3Ccircle%20cx='16'%20cy='16'%20r='8'%20fill='%234da3ff'/%3E%3Ccircle%20cx='16'%20cy='16'%20r='12'%20fill='none'%20stroke='%234da3ff'%20stroke-width='2'%20opacity='.6'/%3E%3C/svg%3E";

export const metadata: Metadata = {
  title: "HANDLAB — 3D Hand Cursor",
  description:
    "Webcam hand tracking → floating 3D cursor (x / y / z). Move your index finger, pinch to click, grab and place objects in 3D space.",
  icons: { icon: ICON_SVG },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${space.variable} ${plex.variable}`}>
      <body>{children}</body>
    </html>
  );
}
