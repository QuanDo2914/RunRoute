import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RunRoute · Find your next run",
  description:
    "Find running loops and point-to-point routes in Urbana–Champaign.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
