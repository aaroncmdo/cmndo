// Werkstatt-Copilot: System-Prompt + dynamischer Auftrags-Kontext. Reparatur-/
// abwicklungs-fokussiert (nicht assessment wie der SV-Copilot). Der Kontext kommt
// aus WerkstattAuftrag (v_werkstatt_auftrag, RLS-gegatet) + optional Extra
// (Vorschaeden) — KEIN DB-Read hier: der Caller (api/werkstatt/copilot/route.ts)
// hat den Auftrag schon via getWerkstattAuftrag geladen + damit RLS-gegated.

import type { WerkstattAuftrag, WerkstattAuftragExtra } from '@/lib/werkstatt/queries'

const EUR = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})
const fmtEur = (n: number | null | undefined) => (n == null ? '–' : EUR.format(Number(n)))
const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) : '–'

const ABRECHNUNGSWEG_LABEL: Record<string, string> = {
  haftpflicht: 'Haftpflicht (gegnerische VS zahlt, Gutachten-Basis)',
  kasko: 'Kasko (eigene VS, Selbstbeteiligung/Bedingungen beachten)',
  selbstzahler: 'Selbstzahler',
}

export const WERKSTATT_COPILOT_SYSTEM_STATIC = `Du bist der Claimondo-Copilot für Partner-Werkstätten. Du unterstützt die
Werkstatt bei der Schadenreparatur und der Abwicklung mit Claimondo. Antworte
immer auf Deutsch, praxisnah, in der DU-Form (Kollege zu Kollege).

=== WOBEI DU HILFST ===

1. Reparaturweg & Abrechnung: Haftpflicht (Gutachten-Basis, gegnerische VS zahlt),
   Kasko (eigene VS, Selbstbeteiligung/Bedingungen) oder Selbstzahler — was das für
   Freigabe und Abrechnung bedeutet.

2. Kostenvoranschlag (KVA): was hineingehört und die Kalkulationslogik — AW/Lohn,
   Ersatzteile (UPE-Aufschläge), Lackmaterial, Verbringung, Beilackierung — plus
   Plausibilität gegen die Gutachten-Kalkulation.

3. Umgang mit dem Gutachten: die kalkulierten Werte einordnen (Reparaturkosten,
   Rest-/Wiederbeschaffungswert); Abweichungen der tatsächlichen Reparatur vom
   Gutachten sauber über Claimondo nachmelden (Nachkalkulation/Ergänzung).

4. Reparaturtermin & Ablauf: erst nach Freigabe reparieren, Kunde und Claimondo
   koordinieren, Reparaturdauer und Nutzungsausfall realistisch kommunizieren.

5. Totalschaden-Fall: wenn der Gutachter Totalschaden feststellt — die 130%-Grenze
   technisch einordnen, wann sich die Reparatur (nicht) lohnt und wie es mit
   Claimondo weitergeht.

Nutze immer den konkreten Auftrags-Kontext (Fahrzeug, Abrechnungsweg, Gutachten-
Werte, KVA, Reparaturtermin, Vorschäden) unten.

=== WAS DU NICHT TUST ===

1. KEINE Rechtsberatung — Haftung, Quote, Ansprüche klärt die Kanzlei/Claimondo.
2. KEINE festen Zusagen zu Freigaben oder Zahlungen der Versicherung.
3. KEINE Interna zu anderen Werkstätten, Provisions-Konditionen oder internen
   Claimondo-Tools.
4. Bei Unsicherheit: sag es ehrlich und verweise auf deinen Claimondo-Betreuer
   (über den Gruppenchat im Auftrag erreichbar).

=== TON ===

- Deutsch, DU-Form, praxisnah, präzise, ohne Floskeln.
- Markdown für Struktur (Listen, **fett**).
- So lang wie nötig, so kurz wie möglich.
`

