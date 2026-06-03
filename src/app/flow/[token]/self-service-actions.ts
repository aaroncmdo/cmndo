'use server'

// AAR-956 §3a: Lead-gekeyte Self-Service-Actions für den datengetriebenen /flow-
// Pfad (termin-loser Lead aus /start). Spiegelt die /anfrage-Actions (speichereQuali/
// ladeMatching/bucheTermin), aber resolved über flow_links-Token → Lead statt über
// gfa.self_service_token. Reuse der Shared-Libs (matchAndSlots, bewerteSchuldfrage).
// Phase C deprecatet /anfrage → diese hier bleiben der kanonische /flow-Pfad.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { bewerteSchuldfrage } from '@/lib/self-service/quali-gate'
import { matchAndSlots, type OeffentlichesSvProfil } from '@/lib/sv-matching-modul'
import { mergeFixerUndAlternativen } from '@/lib/self-service/merge-fixer-alternativen'

/**
 * flow_links-Token → Lead (service_role). Backward-compat: ein Token, das kein
 * flow_links-Eintrag ist, wird als lead_id behandelt (page.tsx-Parität).
 */
async function resolveFlowLead(token: string): Promise<{
  admin: ReturnType<typeof createAdminClient> | null
  leadId: string | null
  error?: string
}> {
  if (!token) return { admin: null, leadId: null, error: 'Kein Token.' }
  const admin = createAdminClient()
  const { data: flowLink } = await admin
    .from('flow_links')
    .select('lead_id, expires_at')
    .eq('token', token)
    .maybeSingle()
  if (flowLink) {
    if (flowLink.expires_at && new Date(flowLink.expires_at as string).getTime() < Date.now()) {
      return { admin, leadId: null, error: 'Dieser Link ist abgelaufen.' }
    }
    return { admin, leadId: (flowLink.lead_id as string | null) ?? null }
  }
  // Backward-compat: Token ist evtl. direkt die lead_id (wie /flow/page.tsx).
  return { admin, leadId: token }
}

/**
 * Selbst-Quali (Schuldfrage) für den Flow-Lead. Policy identisch zu /anfrage
 * speichereQuali: nur Eigenverschulden disqualifiziert (KEIN Termin).
 */
export async function speichereQualiFlow(
  token: string,
  schuldfrage: string,
): Promise<{ ok: boolean; ergebnis?: 'weiter' | 'abbruch'; error?: string }> {
  const { admin, leadId, error } = await resolveFlowLead(token)
  if (!admin || !leadId) return { ok: false, error: error ?? 'Dieser Link ist ungültig.' }

  const ergebnis = bewerteSchuldfrage(schuldfrage)
  const nowIso = new Date().toISOString()

  if (ergebnis === 'abbruch') {
    const { error: updErr } = await admin
      .from('leads')
      .update({
        schuldfrage,
        disqualifiziert: true,
        disqualifiziert_am: nowIso,
        disqualifiziert_grund_key: 'eigenverschulden',
        disqualifiziert_grund:
          'Eigenverschulden — Gutachterkosten nicht über die gegnerische Haftpflicht regulierbar (Self-Service-Quali)',
        status: 'disqualifiziert',
      })
      .eq('id', leadId)
    if (updErr) return { ok: false, error: updErr.message }
    revalidatePath('/dispatch/leads')
    return { ok: true, ergebnis: 'abbruch' }
  }

  const update: Record<string, unknown> = { schuldfrage }
  if (ergebnis === 'weiter_mit_flag') {
    update.notiz = `[Self-Service] Schuldfrage „${schuldfrage}" — Dispatcher-Review empfohlen.`
  }
  const { error: updErr } = await admin.from('leads').update(update).eq('id', leadId)
  if (updErr) return { ok: false, error: updErr.message }
  revalidatePath('/dispatch/leads')
  return { ok: true, ergebnis: 'weiter' }
}

/**
 * SV-Matching für den Flow-Lead — kundensichere OeffentlichesSvProfil-Projektion.
 * Datengetrieben (Aaron-Spec 42068954):
 *  - gepickter SV (gfa-Back-Reference) → Fixer als Default/erster + ALTERNATIVEN
 *    (matchAndSlots({fixerSvId}) liefert nur den Fixen → zusätzlich global mergen).
 *  - sonst → globales Matching (findBestSV-Ranking, Prioritäts-Pakete).
 */
