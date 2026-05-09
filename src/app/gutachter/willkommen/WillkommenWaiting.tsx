'use client'

// Supabase-Propagierungs-Lag: Wenn ein Admin einen neuen SV anlegt und der
// SV sich sofort einloggt, ist der sachverstaendige-Eintrag oft noch nicht
// auf dem Query-Pfad sichtbar (Read-Replica-Lag / PgBouncer-Pool).
// Diese Komponente zeigt einen Spinner + lädt die Seite nach 4 s neu —
// dann ist die Row verfügbar und der Wizard startet normal.

import { useEffect } from 'react'

export default function WillkommenWaiting() {
  useEffect(() => {
    const t = setTimeout(() => window.location.reload(), 4000)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#f8f9fb] gap-4 text-center px-4">
      <div className="w-10 h-10 rounded-full border-4 border-claimondo-navy/20 border-t-claimondo-navy animate-spin" />
      <p className="text-sm font-semibold text-claimondo-navy">Konto wird eingerichtet …</p>
      <p className="text-xs text-claimondo-ondo max-w-xs leading-relaxed">
        Dein Account wurde soeben angelegt. Diese Seite lädt sich automatisch neu.
      </p>
    </div>
  )
}
