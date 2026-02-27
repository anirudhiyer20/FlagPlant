import type { Metadata } from "next";
import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}
