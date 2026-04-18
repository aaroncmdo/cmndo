import { FlowShell } from '../../_components/FlowShell'
import { createClient } from '@/lib/supabase/server'
import { GegnerGuard } from './GegnerGuard'

// AAR-474 C8: Schritt 2c — Gegner-Daten-Form.
// Lädt aktive Versicherer (ist_aktiv=true) für Autocomplete und reicht sie
// an den Client-Guard durch. Der Guard (leadId-Check) ist client-seitig,
// weil leadId in sessionStorage liegt.

export default async function Schritt2GegnerPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('versicherungen')
    .select('id, name')
    .eq('ist_aktiv', true)
    .order('name')

  const versicherer = data ?? []

  return (
    <FlowShell step={2}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-claimondo-navy">
          Daten des Unfallgegners
        </h1>
        <p className="mt-2 text-slate-600">
          Je mehr wir über den Gegner wissen, desto schneller läuft die
          Regulierung. Pflicht sind Name und Kennzeichen — außer bei
          Fahrerflucht.
        </p>
      </div>
      <GegnerGuard versicherer={versicherer} />
    </FlowShell>
  )
}
