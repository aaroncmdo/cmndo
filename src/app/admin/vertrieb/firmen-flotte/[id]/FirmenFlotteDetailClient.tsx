'use client'

// Firmen-Flotten-Akte — Sektions-View. Analog Werkstatt-Detail. Sektionen:
// Stammdaten (Task 5, editierbare Notiz), Fahrzeuge (Task 6), Karten (Task 7),
// Schaeden (Task 8), Flottenmanager-Konto (Task 9).
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BuildingIcon } from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'
import { SectionCard } from '@/components/shared/SectionCard'
import { Button } from '@/components/primitives'
import { updateVertriebFeld } from '../../_actions/update-vertrieb-feld'
import type { FirmenFlotteDetail } from '../../_lib/firmen-flotte-detail'

const FELD_CLS =
  'rounded-ios-md border border-claimondo-border bg-white px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/40'

function Feld({ label, wert }: { label: string; wert: string | null }) {
  return (
    <div>
      <p className="text-caption text-claimondo-ondo/60">{label}</p>
      <p className="text-sm text-claimondo-navy break-words">{wert && wert.trim() ? wert : '—'}</p>
    </div>
  )
}

export default function FirmenFlotteDetailClient({ detail }: { detail: FirmenFlotteDetail }) {
  const router = useRouter()
  const { firma, konten, fahrzeuge, karten, schaeden } = detail

  const [notiz, setNotiz] = useState(firma.notiz ?? '')
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const dirty = notiz !== (firma.notiz ?? '')

  const adresse =
    [firma.adresse_strasse, [firma.adresse_plz, firma.adresse_ort].filter(Boolean).join(' ')]
      .filter((t) => t && t.trim())
      .join(', ') || null

  async function speichereNotiz() {
    setBusy(true)
    setFehler(null)
    const res = await updateVertriebFeld('firmen-flotte', firma.id, 'notizen', notiz.trim() || null)
    setBusy(false)
    if (!res.ok) {
      setFehler(res.error)
      return
    }
    router.refresh()
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-4xl mx-auto">
      <PageHeader
        title={firma.name ?? 'Firmen-Flotte'}
        description={`${fahrzeuge.length} Fahrzeuge · ${karten.length} Karten · ${schaeden.length} Schäden · ${konten.length} Flottenmanager`}
        icon={BuildingIcon}
      />

      <SectionCard title="Stammdaten">
        <div className="grid grid-cols-2 gap-4">
          <Feld label="Firma" wert={firma.name} />
          <Feld label="USt-IdNr." wert={firma.ust_id} />
          <Feld label="Rechtsform" wert={firma.rechtsform} />
          <Feld label="Adresse" wert={adresse} />
          <Feld label="Telefon" wert={firma.telefon} />
          <Feld label="E-Mail" wert={firma.email} />
          <Feld label="Webseite" wert={firma.webseite} />
        </div>
        <div className="space-y-2 mt-4">
          <p className="text-caption text-claimondo-ondo/60">Notizen (intern)</p>
          <textarea
            value={notiz}
            onChange={(e) => setNotiz(e.target.value)}
            rows={3}
            placeholder="Interne Notiz zu dieser Flotte…"
            className={`${FELD_CLS} w-full resize-y`}
          />
          {fehler && <p className="text-caption text-danger-strong">{fehler}</p>}
          <Button variant="navy" size="sm" onClick={speichereNotiz} loading={busy} disabled={!dirty || busy}>
            Speichern
          </Button>
        </div>
      </SectionCard>

      <SectionCard title="Fahrzeuge">
        <p className="text-body-sm text-claimondo-ondo/60">— folgt (Task 6: Liste + Fahrzeug anlegen) —</p>
      </SectionCard>

      <SectionCard title="Schaden-Karten">
        <p className="text-body-sm text-claimondo-ondo/60">— folgt (Task 7: Karten minten + an Fahrzeug binden) —</p>
      </SectionCard>

      <SectionCard title="Schäden">
        <p className="text-body-sm text-claimondo-ondo/60">— folgt (Task 8: Claims der Flotte) —</p>
      </SectionCard>

      <SectionCard title="Flottenmanager-Konto">
        <p className="text-body-sm text-claimondo-ondo/60">— folgt (Task 9: Status / deaktivieren) —</p>
      </SectionCard>
    </div>
  )
}
