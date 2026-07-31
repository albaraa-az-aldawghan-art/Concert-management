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
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // ar-u-nu-latn: عربية بأرقام لاتينية — يجعل المتصفح يرسم أرقام
    // حقول التاريخ والرقم بـ 0-9 لا ٠-٩
    <html lang="ar-u-nu-latn" dir="rtl" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
        <link rel="apple-touch-icon" href="/logo.jpg" />
      </head>
      <body className="h-full bg-slate-50 antialiased">
        <SplashScreen />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
