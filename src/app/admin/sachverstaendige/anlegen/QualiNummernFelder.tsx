'use client'

// AAR-515 Welle 2: Conditional Nummern-Felder für Gruppe-B-Qualifikationen.
//
// Erscheint dynamisch unter der Qualifikationen-Chip-Auswahl sobald eine
// der drei verifizierungspflichtigen Qualis angehakt wird:
//   - „BVSK-Mitglied"                 → bvsk_mitgliedsnummer
//   - „IHK-zertifiziert"              → ihk_zertifikat_nummer
//   - „Öffentlich bestellt und vereidigt" → oebuv_bestellungsnummer
//
// Die Nummern sind beim Anlegen optional. Plausibilisierung erfolgt beim
// Tier-2-Freigabe im Admin-Verifizierungs-Tab (Welle 4) — dort sieht Admin
// Nummer + Dokument nebeneinander.

import { IdCardIcon } from 'lucide-react'

type NummernKey = 'bvsk_mitgliedsnummer' | 'ihk_zertifikat_nummer' | 'oebuv_bestellungsnummer'

type Props = {
  qualifikationen: string[]
  bvsk: string
  ihk: string
  oebuv: string
  // Parent-Update-Callback. FormState-Generic auf Parent-Seite bestimmt den
  // exakten Key-Typ — hier nur die 3 relevanten.
  onChange: (key: NummernKey, value: string) => void
}

const FELDER: Array<{ quali: string; key: NummernKey; label: string; placeholder: string }> = [
  {
    quali: 'BVSK-Mitglied',
    key: 'bvsk_mitgliedsnummer',
    label: 'BVSK-Mitgliedsnummer (optional)',
    placeholder: 'z.B. 12345',
  },
  {
    quali: 'IHK-zertifiziert',
    key: 'ihk_zertifikat_nummer',
    label: 'IHK-Zertifikats-Nummer (optional)',
    placeholder: 'z.B. IHK-SV-2024-12345',
  },
  {
    quali: 'Öffentlich bestellt und vereidigt',
    key: 'oebuv_bestellungsnummer',
    label: 'Bestellungsnummer ö.b.u.v. (optional)',
    placeholder: 'z.B. IHK Köln 4711',
  },
]

export default function QualiNummernFelder({
  qualifikationen,
  bvsk,
  ihk,
  oebuv,
  onChange,
}: Props) {
  const aktiveFelder = FELDER.filter(f => qualifikationen.includes(f.quali))
  if (aktiveFelder.length === 0) return null

  const werte: Record<NummernKey, string> = {
    bvsk_mitgliedsnummer: bvsk,
    ihk_zertifikat_nummer: ihk,
    oebuv_bestellungsnummer: oebuv,
  }

  return (
    <div className="rounded-xl border border-claimondo-ondo/20 bg-claimondo-ondo/5 px-4 py-3 space-y-3">
      <div className="flex items-center gap-2">
        <IdCardIcon className="w-4 h-4 text-claimondo-ondo" />
        <h3 className="text-sm font-semibold text-claimondo-navy">Quali-Nummern</h3>
        <span className="text-[10px] text-claimondo-ondo">optional · Plausibilisierung beim Tier-2-Freigabe</span>
      </div>
      <div className="grid gap-2.5 md:grid-cols-2">
        {aktiveFelder.map(f => (
          <label key={f.key} className="block">
            <span className="text-[11px] font-medium text-claimondo-navy">{f.label}</span>
            <input
              type="text"
              value={werte[f.key]}
              onChange={e => onChange(f.key, e.target.value)}
              placeholder={f.placeholder}
              className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-claimondo-border bg-white focus:border-claimondo-ondo focus:outline-none focus:ring-1 focus:ring-claimondo-ondo/20"
            />
          </label>
        ))}
      </div>
    </div>
  )
}