export function buildWerkstattCopilotDynamicSystem(
  auftrag: WerkstattAuftrag,
  extra: WerkstattAuftragExtra | null,
): string {
  const fahrzeug =
    [auftrag.fahrzeug_hersteller, auftrag.fahrzeug_modell].filter(Boolean).join(' ') || '–'
  const fzDetail: string[] = []
  if (extra?.fahrzeug_baujahr != null) fzDetail.push(`Baujahr ${String(extra.fahrzeug_baujahr)}`)
  if (extra?.kilometerstand != null) fzDetail.push(`${String(extra.kilometerstand)} km`)

  const lines: string[] = []
  lines.push('— Auftrags-Kontext —')
  lines.push('')
  lines.push(`- Fallnummer: ${auftrag.claim_nummer ?? '–'}`)
  lines.push(`- Kunde: ${auftrag.kunde_name ?? '–'}`)
  lines.push(
    `- Fahrzeug: ${fahrzeug}${fzDetail.length ? ` (${fzDetail.join(', ')})` : ''}${
      auftrag.kennzeichen ? ` · ${auftrag.kennzeichen}` : ''
    }`,
  )
  lines.push(
    `- Schadenart: ${auftrag.schadenart ?? '–'}${auftrag.unfallart ? ` · ${auftrag.unfallart}` : ''}`,
  )
  const weg = auftrag.abrechnungsweg
    ? ABRECHNUNGSWEG_LABEL[auftrag.abrechnungsweg] ?? auftrag.abrechnungsweg
    : '–'
  lines.push(`- Abrechnungsweg: ${weg}`)
  if (auftrag.reparaturwunsch) lines.push(`- Reparaturwunsch: ${auftrag.reparaturwunsch}`)
  if (extra && (extra.hat_vorschaeden || extra.vorschaden_anzahl)) {
    lines.push(
      `- Vorschäden gemeldet: ja${extra.vorschaden_anzahl ? ` (${extra.vorschaden_anzahl})` : ''}`,
    )
  }

  const hasGut =
    auftrag.gutachten_reparaturkosten_netto != null || auftrag.gutachten_totalschaden != null
  if (hasGut) {
    lines.push('')
    lines.push('GUTACHTEN (SV-Kalkulation):')
    lines.push(
      `- Reparaturkosten netto: ${fmtEur(auftrag.gutachten_reparaturkosten_netto)} (brutto ${fmtEur(
        auftrag.gutachten_reparaturkosten_brutto,
      )})`,
    )
    lines.push(`- Wertminderung: ${fmtEur(auftrag.gutachten_minderwert)}`)
    lines.push(
      `- Wiederbeschaffungswert: ${fmtEur(
        auftrag.gutachten_wiederbeschaffungswert,
      )} · Restwert: ${fmtEur(auftrag.gutachten_restwert)}`,
    )
    if (auftrag.gutachten_totalschaden === true) lines.push('- **Totalschaden** laut Gutachten.')
    if (auftrag.reparaturdauer_tage != null)
      lines.push(`- Reparaturdauer (Gutachten): ${auftrag.reparaturdauer_tage} Tage`)
  }

  if (auftrag.kostenvoranschlag_netto != null || auftrag.kostenvoranschlag_brutto != null) {
    lines.push('')
    lines.push('DEIN KOSTENVORANSCHLAG:')
    lines.push(
      `- Netto: ${fmtEur(auftrag.kostenvoranschlag_netto)} · Brutto: ${fmtEur(
        auftrag.kostenvoranschlag_brutto,
      )}`,
    )
    if (auftrag.reparaturdauer_tage_kva != null)
      lines.push(`- Reparaturdauer (KVA): ${auftrag.reparaturdauer_tage_kva} Tage`)
  }

  lines.push('')
  lines.push('STATUS:')
  lines.push(
    `- Reparaturtermin: ${auftrag.reparatur_termin_status ?? '–'}${
      auftrag.reparatur_bestaetigter_termin
        ? ` (bestätigt: ${fmtDate(auftrag.reparatur_bestaetigter_termin)})`
        : auftrag.reparatur_wunschtermin
          ? ` (Wunsch: ${fmtDate(auftrag.reparatur_wunschtermin)})`
          : ''
    }`,
  )
  lines.push(
    `- Reparatur freigegeben: ${
      auftrag.reparatur_freigegeben_am ? `ja (${fmtDate(auftrag.reparatur_freigegeben_am)})` : 'noch nicht'
    }`,
  )
  if (auftrag.gutachter_firmenname) lines.push(`- Gutachter: ${auftrag.gutachter_firmenname}`)

  return '\n\n' + lines.join('\n')
}
