import "./globals.css";
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { BackgroundFX } from "@/components/shell/BackgroundFX";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Manual Copilot",
  description:
    "A multimodal AI copilot that reads your manuals end-to-end — cites pages, surfaces diagrams, and draws calculators when words aren't enough.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${jetbrains.variable}`}>
      <body className="min-h-screen antialiased">
        <BackgroundFX />
        {children}
      </body>
    </html>
  );
}
