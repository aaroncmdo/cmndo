'use server'

// Kasko-WB Phase 1 — Kunde-Portal (Umgehung b aus dem Scan): Kasko-Claims aus der Schadenmeldung kannten die
// Bindung nie. Der Kunde beantwortet die Tariffrage jetzt VOR dem Finder. Muster wie werkstatt-finder-actions.ts:
// Ownership via Kunde-RLS, Write via Service-Client, Authz VOR dem Write. Schreibsatz: lib/kasko-wb/persistenz.ts
// (gemeinsam mit FlowLink + Dispatcher, Review #5864).

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { leiteWerkstattbindungAb } from '@/lib/kasko-wb/werkstattbindung'
import { ladeKaskoBindungsInfo } from '@/lib/kasko-wb/actions'
import { baueKaskoLeadPatch, baueKaskoTarifFelder, leseKaskoAltStand, type KaskoAltStand } from '@/lib/kasko-wb/persistenz'
import { createLinkedTask } from '@/lib/tasks/create-task'
import type { Bindungsumfang, KaskoBindungsInfo, KaskoTarifAuswahl, WbStatus } from '@/lib/kasko-wb/types'

async function assertOwner(claimId: string): Promise<{ ok: true; leadId: string | null } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet.' }
  const { data: claim } = await supabase.from('claims').select('id, lead_id').eq('id', claimId).maybeSingle()
  if (!claim) return { ok: false, error: 'Vorgang nicht gefunden.' }
  return { ok: true, leadId: (claim.lead_id as string | null) ?? null }
}

export async function speichereKaskoTarifPortal(
  claimId: string,
  auswahl: KaskoTarifAuswahl,
): Promise<{ ok: true; freieWerkstattwahl: boolean | null } | { ok: false; error: string }> {
  const owner = await assertOwner(claimId)
  if (!owner.ok) return owner
  const svc = createServiceClient()

  let wbStatus: WbStatus | null = null
  let tarif: { hatWerkstattbindung: boolean; bindungsumfang: Bindungsumfang } | null = null
  let markeName = auswahl.markeName?.trim() || null
  let tarifName = auswahl.tarifName?.trim() || null
  if (auswahl.markeId) {
    const { data: m } = await svc.from('kasko_versicherer_marken').select('marke, wb_status').eq('id', auswahl.markeId).maybeSingle()
    if (m) { wbStatus = m.wb_status as WbStatus; markeName = m.marke as string }
  }
  if (auswahl.tarifId) {
    const { data: t } = await svc.from('kasko_tarife').select('anzeigename, hat_werkstattbindung, bindungsumfang').eq('id', auswahl.tarifId).maybeSingle()
    if (t) { tarif = { hatWerkstattbindung: t.hat_werkstattbindung as boolean, bindungsumfang: t.bindungsumfang as Bindungsumfang }; tarifName = t.anzeigename as string }
  }
  const ergebnis = leiteWerkstattbindungAb({ wbStatus, tarif, markerAntwort: auswahl.markerAntwort, schadenIstGlas: false })

  // Alt-Stand des Leads VOR jedem Write (Review #5864, Befund 7): ein Read-Fehler ist ein Fehler — sonst bliebe ein
  // wegen Werkstattbindung disqualifizierter Lead still disqualifiziert. Im Portal existiert per Definition ein Claim.
  let alt: KaskoAltStand | null = null
  if (owner.leadId) {
    const { data: altRow, error: altErr } = await svc
      .from('leads')
      .select('disqualifiziert_grund_key, freie_werkstattwahl, eigene_versicherung_marke_id, eigene_kasko_tarif_id')
      .eq('id', owner.leadId)
      .maybeSingle()
    if (altErr) return { ok: false, error: altErr.message }
    const gelesen = leseKaskoAltStand(altRow)
    alt = gelesen ? { ...gelesen, konvertiert: true } : null
  }

  // freie_werkstattwahl IMMER explizit, auch null (Review #5864, Befund 1: Korrektur gebunden -> unbekannt).
  const patch = baueKaskoTarifFelder(auswahl, ergebnis, { markeName, tarifName })
  const { error } = await svc.from('claims').update(patch as never).eq('id', claimId)
  if (error) return { ok: false, error: error.message }
  if (owner.leadId) {
    // Lead spiegeln (Reminder-Cron liest freie_werkstattwahl vom Lead) + Re-Qualifikation nach frueherer Bindung — non-critical.
    const leadPatch = baueKaskoLeadPatch(patch, ergebnis, alt)
    const { error: leadErr } = await svc.from('leads').update(leadPatch as never).eq('id', owner.leadId)
    if (leadErr) console.error('[kasko-tarif-portal] Lead-Spiegel fehlgeschlagen (non-critical):', leadErr.message)
  }
  if (ergebnis.freieWerkstattwahl === null) {
    // Review W3 (E3): „unser Team meldet sich" muss auch passieren — Dispatch-Aufgabe wie im FlowLink. Non-critical.
    try {
      await createLinkedTask({
        titel: 'Kasko: Werkstattbindung klären',
        beschreibung: `Der Kunde konnte die Werkstattbindung seines Kasko-Tarifs im Portal nicht angeben (Versicherer: ${markeName ?? 'unbekannt'}). Vor der Reparaturfreigabe klären, ob der Tarif eine Partnerwerkstatt vorschreibt.`,
        prioritaet: 'normal',
        ...(owner.leadId ? { entity_type: 'lead' as const, entity_id: owner.leadId } : {}),
        claim_id: claimId,
        empfaenger_rolle: 'dispatch',
        task_code: 'kasko_werkstattbindung_klaeren',
        trigger_event: 'kasko_tarif_unbekannt',
        auto_erstellt: true,
      })
    } catch (err) {
      console.error('[kasko-tarif-portal] Dispatch-Task (Bindung unklar) fehlgeschlagen (non-critical):', err)
    }
  }
  revalidatePath(`/kunde/faelle/${claimId}`)
  return { ok: true, freieWerkstattwahl: ergebnis.freieWerkstattwahl }
}

export async function ladeKaskoBindungsInfoPortal(
  claimId: string,
): Promise<{ ok: true; info: KaskoBindungsInfo } | { ok: false; error: string }> {
  const owner = await assertOwner(claimId)
  if (!owner.ok) return owner
  const svc = createServiceClient()
  const { data: c } = await svc
    .from('claims')
    .select('eigene_versicherung_marke_id, eigene_kasko_tarif_id, eigene_versicherung_name')
    .eq('id', claimId)
    .maybeSingle()
  return ladeKaskoBindungsInfo(
    (c?.eigene_versicherung_marke_id as string | null) ?? null,
    (c?.eigene_kasko_tarif_id as string | null) ?? null,
    (c?.eigene_versicherung_name as string | null) ?? null,
  )
}
