'use client'
// Profi-Verzeichnis-Suche (debounced) -> duenne Route /api/netzwerk/verzeichnis (die eigentliche
// sucheVerzeichnis() ist kein 'use server' + RLS-Client via next/headers -> nicht client-importierbar)
// -> Treffer + „Vernetzen" (sendeFreundAnfrage).
import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/primitives'
import { SectionCard } from '@/components/shared/SectionCard'
import { TextField } from '@/components/shared/forms/TextField'
import { SelectField } from '@/components/shared/forms/SelectField'
import { sendeFreundAnfrage } from '@/lib/netzwerk/verbindungen-actions'
import type { NetzwerkRolle } from '@/lib/netzwerk/types'

type VerzeichnisTreffer = {
  profilId: string
  rolle: NetzwerkRolle
  name: string
  ort: string | null
  avatarUrl: string | null
}

const ROLLE_LABEL: Record<NetzwerkRolle, string> = {
  sachverstaendiger: 'Sachverständiger',
  werkstatt: 'Werkstatt',
  flottenmanager: 'Flotte',
  makler: 'Makler',
}

const FILTER_OPTIONEN = [
  { value: '', label: 'Alle Rollen' },
  { value: 'sachverstaendiger', label: 'Sachverständige' },
  { value: 'werkstatt', label: 'Werkstätten' },
  { value: 'flottenmanager', label: 'Flotten' },
]

export function VerzeichnisSuche() {
  const [query, setQuery] = useState('')
  const [zielRolle, setZielRolle] = useState('')
  const [treffer, setTreffer] = useState<VerzeichnisTreffer[]>([])
  const [suchend, setSuchend] = useState(false)
  const [angefragt, setAngefragt] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setTreffer([])
      setSuchend(false)
      return
    }
    setSuchend(true)
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q })
      if (zielRolle) params.set('zielRolle', zielRolle)
      fetch(`/api/netzwerk/verzeichnis?${params.toString()}`)
        .then((r) => r.json())
        .then((json) => setTreffer(json.ok ? json.treffer : []))
        .catch(() => setTreffer([]))
        .finally(() => setSuchend(false))
    }, 300)
    return () => clearTimeout(timer)
  }, [query, zielRolle])

  function vernetzen(profilId: string) {
    startTransition(async () => {
      const res = await sendeFreundAnfrage(profilId)
      if (!res.ok) {
        toast.error(res.error ?? 'Anfrage konnte nicht gesendet werden.')
      } else {
        toast.success('Anfrage gesendet.')
        setAngefragt((s) => new Set(s).add(profilId))
      }
    })
  }

  const zeigeHinweis = query.trim().length > 0 && query.trim().length < 2

  return (
    <SectionCard title="Profi-Verzeichnis">
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <TextField
            label="Name, Firma, Ort oder PLZ"
            placeholder="z. B. Müller, Köln oder 50667"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1"
          />
          <SelectField
            label="Rolle"
            value={zielRolle}
            onChange={(e) => setZielRolle(e.target.value)}
            options={FILTER_OPTIONEN}
          />
        </div>

        {suchend ? (
          <p className="text-body-sm text-claimondo-shield">Suche läuft…</p>
        ) : zeigeHinweis ? (
          <p className="text-body-sm text-claimondo-shield">Bitte mindestens 2 Zeichen eingeben.</p>
        ) : query.trim().length >= 2 && treffer.length === 0 ? (
          <p className="text-body-sm text-claimondo-shield">Keine Treffer gefunden.</p>
        ) : treffer.length > 0 ? (
          <div className="divide-y divide-claimondo-border">
            {treffer.map((t) => (
              <div key={t.profilId} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-body-sm font-medium text-claimondo-navy truncate">{t.name}</p>
                  <p className="text-caption text-claimondo-shield">
                    {ROLLE_LABEL[t.rolle]}
                    {t.ort ? ` · ${t.ort}` : ''}
                  </p>
                </div>
                <Button
                  variant="ondo"
                  size="sm"
                  loading={pending}
                  disabled={angefragt.has(t.profilId)}
                  onClick={() => vernetzen(t.profilId)}
                >
                  {angefragt.has(t.profilId) ? 'Angefragt' : 'Vernetzen'}
                </Button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </SectionCard>
  )
}
