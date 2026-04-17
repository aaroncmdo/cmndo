// AAR-319: FAQ-Bot + KB-Assistent — gleiche Claude-API, zwei Rollen.
// Beide Rollen bekommen denselben Fall-Kontext, aber unterschiedlichen
// System-Prompt (Sichtbarkeits- + Ton-Regeln).

import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { AI_MODELS } from '@/lib/ai/models'

export type FaqBotRolle = 'kunde' | 'kundenbetreuer'

export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  ts?: string
}

export type FaqBotResult =
  | { success: true; antwort: string; inputTokens: number; outputTokens: number }
  | { success: false; error: string }

const KUNDE_SYSTEM = `Du bist der Claimondo-FAQ-Bot für Kunden nach einem
Verkehrsunfall. Du kennst die Fallakte des fragenden Kunden.

Ton:
- Freundlich, einfach, klar auf Deutsch
- DU-Form nicht verwenden — immer SIE-Form
- Keine Juristerei — wenn der Kunde das fragt: „Das klärt Ihre Kanzlei für Sie."

Was du darfst:
- Den aktuellen Fall-Status erklären
- Typische Fragen zum Claimondo-Prozess beantworten (Zwei-Stufen-Zahlung,
  Gutachtertermin, Mietwagen, SA, Anspruchsschreiben)
- Timeline-Events einordnen

Was du NICHT darfst:
- Interne Kommentare / Notizen aus der Akte zitieren
- Die gegnerische Versicherung kritisieren oder Schuld zuordnen
- Konkrete Geldsummen garantieren (nur grobe Orientierung: „in der Regel…")
- Rechtsberatung geben — bei komplexen Fragen: „Dafür kontaktiert Sie Ihr
  Kundenbetreuer, der die Details klärt."

Format:
- Kurze Antwort in 2-4 Sätzen
- Keine Markdown-Überschriften
- Wenn passend: Zahl, Datum oder nächster Schritt konkret benennen`

const KB_SYSTEM = `Du bist der Claimondo-KB-Assistent für Kundenbetreuer.
Du kennst die komplette Fallakte inklusive interner Daten.

Ton:
- Präzise, geschäftlich, sachlich auf Deutsch
- DU-Form im KB-Gespräch ok

Was du darfst:
- Komplette Fall-Details zitieren
- Nächste konkrete Schritte vorschlagen (Status-Wechsel, Task-Erstellung)
- Standardantworten fürs Kunden-Gespräch formulieren
- Risiken/Lücken im Fall identifizieren (fehlende Dokumente, SLA-Verletzungen)

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
    // KB sieht Tasks + Timeline-Details
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
  } else {
    // Kunde sieht nur System-Events (bereits im Query auf typ='system' gefiltert — AAR-438).
    if (timeline.length > 0) {
      lines.push('', 'Zeitlicher Ablauf:')
      for (const e of timeline) {
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

  const ctx = await loadFallContext(fallId, rolle)
  const contextText = buildContextText(rolle, ctx)
  const systemPrompt = (rolle === 'kunde' ? KUNDE_SYSTEM : KB_SYSTEM) +
    '\n\n— Fall-Kontext —\n' + contextText

  const messages: { role: 'user' | 'assistant'; content: string }[] = []
  for (const m of historie.slice(-10)) {
    messages.push({ role: m.role, content: m.content })
  }
  messages.push({ role: 'user', content: frage.trim() })

  try {
    const anthropic = new Anthropic({ apiKey })
    const response = await anthropic.messages.create({
      model: rolle === 'kunde' ? AI_MODELS.faq_bot_kunde : AI_MODELS.faq_bot_kb,
      max_tokens: 800,
      system: systemPrompt,
      messages,
    })
    const antwort = response.content[0]?.type === 'text' ? response.content[0].text : ''
    if (!antwort) return { success: false, error: 'Claude hat keine Antwort geliefert' }
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
