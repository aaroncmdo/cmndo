'use client'

import { useState, useTransition } from 'react'
import { CoinsIcon, SlidersHorizontalIcon, CheckCircle2Icon } from 'lucide-react'
import { Button } from '@/components/primitives/Button'
import { SectionCard } from '@/components/shared/SectionCard'
import { updateKlasseSatz, updateAnspruchConfigWert } from './actions'

type Klasse = { klasse: string; euroProTag: number; bezeichnung: string | null; beispiele: string | null }
type Config = { key: string; wert: number }

// Menschenlesbare Labels + Einheiten fuer die anspruch_config-Keys. Fallback = roher Key.
const CONFIG_META: Record<string, { label: string; einheit: string }> = {
  kostenpauschale_eur: { label: 'Auslagenpauschale', einheit: '€' },
  wertminderung_min_reparatur_eur: { label: 'Wertminderung – Mindest-Reparaturkosten', einheit: '€' },
  wertminderung_max_alter_jahre: { label: 'Wertminderung – max. Fahrzeugalter', einheit: 'Jahre' },
  bagatelle_schwelle_eur: { label: 'Bagatell-Schwelle', einheit: '€' },
  abschlepp_min_eur: { label: 'Abschleppkosten – min.', einheit: '€' },
  abschlepp_max_eur: { label: 'Abschleppkosten – max.', einheit: '€' },
  dauer_leicht_min_tage: { label: 'Reparaturdauer leicht – min.', einheit: 'Tage' },
  dauer_leicht_max_tage: { label: 'Reparaturdauer leicht – max.', einheit: 'Tage' },
  dauer_mittel_min_tage: { label: 'Reparaturdauer mittel – min.', einheit: 'Tage' },
  dauer_mittel_max_tage: { label: 'Reparaturdauer mittel – max.', einheit: 'Tage' },
  dauer_schwer_min_tage: { label: 'Reparaturdauer schwer – min.', einheit: 'Tage' },
  dauer_schwer_max_tage: { label: 'Reparaturdauer schwer – max.', einheit: 'Tage' },
  totalschaden_schwelle_prozent: { label: 'Totalschaden-Schwelle', einheit: '%' },
  reparatur_grenze_prozent: { label: 'Reparatur-Grenze (130-%-Regel)', einheit: '%' },
  wiederbeschaffungsdauer_min_tage: { label: 'Wiederbeschaffungsdauer – min.', einheit: 'Tage' },
  wiederbeschaffungsdauer_max_tage: { label: 'Wiederbeschaffungsdauer – max.', einheit: 'Tage' },
  nutzungsausfall_max_tage: { label: 'Nutzungsausfall – Höchstdauer (Reparatur)', einheit: 'Tage' },
  mietwagen_max_tage: { label: 'Mietwagen – Höchstdauer', einheit: 'Tage' },
  verbringung_eur: { label: 'Verbringungskosten', einheit: '€' },
  ummeldung_eur: { label: 'An- und Abmeldung', einheit: '€' },
}

function EditableRow({
  label, sublabel, einheit, initial, onSave,
}: {
  label: string
  sublabel?: string | null
  einheit: string
  initial: number
  onSave: (wert: number) => Promise<{ ok: boolean; error?: string }>
}) {
  const [wert, setWert] = useState(String(initial))
  const [baseline, setBaseline] = useState(initial)
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [fehler, setFehler] = useState<string | null>(null)

  const parsed = Number(wert.replace(',', '.'))
  const dirty = wert.trim() !== '' && Number.isFinite(parsed) && parsed !== baseline

  function speichern() {
    if (!Number.isFinite(parsed)) { setStatus('error'); setFehler('Ungültige Zahl'); return }
    setFehler(null)
    startTransition(async () => {
      const r = await onSave(parsed)
      if (r.ok) { setBaseline(parsed); setStatus('saved') } else { setStatus('error'); setFehler(r.error ?? 'Fehler') }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-claimondo-border/60 py-2.5 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-body-sm font-medium text-claimondo-navy">{label}</p>
        {sublabel ? <p className="truncate text-caption text-claimondo-shield">{sublabel}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <input
          inputMode="decimal"
          value={wert}
          onChange={(e) => { setWert(e.target.value); setStatus('idle') }}
          className="w-24 rounded-ios-sm border border-claimondo-border px-2.5 py-1.5 text-right text-body-sm text-claimondo-navy"
        />
        <span className="w-8 text-body-sm text-claimondo-shield">{einheit}</span>
        <Button onClick={speichern} loading={pending} disabled={!dirty || pending} variant="ondo" size="sm">
          Speichern
        </Button>
        {status === 'saved' && !dirty ? <CheckCircle2Icon className="h-4 w-4 shrink-0 text-success-strong" aria-label="Gespeichert" /> : null}
      </div>
      {status === 'error' && fehler ? <p className="w-full text-caption text-danger-strong">{fehler}</p> : null}
    </div>
  )
}

export default function AnspruchSaetzeClient({ klassen, config }: { klassen: Klasse[]; config: Config[] }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-heading-lg font-bold text-claimondo-navy">Anspruchsprüfer – Sätze &amp; Parameter</h1>
        <p className="mt-0.5 text-body-sm text-claimondo-ondo">
          Änderungen greifen sofort für neue Ersteinschätzungen im Anspruchsprüfer. Bereits gespeicherte
          Schätzungen bleiben unverändert (Momentaufnahme).
        </p>
      </div>

      <SectionCard
        title="Nutzungsausfall-Klassensätze (A–L)"
        subtitle="Tagessatz je Fahrzeugklasse. Die Klasse wird aus dem Segment abgeleitet, der Altersabschlag (>5 J −1, >10 J −2 Klassen) rechnet automatisch."
        icon={<CoinsIcon className="h-5 w-5" />}
      >
        <div>
          {klassen.map((k) => (
            <EditableRow
              key={k.klasse}
              label={`Klasse ${k.klasse}${k.bezeichnung ? ` · ${k.bezeichnung}` : ''}`}
              sublabel={k.beispiele}
              einheit="€/Tag"
              initial={k.euroProTag}
              onSave={(wert) => updateKlasseSatz(k.klasse, wert)}
            />
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Anspruch-Parameter"
        subtitle="Schwellen, Reparaturdauern, Höchstdauern und Pauschalen für die Berechnung der Ersteinschätzung."
        icon={<SlidersHorizontalIcon className="h-5 w-5" />}
      >
        <div>
          {config.map((c) => {
            const meta = CONFIG_META[c.key]
            return (
              <EditableRow
                key={c.key}
                label={meta?.label ?? c.key}
                sublabel={meta ? c.key : 'unbekannter Parameter'}
                einheit={meta?.einheit ?? ''}
                initial={c.wert}
                onSave={(wert) => updateAnspruchConfigWert(c.key, wert)}
              />
            )
          })}
        </div>
      </SectionCard>
    </div>
  )
}
