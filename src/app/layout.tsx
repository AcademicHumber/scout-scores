import type { Metadata, Viewport } from "next";
import "./globals.css";
import messages from "@/messages/es.json";

export const metadata: Metadata = {
  title: messages.app.name,
  description: messages.app.tagline,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1f3a8a",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-white text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
