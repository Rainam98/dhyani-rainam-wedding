import type { Metadata } from "next";
import { Cormorant_Garamond, Great_Vibes } from "next/font/google";
import "./globals.css";

const script = Great_Vibes({ subsets: ["latin"], weight: "400", variable: "--font-script", display: "swap" });
const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Rainam & Dhyani Wedding RSVP",
  description: "Rainam and Dhyani's wedding RSVP website",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${script.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
