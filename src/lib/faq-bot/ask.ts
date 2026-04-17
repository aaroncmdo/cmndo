// AAR-319: FAQ-Bot + KB-Assistent — gleiche Claude-API, zwei Rollen.
// Beide Rollen bekommen denselben Fall-Kontext, aber unterschiedlichen
// System-Prompt (Sichtbarkeits- + Ton-Regeln).
//
// AAR-444: Kunden-Prompt mit expliziter Erlaubt/Verboten-Trennung plus
// Off-Topic-Preflight. Interne Felder aus dem Kunden-Kontext entfernt
// (Nachrichten-Stream, KB-Notizen — werden ohnehin nicht geladen, aber
// Timeline-Scope nochmal gehärtet).

import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { AI_MODELS } from '@/lib/ai/models'
import { logAiUsage } from '@/lib/ai/usage-log'
import { checkOffTopic } from './off-topic-guard'

export type FaqBotRolle = 'kunde' | 'kundenbetreuer'

export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  ts?: string
}

export type FaqBotResult =
  | {
      success: true
      antwort: string
      inputTokens: number
      outputTokens: number
      offTopic?: boolean
      offTopicReason?: string
    }
  | { success: false; error: string }

// AAR-444: Neuer Kunde-Prompt mit harter Scope-Abgrenzung.
export const KUNDE_SYSTEM = `Du bist der Claimondo-FAQ-Bot für Kunden nach einem Verkehrsunfall.
Du kennst AUSSCHLIESSLICH die Fallakte des fragenden Kunden und allgemeine Infos
zur Schadenabwicklung in Deutschland.

=== WAS DU DARFST ===

1. Konkrete Antworten zur eigenen Fallakte:
   - Aktueller Status, Phase, nächster Schritt
   - Termine (Gutachter, Kanzlei-Übergabe, erwartete Regulierung)
   - Fahrzeug-Daten, Schadenhöhe (wenn Gutachten vorliegt)
   - Beteiligte Parteien (gegnerische Versicherung — nur Name, keine Bewertung)
   - Timeline-Events die für den Kunden sichtbar sind

2. Allgemeine Infos zur Schadenabwicklung nach Kfz-Unfall:
   - Was macht ein Kfz-Gutachter?
   - Welche Rechte hat der Geschädigte (freie Werkstattwahl, Mietwagen,
     Wertminderung, Nutzungsausfall)?
   - Was passiert typischerweise nach der Schadenmeldung?
   - Was ist ein Anspruchsschreiben, eine Rüge, eine Regulierung?
   - Typische Bearbeitungszeiten der Versicherungen (grob)

=== WAS DU NICHT DARFST ===

1. NIEMALS Interna zu Claimondo ausgeben. Das umfasst:
   - Preise, Gebühren, Kostenstruktur, Provisionen
   - Mitarbeiter-Namen, Rollen, Organigramm
   - Partner-Kanzleien, Partner-Gutachter, Versicherungen mit denen
     wir zusammenarbeiten
   - Geschäftsmodell, Marketing-Kanäle, interne Prozesse
   - Technologie, Tools, KI-Modelle
   - Vertragliche Details mit Partnern
   Wenn der Kunde sowas fragt, antworte genau:
   „Das sind interne Informationen, die ich nicht mit Ihnen teilen darf.
   Für Fragen dazu wenden Sie sich bitte an Ihren Kundenbetreuer."

2. NIEMALS über andere Fälle sprechen. Kein Vergleich, kein
   „bei anderen Kunden dauert das …". Wenn gefragt:
   „Ich kann nur Auskunft zu Ihrer eigenen Akte geben."

3. KEINE Rechtsberatung. Bei juristischen Fragen:
   „Das klärt Ihre Kanzlei für Sie. Soll ich Ihrem Kundenbetreuer Bescheid geben?"

4. KEINE konkreten Geldsummen garantieren. Bei Fragen zu zu erwartender
   Regulierung: grobe Orientierung („In der Regel übernimmt die gegnerische
   Versicherung …") ohne verbindliche Zusagen.

5. KEINE Kritik an Dritten. Weder gegnerische Versicherung, noch Kanzlei,
   noch Gutachter, noch Werkstatt.

6. KEINE Meta-Fragen zum Bot oder zur KI ausweichend beantworten.
   Wenn gefragt „bist du eine KI": Kurz bestätigen, zurück zum Thema:
   „Ja, ich bin ein KI-Assistent, der Ihnen bei Fragen zu Ihrer Akte hilft.
   Was möchten Sie wissen?"

7. KEINE internen Kommentare oder Notizen aus der Akte zitieren, auch
   wenn sie im Kontext stehen sollten.

=== TON ===

- Deutsch, immer SIE-Form
- Freundlich, einfach, klar
- Keine Juristerei, keine Anglizismen wenn vermeidbar
- 2-4 Sätze pro Antwort
- Konkret wenn möglich (Zahl, Datum, nächster Schritt)
- Bei Unsicherheit: „Das weiß ich nicht sicher, das klärt Ihr Kundenbetreuer
  für Sie."`

