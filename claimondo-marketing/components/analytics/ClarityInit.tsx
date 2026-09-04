'use client'

import { usePathname } from 'next/navigation'
import { useClarityConsentInit } from './useClarityConsentInit'
import { LOCALES } from '@/i18n/locales'

// Microsoft Clarity Session-Recording + Heatmaps.
// Lädt nur wenn NEXT_PUBLIC_CLARITY_ID gesetzt ist — damit lokale Dev-Sessions
// und Preview-Deploys ohne ID stillschweigend kein Tracking starten.
//
// Masking: Wird serverseitig im Clarity-Dashboard konfiguriert
// (Settings → Privacy → Masking-Mode: "Strict"). Strict maskiert alle
// Text-Inhalte + Inputs automatisch — Pflicht für Admin/Dispatch/SV-Portale
// wegen Mandantendaten, IBANs, Telefonnummern, Schadenshöhen.
//
// Consent-Gate + Init: in useClarityConsentInit (geteilt mit ClarityInitLP),
// mount-only und DSGVO-consent-gated.
//
// Skip-Routes: Routes mit eigenem Clarity-Snippet (siehe SKIP_ROUTES). Microsoft
// Clarity unterstützt nur eine Project-ID pro Page-Load sauber (window.clarity
// ist global). Damit zwei Projekte nicht kollidieren, lässt ClarityInit dort
// die Init bewusst weg — ausser es wird ein expliziter projectId-Prop gesetzt.
const SKIP_ROUTES = [
  // /kfzgutachter-lp hat eigene LP-spezifische Clarity-ID — siehe
  // src/app/kfzgutachter-lp/page.tsx (CLARITY_ID) + ClarityInitLP.
  '/kfzgutachter-lp',
  // Die beiden Anzeigen-Ziele werden in einem EIGENEN Clarity-Projekt
  // ausgewertet (Aaron 04.09.2026), damit der bezahlte Verkehr nicht im
  // Gesamtrauschen der Website untergeht. Beide Seiten setzen die ID selbst
  // per <ClarityInitLP projectId={CLARITY_ID} />.
  '/check',
  '/gutachter-finden',
]

/**
 * Pfad ohne Sprach-Praefix.
 *
 * ⚠ NOETIG, weil `usePathname()` aus next/navigation das Praefix ENTHAELT und
 * die Route-Strategie `as-needed` ist (i18n/routing.ts): dieselbe Seite ist als
 * `/check` UND als `/de/check` erreichbar. Ein blosses
 * `pathname.startsWith('/check')` haette nur die praefixfreie Variante
 * getroffen — auf `/de/check` waeren dann ZWEI Clarity-Projekte gleichzeitig
 * gestartet, und laut Kommentar oben vertraegt Clarity genau eines pro
 * Seitenaufruf. Der Fehler waere still: Aufzeichnungen laufen, nur unbrauchbar.
 *
 * Der bestehende /kfzgutachter-lp-Eintrag hatte dieselbe Luecke; sie ist damit
 * mitgeschlossen.
 */
function ohneLocale(pathname: string): string {
  const teile = pathname.split('/')
  if (teile.length > 1 && (LOCALES as readonly string[]).includes(teile[1])) {
    return '/' + teile.slice(2).join('/')
  }
  return pathname
}

export function ClarityInit({ projectId }: { projectId?: string } = {}) {
  const pathname = usePathname()
  const pfad = pathname ? ohneLocale(pathname) : null
  const skip = !projectId && !!pfad && SKIP_ROUTES.some((r) => pfad.startsWith(r))
  const id = skip ? undefined : (projectId ?? process.env.NEXT_PUBLIC_CLARITY_ID)
  useClarityConsentInit(id)
  return null
}
