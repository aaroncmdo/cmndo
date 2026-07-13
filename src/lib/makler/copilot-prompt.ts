// AAR-489 (M7): System-Prompt-Builder fuer den Makler-Copilot.
// Lädt Fall + Kunde + Gutachten-Werte + Gruppenchat-Auszug und formatiert
// sie in einen deutschsprachigen System-Prompt mit Eskalations-Playbook.
//
// Wird NUR nach dem Consent-Gate aus der API-Route aufgerufen — setzt
// damit implizit Vollzugriff voraus (Caller hat geprüft).

import { createAdminClient } from '@/lib/supabase/admin'
// CMM-44 MP-6a: 4-Phasen-Modell (v_claim_phase) statt des claims.phase-10-Codes,
// der in MP-6c gedroppt wird. Service-Read der abgeleiteten Phase + Substate-Label.
import { getClaimPhaseMap } from '@/lib/claims/claim-phase-map'
import { SUBPHASE_LABEL, MAIN_PHASE_LABEL } from '@/lib/claims/lifecycle'
// Geteilter Gutachten-Werte-Helper — identische Zahlen wie getMaklerFallDetail (Detail-Uebersicht).
import { mapGutachtenWerte, GUTACHTEN_WERTE_COLUMNS } from './gutachten-werte'

const EUR = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

function fmtEur(n: number | null | undefined): string {
  if (n === null || n === undefined) return '–'
  return EUR.format(Number(n))
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '–'
  return new Date(iso).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })
}

export const MAKLER_COPILOT_SYSTEM_STATIC = `Du bist der Claimondo-Copilot für Makler. Du hilfst dem Makler, Kunden-Fragen
zum Fall professionell und konkret zu beantworten. Antworte immer auf Deutsch.

=== WAS DU DARFST ===

1. Zum aktuellen Fall Auskunft geben:
   - Status, Phase, nächster Schritt
   - Fahrzeug- und Gutachten-Daten, erwartete Forderung
   - Timing (z. B. "4-6 Wochen nach Anschlussschreiben bei der Versicherung
     ist Standard" für Regulierung)
   - Standardantworten für Kundengespräche (in Anführungszeichen, SIE-Form)

2. Bei VS-Kürzungen Eskalationslogik empfehlen (Claimondo-Playbook):
   - Kürzung < 10 %: Rüge über Kanzlei (VS-02); VS reguliert oft nach.
   - Kürzung > 10 %: Rüge + ggf. Ergänzungsgutachten / technische Stellung­nahme.
   - Komplette Ablehnung: Prüfung Klage bei klarer Haftungslage.

3. Markdown nutzen: Listen, **fett**, *kursiv* — für bessere Lesbarkeit.

=== WAS DU NICHT DARFST ===

1. KEINE konkreten Kollegen-Namen aus dem Gruppenchat nennen — der Makler
   kennt sein Team ohnehin.
2. KEINE harten Geldzusagen. Bei Fragen zu erwartbarer Regulierung grobe
   Orientierung geben, ohne Garantie.
3. KEINE Rechtsberatung. Bei juristischen Fragen: "Das klärt die Kanzlei."
4. KEINE Interna zu anderen Fällen, anderen Maklern, Partner-Konditionen,
   Gebührenstruktur oder internen Tools.
5. Bei Unsicherheit: sag, dass du es nicht sicher weißt, und schlage vor, den
   Kundenbetreuer im Gruppenchat zu fragen.

=== TON ===

- Deutsch, SIE-Form in Antwort-Vorschlägen für den Kunden, DU-Form im
  direkten Gespräch mit dem Makler ist okay.
- Präzise, professionell, ohne Floskeln.
- Antworte so lang wie nötig, so kurz wie möglich.
`

type LoadedContext = {
  fall: Record<string, unknown> | null
  leadVorname: string | null
  leadNachname: string | null
  kundeVorname: string | null
  kundeNachname: string | null
  // CMM-44 MP-6a: abgeleitete Hauptphase + Substate (v_claim_phase) — ersetzt den
  // alten claims.phase-10-Code.
  phaseLabel: string | null
  timeline: Array<{ titel: string | null; beschreibung: string | null; created_at: string | null; typ: string | null }>
  chatExcerpt: Array<{ nachricht: string; sender_rolle: string | null; created_at: string | null }>
}

