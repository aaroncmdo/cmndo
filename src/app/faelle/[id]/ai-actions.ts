'use server'

// AAR-104: Claimondo AI Assistant - Fall-Zusammenfassung via Claude
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Anthropic from '@anthropic-ai/sdk'
import { revalidatePath } from 'next/cache'
import { AI_MODELS } from '@/lib/ai/models'

// AAR-437: Modell-Audit Nacht-Shift — ehemals hardcoded 'claude-sonnet-4-5'
const MODEL = AI_MODELS.fall_assistant

export async function generateFallSummary(
  fallId: string,
  kundenAnliegen: string | null,
): Promise<{ success: boolean; summaryId?: string; zusammenfassung?: string; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { success: false, error: 'ANTHROPIC_API_KEY nicht konfiguriert' }

  const admin = createAdminClient()

  // 1. Fall + Lead laden
  const { data: fall } = await admin.from('v_faelle_mit_aktuellem_termin').select('*').eq('id', fallId).single()
  if (!fall) return { success: false, error: 'Fall nicht gefunden' }

  const leadP = fall.lead_id
    ? admin.from('leads').select('*').eq('id', fall.lead_id).single().then(r => r.data)
    : Promise.resolve(null)

  // 2. Parallel alle Nebentabellen laden
  const [lead, dokumente, timeline, nachrichten, termine, pflichtdokumente, tasks, svRow, kbRow] = await Promise.all([
    leadP,
    admin.from('fall_dokumente').select('*').eq('fall_id', fallId).order('hochgeladen_am', { ascending: false }).limit(50).then(r => r.data ?? []),
    admin.from('timeline').select('*').eq('fall_id', fallId).order('created_at', { ascending: false }).limit(50).then(r => r.data ?? []),
    admin.from('nachrichten').select('*').eq('fall_id', fallId).order('created_at', { ascending: false }).limit(30).then(r => r.data ?? []),
    admin.from('gutachter_termine').select('*').eq('fall_id', fallId).then(r => r.data ?? []),
    admin.from('pflichtdokumente').select('*').eq('fall_id', fallId).then(r => r.data ?? []),
    admin.from('tasks').select('*').eq('fall_id', fallId).order('created_at', { ascending: false }).limit(20).then(r => r.data ?? []),
    fall.sv_id
      ? admin.from('sachverstaendige').select('profile_id, profiles!sachverstaendige_profile_id_fkey(vorname, nachname)').eq('id', fall.sv_id).single().then(r => r.data)
      : Promise.resolve(null),
    fall.kundenbetreuer_id
      ? admin.from('profiles').select('vorname, nachname').eq('id', fall.kundenbetreuer_id).single().then(r => r.data)
      : Promise.resolve(null),
  ])

  // 3. Prompts
  const systemPrompt = `Du bist der Claimondo AI Assistant — ein Assistent für Kundenbetreuer eines deutschen KFZ-Schadenmanagement-Unternehmens.

Deine Aufgabe: Eine vollständige Fallakte analysieren und in klarer deutscher Sprache zusammenfassen.

Schreibstil:
- Deutsch mit echten Umlauten (ä, ö, ü, ß)
- Sachlich und professionell, kurz und präzise
- Markdown-Struktur (## Überschriften, **fett**, - Listen)
- Fakten konkret mit Datum/Betrag/Status nennen
- Keine Spekulation — nur was in den Daten steht

Struktur deiner Antwort:

## Überblick
2-3 Sätze: Wer, was, wann. Worum geht es?

## Aktueller Stand
Status + was erledigt ist + was aussteht.

## Zeitliche Entwicklung
Max 5-7 wichtige Events chronologisch. Format: **Datum** — Ereignis.

## Beteiligte
- **Kunde:** Name + Kontakt
- **Sachverständiger:** Vorname + Termin
- **Kundenbetreuer:** Name
- **Gegnerische Versicherung:** Name

## Empfohlene nächste Schritte
3-5 konkrete Handlungsempfehlungen.

${kundenAnliegen ? `\n## Antwort auf das Anliegen\nDer KB hat folgendes Anliegen: "${kundenAnliegen}"\nBeantworte es konkret aus den Falldaten. Wenn nicht ableitbar, sage es ehrlich und schlage vor was zu tun ist.\n` : ''}`

  const svProfile = svRow?.profiles as { vorname?: string | null; nachname?: string | null } | { vorname?: string | null; nachname?: string | null }[] | null
  const svP = Array.isArray(svProfile) ? svProfile[0] : svProfile

  const userMessage = `Fall ${fall.fall_nummer}:

## Stammdaten
${JSON.stringify({
    fall_nummer: fall.fall_nummer,
    status: fall.status,
    service_typ: fall.service_typ,
    schadens_datum: fall.schadens_datum,
    schadens_ort: fall.schadens_ort,
    unfall_konstellation: fall.unfall_konstellation,
    fahrzeug: [fall.fahrzeug_hersteller, fall.fahrzeug_modell].filter(Boolean).join(' '),
    kennzeichen: fall.kennzeichen,
    unfallhergang: fall.unfallhergang,
    gegner_name: fall.gegner_name,
    gegner_versicherung: fall.gegner_versicherung,
    gegner_kennzeichen: fall.gegner_kennzeichen,
    personenschaden: fall.personenschaden_flag,
    mietwagen: fall.mietwagen_flag,
    leasing: fall.finanzierung_leasing === 'leasing',
    abtretung_signiert_am: fall.abtretung_signiert_am,
    // AAR-583 (N6): faelle.vollmacht_unterschrieben existierte nie — abgeleiteter
    // Bool aus Timestamp für LLM-Context-Lesbarkeit.
    vollmacht_unterschrieben: !!fall.vollmacht_signiert_am,
  }, null, 2)}

## Lead-Daten (Original)
${lead ? JSON.stringify({ vorname: lead.vorname, nachname: lead.nachname, telefon: lead.telefon, email: lead.email, notiz: lead.notiz, source_channel: lead.source_channel }, null, 2) : 'Kein Lead'}

## Sachverständiger
${svP ? `${svP.vorname ?? ''} ${svP.nachname ?? ''}`.trim() : 'Noch nicht zugewiesen'}

## Kundenbetreuer
${kbRow ? `${kbRow.vorname ?? ''} ${kbRow.nachname ?? ''}`.trim() : 'Kein KB'}

## Gutachter-Termine (${termine.length})
${termine.map(t => `- ${t.start_zeit} (${t.status})`).join('\n') || 'Keine Termine'}

## Dokumente (${dokumente.length})
${dokumente.slice(0, 15).map(d => `- ${d.datei_name ?? d.typ} (${d.kategorie ?? '—'})`).join('\n') || 'Keine Dokumente'}

## Pflichtdokumente
${pflichtdokumente.map(p => `- ${p.dokument_typ}: ${p.status}`).join('\n') || 'Keine'}

## Timeline (letzte 50)
${timeline.map(t => `- **${new Date(t.created_at).toLocaleString('de-DE')}**: ${t.titel}${t.beschreibung ? ' — ' + String(t.beschreibung).slice(0, 150) : ''}`).join('\n')}

## Nachrichten (letzte 30)
${nachrichten.map(n => `- **${new Date(n.created_at).toLocaleString('de-DE')}** [${n.kanal}] ${n.sender_rolle}: ${String(n.nachricht ?? '').slice(0, 200)}`).join('\n')}

## Tasks (${tasks.length})
${tasks.map(t => `- [${t.status === 'erledigt' ? 'x' : ' '}] ${t.titel}${t.faellig_am ? ' (fällig: ' + t.faellig_am + ')' : ''}`).join('\n')}

---

Bitte erstelle die Zusammenfassung nach der im System-Prompt vorgegebenen Struktur.`

  // 4. Claude API
  try {
    const anthropic = new Anthropic({ apiKey })
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    })

    const zusammenfassung = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as { text: string }).text)
      .join('\n')

    // 5. Persist
    const { data: summary, error } = await admin.from('fall_summaries').insert({
      fall_id: fallId,
      kunden_anliegen: kundenAnliegen,
      zusammenfassung,
      ai_modell: MODEL,
      prompt_tokens: response.usage.input_tokens,
      completion_tokens: response.usage.output_tokens,
      generated_by_user_id: user.id,
      fall_status_at_generation: fall.status,
      anzahl_dokumente_at_generation: dokumente.length,
      anzahl_nachrichten_at_generation: nachrichten.length,
      letzte_timeline_event_at_generation: timeline[0]?.created_at ?? null,
    }).select('id').single()

    if (error) return { success: false, error: error.message }

    revalidatePath(`/faelle/${fallId}`)
    return { success: true, summaryId: summary.id, zusammenfassung }
  } catch (err) {
    console.error('[AAR-104] Claude API Fehler:', err)
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