export const KB_SYSTEM = `Du bist der Claimondo-KB-Assistent für Kundenbetreuer.
Du kennst die komplette Fallakte inklusive interner Daten, Notizen und
Geschäftslogik. Interna zu Claimondo (Prozesse, Tools, Partner, Kollegen)
darfst du ansprechen — dein Gegenüber ist Teil des Teams.

Ton:
- Präzise, geschäftlich, sachlich auf Deutsch
- DU-Form im KB-Gespräch ok

Was du darfst:
- Komplette Fall-Details zitieren
- Nächste konkrete Schritte vorschlagen (Status-Wechsel, Task-Erstellung)
- Standardantworten fürs Kunden-Gespräch formulieren
- Risiken/Lücken im Fall identifizieren (fehlende Dokumente, SLA-Verletzungen)
- Interne Prozesse, Partner-Konstellationen, Kollegen-Namen nennen

Format:
- Strukturiert mit Bullet-Points wenn sinnvoll
- Konkrete Action-Items als Liste
- Bei Standardantwort-Formulierung: in Anführungszeichen, SIE-Form`

async function loadFallContext(fallId: string, rolle: FaqBotRolle) {
  const admin = createAdminClient()

  // AAR-438: Timeline bei Kunden-Rolle direkt auf typ='system' filtern
  // (spart Round-Trip-Payload gegenüber nachträglichem JS-Filter).
  const timelineQuery = admin
    .from('timeline')
    .select('typ, titel, beschreibung, created_at')
    .eq('fall_id', fallId)
    .order('created_at', { ascending: false })
    .limit(rolle === 'kunde' ? 5 : 10)
  const timelineQueryScoped = rolle === 'kunde'
    ? timelineQuery.eq('typ', 'system')
    : timelineQuery

  const [fallRes, leadRes, timelineRes, tasksRes] = await Promise.all([
    admin.from('faelle').select('*').eq('id', fallId).maybeSingle(),
    admin
      .from('faelle')
      .select('lead_id, leads(vorname, nachname, email, telefon, unfallhergang, schadentyp)')
      .eq('id', fallId)
      .maybeSingle(),
    timelineQueryScoped,
    // AAR-438: Tasks nach Fälligkeit sortiert — Priorität (TEXT kritisch/dringend/normal)
    // wird in JS gewichtet sortiert, da alphabetisches DESC falsch wäre (normal > kritisch).
    admin
      .from('tasks')
      .select('titel, status, empfaenger_rolle, faellig_am, prioritaet')
      .eq('fall_id', fallId)
      .eq('status', 'offen')
      .order('faellig_am', { ascending: true, nullsFirst: false })
      .limit(50),
  ])

  const fall = fallRes.data as Record<string, unknown> | null
  const leadRaw = (leadRes.data as { leads: unknown } | null)?.leads
  const lead = (Array.isArray(leadRaw) ? leadRaw[0] : leadRaw) as Record<string, unknown> | null

  // AAR-438: Top-10 Tasks nach Priorität (kritisch > dringend > normal), dann Fälligkeit.
  const prioGewicht: Record<string, number> = { kritisch: 3, dringend: 2, normal: 1 }
  const tasksSortiert = (tasksRes.data ?? [])
    .slice()
    .sort((a, b) => {
      const pa = prioGewicht[(a.prioritaet as string) ?? 'normal'] ?? 0
      const pb = prioGewicht[(b.prioritaet as string) ?? 'normal'] ?? 0
      if (pa !== pb) return pb - pa
      const da = a.faellig_am ? new Date(a.faellig_am as string).getTime() : Infinity
      const db = b.faellig_am ? new Date(b.faellig_am as string).getTime() : Infinity
      return da - db
    })
    .slice(0, 10)

  return { fall, lead, timeline: timelineRes.data ?? [], tasks: tasksSortiert }
}

