'use client'

// AAR-login-embed (L3a) — Marketing-Split-Kopie, byte-gleich zum Monolith-Original
// (src/components/landing/LoginCtaLink.tsx). Anmelden-CTA, der die aktuelle Seite
// als ?continue= mitgibt -> nach Login kehrt der User hierher zurueck (statt nur
// ins Default-Portal). SSR-Fallback ist der statische /login-Link (No-JS-safe,
// keine Hydration-Diff). Server-seitige Whitelist in login/actions.ts (L1,
// safe-continue) erlaubt nur *.claimondo.de -> claimondo.de faellt rein.

import type { ReactNode } from 'react'

const LOGIN_BASE = 'https://app.claimondo.de'

export function LoginCtaLink({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <a
      href={`${LOGIN_BASE}/login`}
      className={className}
      onClick={(e) => {
        e.preventDefault()
        window.location.href = `${LOGIN_BASE}/login?continue=${encodeURIComponent(window.location.href)}`
      }}
    >
      {children}
    </a>
  )
}
