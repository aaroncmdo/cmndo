// CMM-48: Legacy-Dispatch-Konvertierungspfad als delegierender Wrapper.
//
// Diese Funktion ist die „Status auf umgewandelt"-Aktion aus dem Dispatcher-
// Portal. Sie ruft `convertLeadToClaim` (claim-canonical Pfad) und führt die
// dispatch-spezifischen Side-Effects on top aus.
//
// Lebt absichtlich AUSSERHALB von `dispatch-fall-actions.ts` (das Datei-
// Level-`'use server'` hat) damit der Test-API-Endpoint sie ohne Server-
// Action-Serialisierungs-Overhead importieren kann — der `SupabaseClient`-
// Parameter wäre für ein Server-Action-Wrapping nicht zulässig.
//
// Externer Caller-Pfad: `updateLeadStatus(...,'umgewandelt')` in
// `dispatch-fall-actions.ts`. Test-Pfad: `/api/admin/test/cmm48-smoke`.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'
import { sendFallCommunication } from '@/lib/communications/send-fall'
import { triggerKonversionTasks } from '@/lib/tasking'
import { createPflichtdokumenteFromKatalog } from '@/lib/dokumente/create-pflicht'
import { assignKundenbetreuer } from '@/lib/faelle/kb-assignment'

// Der Caller-Client kann ein server-action-Client (createClient) oder ein
// service-role-Client (createServiceClient) sein — beide implementieren
// dieselbe Supabase-JS-API. Generisch typisiert um keinen Drift zu erzeugen.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any, any, any>

export type ConvertResult = {
  fallId: string
  linked: {
    calls: number
    tasks: number
    emails: number
    termine: number
    nachrichten: number
    dokumente: number
  }
}