// AAR-444: interne Felder die auch beim KB-Prompt vorsichtig, beim Kunden
// komplett rausgefiltert werden. Zentral gepflegt damit neue Felder
// nicht durchrutschen.
const INTERNE_FALL_FELDER: readonly string[] = [
  'interne_notizen',
  'interne_notiz',
  'kb_notizen',
  'dispatch_notes',
  'interne_kommentare',
  'kommentare',
]

function buildContextText(
  rolle: FaqBotRolle,
  ctx: Awaited<ReturnType<typeof loadFallContext>>,
): string {
  const { fall, lead, timeline, tasks } = ctx
  if (!fall) return 'Kein Fall-Kontext gefunden.'

  const name = lead ? `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() : ''
  const fallNr = (fall.fall_nummer as string | null) ?? ''
  const status = (fall.status as string | null) ?? '—'
  const fahrzeug = [fall.fahrzeug_hersteller, fall.fahrzeug_modell].filter(Boolean).join(' ')
  const schadentyp = (fall.schadenart as string | null) ?? (lead?.schadentyp as string | null) ?? '—'
  const svTermin = fall.sv_termin ? new Date(fall.sv_termin as string).toLocaleString('de-DE') : 'nicht gesetzt'
  const gegnerVS = (fall.gegner_versicherung as string | null) ?? '—'
  const reparaturkosten = (fall.reparaturkosten as number | null) ?? null
  const regulierungBetrag = (fall.regulierung_betrag as number | null) ?? null

  const lines: string[] = [
    `Fall: ${fallNr || 'unbekannt'}`,
    `Kunde: ${name || 'unbekannt'}`,
    `Status: ${status}`,
    `Fahrzeug: ${fahrzeug || '—'}`,
    `Schadentyp: ${schadentyp}`,
    `Gutachter-Termin: ${svTermin}`,
    `Gegner-Versicherung: ${gegnerVS}`,
  ]
  if (reparaturkosten != null) lines.push(`Reparaturkosten: ${reparaturkosten} €`)
  if (regulierungBetrag != null) lines.push(`Regulierungs-Betrag: ${regulierungBetrag} €`)

  if (rolle === 'kundenbetreuer') {
    // KB sieht Tasks + Timeline-Details + interne Notizen (falls vorhanden).
    if (tasks.length > 0) {
      lines.push('', 'Offene Tasks:')
      for (const t of tasks) {
        lines.push(
          `- [${t.prioritaet ?? 'normal'}] ${t.titel} (${t.empfaenger_rolle ?? '—'}${
            t.faellig_am ? `, fällig ${new Date(t.faellig_am as string).toLocaleDateString('de-DE')}` : ''
          })`,
        )
      }
    }
    if (timeline.length > 0) {
      lines.push('', 'Letzte Timeline-Events:')
      for (const e of timeline.slice(0, 5)) {
        lines.push(`- ${e.titel}${e.beschreibung ? ` — ${e.beschreibung}` : ''}`)
      }
    }
    // AAR-444: interne Felder explizit nur dem KB zeigen
    for (const feld of INTERNE_FALL_FELDER) {
      const wert = fall[feld]
      if (typeof wert === 'string' && wert.trim().length > 0) {
        lines.push('', `Interne Notiz (${feld}): ${wert}`)
      }
    }
  } else {
    // AAR-444: Kunde sieht nur System-Events (bereits im Query auf typ='system'
    // gefiltert — AAR-438). Interne Felder werden bewusst nie in den Kunden-
    // Kontext geschrieben, auch wenn sie auf `faelle` gepflegt sind.
    if (timeline.length > 0) {
      lines.push('', 'Zeitlicher Ablauf:')
      for (const e of timeline) {
        // Doppelte Absicherung: System-Events haben keine sensiblen Details,
        // aber Beschreibung bleibt weg — Titel reicht für den Kunden.
        lines.push(`- ${e.titel}`)
      }
    }
  }

  return lines.join('\n')
}

export async function askFaqBot(
  fallId: string,
  frage: string,
  rolle: FaqBotRolle,
  historie: ChatMessage[] = [],
): Promise<FaqBotResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { success: false, error: 'ANTHROPIC_API_KEY nicht gesetzt' }
  if (!frage.trim()) return { success: false, error: 'Frage fehlt' }
  if (frage.length > 2000) return { success: false, error: 'Frage zu lang (max 2000 Zeichen)' }

  // AAR-444: Off-Topic-Preflight nur für Kunden — KB darf alles fragen.
  if (rolle === 'kunde') {
    const check = checkOffTopic(frage)
    if (check.blocked) {
      return {
        success: true,
        antwort: check.antwort,
        inputTokens: 0,
        outputTokens: 0,
        offTopic: true,
        offTopicReason: check.reason,
      }
    }
  }

  const ctx = await loadFallContext(fallId, rolle)
  const contextText = buildContextText(rolle, ctx)

  // AAR-436: System-Prompt in statisch (cached) + dynamisch (pro Fall) splitten.
  // Statischer Teil ist identisch über alle Anfragen einer Rolle — wird mit
  // cache_control: ephemeral markiert und bleibt 5min warm.
  const systemStatic = rolle === 'kunde' ? KUNDE_SYSTEM : KB_SYSTEM
  const systemDynamic = '\n\n— Fall-Kontext —\n' + contextText

  const messages: { role: 'user' | 'assistant'; content: string }[] = []
  for (const m of historie.slice(-10)) {
    messages.push({ role: m.role, content: m.content })
  }
  messages.push({ role: 'user', content: frage.trim() })

  const model = rolle === 'kunde' ? AI_MODELS.faq_bot_kunde : AI_MODELS.faq_bot_kb

  try {
    const anthropic = new Anthropic({ apiKey })
    const response = await anthropic.messages.create({
      model,
      max_tokens: 800,
      system: [
        // AAR-436: statischer Teil — gecached.
        { type: 'text', text: systemStatic, cache_control: { type: 'ephemeral' } },
        // Dynamischer Fall-Kontext — nicht gecached (ändert sich pro Fall).
        { type: 'text', text: systemDynamic },
      ],
      messages,
    })
    const antwort = response.content[0]?.type === 'text' ? response.content[0].text : ''
    if (!antwort) return { success: false, error: 'Claude hat keine Antwort geliefert' }

    // AAR-436: Usage-Log fire-and-forget.
    void logAiUsage({
      endpoint: rolle === 'kunde' ? 'faq_bot_kunde' : 'faq_bot_kb',
      model,
      fallId,
      usage: response.usage,
    })

    return {
      success: true,
      antwort,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    }
  } catch (err) {
    console.error('[AAR-319] Claude-API fehlgeschlagen:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Claude-API-Fehler',
    }
  }
}
