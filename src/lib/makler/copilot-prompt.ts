// AAR-489 (M7): System-Prompt-Builder fuer den Makler-Copilot.
// Lädt Fall + Kunde + Gutachten-Werte + Gruppenchat-Auszug und formatiert
// sie in einen deutschsprachigen System-Prompt mit Eskalations-Playbook.
//
// Wird NUR nach dem Consent-Gate aus der API-Route aufgerufen — setzt
// damit implizit Vollzugriff voraus (Caller hat geprüft).

import { createAdminClient } from '@/lib/supabase/admin'

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
  return new Date(iso).toLocaleDateString('de-DE')
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
  timeline: Array<{ titel: string | null; beschreibung: string | null; created_at: string | null; typ: string | null }>
  chatExcerpt: Array<{ nachricht: string; sender_rolle: string | null; created_at: string | null }>
}

async function loadContext(fallId: string): Promise<LoadedContext> {
  const admin = createAdminClient()
  const [fallRes, timelineRes, chatRes] = await Promise.all([
    admin
      .from('faelle')
      .select(
        `
        *,
        leads(vorname, nachname),
        kunde:profiles!faelle_kunde_id_fkey(vorname, nachname)
      `,
      )
      .eq('id', fallId)
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

  const fallRaw = fallRes.data as (Record<string, unknown> & {
    leads?: unknown
    kunde?: unknown
  }) | null

  const leadRaw = fallRaw?.leads
  const lead = (Array.isArray(leadRaw) ? leadRaw[0] : leadRaw) as
    | { vorname: string | null; nachname: string | null }
    | null
    | undefined
  const kundeRaw = fallRaw?.kunde
  const kunde = (Array.isArray(kundeRaw) ? kundeRaw[0] : kundeRaw) as
    | { vorname: string | null; nachname: string | null }
    | null
    | undefined

  return {
    fall: fallRaw,
    leadVorname: lead?.vorname ?? null,
    leadNachname: lead?.nachname ?? null,
    kundeVorname: kunde?.vorname ?? null,
    kundeNachname: kunde?.nachname ?? null,
    timeline: (timelineRes.data ?? []) as LoadedContext['timeline'],
    chatExcerpt: (chatRes.data ?? []) as LoadedContext['chatExcerpt'],
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
  const wbw = fall.wiederbeschaffungswert as number | null | undefined
  const restwert = fall.restwert as number | null | undefined
  const istTotal = fall.totalschaden as boolean | null | undefined

  const gesamtforderung =
    [reparaturkosten, wertminderung, nutzungsausfall, gutachterHonorar]
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
      .reduce((s, v) => s + v, 0) || null

  const lines: string[] = []
  lines.push(`Makler-Firma: ${maklerFirma}`)
  lines.push('')
  lines.push('FALL-KONTEXT:')
  lines.push(`- Fallnummer: ${(fall.fall_nummer as string | null) ?? '–'}`)
  lines.push(`- Kunde: ${kundeName}`)
  lines.push(
    `- Unfall: ${fmtDate(fall.unfalldatum as string | null)}${
      fall.unfallort ? `, ${fall.unfallort as string}` : ''
    }`,
  )
  if (fall.unfallhergang) {
    lines.push(`- Hergang: ${String(fall.unfallhergang)}`)
  }
  lines.push(`- Schadenart: ${(fall.schadenart as string | null) ?? '–'}`)
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
  lines.push(
    `- Aktuelle Phase: ${(fall.aktuelle_phase as string | null) ?? (fall.status as string | null) ?? '–'}`,
  )

  const hasGutachten =
    reparaturkosten != null ||
    wertminderung != null ||
    gutachterHonorar != null ||
    wbw != null
  if (hasGutachten) {
    lines.push('')
    lines.push('GUTACHTEN:')
    lines.push(`- Reparaturkosten: ${fmtEur(reparaturkosten)}`)
    lines.push(`- Wertminderung: ${fmtEur(wertminderung)}`)
    lines.push(`- Nutzungsausfall: ${fmtEur(nutzungsausfall)}`)
    lines.push(`- Gutachter-Honorar: ${fmtEur(gutachterHonorar)}`)
    lines.push(`- Wiederbeschaffungswert: ${fmtEur(wbw)}`)
    lines.push(`- Restwert: ${fmtEur(restwert)}`)
    lines.push(`- Totalschaden: ${istTotal ? 'Ja' : 'Nein'}`)
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

/** Gibt den Gegner-VS-Namen zurück (oder null) — wird für die Suggestion-Chips genutzt. */
export async function getFallGegnerVs(fallId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('faelle')
    .select('gegner_versicherung')
    .eq('id', fallId)
    .maybeSingle()
  return (data?.gegner_versicherung as string | null) ?? null
}

export async function buildCopilotDynamicSystem(
  fallId: string,
  maklerFirma: string,
): Promise<string> {
  const ctx = await loadContext(fallId)
  return '\n\n— Fall-Kontext —\n' + buildContextText(ctx, maklerFirma)
}
