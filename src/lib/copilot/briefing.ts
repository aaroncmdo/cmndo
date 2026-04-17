import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildPreCallStaticSystem, buildPreCallUser } from './prompts'
import { logAiUsage } from '@/lib/ai/usage-log'

const BRIEFING_MODEL = 'claude-sonnet-4-20250514'

/**
 * KFZ-143: Generiert ein Pre-Call Briefing via Claude.
 * AAR-436: Statischer System-Prompt gecached (ephemeral), dynamischer
 * Kontext als User-Message. Usage wird nach dem Call geloggt.
 */
export async function getPreCallBriefing(opts: { fallId?: string; leadId?: string }): Promise<{
  briefing: string
  callId?: string
}> {
  const db = createAdminClient()

  // Kontext laden
  let kundeName = '—'
  let fallNummer = '—'
  let status = '—'
  let fahrzeug = '—'
  let schadenhoehe: string | null = null
  let terminDatum: string | null = null
  let aktivePhase = '—'
  const subProzesse: string[] = []
  const letzteNachrichten: string[] = []

  if (opts.fallId) {
    const { data: fall } = await db.from('faelle').select('fall_nummer, status, fahrzeug_hersteller, fahrzeug_modell, kennzeichen, gutachten_betrag, sv_termin, lead_id').eq('id', opts.fallId).single()
    if (fall) {
      fallNummer = fall.fall_nummer ?? opts.fallId.slice(0, 8)
      status = fall.status
      fahrzeug = [fall.fahrzeug_hersteller, fall.fahrzeug_modell].filter(Boolean).join(' ') || fall.kennzeichen || '—'
      schadenhoehe = fall.gutachten_betrag ? `${Number(fall.gutachten_betrag).toLocaleString('de-DE')} €` : null
      terminDatum = fall.sv_termin ? new Date(fall.sv_termin).toLocaleDateString('de-DE') : null

      // Kunde
      if (fall.lead_id) {
        const { data: lead } = await db.from('leads').select('vorname, nachname').eq('id', fall.lead_id).single()
        if (lead) kundeName = [lead.vorname, lead.nachname].filter(Boolean).join(' ') || '—'
      }

      // Letzte Nachrichten
      const { data: msgs } = await db.from('nachrichten').select('nachricht, sender_rolle, created_at')
        .eq('fall_id', opts.fallId).order('created_at', { ascending: false }).limit(3)
      for (const m of msgs ?? []) {
        letzteNachrichten.push(`[${m.sender_rolle}] ${m.nachricht}`)
      }

      // Stepper
      try {
        const { getStepperState } = await import('@/lib/fall/stepper-state')
        const state = await getStepperState(opts.fallId)
        const activePhase = state.hauptPhasen.find(p => p.status === 'aktiv')
        if (activePhase) {
          aktivePhase = activePhase.label
          for (const s of activePhase.subs.filter(s => s.status === 'aktiv')) subProzesse.push(s.label)
        }
      } catch { /* */ }
    }
  } else if (opts.leadId) {
    const { data: lead } = await db.from('leads').select('vorname, nachname, schadenfall_typ, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, status').eq('id', opts.leadId).single()
    if (lead) {
      kundeName = [lead.vorname, lead.nachname].filter(Boolean).join(' ') || '—'
      fallNummer = `Lead ${opts.leadId.slice(0, 8)}`
      status = lead.status ?? '—'
      fahrzeug = [lead.fahrzeug_hersteller, lead.fahrzeug_modell].filter(Boolean).join(' ') || lead.kennzeichen || '—'
      aktivePhase = 'Lead-Qualifizierung'
    }
  }

  const ctx = {
    kundeName, fallNummer, status, fahrzeug, schadenhoehe, terminDatum,
    letzteNachrichten, aktivePhase, subProzesse,
  }

  // Claude API Call
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { briefing: 'ANTHROPIC_API_KEY nicht gesetzt. Bitte in Vercel konfigurieren.' }
  }

  const anthropic = new Anthropic({ apiKey })
  const response = await anthropic.messages.create({
    model: BRIEFING_MODEL,
    max_tokens: 800,
    // AAR-436: statischer System-Prompt wird gecached
    system: [
      {
        type: 'text',
        text: buildPreCallStaticSystem(),
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: buildPreCallUser(ctx) }],
  })

  const briefing = response.content[0]?.type === 'text' ? response.content[0].text : 'Briefing konnte nicht generiert werden.'

  void logAiUsage({
    endpoint: 'pre_call_briefing',
    model: BRIEFING_MODEL,
    fallId: opts.fallId ?? null,
    usage: response.usage,
  })

  return { briefing }
}
