import type { Metadata } from "next";
import { JetBrains_Mono, Sora } from "next/font/google";
import { SessionProvider } from "@/components/session-provider";
import "./globals.css";

const sans = Sora({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700", "800"]
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "700"]
});

export const metadata: Metadata = {
  title: "FlagPlant",
  description: "FlagPlant MVP Phase 2 starter app"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${mono.variable}`}>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
