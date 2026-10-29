import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "STD 2D",
  description: "STD 2D · Sistema de Trámite Documentario.",
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
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
