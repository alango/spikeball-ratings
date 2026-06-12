import type { ReactNode } from "react";
import "./globals.css";
import { Nav } from "./_components/Nav";

export const metadata = {
  title: "Spikeball League",
  description: "Ongoing ratings and game history for an ad-hoc 2v2 spikeball league.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <Nav />
        <main className="mx-auto max-w-2xl px-4 py-5">{children}</main>
      </body>
    </html>
  );
}
