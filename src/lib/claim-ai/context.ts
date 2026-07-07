// Claim-AI-Konsole — Context-Builder + Prompt-Summarizer.
// Spiegelt den Promise.all-Loader aus src/app/faelle/[id]/ai-actions.ts (staging).
// Keine 'use server'-Direktive — nur pure Funktionen + Async-Loader. KEIN 'use server'.
import { createAdminClient } from '@/lib/supabase/admin'

export type ClaimAiContext = {
  claimNummer: string | null
  status: string | null
  fahrzeug: string | null
  unfallhergang: string | null
  gegner: string | null
  tageInaktiv: number
  dokumente: string[]
  pflichtdokumente: { typ: string; status: string }[]
  termine: { start: string; status: string }[]
  letzteNachrichten: string[]
  letzteTimeline: string[]
  offeneTasks: string[]
}

/**
 * Reine Funktion — erzeugt deterministischen Markdown-Prompt aus ClaimAiContext.
 * Spiegelt summarizeClaimForPrompt aus src/lib/orchestrator/context.ts, aber
 * reichhaltiger (Pflichtdokumente, Nachrichten, Termine, Gegner).
 */
export function summarizeClaimAiContext(ctx: ClaimAiContext): string {
  const pflichtdoks = ctx.pflichtdokumente.length
    ? ctx.pflichtdokumente.map((d) => `- ${d.typ}: ${d.status}`).join('\n')
    : '- (keine Pflichtdokumente)'

  const dokumente = ctx.dokumente.length
    ? ctx.dokumente.map((d) => `- ${d}`).join('\n')
    : '- (keine Dokumente)'

  const termine = ctx.termine.length
    ? ctx.termine.map((t) => `- ${t.start} (${t.status})`).join('\n')
    : '- (keine Termine)'

  const nachrichten = ctx.letzteNachrichten.length
    ? ctx.letzteNachrichten.map((n) => `- ${n}`).join('\n')
    : '- (keine Nachrichten)'

  const timeline = ctx.letzteTimeline.length
    ? ctx.letzteTimeline.map((e) => `- ${e}`).join('\n')
    : '- (kein Verlauf)'

  const tasks = ctx.offeneTasks.length
    ? ctx.offeneTasks.map((t) => `- ${t}`).join('\n')
    : '- (keine offenen Tasks)'

  return [
    `Fall ${ctx.claimNummer ?? '(unbekannt)'} — Status: ${ctx.status ?? 'unbekannt'}.`,
    `Fahrzeug: ${ctx.fahrzeug ?? 'unbekannt'}. Unfallhergang: ${ctx.unfallhergang ?? 'unbekannt'}. Gegner: ${ctx.gegner ?? 'unbekannt'}.`,
    `Inaktiv seit: ${ctx.tageInaktiv} Tage.`,
    `Pflichtdokumente:\n${pflichtdoks}`,
    `Hochgeladene Dokumente:\n${dokumente}`,
    `Termine:\n${termine}`,
    `Letzte Nachrichten:\n${nachrichten}`,
    `Letzte Timeline-Einträge:\n${timeline}`,
    `Offene Tasks:\n${tasks}`,
  ].join('\n\n')
}

/**
 * Laedt den Claim-AI-Kontext aus Basis-Tabellen via Admin-Client.
 * Spiegelt den Promise.all-Loader aus ai-actions.ts (staging, Zeilen 28-50):
 *   - v_faelle_mit_aktuellem_termin (service_role-lesbar — kein v_claim_*-Problem)
 *   - leads, fall_dokumente, timeline, nachrichten, gutachter_termine,
 *     pflichtdokumente, tasks (alle Basis-Tabellen)
 * tageInaktiv = ganze Tage seit juengstem timeline.created_at (Fallback 0).
 */
