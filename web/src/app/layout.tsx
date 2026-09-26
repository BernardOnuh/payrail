import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter, Inter_Tight } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/components/providers";
import { Shell } from "@/components/shell";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const tight = Inter_Tight({ variable: "--font-tight", subsets: ["latin"], display: "swap" });
const plex = IBM_Plex_Mono({
  variable: "--font-plex",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Payrail — stablecoin payouts for AI agents on Arc",
  description:
    "Non-custodial payout and treasury API for AI agents. Quote, plan, verify and sign stablecoin flows on Arc.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${tight.variable} ${plex.variable}`}>
      <body className="min-h-dvh bg-paper font-sans text-ink antialiased">
        <AppProviders>
          <Shell>{children}</Shell>
        </AppProviders>
      </body>
    </html>
  );
}