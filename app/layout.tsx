import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TAL Fleet Calculator",
  description: "Enterprise AGV/AMR fleet sizing tool — Toyota Automated Logistics",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark">
      <body>{children}</body>
    </html>
  );
}
