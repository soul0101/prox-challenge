import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Manual Copilot — Vulcan OmniPro 220",
  description:
    "A multimodal agent for the Vulcan OmniPro 220 welder (and any other manual you drop in).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
