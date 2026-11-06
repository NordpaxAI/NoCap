import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Inter, Manrope, Newsreader, Outfit } from "next/font/google";
import "./public.css";
import "./members.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", weight: ["300", "400", "500", "600", "700"] });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", weight: ["400", "500", "600", "700"] });
const instrument = Instrument_Serif({ subsets: ["latin"], variable: "--font-instrument", weight: "400", style: ["normal", "italic"] });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", weight: ["400", "500"] });
const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-newsreader", weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "nocap — NextGen International Deal Lawyers", template: "%s — nocap" },
  description: "A private international circle for the next generation of deal lawyers.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${outfit.variable} ${manrope.variable} ${instrument.variable} ${inter.variable} ${newsreader.variable}`}>
        {children}
      </body>
    </html>
  );
}
