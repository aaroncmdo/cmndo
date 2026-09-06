'use client'

// AAR-956: Wiederverwendbares Feld „Google-Business-Profil verknüpfen".
// Genutzt im Onboarding-Logo-Schritt (LogoUploadStep) UND im SV-Profil
// (ProfilClient). Sucht den Betrieb via Places-Autocomplete (types=establishment),
// speichert die place_id direkt (on-select) via verknuepfeGoogleBusiness und
// zeigt die frisch gefetchten Sterne an. Optional — nicht jeder SV hat ein
// Google-Business-Profil (z.B. neue Betriebe).

import { useState, useTransition } from 'react'
import { CheckCircle2Icon, StarIcon, Loader2Icon } from 'lucide-react'
import GooglePlaceAutocomplete from '@/components/GooglePlaceAutocomplete'
import { verknuepfeGoogleBusiness } from '@/lib/actions/sv/google-business'

export default function GoogleBusinessFeld({
  defaultName,
  defaultDurchschnitt,
  defaultAnzahl,
}: {
  /** Bisher verknüpfter Business-Name (Anzeige im Input). */
  defaultName?: string | null
  defaultDurchschnitt?: number | null
  defaultAnzahl?: number | null
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(defaultDurchschnitt != null || !!defaultName)
  const [bew, setBew] = useState<{ d: number | null; a: number | null }>({
    d: defaultDurchschnitt ?? null,
    a: defaultAnzahl ?? null,
  })

  function handleSelect(placeId: string) {
    if (!placeId) return
    setError(null)
    startTransition(async () => {
      const res = await verknuepfeGoogleBusiness(placeId)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setBew({ d: res.durchschnitt, a: res.anzahl })
      setSaved(true)
    })
  }

  return (
    <div className="rounded-ios-xl border border-claimondo-border bg-white p-4 space-y-2">
      <div className="flex items-center gap-2">
        <StarIcon className="w-4 h-4 text-claimondo-ondo" />
        <p className="text-sm font-semibold text-claimondo-navy">
          Dein Google-Business-Profil{' '}
          <span className="text-[11px] font-normal text-claimondo-shield">(optional)</span>
        </p>
      </div>
      <p className="text-[11px] text-claimondo-shield leading-relaxed">
        Such Ihren Betrieb so, wie er bei Google erscheint — das schaltet Ihre echte
        Sterne-Bewertung im Gutachter-Finder frei. Kunden vertrauen Profilen mit Bewertungen eher.
      </p>
      <GooglePlaceAutocomplete
        types={['establishment']}
        defaultValue={defaultName ?? ''}
        placeholder="Firmenname bei Google suchen…"
        onSelect={(r) => handleSelect(r.place_id)}
      />
      {pending && (
        <p className="flex items-center gap-1.5 text-[11px] text-claimondo-ondo">
          <Loader2Icon className="w-3 h-3 animate-spin" /> Verknüpfe + lade Bewertung…
        </p>
      )}
      {!pending && saved && bew.d != null && (
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-claimondo-navy">
          <CheckCircle2Icon className="w-3.5 h-3.5 text-claimondo-ondo" />
          Verknüpft — {bew.d.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}★
          {bew.a != null ? ` (${bew.a} Bewertungen)` : ''}
        </p>
      )}
      {!pending && saved && bew.d == null && (
        <p className="flex items-center gap-1.5 text-[11px] text-claimondo-shield">
          <CheckCircle2Icon className="w-3.5 h-3.5 text-claimondo-ondo" />
          Verknüpft — Bewertung wird in Kürze geladen.
        </p>
      )}
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  )
}