export async function convertLeadToFall(
  supabase: AnySupabase,
  leadId: string,
  userId: string,
): Promise<ConvertResult> {
  // 1. Lead-Daten laden
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single()

  if (leadErr || !lead) throw new Error('Lead nicht gefunden')

  // 2. Kundenbetreuer-Zuweisung mit Sticky-Lookup (gleicher Kunde/Ansprechpartner
  // → gleicher KB, auch bei voller Kapazität). Fallback: Round-Robin → Admin.
  // `writeToFall:false` weil die KB-Zuweisung über convertLeadToClaim auf
  // claims.kundenbetreuer_id geschrieben wird — wir reichen die Auswahl rein.
  const kbAssignment = await assignKundenbetreuer(supabase, /* fallId noch nicht bekannt */ '', {
    writeToFall: false,
    logToTimeline: false,
    stickyHints: { lead_id: leadId },
  })
  const kundenbetreuerId = kbAssignment.kundenbetreuer_id
  const kbFallbackFlag = kbAssignment.fallback_used === 'admin'

  // 3. CMM-48 (15.05.2026): Lead → Claim direkt. convertLeadToClaim ist der
  // neue, claim-canonical Pfad (claims-INSERT zuerst, dann faelle via
  // buildFallInsertFromLead mit claim_id-Bridge). kundenbetreuer_id wird
  // dabei nur auf claims gesetzt — faelle.kundenbetreuer_id wird seit
  // CMM-44 SP-A nicht mehr geschrieben (DUP-Spalte, claims = SSoT).
  // claim_nummer-Generierung (DB-Trigger) + entity-FK-Resolver leben in
  // convertLeadToClaim, hier kein Duplikat mehr nötig.
  const { convertLeadToClaim } = await import('@/lib/leads/convert-lead-to-claim')
  const conv = await convertLeadToClaim({
    leadId,
    triggerByUserId: userId,
    kundenbetreuerId,
  })
  if (!conv.ok) {
    throw new Error(`Fall-Erstellung fehlgeschlagen: ${conv.error}`)
  }
  const fallId = conv.fallId
  const fallNummer = conv.claimNummer ?? ''
  const fall = { id: fallId }

  // 3b. AAR-427-Metadata + SA-Flags-Reset. convertLeadToClaim setzt
  // sa_unterschrieben=true/abtretung_signiert_am=now hartcodiert (Flow-Pfad),
  // Dispatch-Convert läuft aber OHNE SA-Signatur — daher zurücksetzen.
  // CMM-44 SP-B PR2a: kundenbetreuer_fallback_flag/zugewiesen_am leben auf
  // claims (SSoT) — werden separat auf claims geschrieben.
  const nowIso = new Date().toISOString()
  await supabase
    .from('faelle')
    .update({
      sa_unterschrieben: false,
      sa_unterschrieben_am: null,
      abtretung_signiert_am: null,
      abtretung_pdf: null,
    })
    .eq('id', fallId)

  // CMM-44 SP-B PR2a: kundenbetreuer_fallback_flag + kundenbetreuer_zugewiesen_am
  // auf claims setzen (SSoT). claimId kommt aus dem conv-Ergebnis.
  // CMM-44 SP-B PR2b: SA/Abtretung Dual-Write → claims (SSoT).
  if (conv.claimId) {
    await supabase
      .from('claims')
      .update({
        ...(kundenbetreuerId ? {
          kundenbetreuer_fallback_flag: kbFallbackFlag,
          kundenbetreuer_zugewiesen_am: nowIso,
        } : {}),
        sa_unterschrieben: false,
        sa_unterschrieben_am: null,
        abtretung_signiert_am: null,
        abtretung_pdf: null,
      })
      .eq('id', conv.claimId)
  }

  // 4. KFZ-146: Alle verbundenen Daten (Calls/Tasks/Emails/Termine/Nachrichten/Dokumente) verlinken.
  type LinkResult = ConvertResult['linked']
  let linked: LinkResult = { calls: 0, tasks: 0, emails: 0, termine: 0, nachrichten: 0, dokumente: 0 }
  const service = createServiceClient()
  const { data: linkData, error: linkErr } = await service.rpc('link_lead_data_to_fall', {
    p_lead_id: leadId,
    p_fall_id: fall.id,
  })
  if (linkErr) {
    console.error('[KFZ-146] link_lead_data_to_fall failed:', linkErr.message)
  } else if (linkData) {
    linked = linkData as unknown as LinkResult
  }

  // 5. AAR-unfallfotos: Schadensfoto-URLs aus dem Lead nach fall_dokumente
  // übernehmen, damit Admin/SV/Kunde sie im Dokumente-Tab sehen.
  const fotoUrls = Array.isArray(lead.schadensfoto_urls)
    ? (lead.schadensfoto_urls as string[])
    : []
  if (fotoUrls.length > 0) {
    const fotoRows = fotoUrls
      .map((url) => {
        const marker = '/public/fall-dokumente/'
        const idx = url.indexOf(marker)
        if (idx === -1) return null
        const storagePath = url.slice(idx + marker.length)
        return {
          fall_id: fall.id,
          dokument_typ: 'schadensfotos',
          storage_path: storagePath,
          original_filename: storagePath.split('/').pop() ?? 'unfallfoto.jpg',
          mime_type: 'image/jpeg',
          uploaded_by_kunde: true,
          beschreibung: 'Unfallfoto (Dispatch-Phase)',
          hochgeladen_am: new Date().toISOString(),
        }
      })
      .filter(<T,>(v: T | null): v is T => v !== null)
    if (fotoRows.length > 0) {
      const { error: fotoErr } = await supabase.from('fall_dokumente').insert(fotoRows)
      if (fotoErr) {
        console.error('[AAR-unfallfotos] fall_dokumente-Insert fehlgeschlagen:', fotoErr.message)
      }
    }
  }

  // 6. Lead-Notiz als Timeline-Eintrag übertragen
  if (lead.notiz && String(lead.notiz).trim()) {
    await supabase.from('timeline').insert({
      fall_id: fall.id,
      lead_id: leadId,
      typ: 'notiz',
      titel: 'Notiz aus Lead-Phase',
      beschreibung: String(lead.notiz).trim(),
      erstellt_von: userId,
    })
  }

  // 7. Pflichtdokumente (Katalog-getrieben) + Sync der bereits hochgeladenen Lead-URLs.
  await createPflichtdokumenteFromKatalog(supabase, fall.id, lead)
  try {
    const { syncLeadDokumenteAnPflicht } = await import('@/lib/dokumente/sync-lead-zu-pflicht')
    await syncLeadDokumenteAnPflicht(supabase, fall.id, lead as Record<string, unknown>)
  } catch (err) {
    console.warn('[AAR-pflicht-sync] convert-lead-to-fall:', err instanceof Error ? err.message : err)
  }

  // 8. AAR-90: Cardentity-Anreicherung wenn Lead FIN hat
  if (lead.fin) {
    try {
      const { enrichFallByFin } = await import('@/lib/cardentity/enrich-fahrzeug')
      enrichFallByFin(fall.id).catch(() => {})
    } catch {
      /* */
    }
  }

  // 9. Timeline-Eintrag „Lead konvertiert" mit linked-Summary.
  const betreuerName = await getProfileName(supabase, kundenbetreuerId)
  const parts = [
    linked.calls > 0 ? `${linked.calls} Calls` : null,
    linked.tasks > 0 ? `${linked.tasks} Tasks` : null,
    linked.emails > 0 ? `${linked.emails} E-Mails` : null,
    linked.termine > 0 ? `${linked.termine} Termine` : null,
    linked.nachrichten > 0 ? `${linked.nachrichten} Nachrichten` : null,
    linked.dokumente > 0 ? `${linked.dokumente} Dokumente` : null,
  ].filter(Boolean)
  const linkedSummary = parts.length > 0 ? ` Übertragen: ${parts.join(', ')}.` : ''
  await supabase.from('timeline').insert({
    fall_id: fall.id,
    lead_id: leadId,
    typ: 'system',
    titel: 'Lead konvertiert zu Kundenakte',
    beschreibung: `Fallnummer ${fallNummer} erstellt. Kundenbetreuer: ${betreuerName}.${linkedSummary}`,
    erstellt_von: userId,
  })

  // 10. AAR-427: Bei Admin-Fallback separat loggen + Admin notifizieren.
  if (kbFallbackFlag && kundenbetreuerId) {
    await supabase.from('timeline').insert({
      fall_id: fall.id,
      lead_id: leadId,
      typ: 'system',
      titel: 'KB-Fallback auf Admin',
      beschreibung: `Kein Kundenbetreuer verfügbar — Admin ${betreuerName} übernimmt vorübergehend die KB-Rolle. Bitte nach KB-Einstellung / Urlaubsrückkehr manuell re-assignen.`,
      erstellt_von: userId,
    })
    createNotification(
      kundenbetreuerId,
      'fallback_kb_zuweisung',
      'Fall als KB-Fallback zugewiesen',
      `Fall ${fallNummer} wurde dir als Fallback zugewiesen, weil aktuell kein Kundenbetreuer verfügbar ist.`,
      `/faelle/${fall.id}`,
    ).catch(() => {})
  } else if (kbAssignment.fallback_used === 'error') {
    await supabase.from('timeline').insert({
      fall_id: fall.id,
      lead_id: leadId,
      typ: 'system',
      titel: 'KB-Zuweisung fehlgeschlagen',
      beschreibung: 'Kein aktiver Kundenbetreuer und kein aktiver Admin verfügbar — Fall bleibt unbezogen. Bitte manuell zuweisen.',
      erstellt_von: userId,
    })
    console.error('[AAR-427] Fall ohne Owner angelegt:', { fallId: fall.id, fallNummer })
  }

  // 11. WhatsApp-Communication + Auto-Tasks (fire-and-forget).
  sendFallCommunication(fall.id, 'fall_eroeffnet').catch(() => {})
  triggerKonversionTasks(fall.id, kundenbetreuerId, null).catch(() => {})

  return { fallId: fall.id, linked }
}

async function getProfileName(
  supabase: AnySupabase,
  profileId: string | null,
): Promise<string> {
  if (!profileId) return '—'
  const { data } = await supabase
    .from('profiles')
    .select('vorname, nachname')
    .eq('id', profileId)
    .single()
  if (!data) return '—'
  return `${data.vorname ?? ''} ${data.nachname ?? ''}`.trim() || '—'
}
