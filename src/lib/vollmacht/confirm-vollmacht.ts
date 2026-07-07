// confirmVollmacht — server-internes Modul (KEIN 'use server'-Action-Endpoint).
//
// Security-Relocation (Route-Rollen-Gating-Audit-Handoff): die Funktion lag zuvor in
// src/app/flow/[token]/actions.ts — einem 'use server'-File, dessen JEDER Export ein
// aufrufbarer Server-Action-Endpoint ist. confirmVollmacht nimmt eine rohe fallId + den
// Admin-Client (RLS-Bypass) OHNE Ownership-/Token-Bindung -> latenter IDOR, falls je
// client-wired (jeder koennte fremde Faelle "vollmacht-signieren" + Termin bestaetigen).
// Der #3611-IDOR-Sweep hatte sie ausgelassen (nicht client-wired = tree-shaken).
// Beide Caller (kanzlei-wunsch/actions + lexdrive/process-event) sind server-intern mit
// getrusteter fallId -> die Funktion gehoert in ein normales Server-Modul, nicht in eine
// Action-Datei. Das entfernt die Action-Endpoint-Surface komplett (kein client-Invoke-Pfad,
// unabhaengig von Tree-Shaking). Verhalten unveraendert.

import { createAdminClient } from '@/lib/supabase/admin'

export async function confirmVollmacht(fallId: string): Promise<void> {
  const admin = createAdminClient()

  // Fall laden, um service_typ zu prüfen
  // CMM-44 SP-B PR2a: service_typ lebt auf claims (SSoT) — via claims-Embed.
  // CMM-49 (faelle-Drop-Runway): via v_claim_full (flat). vcf.id = claim_id; service_typ/lead_id flach.
  const { data: fall, error: fallErr } = await admin
    .from('v_claim_full')
    .select('id, service_typ, lead_id')
    .eq('fall_id', fallId)
    .single()

  if (fallErr || !fall) return
  const claimIdForVollmacht = (fall.id as string | null) ?? null
  const leadIdForVollmacht = (fall.lead_id as string | null) ?? null

  // Nur für 'komplett' — bei 'nur_gutachter' wurde Termin bereits bei SA bestätigt
  if (((fall.service_typ as string | null) ?? 'komplett') !== 'komplett') return

  // Aktiven Termin finden (status='reserviert')
  const { data: termin, error: terminErr } = await admin
    .from('gutachter_termine')
    .select('id')
    .eq('fall_id', fallId)
    .eq('status', 'reserviert')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (terminErr) {
    console.error('[confirmVollmacht] Termin-Query:', terminErr.message)
    return
  }
  if (!termin) return // Kein Termin vorhanden

  // Termin bestätigen
  const { bestaetigeTermin } = await import('@/lib/termine/bestaetigung')
  await bestaetigeTermin(termin.id)

  // Vollmacht-Unterschrift markieren (Bool-Semantik wird aus IS NOT NULL abgeleitet):
  // - `claims.vollmacht_signiert_am` = SSoT der Schadens-Welt (CMM-44 SP-B PR2b).
  // - `leads.vollmacht_datum` = CPA-/Provisions-Billing-Datum (gelesen in
  //   admin/finance/(hub) + lib/finance/abrechnungen-generator).
  // FIX: schrieb `vollmacht_datum` vorher auf `faelle` — die Spalte existiert dort
  // NICHT (pre-existing Drift, vgl. AAR-583 N6) -> stiller Fehlschlag, leads.vollmacht_datum
  // blieb leer -> CPA-auf-Vollmacht-Billing war tot. Jetzt auf `leads` via claims.lead_id,
  // set-once (erste Unterschrift zaehlt), beide Writes non-fatal (error-geloggt).
  const nowIso = new Date().toISOString()
  if (claimIdForVollmacht) {
    const { error: claimErr } = await admin.from('claims')
      .update({ vollmacht_signiert_am: nowIso })
      .eq('id', claimIdForVollmacht)
    if (claimErr) console.error('[confirmVollmacht] claims.vollmacht_signiert_am:', claimErr.message)
  }
  if (leadIdForVollmacht) {
    const { error: leadErr } = await admin.from('leads')
      .update({ vollmacht_datum: nowIso })
      .eq('id', leadIdForVollmacht)
      .is('vollmacht_datum', null)
    if (leadErr) console.error('[confirmVollmacht] leads.vollmacht_datum:', leadErr.message)
  }

  // KFZ-136: Reminder generieren
  try {
    const { generateReminderForTermin } = await import('@/lib/reminders/generate')
    await generateReminderForTermin(termin.id)
  } catch (err) { console.error('[KFZ-136] Reminder-Gen nach Vollmacht:', err) }

  // AAR-694b: Bei Komplettpaket war die Vollmacht der finale Trigger für den
  // Google-Kalender-Event. Jetzt nachschreiben (für alle aktiven Termine).
  import('@/lib/google-calendar/sv-event-sync').then(({ syncSvCalendarEventsForFall }) =>
    syncSvCalendarEventsForFall(fallId).catch((err) =>
      console.warn('[confirmVollmacht] syncSvCalendarEventsForFall:', err instanceof Error ? err.message : err),
    ),
  )

  // CalDAV-Paritaet: bei 'komplett' war die Vollmacht der finale Gate-Trigger — jetzt ist das
  // Datenschutz-Gate erfuellt, also den bestaetigten Termin auch in den CalDAV-Kalender
  // (Apple/Fastmail) schreiben. Non-critical, fire-and-forget.
  import('@/lib/kalender/caldav/sv-termin-sync').then(({ syncSvTerminToCalDav }) =>
    syncSvTerminToCalDav(termin.id).catch((err) =>
      console.warn('[confirmVollmacht] syncSvTerminToCalDav:', err instanceof Error ? err.message : err),
    ),
  )
}