async function loadContext(fallId: string): Promise<LoadedContext> {
  // AAR-auth-haertung: admin-client umgeht RLS -> der Caller MUSS Consent-gaten.
  // api/makler/copilot/route.ts prueft session-makler + fall-consent + vollzugriff
  // VOR dem Aufruf. NICHT aus einem ungegateten Kontext nutzen (PII-Read fremder Faelle).
  const admin = createAdminClient()

  // CMM-49 (faelle-Drop-Runway): Fall-Kontext claims-zentrisch aus v_claim_full statt
  // faelle.select('*'). Die Gutachten-Werte kommen aus der gebauten Entity
  // v_gutachten_werte (claim_id-keyed); die alten faelle.reparaturkosten/wertminderung/
  // nutzungsausfall_gesamt/gutachter_honorar waren tote Legacy-Spalten (0-populated, vor
  // dem Entity-Refactor) -> der GUTACHTEN-Block war faktisch immer leer (latenter Bug, jetzt
  // gefixt). Netto-Sicht (Forderung). Kunde-Name party-sourced (v_claim_full.kunde_*),
  // Fallback Lead. timeline/nachrichten bleiben fall_id-keyed (== claims.id via Bridge, 1:1).
  const [vcfRes, timelineRes, chatRes] = await Promise.all([
    admin
      .from('v_claim_full')
      .select(
        'id, lead_id, claim_nummer, service_typ, schadentag, schadenort_adresse, hergang_kunde_text, schadenart, gegner_name, gegner_versicherung, fahrzeug_hersteller, fahrzeug_modell, fahrzeug_baujahr, kunde_vorname, kunde_nachname',
      )
      .eq('fall_id', fallId)
      .maybeSingle(),
    admin
      .from('timeline')
      .select('typ, titel, beschreibung, created_at')
      .eq('fall_id', fallId)
      .order('created_at', { ascending: false })
      .limit(10),
    admin
      .from('nachrichten')
      .select('nachricht, sender_rolle, created_at')
      .eq('fall_id', fallId)
      .in('kanal', ['gruppenchat', 'chat_gruppe_mit_makler'])
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const timeline = (timelineRes.data ?? []) as LoadedContext['timeline']
  const chatExcerpt = (chatRes.data ?? []) as LoadedContext['chatExcerpt']

  const vcf = vcfRes.data as Record<string, unknown> | null
  if (!vcf) {
    return {
      fall: null,
      leadVorname: null,
      leadNachname: null,
      kundeVorname: null,
      kundeNachname: null,
      phaseLabel: null,
      timeline,
      chatExcerpt,
    }
  }

  const claimId = vcf.id as string
  const leadId = (vcf.lead_id as string | null) ?? null

  // Gutachten-Werte (Entity) + abgeleitete 4-Phase (v_claim_phase) parallel.
  const [gutRes, phaseMap] = await Promise.all([
    admin
      .from('v_gutachten_werte')
      .select(GUTACHTEN_WERTE_COLUMNS)
      .eq('claim_id', claimId)
      .maybeSingle(),
    getClaimPhaseMap([claimId]),
  ])
  const gut = gutRes.data as Record<string, unknown> | null

  // Lead-Name nur als Fallback fuer den Kunde-Namen (v_claim_full.kunde_* ist party-
  // sourced und meist gesetzt); separater Read nur wenn lead_id vorhanden.
  let leadVorname: string | null = null
  let leadNachname: string | null = null
  if (leadId) {
    const { data: lead } = await admin
      .from('leads')
      .select('vorname, nachname')
      .eq('id', leadId)
      .maybeSingle()
    leadVorname = (lead?.vorname as string | null) ?? null
    leadNachname = (lead?.nachname as string | null) ?? null
  }

  // Gutachten-Werte kanonisch aus der Entity (geteilter Helper mit getMaklerFallDetail —
  // garantiert identische Zahlen in Detail & Copilot). nutzungsausfall_gesamt = Tage × Tagessatz.
  const gw = mapGutachtenWerte(gut)

  // fall-Record mit genau den Keys, die buildContextText liest.
  const fall: Record<string, unknown> = {
    claim_nummer: vcf.claim_nummer ?? null,
    service_typ: vcf.service_typ ?? null,
    unfalldatum: vcf.schadentag ?? null,
    unfallort: vcf.schadenort_adresse ?? null,
    unfallhergang: vcf.hergang_kunde_text ?? null,
    schadens_art: vcf.schadenart ?? null,
    gegner_name: vcf.gegner_name ?? null,
    gegner_versicherung: vcf.gegner_versicherung ?? null,
    fahrzeug_hersteller: vcf.fahrzeug_hersteller ?? null,
    fahrzeug_modell: vcf.fahrzeug_modell ?? null,
    fahrzeug_baujahr: vcf.fahrzeug_baujahr ?? null,
    reparaturkosten: gw.reparaturkosten,
    wertminderung: gw.wertminderung,
    nutzungsausfall_gesamt: gw.nutzungsausfall_gesamt,
    gutachter_honorar: gw.gutachter_honorar,
    // Datenminimierung (Variante B): wiederbeschaffungswert/restwert/totalschaden
    // bewusst NICHT in den Makler-Copilot-Kontext — sonst Leak via AI-Antwort.
  }

  const phaseCell = phaseMap.get(claimId)
  const phaseLabel = phaseCell
    ? `${MAIN_PHASE_LABEL[phaseCell.mainPhase]} · ${SUBPHASE_LABEL[phaseCell.subPhase]}`
    : null

  return {
    fall,
    leadVorname,
    leadNachname,
    kundeVorname: (vcf.kunde_vorname as string | null) ?? null,
    kundeNachname: (vcf.kunde_nachname as string | null) ?? null,
    phaseLabel,
    timeline,
    chatExcerpt,
  }
}

function buildContextText(ctx: LoadedContext, maklerFirma: string): string {
  if (!ctx.fall) return 'Kein Fall-Kontext gefunden.'
  const fall = ctx.fall
  const kundeName =
    [ctx.kundeVorname, ctx.kundeNachname].filter(Boolean).join(' ').trim() ||
    [ctx.leadVorname, ctx.leadNachname].filter(Boolean).join(' ').trim() ||
    'unbekannt'

  const fahrzeug = [fall.fahrzeug_hersteller, fall.fahrzeug_modell]
    .filter(Boolean)
    .join(' ') || '–'

  const reparaturkosten = fall.reparaturkosten as number | null | undefined
  const wertminderung = fall.wertminderung as number | null | undefined
  const nutzungsausfall = fall.nutzungsausfall_gesamt as number | null | undefined
  const gutachterHonorar = fall.gutachter_honorar as number | null | undefined

  const gesamtforderung =
    [reparaturkosten, wertminderung, nutzungsausfall, gutachterHonorar]
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
      .reduce((s, v) => s + v, 0) || null

  const lines: string[] = []
  lines.push(`Makler-Firma: ${maklerFirma}`)
  lines.push('')
  lines.push('FALL-KONTEXT:')
  lines.push(`- Fallnummer: ${(fall.claim_nummer as string | null) ?? '–'}`)
  lines.push(`- Kunde: ${kundeName}`)
  lines.push(
    `- Unfall: ${fmtDate(fall.unfalldatum as string | null)}${
      fall.unfallort ? `, ${fall.unfallort as string}` : ''
    }`,
  )
  if (fall.unfallhergang) {
    lines.push(`- Hergang: ${String(fall.unfallhergang)}`)
  }
  lines.push(`- Schadenart: ${(fall.schadens_art as string | null) ?? '–'}`)
  lines.push(`- Service-Typ: ${(fall.service_typ as string | null) ?? '–'}`)
  lines.push(
    `- Fahrzeug: ${fahrzeug}${
      fall.fahrzeug_baujahr ? ` (Baujahr ${fall.fahrzeug_baujahr})` : ''
    }`,
  )
  if (fall.gegner_name) {
    lines.push(`- Gegner: ${fall.gegner_name as string}`)
  }
  if (fall.gegner_versicherung) {
    lines.push(
      `- Gegnerische Versicherung: ${fall.gegner_versicherung as string}`,
    )
  }
  // CMM-49 T1.2 (CMM-71): abgeleitete Phase (phaseLabel aus v_claim_phase); fall.status-Fallback entfernt.
  lines.push(
    `- Aktuelle Phase: ${ctx.phaseLabel ?? '–'}`,
  )

  const hasGutachten =
    reparaturkosten != null ||
    wertminderung != null ||
    nutzungsausfall != null ||
    gutachterHonorar != null
  if (hasGutachten) {
    lines.push('')
    lines.push('GUTACHTEN:')
    lines.push(`- Reparaturkosten: ${fmtEur(reparaturkosten)}`)
    lines.push(`- Wertminderung: ${fmtEur(wertminderung)}`)
    lines.push(`- Nutzungsausfall: ${fmtEur(nutzungsausfall)}`)
    lines.push(`- Gutachter-Honorar: ${fmtEur(gutachterHonorar)}`)
    if (gesamtforderung !== null) {
      lines.push(`- Gesamtforderung (Netto): ${fmtEur(gesamtforderung)}`)
    }
  }

  if (ctx.timeline.length > 0) {
    lines.push('')
    lines.push('TIMELINE (letzte 10 Events, neu zuerst):')
    for (const e of ctx.timeline) {
      const datum = e.created_at ? fmtDate(e.created_at) : '–'
      const titel = e.titel ?? e.typ ?? '–'
      const beschreibung = e.beschreibung ? ` — ${e.beschreibung}` : ''
      lines.push(`- ${datum}: ${titel}${beschreibung}`)
    }
  }

  if (ctx.chatExcerpt.length > 0) {
    lines.push('')
    lines.push('GRUPPENCHAT-AUSZUG (letzte 5, neu zuerst):')
    for (const n of ctx.chatExcerpt) {
      const rolle = n.sender_rolle ?? 'unbekannt'
      const text = n.nachricht.length > 200 ? n.nachricht.slice(0, 200) + '…' : n.nachricht
      lines.push(`- [${rolle}] ${text}`)
    }
  }

  return lines.join('\n')
}

export async function buildCopilotDynamicSystem(
  fallId: string,
  maklerFirma: string,
): Promise<string> {
  const ctx = await loadContext(fallId)
  return '\n\n— Fall-Kontext —\n' + buildContextText(ctx, maklerFirma)
}