export async function ladeMatchingFlow(
  token: string,
): Promise<{ ok: boolean; svs?: OeffentlichesSvProfil[]; error?: string }> {
  const { admin, leadId, error } = await resolveFlowLead(token)
  if (!admin || !leadId) return { ok: false, error: error ?? 'Dieser Link ist ungültig.' }

  const { data: lead } = await admin
    .from('leads')
    .select(
      'besichtigungsort_lat, besichtigungsort_lng, fahrzeug_standort_lat, fahrzeug_standort_lng, wunschtermin, disqualifiziert',
    )
    .eq('id', leadId)
    .maybeSingle()
  if (!lead) return { ok: false, error: 'Vorgang nicht gefunden.' }
  if (lead.disqualifiziert) {
    return { ok: false, error: 'Für diesen Vorgang ist keine Terminbuchung möglich.' }
  }

  const lat =
    (lead.besichtigungsort_lat as number | null) ??
    (lead.fahrzeug_standort_lat as number | null) ??
    null
  const lng =
    (lead.besichtigungsort_lng as number | null) ??
    (lead.fahrzeug_standort_lng as number | null) ??
    null
  if (lat == null || lng == null) {
    return {
      ok: false,
      error: 'Uns fehlt noch der Besichtigungsort — wir melden uns telefonisch für die Terminvereinbarung.',
    }
  }
  const wunschterminIso = (lead.wunschtermin as string | null) ?? null

  // Picked-SV liegt auf der gfa (leads hat keine SV-Spalte) — Back-Reference.
  const { data: gfa } = await admin
    .from('gutachter_finder_anfragen')
    .select('zugeordneter_sv_id')
    .eq('konvertiert_zu_lead_id', leadId)
    .maybeSingle()
  const fixerSvId = (gfa?.zugeordneter_sv_id as string | null) ?? null

  if (!fixerSvId) {
    const svs = await matchAndSlots({ lat: Number(lat), lng: Number(lng), wunschterminIso })
    return { ok: true, svs }
  }

  // Fixer zuerst + Alternativen (global), Fixer aus den Alternativen rausdedupen.
  const [fixerList, globalList] = await Promise.all([
    matchAndSlots({ lat: Number(lat), lng: Number(lng), wunschterminIso, fixerSvId }),
    matchAndSlots({ lat: Number(lat), lng: Number(lng), wunschterminIso }),
  ])
  const svs = mergeFixerUndAlternativen(fixerList, globalList, fixerSvId)
  return { ok: true, svs }
}

/**
 * Self-Service-Termin reservieren (Flow-Lead). Setzt NUR lead_id auf
 * gutachter_termine (signSAandCreateFall findet via lead_id). KEIN `typ` →
 * NULL (vom CHECK toleriert); NIE reserviereSlot (typ:'vor_ort' = CHECK-Verletzung).
 * Konflikt-Check (Race) + Idempotenz (alte Reservierung dieses Leads stornieren).
 */
export async function bucheTerminFlow(
  token: string,
  svId: string,
  startIso: string,
  endIso: string,
): Promise<{ ok: boolean; terminId?: string; error?: string }> {
  if (!svId || !startIso || !endIso) return { ok: false, error: 'Termin-Daten fehlen.' }
  const { admin, leadId, error } = await resolveFlowLead(token)
  if (!admin || !leadId) return { ok: false, error: error ?? 'Dieser Link ist ungültig.' }

  const { data: konflikt } = await admin
    .from('gutachter_termine')
    .select('id')
    .eq('sv_id', svId)
    .not('status', 'in', '("storniert","abgelehnt","abgesagt","no_show")')
    .lt('start_zeit', endIso)
    .gt('end_zeit', startIso)
    .limit(1)
  if (konflikt && konflikt.length > 0) {
    return { ok: false, error: 'Dieser Termin ist leider gerade vergeben. Bitte wählen Sie einen anderen.' }
  }

  await admin
    .from('gutachter_termine')
    .update({ status: 'storniert' })
    .eq('lead_id', leadId)
    .in('status', ['reserviert', 'gegenvorschlag', 'abgelehnt'])

  const { data: inserted, error: insErr } = await admin
    .from('gutachter_termine')
    .insert({
      lead_id: leadId,
      sv_id: svId,
      start_zeit: startIso,
      end_zeit: endIso,
      status: 'reserviert',
    })
    .select('id')
    .single()
  if (insErr || !inserted) {
    return { ok: false, error: insErr?.message ?? 'Termin konnte nicht reserviert werden.' }
  }

  revalidatePath('/dispatch/leads')
  return { ok: true, terminId: inserted.id as string }
}
