// SV-Copilot (technisch-fachlich): System-Prompt-Builder fuer den Gutachter-
// Copilot in der Fallakte. Spiegelt lib/makler/copilot-prompt.ts (cached static
// Prompt + dynamischer Fall-Kontext), aber mit SV-Fachfokus: Kalkulation,
// Wertminderung, Vorschaeden, Nutzungsausfall, Totalschaden/Restwert, BVSK.
//
// Der Loader nutzt den Admin-Client (umgeht RLS) -> der Caller
// (api/gutachter/copilot/route.ts) MUSS die sv_id-Zugehoerigkeit pruefen,
// BEVOR er buildGutachterCopilotDynamicSystem aufruft.

import { createAdminClient } from '@/lib/supabase/admin'
import { getClaimPhaseMap } from '@/lib/claims/claim-phase-map'
import { SUBPHASE_LABEL, MAIN_PHASE_LABEL } from '@/lib/claims/lifecycle'
// Geteilter Gutachten-Werte-Helper (identische Zahlen wie Makler-Copilot / Detail).
import { mapGutachtenWerte, GUTACHTEN_WERTE_COLUMNS } from '@/lib/makler/gutachten-werte'

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

export const GUTACHTER_COPILOT_SYSTEM_STATIC = `Du bist der Claimondo-Copilot für Kfz-Sachverständige. Du unterstützt den
Sachverständigen bei der technischen Begutachtung und der Schadenkalkulation.
Antworte immer auf Deutsch, fachlich präzise, in der DU-Form (Kollege zu Kollege).

=== WOBEI DU HILFST ===

1. Reparaturkosten-Kalkulation: Methodik, Verbringungskosten, Beilackierung,
   UPE-Aufschläge, Lohnkosten-Ansatz, Prüfung auf Plausibilität/Vollständigkeit.

2. Wertminderung (merkantiler Minderwert): Methoden (Ruhkopf/Sahm, BVSK,
   Halbgewachs) und Einflussfaktoren (Alter, Laufleistung, Schadenumfang,
   Vorschäden). Gib eine methodische Orientierung mit Spanne — keine feste Zahl.

3. Vorschäden: Abgrenzung Alt-/Neuschaden, Dokumentationspflicht, Umgang mit
   erkannten oder nicht deklarierten Vorschäden und deren Wirkung auf die
   merkantile Bewertung.

4. Nutzungsausfall: Fahrzeugklasse-Einordnung (Tabelle Sanden/Danner/
   Küppersbusch), Herabstufung bei Alter/Laufleistung, Tagessatz-Ansatz.

5. Totalschaden / Restwert / Wiederbeschaffungswert: technische Einordnung der
   130%-Grenze (die rechtliche Bewertung macht die Kanzlei), Restwertermittlung,
   Umgang mit Restwertbörsen-Angeboten, Abgrenzung Reparatur- vs. Totalschaden.

6. BVSK-Honorartabelle: Honorar-Einordnung nach Schadenhöhe.

Beziehe dich immer auf den konkreten Fall-Kontext unten (Fahrzeug, Schadenart,
Vorschäden, bereits erfasste Gutachten-Werte).

=== WAS DU NICHT TUST ===

1. KEINE Rechtsberatung — Haftung, Haftungsquote, Klage, Verjährung klärt die
   Kanzlei. Bei rechtlichen Fragen: „Das bewertet die Kanzlei."
2. KEINE festen Geldzusagen — bei Wertminderung/Nutzungsausfall eine methodische
   Orientierung mit Spanne, ausdrücklich ohne Garantie.
3. KEINE Interna zu anderen Fällen, anderen Sachverständigen, Honorar-Splits
   oder internen Tools.
4. Bei Unsicherheit: sag ehrlich, dass du es nicht sicher weißt, und verweise auf
   die einschlägige Norm/Tabelle oder den Kundenbetreuer.

=== TON ===

- Deutsch, DU-Form, fachlich, präzise, ohne Floskeln.
- Markdown für Struktur (Listen, **fett**).
- So lang wie nötig, so kurz wie möglich.
`