export async function buildClaimAiContext(fallId: string): Promise<ClaimAiContext | null> {
  const admin = createAdminClient()

  // 1. Fall aus v_faelle_mit_aktuellem_termin (service_role-lesbar, wie ai-actions.ts)
  const { data: fall } = await admin
    .from('v_faelle_mit_aktuellem_termin')
    .select('*')
    .eq('id', fallId)
    .single()

  if (!fall) return null

  const fallRow = fall as Record<string, unknown>

  // 2. Lead laden (best-effort, wie ai-actions.ts)
  const leadP = fallRow.lead_id
    ? admin
        .from('leads')
        .select('*')
        .eq('id', fallRow.lead_id as string)
        .single()
        .then((r) => r.data)
    : Promise.resolve(null)

  // 3. Parallele Basis-Tabellen — 1:1 Loader-Spiegel aus ai-actions.ts
  const [lead, dokumente, timeline, nachrichten, termine, pflichtdokumente, tasks] = await Promise.all([
    leadP,
    admin
      .from('fall_dokumente')
      .select('*')
      .eq('fall_id', fallId)
      .order('hochgeladen_am', { ascending: false })
      .limit(50)
      .then((r) => r.data ?? []),
    admin
      .from('timeline')
      .select('*')
      .eq('fall_id', fallId)
      .order('created_at', { ascending: false })
      .limit(50)
      .then((r) => r.data ?? []),
    admin
      .from('nachrichten')
      .select('*')
      .eq('fall_id', fallId)
      .order('created_at', { ascending: false })
      .limit(30)
      .then((r) => r.data ?? []),
    admin
      .from('gutachter_termine')
      .select('*')
      .eq('fall_id', fallId)
      .then((r) => r.data ?? []),
    admin
      .from('pflichtdokumente')
      .select('*')
      .eq('fall_id', fallId)
      .then((r) => r.data ?? []),
    admin
      .from('tasks')
      .select('*')
      .eq('fall_id', fallId)
      .order('created_at', { ascending: false })
      .limit(20)
      .then((r) => r.data ?? []),
  ])

  // 4. tageInaktiv aus juengstem timeline.created_at
  type TimelineRow = { created_at?: string | null }
  const letzteTimelineAktivitaet: string | null =
    ((timeline as TimelineRow[])[0]?.created_at) ?? null
  const tageInaktiv = letzteTimelineAktivitaet
    ? Math.floor((Date.now() - new Date(letzteTimelineAktivitaet).getTime()) / 86400000)
    : 0

  // 5. Felder aus den geladenen Tabellen mappen — Spaltennamen gegen prod-Schema verifiziert.
  // fall_dokumente hat KEIN datei_name/typ (ai-actions.ts liest sie latent-leer) — echte
  // Spalten sind original_filename + dokument_typ (prod paizkjajbuxxksdoycev geprueft 07.07.).
  type DokRow = { original_filename?: string | null; dokument_typ?: string | null }
  type PflichtRow = { dokument_typ?: string | null; status?: string | null }
  type NachrichtRow = { nachricht?: string | null; sender_rolle?: string | null }
  type TerminRow = { start_zeit?: string | null; status?: string | null }
  type TaskRow = { titel?: string | null; status?: string | null }

  const leadRow = lead as Record<string, unknown> | null

  // Fahrzeug aus fall (v_faelle_mit_aktuellem_termin liefert fahrzeug_hersteller + fahrzeug_modell)
  const hersteller = (fallRow.fahrzeug_hersteller as string | null) ?? null
  const modell = (fallRow.fahrzeug_modell as string | null) ?? null
  const fahrzeug = hersteller && modell
    ? `${hersteller} ${modell}`
    : hersteller ?? modell ?? (leadRow?.fahrzeug_hersteller as string | null) ?? null

  // Gegner: gegner_name + gegner_versicherung aus dem Fall (wie ai-actions.ts)
  const gegner =
    (fallRow.gegner_name as string | null) ??
    (fallRow.gegner_versicherung as string | null) ??
    null

  // Unfallhergang direkt aus dem Fall (wie ai-actions.ts: fall.unfallhergang)
  const unfallhergang = (fallRow.unfallhergang as string | null) ?? null

  return {
    claimNummer: (fallRow.claim_nummer as string | null) ?? null,
    status: (fallRow.status as string | null) ?? null,
    fahrzeug,
    unfallhergang,
    gegner,
    tageInaktiv,
    dokumente: (dokumente as DokRow[])
      .map((d) => d.original_filename ?? d.dokument_typ ?? '')
      .filter(Boolean) as string[],
    pflichtdokumente: (pflichtdokumente as PflichtRow[])
      .map((d) => ({ typ: d.dokument_typ ?? '', status: d.status ?? '' }))
      .filter((d) => d.typ),
    termine: (termine as TerminRow[])
      .filter((t) => t.start_zeit)
      .map((t) => ({ start: t.start_zeit!, status: t.status ?? '' })),
    letzteNachrichten: (nachrichten as NachrichtRow[])
      .slice(0, 10)
      .map((n) => `${n.sender_rolle ?? 'Unbekannt'}: ${n.nachricht ?? ''}`)
      .filter((n) => n.length > 3),
    letzteTimeline: (timeline as TimelineRow[])
      .slice(0, 10)
      .map((t) => {
        const tRow = t as Record<string, unknown>
        return (tRow.titel as string | null) ?? ''
      })
      .filter(Boolean) as string[],
    offeneTasks: (tasks as TaskRow[])
      .filter((t) => t.status === 'offen')
      .map((t) => t.titel ?? '')
      .filter(Boolean) as string[],
  }
}
