import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import { Toaster } from "sonner";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { CookieBanner } from "@/components/CookieBanner";
import PwaInstallBanner from "@/components/PwaInstallBanner";
import OfflineBanner from "@/components/offline/OfflineBanner";
import ServiceWorkerBoot from "@/components/offline/ServiceWorkerBoot";
import PersistStorageToast from "@/components/offline/PersistStorageToast";
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
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
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

// Next.js 15+: themeColor gehört in den separaten viewport-Export.
// 2026-05-08: aus metadata raus migriert (Deprecation-Warning Sweep).
export const viewport = {
  themeColor: "#0D1B3E",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // AAR-459 F1: Locale + Messages aus next-intl/server holen.
  // Locale stammt aus src/i18n/request.ts, das das Cookie `claimondo-locale`
  // liest und auf 'de' fällt-backt. `dir` wird für Arabisch auf 'rtl'
  // gesetzt — weitere Sprachen bleiben 'ltr'.
  const locale = await getLocale();
  const messages = await getMessages();
  const dir = locale === "ar" ? "rtl" : "ltr";

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${montserrat.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col glass-bg">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-lg focus:text-sm focus:font-medium focus:text-[#1E3A5F] focus:ring-2 focus:ring-[#4573A2]">
          Zum Hauptinhalt springen
        </a>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
          <Toaster position="top-right" richColors closeButton />
          <CookieBanner />
          <PwaInstallBanner />
          <OfflineBanner />
          <ServiceWorkerBoot />
          <PersistStorageToast />
        </NextIntlClientProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
