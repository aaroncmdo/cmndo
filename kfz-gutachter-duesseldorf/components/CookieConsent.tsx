'use client'

import { useEffect, useState } from 'react'

// Custom Cookie-Consent fuer die Cluster-LPs (AAR-967). vanilla-cookieconsent
// (orestbida v3) initialisierte im Next-16-Standalone/Turbopack-Build NICHT
// zuverlaessig (run() baut kein #cc-main, show() wirft "addEventListener of
// undefined"). Daher eigener schlanker Banner im selben Look (Box unten-links,
// necessary/analytics/ads). cc_cookie bleibt kompatibel (categories[]), Consent
// steuert Google Consent Mode v2 (gtag). window.gtag ist global getypt (lib/tracking.ts).

const COOKIE = 'cc_cookie'
const MAXAGE = 60 * 60 * 24 * 182 // ~6 Monate

function writeConsent(cats: string[]) {
  document.cookie = `${COOKIE}=${encodeURIComponent(JSON.stringify({ categories: cats }))};path=/;max-age=${MAXAGE};samesite=lax`
}

function applyGcm(statistics: boolean, marketing: boolean) {
  const g = (b: boolean): 'granted' | 'denied' => (b ? 'granted' : 'denied')
  try {
    window.gtag?.('consent', 'update', {
      analytics_storage: g(statistics),
      functionality_storage: g(statistics),
      ad_storage: g(marketing),
      ad_user_data: g(marketing),
      ad_personalization: g(marketing),
    })
  } catch {
    // gtag evtl. nicht geladen (Phase 1 ohne Tracking-ENV) — Wahl bleibt in cc_cookie.
  }
}

export function CookieConsentBanner() {
  const [open, setOpen] = useState(false)
  const [prefs, setPrefs] = useState(false)
  const [analytics, setAnalytics] = useState(false)
  const [ads, setAds] = useState(false)

  useEffect(() => {
    if (!document.cookie.match(/(?:^|; )cc_cookie=/)) setOpen(true)
    const reopen = () => {
      setPrefs(true)
      setOpen(true)
    }
    window.addEventListener('cc:open', reopen)
    return () => window.removeEventListener('cc:open', reopen)
  }, [])

  function save(cats: string[]) {
    writeConsent(cats)
    applyGcm(cats.includes('analytics'), cats.includes('ads'))
    // Andere Consent-Verbraucher (ProSealWidget) sofort informieren — ohne das
    // erschiene das Siegel erst beim naechsten Seitenaufruf, obwohl der Besucher
    // gerade zugestimmt hat.
    try {
      window.dispatchEvent(new Event('cc:changed'))
    } catch {
      // noop
    }
    setOpen(false)
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-label="Cookie-Einstellungen"
      className="fixed bottom-4 left-4 z-[2000] w-[calc(100vw-2rem)] max-w-[420px] rounded-2xl border border-border bg-surface shadow-[0_12px_40px_rgba(14,52,70,.22)] p-5 text-ink"
    >
      {!prefs ? (
        <>
          <h2 className="font-display font-bold text-[16px] mb-1.5">Wir verwenden Cookies</h2>
          <p className="text-[13px] leading-relaxed text-secondary mb-4">
            Wir nutzen Cookies für Statistik und Marketing. Notwendige Cookies sind immer aktiv. Sie können frei
            wählen und Ihre Einwilligung jederzeit widerrufen.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => save(['necessary', 'analytics', 'ads'])}
              className="flex-1 min-w-[120px] bg-amber text-white font-display font-bold text-[13.5px] px-4 py-2.5 rounded-cta hover:bg-amber-700 transition"
            >
              Alle akzeptieren
            </button>
            <button
              type="button"
              onClick={() => save(['necessary'])}
              className="flex-1 min-w-[100px] bg-petrol-tint text-petrol font-semibold text-[13.5px] px-4 py-2.5 rounded-cta hover:brightness-95 transition"
            >
              Ablehnen
            </button>
            <button
              type="button"
              onClick={() => setPrefs(true)}
              className="text-muted text-[12.5px] underline underline-offset-2 px-1.5 py-2 hover:text-ink transition"
            >
              Einstellungen
            </button>
          </div>
        </>
      ) : (
        <>
          <h2 className="font-display font-bold text-[16px] mb-3">Cookie-Einstellungen</h2>
          <label className="flex items-start gap-3 mb-2.5 opacity-70">
            <input type="checkbox" checked readOnly className="mt-1 accent-petrol" />
            <span className="text-[12.5px] leading-snug text-secondary">
              <strong className="block text-ink text-[13px]">Notwendig</strong>Für den Betrieb der Seite erforderlich. Immer aktiv.
            </span>
          </label>
          <label className="flex items-start gap-3 mb-2.5 cursor-pointer">
            <input type="checkbox" checked={analytics} onChange={(e) => setAnalytics(e.target.checked)} className="mt-1 accent-amber" />
            <span className="text-[12.5px] leading-snug text-secondary">
              <strong className="block text-ink text-[13px]">Statistik</strong>Reichweitenmessung (Google Analytics, Microsoft Clarity).
            </span>
          </label>
          <label className="flex items-start gap-3 mb-4 cursor-pointer">
            <input type="checkbox" checked={ads} onChange={(e) => setAds(e.target.checked)} className="mt-1 accent-amber" />
            <span className="text-[12.5px] leading-snug text-secondary">
              <strong className="block text-ink text-[13px]">Marketing</strong>Conversion-Messung für Google Ads.
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => save(['necessary', ...(analytics ? ['analytics'] : []), ...(ads ? ['ads'] : [])])}
              className="flex-1 min-w-[120px] bg-petrol text-white font-display font-bold text-[13.5px] px-4 py-2.5 rounded-cta hover:bg-petrol-700 transition"
            >
              Auswahl speichern
            </button>
            <button
              type="button"
              onClick={() => save(['necessary', 'analytics', 'ads'])}
              className="flex-1 min-w-[120px] bg-amber text-white font-display font-bold text-[13.5px] px-4 py-2.5 rounded-cta hover:bg-amber-700 transition"
            >
              Alle akzeptieren
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/** Re-Open der Einstellungen (z. B. Footer-Widerruf-Link via window-Event). */
export function openConsentPreferences() {
  try {
    window.dispatchEvent(new Event('cc:open'))
  } catch {
    // noop
  }
}
