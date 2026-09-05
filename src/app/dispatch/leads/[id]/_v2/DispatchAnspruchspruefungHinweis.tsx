'use client'

// Kasko-WB Phase 2 (D2): die unverbindliche Selbst-Auswertung des Kunden aus dem /check-Quiz (leads.auswertung_
// unverbindlich, Shape {quelle, tier, erstellt_am, antworten}) sichtbar machen — vorher hatte die Spalte null Leser.
// Nur Anzeige: kein Betrag, kein Urteil; der Dispatcher sieht, was der Kunde vorher angeklickt hat.

import { Card } from '@/components/primitives'

const TIER: Record<string, string> = {
  voll: 'Vollanspruch (unverschuldet)',
  quote: 'Anteilig (Teilschuld)',
  pruefen: 'Schuld offen',
  kasko: 'Kasko (Eigenverschulden)',
}
const FELD: Record<string, string> = { schuld: 'Schuld', unfall_her: 'Unfall', gutachten: 'Gutachten' }
const LABEL: Record<string, Record<string, string>> = {
  schuld: { gegner: 'Der Gegner', teils: 'Teils ich, teils der Gegner', unklar: 'Noch unklar', selbst: 'Ich war (haupt)schuld', eigenverantwortung: 'Ich war (haupt)schuld' },
  unfall_her: { unter_woche: 'vor weniger als einer Woche', bis_monat: 'vor bis zu einem Monat', ueber_monat: 'vor mehr als einem Monat' },
  gutachten: { nein: 'noch keins', versicherung: 'von der Versicherung', ja: 'eigenes vorhanden' },
}

export type AuswertungAnzeige = { tier: string; zeilen: string[]; datum: string | null }

/** Pure: Rohwert -> Anzeige. Unbekannte Felder/Werte erscheinen roh (nichts wird erfunden), null -> null. */
export function formatiereAuswertung(a: unknown): AuswertungAnzeige | null {
  if (!a || typeof a !== 'object') return null
  const o = a as { tier?: unknown; erstellt_am?: unknown; antworten?: unknown }
  const tierRoh = typeof o.tier === 'string' ? o.tier : null
  const antworten = o.antworten && typeof o.antworten === 'object' ? (o.antworten as Record<string, unknown>) : {}
  const zeilen = Object.entries(antworten)
    .filter(([, v]) => typeof v === 'string' && v !== '')
    .map(([k, v]) => `${FELD[k] ?? k}: ${LABEL[k]?.[v as string] ?? (v as string)}`)
  if (!tierRoh && zeilen.length === 0) return null
  let datum: string | null = null
  if (typeof o.erstellt_am === 'string') {
    const d = new Date(o.erstellt_am)
    if (!Number.isNaN(d.getTime())) {
      datum = d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })
    }
  }
  return { tier: tierRoh ? (TIER[tierRoh] ?? tierRoh) : 'ohne Einstufung', zeilen, datum }
}

export default function DispatchAnspruchspruefungHinweis({ auswertung }: { auswertung: unknown }) {
  const f = formatiereAuswertung(auswertung)
  if (!f) return null
  return (
    <Card p={4} radius="lg" className="mb-4" data-testid="dispatch-anspruchspruefung">
      <p className="text-caption uppercase tracking-wide text-claimondo-navy/60">
        Anspruchsprüfung des Kunden (unverbindlich{f.datum ? `, ${f.datum}` : ''})
      </p>
      <p className="mt-1 text-body-sm font-semibold text-claimondo-navy">{f.tier}</p>
      {f.zeilen.length > 0 && (
        <ul className="mt-1 text-body-sm text-claimondo-navy/80">
          {f.zeilen.map((z) => (
            <li key={z}>{z}</li>
          ))}
        </ul>
      )}
    </Card>
  )
}
