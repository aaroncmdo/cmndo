'use server'

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
// Alias: die exportierte Server-Action in dieser Datei heißt selbst `createLead`.
import { createLead as insertLeadRow } from '@/lib/leads/create-lead'
import { createNotification } from '@/lib/notifications'
import { triggerSV01, triggerSV04 } from '@/lib/gutachterTasking'
import {
  emailSvZugewiesen,
  emailGutachtenEingegangen,
  emailFilmcheckBestanden,
} from '@/lib/email'
// C3a Fundament: die J1-Statuswechsel-Sends laufen jetzt ueber die Notification-Outbox
// (enqueue) statt fire-and-forget sendFallCommunication -> Dedup (doppeltes enqueue = 1
// Versand), Retry + sichtbarer Fehler-Task. Der Worker delegiert weiterhin an
// sendFallCommunication (Registry = Template-Layer UNTER der Outbox).
import { enqueue, buildDedupKey } from '@/lib/notifications/outbox'
import { triggerKonversionTasks, triggerGutachterTerminTask, triggerGutachtenUploadTask, triggerQcTask, triggerLeadTasks, triggerOnboardingTasks, resolveGates, autoCompleteTask, triggerKanzleiPaketTask, triggerAsSendedatumTask, triggerArchivierungTask } from '@/lib/tasking'
import { createGutachterMitteilung } from '@/lib/mitteilungen'
import { transitionFallStatus } from '@/lib/faelle/state-machine'
import { aktuellerTerminFuerFall } from '@/lib/termine/aktueller-termin-fuer-fall'
import { staffMayMutateClaim } from './_helpers/staff-claim-scope'

// ─── Fall Status ────────────────────────────────────────────────────────────

