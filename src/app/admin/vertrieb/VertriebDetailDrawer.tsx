'use client'
// Vertrieb-CRM P1b: Read-only Detail-Drawer — Klick auf eine Roster-Zeile zeigt den
// Partner: Stufe + workflow-getriebener „Nächster Schritt"-Hinweis + alle Felder.
// P2 baut das pro Typ (SV/Makler/Werkstatt/Lead) mit editierbaren Feldern + Aktionen aus.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Drawer, Card, Button } from '@/components/primitives'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { KIND_LABEL, STUFE_HINT } from './_lib/labels'
import { detailLink } from './_lib/detail-link'
import { updateVertriebFeld } from './_actions/update-vertrieb-feld'
import type { VertriebKontakt } from '@/lib/vertrieb/vertrieb-kontakt.types'

function Feld({ label, wert }: { label: string; wert: string | null }) {
  return (
    <div>
      <p className="text-caption text-claimondo-ondo/60">{label}</p>
      <p className="text-sm text-claimondo-navy break-words">{wert && wert.trim() ? wert : '—'}</p>
    </div>
  )
}

// Editierbare interne Notiz — pro Partner via key={id} frisch gemountet (kein Reset-Effekt).
// Speichert ueber updateVertriebFeld (Staff-Guard + Whitelist) in die reale Spalte je kind.
function NotizenEditor({ kontakt }: { kontakt: VertriebKontakt }) {
  const router = useRouter()
  const [wert, setWert] = useState(kontakt.notizen ?? '')
  const [saving, setSaving] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [gespeichert, setGespeichert] = useState(false)
  const dirty = wert !== (kontakt.notizen ?? '')

  async function speichern() {
    setSaving(true)
    setFehler(null)
    setGespeichert(false)
    const res = await updateVertriebFeld(kontakt.kind, kontakt.id, 'notizen', wert.trim() || null)
    setSaving(false)
    if (!res.ok) {
      setFehler(res.error)
      return
    }
    setGespeichert(true)
    router.refresh()
  }

  return (
    <div className="space-y-2">
      <p className="text-caption text-claimondo-ondo/60">Notizen (intern)</p>
      <textarea
        value={wert}
        onChange={(e) => {
          setWert(e.target.value)
          setGespeichert(false)
        }}
        rows={3}
        placeholder="Interne Notiz zu diesem Partner…"
        className="w-full rounded-ios-md border border-claimondo-border bg-white px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/40"
      />
      {fehler && <p className="text-caption text-danger-strong">{fehler}</p>}
      <div className="flex items-center gap-2">
        <Button variant="navy" size="sm" onClick={speichern} loading={saving} disabled={!dirty || saving}>
          Speichern
        </Button>
        {gespeichert && !dirty && <span className="text-caption text-success-strong">Gespeichert</span>}
      </div>
    </div>
  )
}

export default function VertriebDetailDrawer({
  kontakt,
  onClose,
}: {
  kontakt: VertriebKontakt | null
  onClose: () => void
}) {
  const router = useRouter()
  const link = kontakt ? detailLink(kontakt.kind, kontakt.id) : null
  return (
    <Drawer open={!!kontakt} onClose={onClose} width={460} ariaLabel="Partner-Detail">
      {kontakt && (
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-caption text-claimondo-ondo/60">{KIND_LABEL[kontakt.kind]}</p>
            <h2 className="text-heading-md text-claimondo-navy">{kontakt.name ?? '—'}</h2>
            <StatusBadge domain="vertrieb-workflow" code={kontakt.stufe} size="sm" />
          </div>

          <Card p={4} radius="lg">
            <p className="text-caption text-claimondo-ondo/60 mb-1">Nächster Schritt</p>
            <p className="text-sm text-claimondo-navy">{STUFE_HINT[kontakt.stufe]}</p>
          </Card>

          <div className="grid grid-cols-2 gap-4">
            <Feld label="E-Mail" wert={kontakt.email} />
            <Feld label="Telefon" wert={kontakt.telefon} />
            <Feld label="PLZ" wert={kontakt.plz} />
            <Feld label="Ort" wert={kontakt.ort} />
            <Feld label="Quelle" wert={kontakt.quelle} />
            <Feld
              label="Angelegt"
              wert={kontakt.erstellt_am ? new Date(kontakt.erstellt_am).toLocaleDateString('de-DE') : null}
            />
          </div>

          <NotizenEditor key={kontakt.id} kontakt={kontakt} />

          {link && (
            <Button variant="navy" fullWidth onClick={() => router.push(link.href)}>
              {link.label}
            </Button>
          )}
        </div>
      )}
    </Drawer>
  )
}
