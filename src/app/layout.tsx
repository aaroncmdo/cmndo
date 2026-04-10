import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import { Toaster } from "sonner";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { CookieBanner } from "@/components/CookieBanner";
import { Footer } from "@/components/Footer";
import PwaInstallBanner from "@/components/PwaInstallBanner";
import OfflineBanner from "@/components/offline/OfflineBanner";
import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  variable: "--font-montserrat",
});

export const metadata: Metadata = {
  title: "Claimondo",
  description: "Claimondo KFZ-Schadensmanagement",
  manifest: "/manifest.json",
  themeColor: "#0D1B3E",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icons/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/icons/icon.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Claimondo",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="de"
      className={`${montserrat.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col glass-bg">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-lg focus:text-sm focus:font-medium focus:text-[#1E3A5F] focus:ring-2 focus:ring-[#4573A2]">
          Zum Hauptinhalt springen
        </a>
        {children}
        <Footer />
        <Toaster position="top-right" richColors closeButton />
        <CookieBanner />
        <PwaInstallBanner />
        <OfflineBanner />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