export async function updateFallStatus(
  fallId: string,
  newStatus: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const serviceClient = createServiceClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  // Write-Path-Audit (28.06.): Rollen-Guard — Status-Transition via state-machine (claims-
  // Write) ist eine Staff-Aktion, vorher fehlte der Check (jeder Login konnte sie auslösen).
  {
    const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
    const rolle = (profile?.rolle as string | null) ?? null
    if (!['admin', 'dispatch', 'kundenbetreuer'].includes(rolle ?? '')) {
      return { ok: false, error: 'Nicht berechtigt' }
    }
    // Write-Path-Audit F6 (01.07.): KB darf nur eigene (oder unassigned) Claims transitionen —
    // spiegelt die claims-RLS-Write-Policy. admin/dispatch bleiben global (Routing-Rolle).
    // transitionFallStatus schreibt via admin-client (RLS-Bypass), daher greift der Guard hier.
    if (rolle === 'kundenbetreuer') {
      const { data: claimRow } = await serviceClient
        .from('v_claim_full')
        .select('kundenbetreuer_id')
        .eq('fall_id', fallId)
        .maybeSingle()
      if (!staffMayMutateClaim({ rolle, claimKbId: (claimRow?.kundenbetreuer_id as string | null) ?? null, userId: user.id })) {
        return { ok: false, error: 'Nicht berechtigt (fremder Fall)' }
      }
    }
  }

  // KFZ-153: Block status change to regulierung/abgeschlossen without Klassifizierung
  if (newStatus === 'regulierung' || newStatus === 'abgeschlossen') {
    const { data: klassifizierung } = await serviceClient
      .from('regulierungs_klassifizierung')
      .select('id')
      .eq('fall_id', fallId)
      .maybeSingle()
    if (!klassifizierung) {
      return {
        ok: false,
        error: 'Regulierungs-Klassifizierung fehlt. Bitte im Tab "Abrechnung" die Pflicht-Klassifizierung ausfüllen.',
      }
    }
  }

  // AAR-88: Zentraler Status-Wechsel via state-machine
  // (validiert Uebergaenge, setzt Timestamps, schreibt Timeline,
  // triggert LexDrive-Email + SLA-Hooks)
  try {
    await transitionFallStatus(fallId, newStatus, { user_id: user.id })
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Status-Wechsel fehlgeschlagen' }
  }

  // Fire-and-forget email notifications on status change
  triggerStatusEmail(serviceClient, fallId, newStatus).catch(() => {})

  // Fire-and-forget WhatsApp notifications on status change
  if (newStatus === 'sv-zugewiesen') {
    await enqueue({
      dedupKey: buildDedupKey({ template: 'sv_losgefahren', claimId: fallId }),
      kanal: 'whatsapp',
      template: 'sv_losgefahren',
      claimId: fallId,
    }).catch(() => {})
    // Auto-Task: Gutachter soll Termin bestaetigen
    // CMM-44 SP-A2 (Cluster 1): schadenort_* aus claims (SSoT). CMM-44 SP-B PR2c: schadens_ursache
    // ebenfalls claims. CMM-49: alles flach aus v_claim_full (faelle-frei, SSoT) statt faelle+Embed.
    const { data: fallInfo } = await supabase.from('v_claim_full').select('sv_id, lead_id, claim_nummer, schadenort_adresse, schadenort_plz, schadenort_ort, schadens_ursache').eq('fall_id', fallId).single()
    triggerGutachterTerminTask(fallId, fallInfo?.sv_id ?? null).catch(() => {})
    // SV-01: Neuer Auftrag Task für Gutachter
    if (fallInfo?.sv_id) {
      const { data: svData } = await serviceClient.from('sachverstaendige').select('profile_id').eq('id', fallInfo.sv_id).single()
      if (svData?.profile_id) {
        let kundeName2 = ''; const addr = [fallInfo?.schadenort_adresse, fallInfo?.schadenort_plz, fallInfo?.schadenort_ort].filter(Boolean).join(', ')
        if (fallInfo.lead_id) { const { data: ld } = await serviceClient.from('leads').select('vorname, nachname').eq('id', fallInfo.lead_id).single(); kundeName2 = [ld?.vorname, ld?.nachname].filter(Boolean).join(' ') }
        triggerSV01(fallId, svData.profile_id, kundeName2, addr, '', (fallInfo?.schadens_ursache as string | null) ?? '', null).catch(() => {})
      }
    }
    // Gutachter-Mitteilung: Neuer Auftrag
    if (fallInfo?.sv_id) {
      let kundeName = ''
      if (fallInfo.lead_id) {
        const { data: lead } = await supabase.from('leads').select('vorname, nachname').eq('id', fallInfo.lead_id).single()
        kundeName = [lead?.vorname, lead?.nachname].filter(Boolean).join(' ')
      }
      createGutachterMitteilung(fallInfo.sv_id, 'neuer_auftrag', fallId, {
        kunde_name: kundeName || undefined,
        schadentyp: (fallInfo?.schadens_ursache as string | null) ?? undefined,
        adresse: [fallInfo?.schadenort_adresse, fallInfo?.schadenort_plz, fallInfo?.schadenort_ort].filter(Boolean).join(', ') || undefined,
        claim_nummer: fallInfo?.claim_nummer ?? undefined,
      }).catch(() => {})
    }
  }
  if (newStatus === 'sv-termin') {
    await enqueue({
      dedupKey: buildDedupKey({ template: 'termin_bestaetigt', claimId: fallId }),
      kanal: 'whatsapp',
      template: 'termin_bestaetigt',
      claimId: fallId,
    }).catch(() => {})
    // Gutachter-Mitteilung: Termin bestaetigt.
    // CMM-49-Nachzug: sv_id/claim_nummer aus v_claim_full (wie die Nachbar-Branches),
    // Termin-Datum kanonisch aus gutachter_termine statt der stale
    // v_faelle_mit_aktuellem_termin.sv_termin (claim_id meist NULL -> Datum fehlte).
    const { data: fallInfo } = await supabase.from('v_claim_full').select('sv_id, claim_nummer').eq('fall_id', fallId).maybeSingle()
    if (fallInfo?.sv_id) {
      const aktTermin = await aktuellerTerminFuerFall(serviceClient, fallId)
      const terminDate = aktTermin ? new Date(aktTermin.start_zeit) : null
      createGutachterMitteilung(fallInfo.sv_id, 'termin_bestaetigt', fallId, {
        datum: terminDate?.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) ?? undefined,
        uhrzeit: terminDate?.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }) ?? undefined,
        claim_nummer: fallInfo.claim_nummer ?? undefined,
      }).catch(() => {})
    }
  }
  if (newStatus === 'besichtigung') {
    // Auto-Task: Gutachter soll Gutachten hochladen (48h)
    // CMM-49 (faelle-Drop-Runway): sv_id aus v_claim_full (flat, faelle-frei, SSoT) statt faelle.
    const { data: fallInfo } = await supabase.from('v_claim_full').select('sv_id').eq('fall_id', fallId).single()
    triggerGutachtenUploadTask(fallId, fallInfo?.sv_id ?? null).catch(() => {})
    // AAR-89: SV-04 Task (mit profile_id)
    if (fallInfo?.sv_id) {
      const { data: svData } = await serviceClient.from('sachverstaendige').select('profile_id').eq('id', fallInfo.sv_id).single()
      if (svData?.profile_id) {
        triggerSV04(fallId, svData.profile_id).catch(() => {})
      }
    }
  }
  if (newStatus === 'gutachten-eingegangen') {
    // Auto-Task: QC-Pruefung durchfuehren (2h)
    // CMM-44 SP-A: kundenbetreuer_id liegt auf claims (SSoT). CMM-49: via v_claim_full (flat, faelle-frei).
    const { data: fallInfo } = await supabase.from('v_claim_full').select('kundenbetreuer_id').eq('fall_id', fallId).single()
    triggerQcTask(fallId, fallInfo?.kundenbetreuer_id ?? null).catch(() => {})
  }
  if (newStatus === 'regulierung' || newStatus === 'vs-regulierung') {
    await enqueue({
      dedupKey: buildDedupKey({ template: 'regulierung_angekuendigt', claimId: fallId }),
      kanal: 'whatsapp',
      template: 'regulierung_angekuendigt',
      claimId: fallId,
    }).catch(() => {})
    // Gutachter-Mitteilung: Regulierung angekuendigt
    // CMM-49: sv_id + claim_nummer aus v_claim_full (flat, faelle-frei, SSoT).
    const { data: fallInfo } = await supabase.from('v_claim_full').select('sv_id, claim_nummer').eq('fall_id', fallId).single()
    if (fallInfo?.sv_id) {
      createGutachterMitteilung(fallInfo.sv_id, 'kanzlei_regulierung', fallId, {
        claim_nummer: fallInfo?.claim_nummer ?? undefined,
      }).catch(() => {})
    }
  }
  if (newStatus === 'abgeschlossen') {
    await enqueue({
      dedupKey: buildDedupKey({ template: 'fall_abgeschlossen', claimId: fallId }),
      kanal: 'whatsapp',
      template: 'fall_abgeschlossen',
      claimId: fallId,
    }).catch(() => {})
    // KFZ-151: Auto-Resolve aller offenen Fall- und Case-Tasks
    try {
      const { resolveTasksForEntity } = await import('@/lib/tasks/resolve-tasks')
      await resolveTasksForEntity('fall', fallId, 'Fall abgeschlossen')
      await resolveTasksForEntity('case', fallId, 'Fall abgeschlossen')
    } catch (err) { console.error('[KFZ-151] resolveTasks fall abschluss:', err) }
  }

  // AAR-88: Neue Trigger fuer bisher fehlende Status
  if (newStatus === 'kanzlei-uebergeben') {
    // CMM-44 SP-A: kundenbetreuer_id liegt auf claims (SSoT). CMM-49: via v_claim_full (flat, faelle-frei).
    const { data: fallInfo } = await serviceClient.from('v_claim_full').select('sv_id, claim_nummer, kundenbetreuer_id').eq('fall_id', fallId).single()
    triggerKanzleiPaketTask(fallId, fallInfo?.kundenbetreuer_id ?? null).catch(() => {})
    triggerAsSendedatumTask(fallId, fallInfo?.kundenbetreuer_id ?? null).catch(() => {})
    await enqueue({
      dedupKey: buildDedupKey({ template: 'kanzlei_uebergabe', claimId: fallId }),
      kanal: 'whatsapp',
      template: 'kanzlei_uebergabe',
      claimId: fallId,
    }).catch(() => {})
    if (fallInfo?.sv_id) {
      createGutachterMitteilung(fallInfo.sv_id, 'qc_bestanden', fallId, {
        claim_nummer: fallInfo?.claim_nummer ?? undefined,
      }).catch(() => {})
    }
  }
  if (newStatus === 'anschlussschreiben') {
    await enqueue({
      dedupKey: buildDedupKey({ template: 'as_gesendet', claimId: fallId }),
      kanal: 'whatsapp',
      template: 'as_gesendet',
      claimId: fallId,
    }).catch(() => {})
    autoCompleteTask(fallId, 'as_sendedatum_gesetzt').catch(() => {})
  }
  if (newStatus === 'zahlung-eingegangen') {
    await enqueue({
      dedupKey: buildDedupKey({ template: 'zahlung_eingegangen', claimId: fallId }),
      kanal: 'whatsapp',
      template: 'zahlung_eingegangen',
      claimId: fallId,
    }).catch(() => {})
    // CMM-44 SP-A: kundenbetreuer_id liegt auf claims (SSoT). CMM-49: via v_claim_full (flat, faelle-frei).
    const { data: fallInfo } = await serviceClient.from('v_claim_full').select('kundenbetreuer_id').eq('fall_id', fallId).single()
    triggerArchivierungTask(fallId, fallInfo?.kundenbetreuer_id ?? null).catch(() => {})
  }
  // AAR-91: Storno-Workflow (Cleanup + Mitteilungen + Refund)
  if (newStatus === 'storniert') {
    // CMM-44 SP-A: kundenbetreuer_id wird hier nicht genutzt — aus dem Select
    // entfernt (die Spalte liegt jetzt auf claims als SSoT).
    // CMM-44 SP-H PR2: storno_grund lebt auf auftraege (aktueller Auftrag) — via
    // Nested-Embed unter claims. Pre-launch <=1 Auftrag pro Claim.
    // CMM-49 (faelle-Drop-Runway): Anchor faelle_claim_bridge + claims-Embed (sv_id/operative_status/
    // claim_nummer aus claims SSoT; auftraege.storno_grund via claims->auftraege). faelle.status-Fallback
    // entfaellt (faelle-Drop; operative_status ist SSoT, 1:1-Mirror).
    const { data: fallInfo } = await serviceClient.from('faelle_claim_bridge')
      .select('claims:claims!fk_bridge_claim(sv_id, claim_nummer, operative_status, auftraege(storno_grund))')
      .eq('fall_id', fallId).single()
    const fallInfoClaim = Array.isArray(fallInfo?.claims) ? fallInfo?.claims[0] : fallInfo?.claims
    const stornoSvId = (fallInfoClaim as { sv_id?: string | null } | null)?.sv_id ?? null
    const fallInfoStatus = ((fallInfoClaim as { operative_status?: string | null } | null)?.operative_status) ?? null
    const stornoClaimNummer = (fallInfoClaim as { claim_nummer?: string | null } | null)?.claim_nummer ?? null
    const fallInfoAuftraege = Array.isArray(
      (fallInfoClaim as { auftraege?: unknown } | null)?.auftraege,
    )
      ? ((fallInfoClaim as { auftraege: unknown[] }).auftraege)
      : ((fallInfoClaim as { auftraege?: unknown } | null)?.auftraege
          ? [(fallInfoClaim as { auftraege: unknown }).auftraege]
          : [])
    const stornoGrund =
      ((fallInfoAuftraege[0] as { storno_grund?: string | null } | undefined)?.storno_grund) ?? null

    // Phase 1: Tasks aufloesen
    try {
      const { resolveTasksForEntity } = await import('@/lib/tasks/resolve-tasks')
      await resolveTasksForEntity('fall', fallId, 'Fall storniert')
      await resolveTasksForEntity('case', fallId, 'Fall storniert')
    } catch (err) { console.error('[AAR-91] resolveTasks storniert:', err) }

    // Phase 2a: WhatsApp an Kunde
    await enqueue({
      dedupKey: buildDedupKey({ template: 'termin_storniert', claimId: fallId }),
      kanal: 'whatsapp',
      template: 'termin_storniert',
      claimId: fallId,
    }).catch(() => {})

    // Phase 2b/3: SV-Mitteilung + Email + Refund
    if (stornoSvId) {
      createGutachterMitteilung(stornoSvId, 'auftrag_storniert', fallId, {
        claim_nummer: stornoClaimNummer ?? undefined,
        grund: stornoGrund ?? undefined,
      }).catch(() => {})

      const { data: svData } = await serviceClient.from('sachverstaendige').select('profile_id').eq('id', stornoSvId).single()
      if (svData?.profile_id) {
        const { data: svProfile } = await serviceClient.from('profiles').select('email').eq('id', svData.profile_id).single()
        if (svProfile?.email) {
          const { emailSvAuftragStorniert } = await import('@/lib/email')
          emailSvAuftragStorniert(svProfile.email, stornoClaimNummer ?? '', stornoGrund ?? '').catch(() => {})
        }
      }

      // Refund entfernt (Billing-Konsolidierung 2026-07-01): der Storno-Refund
      // laeuft ueber die State-Machine (transitionFallStatus('storniert') ->
      // AAR-926 revertCaseBilling, claims-basiert, respektiert
      // STORNO_GRUENDE_OHNE_REVERT). Die fruehere gutachter_abrechnungen-
      // Gegenbuchung war eine Doppel-Buchung.
    }

    // Phase 2c: Kanzlei-Email wenn schon übergeben
    // B4-slice-1b: 'in_kommunikation_vs'/'abgelehnt' ergaenzt — sie liegen strikt NACH der
    // Kanzlei-Uebergabe. Ohne sie erfaehrt die Partnerkanzlei nichts vom Storno und arbeitet
    // an einem stornierten Fall weiter.
    const KANZLEI_RELEVANT = ['kanzlei-uebergeben', 'anschlussschreiben', 'regulierung', 'regulierung-laeuft', 'in_kommunikation_vs', 'abgelehnt', 'kanzlei', 'vs_kontakt']
    if (fallInfoStatus && KANZLEI_RELEVANT.includes(fallInfoStatus)) {
      const { data: kanzleiUsers } = await serviceClient.from('profiles').select('email').eq('rolle', 'kanzlei')
      for (const k of kanzleiUsers ?? []) {
        if (k.email) {
          const { emailKanzleiAuftragStorniert } = await import('@/lib/email')
          emailKanzleiAuftragStorniert(k.email, stornoClaimNummer ?? '', stornoGrund ?? '', fallInfoStatus).catch(() => {})
        }
      }
    }
  }

  if (newStatus === 'vs-abgelehnt') {
    await enqueue({
      dedupKey: buildDedupKey({ template: 'chat_fallback_kunde', claimId: fallId }),
      kanal: 'whatsapp',
      template: 'chat_fallback_kunde',
      claimId: fallId,
    }).catch(() => {})
    // CMM-44 SP-A: kundenbetreuer_id liegt auf claims (SSoT). CMM-49: via v_claim_full (flat, faelle-frei).
    const { data: fallInfo } = await serviceClient.from('v_claim_full').select('claim_nummer, kundenbetreuer_id').eq('fall_id', fallId).single()
    if (fallInfo?.kundenbetreuer_id) {
      createNotification(
        fallInfo.kundenbetreuer_id,
        'vs-abgelehnt',
        `VS Ablehnung — Fall ${fallInfo?.claim_nummer ?? fallId.slice(0, 8)}`,
        'Versicherung hat abgelehnt. Bitte Eskalations-Schritte einleiten.',
        `/faelle/${fallId}`,
      ).catch(() => {})
    }
  }

  revalidatePath('/dispatch/dashboard')
  revalidatePath(`/faelle/${fallId}`)
  return { ok: true }
}

