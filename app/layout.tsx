import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import SplashScreen from "@/components/SplashScreen";

export const metadata: Metadata = {
  title: "الفريج — نظام إدارة الفعاليات",
  description: "نظام الفريج المتكامل لإدارة الفعاليات والحفلات",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "الفريج",
  },
};

export const viewport: Viewport = {
  themeColor: "#1C2D50",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className="h-full">
      <head>
        <link rel="apple-touch-icon" href="/logo.jpg" />
      </head>
      <body className="h-full bg-slate-50 antialiased">
        <SplashScreen />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
