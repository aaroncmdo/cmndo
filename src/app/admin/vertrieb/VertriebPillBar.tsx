'use client'
// Vertrieb-Cockpit: Rollen-Pills (SV·Makler·Werkstatt) + Lead/Partner-Schalter.
// Ersetzt die frühere Tab-Nav + die Typ/Rolle-Button-Bloecke im Roster (Chip-basiert,
// Component-Set-konform). "Partner-Leads" als eigene Rubrik loest sich hier auf:
// = Lead-Modus ueber alle Rollen.
import { Chip, ChipRow } from '@/components/ui/Chip'
import type { VertriebRolle, VertriebTyp } from '@/lib/vertrieb/vertrieb-kontakt.types'

const ROLLE_PILLS: { key: VertriebRolle | 'alle'; label: string }[] = [
  { key: 'alle', label: 'Alle' },
  { key: 'sv', label: 'Sachverständige' },
  { key: 'makler', label: 'Makler' },
  { key: 'werkstatt', label: 'Werkstätten' },
  { key: 'firmen-flotte', label: 'Firmen-Flotten' },
]
const TYP_PILLS: { key: VertriebTyp | 'alle'; label: string }[] = [
  { key: 'alle', label: 'Alle' },
  { key: 'lead', label: 'Leads' },
  { key: 'partner', label: 'Partner' },
]

export default function VertriebPillBar({
  rolle,
  setRolle,
  typ,
  setTyp,
}: {
  rolle: VertriebRolle | 'alle'
  setRolle: (r: VertriebRolle | 'alle') => void
  typ: VertriebTyp | 'alle'
  setTyp: (t: VertriebTyp | 'alle') => void
}) {
  return (
    <div className="space-y-2">
      <ChipRow>
        {ROLLE_PILLS.map((p) => (
          <Chip key={p.key} variant={rolle === p.key ? 'selected' : 'default'} onClick={() => setRolle(p.key)}>
            {p.label}
          </Chip>
        ))}
      </ChipRow>
      <ChipRow>
        {TYP_PILLS.map((p) => (
          <Chip key={p.key} variant={typ === p.key ? 'selected' : 'ghost'} onClick={() => setTyp(p.key)}>
            {p.label}
          </Chip>
        ))}
      </ChipRow>
    </div>
  )
}
