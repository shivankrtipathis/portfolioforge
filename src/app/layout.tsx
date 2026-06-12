import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PortfolioForge — VC Fund Construction",
  description: "Venture capital fund portfolio construction & returns modeling.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
