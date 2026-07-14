'use server'

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { FINANCE } from '@/lib/finance/constants'
// Alias: die exportierte Server-Action in dieser Datei heißt selbst `createLead`.
import { createLead as insertLeadRow } from '@/lib/leads/create-lead'
import { createNotification } from '@/lib/notifications'
import { triggerSV01, triggerSV04 } from '@/lib/gutachterTasking'
import {
  emailSvZugewiesen,
  emailGutachtenEingegangen,
  emailFilmcheckBestanden,
} from '@/lib/email'
import { sendFallCommunication } from '@/lib/communications/send-fall'
import { triggerKonversionTasks, triggerGutachterTerminTask, triggerGutachtenUploadTask, triggerQcTask, triggerLeadTasks, triggerOnboardingTasks, resolveGates, autoCompleteTask, triggerKanzleiPaketTask, triggerAsSendedatumTask, triggerArchivierungTask } from '@/lib/tasking'
import { createGutachterMitteilung } from '@/lib/mitteilungen'
import { transitionFallStatus } from '@/lib/faelle/state-machine'
import { aktuellerTerminFuerFall } from '@/lib/termine/aktueller-termin-fuer-fall'
import { ensureCanonicalFlowLinkForLead } from '@/lib/start-link/ensure-flowlink-for-lead'
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
    sendFallCommunication(fallId, 'sv_losgefahren').catch(() => {})
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
    sendFallCommunication(fallId, 'termin_bestaetigt').catch(() => {})
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
    sendFallCommunication(fallId, 'regulierung_angekuendigt').catch(() => {})
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
    sendFallCommunication(fallId, 'fall_abgeschlossen').catch(() => {})
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
    sendFallCommunication(fallId, 'kanzlei_uebergabe').catch(() => {})
    if (fallInfo?.sv_id) {
      createGutachterMitteilung(fallInfo.sv_id, 'qc_bestanden', fallId, {
        claim_nummer: fallInfo?.claim_nummer ?? undefined,
      }).catch(() => {})
    }
  }
  if (newStatus === 'anschlussschreiben') {
    sendFallCommunication(fallId, 'as_gesendet').catch(() => {})
    autoCompleteTask(fallId, 'as_sendedatum_gesetzt').catch(() => {})
  }
  if (newStatus === 'zahlung-eingegangen') {
    sendFallCommunication(fallId, 'zahlung_eingegangen').catch(() => {})
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
      .select('claims:claim_id(sv_id, claim_nummer, operative_status, auftraege(storno_grund))')
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
    sendFallCommunication(fallId, 'termin_storniert').catch(() => {})

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
    sendFallCommunication(fallId, 'chat_fallback_kunde').catch(() => {})
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

  // AAR-92: Maik-Provision tracken bei Google-Ads/SEA Leads
  if (data.source_channel === 'google-ads' || data.source_channel === 'sea') {
    const monat = new Date().toISOString().slice(0, 7)
    await supabase.from('provisionen_maik').insert({
      lead_id: leadId,
      monat,
      basis_provision: FINANCE.CPA_MARKETING_NETTO,
      source_channel: data.source_channel,
      status: 'pending',
    }).then(({ error }) => { if (error) console.error('[AAR-92] Provision-Insert:', error.message) })
  }

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

// ─── Flow-Link ──────────────────────────────────────────────────────────────

type SendFlowLinkResult =
  | { ok: true; token: string; url: string }
  | { ok: false; error: string }

export async function sendFlowLink(leadId: string): Promise<SendFlowLinkResult> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const { data: lead } = await supabase
    .from('leads')
    .select('id, vorname, nachname, telefon, service_typ')
    .eq('id', leadId)
    .single()

  if (!lead) return { ok: false, error: 'Lead nicht gefunden' }

  // KFZ-192: service_typ aus Lead in FlowLink kopieren
  const serviceTyp = (lead as Record<string, unknown>).service_typ as string ?? 'komplett'

  // AAR-956: EIN Lead = EIN Link — kanonische idempotente Brücke statt eigenem
  // flow_links-Insert (reuse bestehender gültiger Link, sonst neu).
  const flRes = await ensureCanonicalFlowLinkForLead(leadId, { serviceTyp })
  if (!flRes.ok) return { ok: false, error: `Flow-Link Erstellung fehlgeschlagen: ${flRes.error}` }
  const token = flRes.token

  // AAR-52: FlowLink per WhatsApp an Kunden senden
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://claimondo.de'
  const flowUrl = `${baseUrl}/flow/${token}`

  // AAR-116 Hardening: Lead-Status wird erst NACH erfolgreichem WA-Send aktualisiert
  // (siehe unten). Ohne Termin gibt es keinen WA-Send und der Lead bleibt in der
  // vorherigen Phase — sonst zeigt er "flow-versendet" obwohl keine Nachricht
  // angekommen ist (KFZ-Bug 14.04.2026, DB-Evidenz siehe AAR-116).

  if (lead.telefon) {
    // AAR-116: Template flowlink_versand erwartet 6 Variablen (Vorname, SV-Vorname,
    // SV-Nachname, Datum, Uhrzeit, FlowLink-URL). Wir suchen den reservierten
    // Gutachter-Termin zum Lead und liefern alle Felder. Ohne Termin waere das
    // Template leer und Twilio wuerde die Nachricht mit leeren Placeholdern rendern.
    // CMM-49 (sv_id-Drop): der sachverstaendige-Embed lief über die gutachter_termine.sv_id-FK
    // (bricht beim DROP COLUMN sv_id) → assignee_id + separater sachverstaendige-Lookup
    // (value-identisch für SV-Termine; typ-Guard schließt kb_beratung aus).
    const { data: terminRaw } = await supabase
      .from('gutachter_termine')
      // AAR-956: Self-Service-Termine sind bezug-nativ (lead_id NULL) -> Dual-Lookup mitfinden
      // (sitzt auf #2644 assignee_id/assignee_typ auf — Profil-Lookup separat unten).
      .select('start_zeit, assignee_id, assignee_typ')
      .or(`lead_id.eq.${leadId},and(bezug_typ.eq.lead,bezug_id.eq.${leadId})`)
      .in('status', ['reserviert', 'bestaetigt'])
      .order('start_zeit', { ascending: true })
      .limit(1)
      .maybeSingle()
    const termin = terminRaw as { start_zeit: string; assignee_id: string | null; assignee_typ: string | null } | null
    let profile: { vorname: string | null; nachname: string | null } | null = null
    if (termin?.assignee_id && termin.assignee_typ === 'sachverstaendiger') {
      const { data: sv } = await supabase
        .from('sachverstaendige')
        .select('profile_id, profiles!sachverstaendige_profile_id_fkey(vorname, nachname)')
        .eq('id', termin.assignee_id)
        .maybeSingle()
      // Nested-FK-Relations kommen je nach Cardinality als Array ODER Objekt zurück.
      const profileRaw = (sv as { profiles: unknown } | null)?.profiles
      profile = (Array.isArray(profileRaw) ? profileRaw[0] : profileRaw) as
        | { vorname: string | null; nachname: string | null }
        | null
      // AAR-607 B2: Wenn Nested-FK leer ist, Profile separat per profile_id laden.
      if (!profile && sv?.profile_id) {
        const { data: p } = await supabase
          .from('profiles')
          .select('vorname, nachname')
          .eq('id', sv.profile_id as string)
          .maybeSingle()
        profile = p
      }
    }
    const svVorname = profile?.vorname ?? ''
    const svNachname = profile?.nachname ?? ''
    if (termin && !svVorname && !svNachname) {
      console.warn('[sendFlowLink] SV-Name nicht auflösbar für Termin', { leadId, svId: termin.assignee_id })
    }
    const terminDate = termin?.start_zeit ? new Date(termin.start_zeit) : null
    const datum = terminDate ? terminDate.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) : ''
    const uhrzeit = terminDate
      ? terminDate.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })
      : ''

    if (!termin) {
      console.warn('[sendFlowLink] Kein reservierter Gutachter-Termin für Lead', leadId, '— WhatsApp übersprungen (AAR-115 notwendig)')
    } else {
      try {
        const { sendCommunication } = await import('@/lib/communications/send')
        await sendCommunication('flowlink_versand', {
          telefon: lead.telefon,
          vorname: lead.vorname ?? '',
          '1': lead.vorname ?? '',
          '2': svVorname,
          '3': svNachname,
          '4': datum,
          '5': uhrzeit,
          '6': flowUrl,
        })
        // AAR-67: wa_gesendet=true NUR bei erfolgreichem WA-Send
        // AAR-116 Hardening: Lead-Status erst HIER setzen (nach bestätigtem WA-Send),
        // damit ein fehlgeschlagener Send den Lead nicht in 'flow-versendet' hängen lässt.
        await supabase.from('leads').update({
          wa_gesendet: true,
          status: 'flow-gesendet',
          qualifizierungs_phase: 'flow-versendet',
        }).eq('id', leadId)
        // Timeline-Eintrag: FlowLink versendet
        await supabase.from('timeline').insert({
          fall_id: null,
          typ: 'system',
          titel: 'FlowLink versendet',
          beschreibung: `Per WhatsApp an ${lead.telefon} — SV ${svVorname} ${svNachname} am ${datum} ${uhrzeit}`,
          erstellt_von: user.id,
        }).then(() => {}, () => {})
      } catch (err) {
        console.error('[sendFlowLink] WA-Send fehlgeschlagen:', err)
        // wa_gesendet + qualifizierungs_phase bleiben unverändert — Token ist aber
        // gültig, kann manuell erneut gesendet werden
      }
    }
  }
  revalidatePath('/dispatch/dashboard')
  revalidatePath(`/dispatch/leads/${leadId}`)

  return { ok: true, token, url: flowUrl }
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
