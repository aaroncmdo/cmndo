import Script from 'next/script'

// Monika-Chat-Widget — FOOTPRINT-SAFE geproxt. Das Script laedt von
// autounfall.io/embed/monika.js (next.config `rewrites` -> app.claimondo.de). Das
// Widget leitet seinen `embedBase` aus dem EIGENEN Script-src ab (document.currentScript),
// also laufen ALLE Runtime-Requests (Submit /api/anfrage-from-lp, Sounds /embed/sounds/*,
// Tracking /api/embed-track) ueber autounfall.io und werden serverseitig geproxt.
// -> KEIN crawlbarer claimondo.de-Ref im HTML (Entity-Lock, wie der Finder).
//
// data-mode="generic" -> anon-Quelle `generic_lp` in der Haupt-App (kein Cluster, kein
// SV); der Lead landet anon in der Dispatch-Queue. Theme + Logo = au.io (Ink/Amber,
// eigenes Favicon). Voraussetzung: die generic_lp-Quelle ist in der Haupt-App live +
// autounfall.io in MONIKA_ANON_DOMAINS (sonst 403 beim Absenden).
//
// Die Hex-Werte sind au.io-Tokens (au-ink #1E293B / au-amber #C04920); autounfall-io ist
// ein eigener Top-Level-Build und nicht von den src/**-Token-Ratchets erfasst.
export function MonikaEmbedSlot() {
  return (
    <Script
      src="/embed/monika.js"
      strategy="lazyOnload"
      data-mode="generic"
      data-primary="#1E293B"
      data-accent="#C04920"
      data-text="#1E293B"
      data-logo="/favicon.svg"
    />
  )
}