// ─── Lead Status ────────────────────────────────────────────────────────────

// ─── Neuen Lead erstellen (BUG-14) ─────────────────────────────────────────

export async function createLead(data: {
  vorname: string
  nachname: string
  telefon: string
  email: string
  source_channel: string
  schadens_fall_typ?: string
  // KFZ-154: Spezifikation + Schadensart für Dispatcher-Match. Optional bei
  // schnellem Quick-Add (kann nachträglich via LeadInlineFields gesetzt werden)
  // oder beim manuellen Anlegen direkt mitgegeben werden.
  spezifikation?: string
  schadens_art?: string
  // AAR-90: optional FIN bei manuellem Lead-Anlegen → Cardentity-Anreicherung
  fin?: string
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  // Via zentrale createLead() (Writer-Konsistenz, leads-Audit 15.05.2026).
  // Liefert die leadId direkt zurück — vorher wurde der frisch angelegte Lead
  // per vorname/nachname-Query nachgeschlagen (fragil bei Namensgleichheit).
  const created = await insertLeadRow(
    supabase,
    {
      source_channel: data.source_channel || 'telefon',
      status: 'neu',
      vorname: data.vorname,
      nachname: data.nachname,
      telefon: data.telefon || null,
      email: data.email || null,
    },
    {
      schadens_fall_typ: data.schadens_fall_typ || null,
      spezifikation: data.spezifikation || null,
      schadens_art: data.schadens_art || null,
      fin: data.fin ? data.fin.toUpperCase() : null,
      qualifizierungs_phase: 'neu',
      kunden_konstellation: 'kk-01',
      zugewiesen_an: user.id,
    },
  )

  if (!created.ok) return { ok: false, error: created.error }

  // Phase 1: Lead-Tasks + Notification
  const leadId = created.leadId
  triggerLeadTasks(leadId, user.id).catch(() => {})
  createNotification(user.id, 'neuer-lead', `Neuer Lead: ${data.vorname} ${data.nachname}`, `${data.source_channel} · ${data.schadens_fall_typ || 'Kein Typ'}`, `/dispatch/leads/${leadId}`).catch(() => {})

  // Cardentity-Anreicherung feuert NICHT mehr automatisch bei Lead-Anlage —
  // kostenpflichtiger Abruf ist manuell ueber den Cardentity-Button abrufbar
  // (2026-05-31, Aaron-Entscheidung).

  revalidatePath('/dispatch/dashboard')
  return { ok: true }
}

// ─── KFZ-192: Service-Typ setzen ────────────────────────────────────────────

export async function updateServiceTyp(
  leadId: string,
  serviceTyp: 'komplett' | 'nur_gutachter',
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const { error } = await supabase
    .from('leads')
    .update({ service_typ: serviceTyp, updated_at: new Date().toISOString() })
    .eq('id', leadId)

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/dispatch/leads/${leadId}`)
  revalidatePath('/dispatch/dashboard')
  return { ok: true }
}

// ─── Lead → Kundenakte Konversion ───────────────────────────────────────────
// convertLeadToFall lebt in `@/lib/leads/convert-lead-to-fall` und wird hier
// NICHT mehr aufgerufen: der verwaiste Dispatcher-Wrapper `updateLeadStatus`
// (0 Caller) wurde entfernt. Konversion laeuft ueber den Kunde-Flow
// (`meldeNeuenSchaden`) bzw. die SA-Signatur im Flow — nicht ueber Dispatch.

// ─── E-Mail Notifications ───────────────────────────────────────────────────

async function triggerStatusEmail(supabase: Awaited<ReturnType<typeof createClient>>, fallId: string, status: string) {
  // CMM-44 SP-A2 (Cluster 1): schadenort_* aus claims (SSoT). CMM-49: alles flach aus
  // v_claim_full (faelle-frei, SSoT) statt faelle+claim_id-Embed. Der Body nutzt nur
  // sv_id/lead_id/claim_nummer/schadenort_* — alle in vcf flach.
  const { data: fall } = await supabase
    .from('v_claim_full')
    .select('sv_id, lead_id, claim_nummer, schadenort_adresse, schadenort_plz, schadenort_ort')
    .eq('fall_id', fallId)
    .single()
  if (!fall) return

  const fallNr = fall.claim_nummer ?? fallId.slice(0, 8)

  if (status === 'sv-zugewiesen' && fall.sv_id) {
    const { data: sv } = await supabase.from('sachverstaendige').select('profile_id').eq('id', fall.sv_id).single()
    const { data: profile } = sv ? await supabase.from('profiles').select('email').eq('id', sv.profile_id).single() : { data: null }
    if (profile?.email) {
      let kunde = '—'
      if (fall.lead_id) {
        const { data: lead } = await supabase.from('leads').select('vorname, nachname').eq('id', fall.lead_id).single()
        if (lead) kunde = `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() || '—'
      }
      const adr = [fall?.schadenort_adresse, fall?.schadenort_plz, fall?.schadenort_ort].filter(Boolean).join(', ') || '—'
      await emailSvZugewiesen(profile.email, fallNr, kunde, adr)
    }
  }

  if (status === 'gutachten-eingegangen') {
    const { data: admins } = await supabase.from('profiles').select('email').eq('rolle', 'admin')
    for (const a of admins ?? []) {
      if (a.email) await emailGutachtenEingegangen(a.email, fallNr)
    }
  }

  if (status === 'kanzlei-uebergeben') {
    const { data: kanzlei } = await supabase.from('profiles').select('email').eq('rolle', 'kanzlei')
    for (const k of kanzlei ?? []) {
      if (k.email) await emailFilmcheckBestanden(k.email, fallNr)
    }
  }

}
