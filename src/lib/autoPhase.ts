import { createServiceClient } from '@/lib/supabase/server'

/**
 * Check if a lead should automatically move to a new phase based on its data.
 * Called after any update to leads.
 */
export async function checkLeadAutoPhase(leadId: string) {
  const svc = createServiceClient()
  const { data: lead } = await svc.from('leads').select('*').eq('id', leadId).single()
  if (!lead) return

  const phase = lead.qualifizierungs_phase as string | null
  const updates: Record<string, unknown> = {}

  // If schadentyp set and still in 'neu' or 'nicht-erreicht' → 'in-qualifizierung'
  if (lead.schadenfall_typ && (phase === 'neu' || phase === 'nicht-erreicht')) {
    updates.qualifizierungs_phase = 'in-qualifizierung'
  }

  // If flow_token generated → 'flow-versendet'
  if (lead.flow_token && phase === 'in-qualifizierung') {
    updates.qualifizierungs_phase = 'flow-versendet'
  }

  // If SA + Vollmacht both signed → 'konvertiert' (skip sa-ausstehend)
  if (lead.sa_unterschrieben && lead.vollmacht_unterschrieben && phase !== 'konvertiert' && phase !== 'disqualifiziert') {
    updates.qualifizierungs_phase = 'konvertiert'
  }

  if (Object.keys(updates).length > 0) {
    await svc.from('leads').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', leadId)
  }
}

/**
 * Check if a fall should automatically move to a new phase based on its data.
 * Called after any update to faelle.
 */
export async function checkFallAutoPhase(fallId: string) {
  const svc = createServiceClient()
  const { data: fall } = await svc.from('faelle').select('*').eq('id', fallId).single()
  if (!fall) return

  const status = fall.status as string
  let newStatus: string | null = null

  // SV zugewiesen
  if (fall.sv_id && status === 'ersterfassung') {
    newStatus = 'sv-zugewiesen'
  }

  // SV Termin gesetzt
  if (fall.sv_termin && status === 'sv-zugewiesen') {
    newStatus = 'sv-termin'
  }

  // Gutachten hochgeladen
  if (fall.gutachten_eingegangen_am && (status === 'sv-termin' || status === 'besichtigung')) {
    newStatus = 'gutachten-eingegangen'
  }

  // QC bestanden
  if (fall.filmcheck_ok && status === 'gutachten-eingegangen') {
    newStatus = 'filmcheck'
  }

  // Mandatsnummer gesetzt (Kanzlei-Übergabe)
  if (fall.mandatsnummer && status === 'filmcheck') {
    newStatus = 'kanzlei-uebergeben'
  }

  // AS Sendedatum gesetzt
  if (fall.anschlussschreiben_am && status === 'kanzlei-uebergeben') {
    newStatus = 'anschlussschreiben'
  }

  // Zahlung eingegangen
  if (fall.zahlung_eingegangen_am && (status === 'anschlussschreiben' || status === 'regulierung')) {
    newStatus = 'abgeschlossen'
  }

  if (newStatus && newStatus !== status) {
    await svc.from('faelle').update({
      status: newStatus,
      status_changed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', fallId)

    // Timeline entry
    await svc.from('timeline').insert({
      fall_id: fallId,
      typ: 'system',
      titel: `Phase automatisch geaendert: ${newStatus}`,
      beschreibung: `Automatische Verschiebung basierend auf Daten.`,
    })
  }
}