type LoadedContext = {
  fall: Record<string, unknown> | null
  kundeVorname: string | null
  kundeNachname: string | null
  phaseLabel: string | null
  timeline: Array<{ titel: string | null; beschreibung: string | null; created_at: string | null; typ: string | null }>
}

async function loadContext(fallId: string): Promise<LoadedContext> {
  // Admin-Client umgeht RLS -> der Caller MUSS die sv_id-Zugehoerigkeit gaten
  // (api/gutachter/copilot/route.ts prueft session-SV + v_claim_full-Ownership VOR
  // dem Aufruf). NICHT aus einem ungegateten Kontext nutzen (PII-Read fremder Faelle).
  const admin = createAdminClient()

  const [vcfRes, timelineRes] = await Promise.all([
    admin
      .from('v_claim_full')
      .select(
        'id, claim_nummer, service_typ, schadentag, schadenort_adresse, schadenort_plz, hergang_kunde_text, schadenart, gegner_name, gegner_versicherung, fahrzeug_hersteller, fahrzeug_modell, fahrzeug_baujahr, fahrzeug_farbe, erstzulassung, kilometerstand, hat_vorschaeden, vorschaden_anzahl, vorschaden_erkannt, vorschaden_letzter_datum, kunde_vorname, kunde_nachname',
      )
      .eq('fall_id', fallId)
      .maybeSingle(),
    admin
      .from('timeline')
      .select('typ, titel, beschreibung, created_at')
      .eq('fall_id', fallId)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const timeline = (timelineRes.data ?? []) as LoadedContext['timeline']
  const vcf = vcfRes.data as Record<string, unknown> | null
  if (!vcf) {
    return { fall: null, kundeVorname: null, kundeNachname: null, phaseLabel: null, timeline }
  }

  const claimId = vcf.id as string
  const [gutRes, phaseMap] = await Promise.all([
    admin.from('v_gutachten_werte').select(GUTACHTEN_WERTE_COLUMNS).eq('claim_id', claimId).maybeSingle(),
    getClaimPhaseMap([claimId]),
  ])
  const gw = mapGutachtenWerte(gutRes.data as Record<string, unknown> | null)

  const fall: Record<string, unknown> = {
    claim_nummer: vcf.claim_nummer ?? null,
    service_typ: vcf.service_typ ?? null,
    unfalldatum: vcf.schadentag ?? null,
    unfallort: vcf.schadenort_adresse ?? null,
    unfallort_plz: vcf.schadenort_plz ?? null,
    unfallhergang: vcf.hergang_kunde_text ?? null,
    schadens_art: vcf.schadenart ?? null,
    gegner_name: vcf.gegner_name ?? null,
    gegner_versicherung: vcf.gegner_versicherung ?? null,
    fahrzeug_hersteller: vcf.fahrzeug_hersteller ?? null,
    fahrzeug_modell: vcf.fahrzeug_modell ?? null,
    fahrzeug_baujahr: vcf.fahrzeug_baujahr ?? null,
    fahrzeug_farbe: vcf.fahrzeug_farbe ?? null,
    erstzulassung: vcf.erstzulassung ?? null,
    kilometerstand: vcf.kilometerstand ?? null,
    hat_vorschaeden: vcf.hat_vorschaeden ?? null,
    vorschaden_anzahl: vcf.vorschaden_anzahl ?? null,
    vorschaden_erkannt: vcf.vorschaden_erkannt ?? null,
    vorschaden_letzter_datum: vcf.vorschaden_letzter_datum ?? null,
    reparaturkosten: gw.reparaturkosten,
    wertminderung: gw.wertminderung,
    nutzungsausfall_gesamt: gw.nutzungsausfall_gesamt,
    gutachter_honorar: gw.gutachter_honorar,
  }

  const phaseCell = phaseMap.get(claimId)
  const phaseLabel = phaseCell
    ? `${MAIN_PHASE_LABEL[phaseCell.mainPhase]} · ${SUBPHASE_LABEL[phaseCell.subPhase]}`
    : null

  return {
    fall,
    kundeVorname: (vcf.kunde_vorname as string | null) ?? null,
    kundeNachname: (vcf.kunde_nachname as string | null) ?? null,
    phaseLabel,
    timeline,
  }
}

function buildContextText(ctx: LoadedContext): string {
  if (!ctx.fall) return 'Kein Fall-Kontext gefunden.'
  const fall = ctx.fall
  const kundeName =
    [ctx.kundeVorname, ctx.kundeNachname].filter(Boolean).join(' ').trim() || 'unbekannt'
  const fahrzeug = [fall.fahrzeug_hersteller, fall.fahrzeug_modell].filter(Boolean).join(' ') || '–'

  const reparaturkosten = fall.reparaturkosten as number | null | undefined
  const wertminderung = fall.wertminderung as number | null | undefined
  const nutzungsausfall = fall.nutzungsausfall_gesamt as number | null | undefined
  const gutachterHonorar = fall.gutachter_honorar as number | null | undefined

  const lines: string[] = []
  lines.push('FALL-KONTEXT:')
  lines.push(`- Fallnummer: ${(fall.claim_nummer as string | null) ?? '–'}`)
  lines.push(`- Kunde: ${kundeName}`)
  lines.push(
    `- Unfall: ${fmtDate(fall.unfalldatum as string | null)}${
      fall.unfallort ? `, ${fall.unfallort as string}` : ''
    }`,
  )
  if (fall.unfallhergang) lines.push(`- Hergang: ${String(fall.unfallhergang)}`)
  lines.push(`- Schadenart: ${(fall.schadens_art as string | null) ?? '–'}`)
  const fzDetail: string[] = []
  if (fall.fahrzeug_baujahr) fzDetail.push(`Baujahr ${fall.fahrzeug_baujahr as string | number}`)
  if (fall.erstzulassung) fzDetail.push(`EZ ${fmtDate(fall.erstzulassung as string | null)}`)
  if (fall.kilometerstand) fzDetail.push(`${fall.kilometerstand as string | number} km`)
  if (fall.fahrzeug_farbe) fzDetail.push(`${fall.fahrzeug_farbe as string}`)
  lines.push(`- Fahrzeug: ${fahrzeug}${fzDetail.length ? ` (${fzDetail.join(', ')})` : ''}`)
  if (fall.gegner_versicherung) lines.push(`- Gegnerische Versicherung: ${fall.gegner_versicherung as string}`)
  lines.push(`- Aktuelle Phase: ${ctx.phaseLabel ?? '–'}`)

  // Vorschaeden — fuer die SV-Bewertung zentral.
  const hatV = fall.hat_vorschaeden === true
  lines.push('')
  lines.push('VORSCHÄDEN:')
  if (hatV || fall.vorschaden_anzahl) {
    lines.push(`- Vorschäden gemeldet: ja${fall.vorschaden_anzahl ? ` (${fall.vorschaden_anzahl as number})` : ''}`)
    if (fall.vorschaden_erkannt) lines.push(`- Erkannt/dokumentiert: ${String(fall.vorschaden_erkannt)}`)
    if (fall.vorschaden_letzter_datum) lines.push(`- Letzter Vorschaden: ${fmtDate(fall.vorschaden_letzter_datum as string | null)}`)
  } else {
    lines.push('- Keine Vorschäden gemeldet.')
  }

  const hasGutachten =
    reparaturkosten != null || wertminderung != null || nutzungsausfall != null || gutachterHonorar != null
  if (hasGutachten) {
    lines.push('')
    lines.push('BEREITS ERFASSTE GUTACHTEN-WERTE (Netto):')
    lines.push(`- Reparaturkosten: ${fmtEur(reparaturkosten)}`)
    lines.push(`- Wertminderung: ${fmtEur(wertminderung)}`)
    lines.push(`- Nutzungsausfall: ${fmtEur(nutzungsausfall)}`)
    lines.push(`- SV-Honorar: ${fmtEur(gutachterHonorar)}`)
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

  return lines.join('\n')
}

export async function buildGutachterCopilotDynamicSystem(fallId: string): Promise<string> {
  const ctx = await loadContext(fallId)
  return '\n\n— Fall-Kontext —\n' + buildContextText(ctx)
}
