import type { Metadata } from "next";
import { Inter, Chakra_Petch } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/toaster";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const display = Chakra_Petch({ variable: "--font-display", subsets: ["latin"], weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  title: { default: "Redline — Vetted Valorant Coaching & Duo Rank Up", template: "%s · Redline" },
  description: "A marketplace of personally vetted Valorant providers with fair minimum prices and verified reviews.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${display.variable} min-h-screen antialiased`}>{children}<Toaster /></body>
    </html>
  );
}
