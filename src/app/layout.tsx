import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "HelixObs",
  description: "Entity-centric observability for scientific pipelines",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-white text-zinc-900 antialiased">
        <header className="border-b border-zinc-200 px-6 py-3 flex items-center gap-6 shrink-0">
          <Link href="/" className="text-sm font-semibold tracking-widest text-zinc-900 hover:text-black">
            HELIXOBS
          </Link>
          <span className="text-zinc-200 text-xs">|</span>
          <Link href="/sherlock" className="text-sm font-semibold text-amber-700 hover:text-amber-900 transition-colors">
            Sherlock
          </Link>
          <span className="text-zinc-400 text-xs">entity observability</span>
        </header>
        <main className="flex-1 flex flex-col">{children}</main>
      </body>
    </html>
  );
}
