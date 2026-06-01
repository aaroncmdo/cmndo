'use server'

// AAR-940 Phase 2: Token-validierte Self-Service-Strecke /anfrage/[token].
// Anon-Route — kein Login. Token = gutachter_finder_anfragen.self_service_token.
// Promotion Anfrage->Lead beim Klick (service_role, anon schreibt nie in leads).
// Muster: /kunde-termin/[token] (createAdminClient, Token+Expiry-Gate).

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { createLead } from '@/lib/leads/create-lead'
import { bewerteSchuldfrage } from '@/lib/self-service/quali-gate'
import { matchAndSlots, type OeffentlichesSvProfil } from '@/lib/sv-matching-modul'
import { signSAandCreateFall, createKundeAccount } from '@/app/flow/[token]/actions'
import { groupFelderByTarget } from '@/lib/onboarding/group-felder-by-target'
import type { OnboardingFeld } from '@/components/onboarding/types'

// leads_schadentyp_check erlaubt nur diese Werte (sonst CHECK-Violation).
const SCHADENTYP_ALLOWED = new Set([
  'spurwechsel',
  'auffahrunfall',
  'vorfahrtsverletzung',
  'parkplatz',
  'sonstiges',
])

/**
 * Laedt + validiert die Anfrage per self_service_token (+ Expiry). service_role.
 * self_service_token-Spalten sind (noch) nicht in database.types -> Cast.
 */
async function ladeAnfrageByToken(token: string): Promise<{
  admin: ReturnType<typeof createAdminClient> | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  anfrage: any | null
  error?: string
}> {
  if (!token) return { admin: null, anfrage: null, error: 'Kein Token.' }
  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (admin as any)
    .from('gutachter_finder_anfragen')
    .select('*')
    .eq('self_service_token', token)
    .maybeSingle()
  if (!data) return { admin, anfrage: null, error: 'Dieser Link ist ungültig.' }
  const exp = data.self_service_token_expires_at as string | null
  if (!exp || new Date(exp).getTime() < Date.now()) {
    return { admin, anfrage: null, error: 'Dieser Link ist abgelaufen.' }
  }
  return { admin, anfrage: data }
}

/** Liest die kundensichtbaren Anfrage-Basics fuer die Landing (Token-Gate). */
export async function getAnfrageByToken(token: string): Promise<{
  data: { vorname: string | null; bereitsKonvertiert: boolean } | null
  error?: string
}> {
  const { anfrage, error } = await ladeAnfrageByToken(token)
  if (!anfrage) return { data: null, error }
  return {
    data: {
      vorname: (anfrage.vorname as string | null) ?? null,
      bereitsKonvertiert: !!anfrage.konvertiert_zu_lead_id,
    },
  }
}

/**
 * Promotion beim FlowLink-Klick: Anfrage -> Lead via service_role. Idempotent
 * (schon promotet -> bestehender Lead). Anfrage bleibt read-only Capture, nur
 * der Marker (konvertiert_zu_lead_id/status) wird gesetzt. KEIN Fall/Account —
 * der entsteht erst in Phase 4 via signSAandCreateFall nach SA.
 */
export async function promoteAnfrageZuLead(
  token: string,
): Promise<{ ok: boolean; leadId?: string; error?: string }> {
  const { admin, anfrage, error } = await ladeAnfrageByToken(token)
  if (!admin || !anfrage) return { ok: false, error: error ?? 'Dieser Link ist ungültig.' }

  // Idempotenz: schon promotet -> bestehenden Lead zurueck.
  if (anfrage.konvertiert_zu_lead_id) {
    return { ok: true, leadId: anfrage.konvertiert_zu_lead_id as string }
  }

  const vorname = (anfrage.vorname as string | null) ?? ''
  const nachname = (anfrage.nachname as string | null) ?? ''
  const rawSchadentyp = (anfrage.schadentyp as string | null) ?? 'sonstiges'
  const schadentyp = SCHADENTYP_ALLOWED.has(rawSchadentyp) ? rawSchadentyp : 'sonstiges'

  const created = await createLead(
    admin,
    {
      source_channel: 'self_service',
      status: 'quali-offen',
      vorname,
      nachname,
      telefon: (anfrage.telefon as string | null) ?? null,
      email: (anfrage.email as string | null) ?? null,
    },
    {
      schadentyp,
      schadens_hergang:
        (anfrage.schadens_kurzbeschreibung as string | null) ??
        (anfrage.schadenort as string | null) ??
        null,
      fahrzeug_standort_lat: (anfrage.schadenort_lat as number | null) ?? null,
      fahrzeug_standort_lng: (anfrage.schadenort_lng as number | null) ?? null,
      fahrzeug_standort_adresse:
        (anfrage.besichtigungsort_adresse as string | null) ??
        (anfrage.schadenort as string | null) ??
        null,
      fin: (anfrage.fin_vin as string | null) ?? null,
      kennzeichen: (anfrage.kennzeichen as string | null) ?? null,
      hsn: (anfrage.hsn as string | null) ?? null,
      tsn: (anfrage.tsn as string | null) ?? null,
      fahrzeug_hersteller: (anfrage.fahrzeug_hersteller as string | null) ?? null,
      fahrzeug_modell: (anfrage.fahrzeug_modell as string | null) ?? null,
      fahrzeug_baujahr: (anfrage.fahrzeug_baujahr as number | null) ?? null,
      wunschtermin: (anfrage.wunschtermin as string | null) ?? null,
      qualifizierungs_phase: 'erstkontakt',
      ga_client_id: (anfrage.ga_client_id as string | null) ?? null,
    },
  )
  if (!created.ok) return { ok: false, error: created.error }

  // Anfrage-Marker (Anfrage = read-only Capture; nur Verweis + Status).
  const { error: markErr } = await admin
    .from('gutachter_finder_anfragen')
    .update({
      konvertiert_zu_lead_id: created.leadId,
      konvertiert_am: new Date().toISOString(),
      status: 'konvertiert',
    })
    .eq('id', anfrage.id as string)
  if (markErr) {
    // Lead existiert bereits — Marker ist Best-effort, nicht hart fehlschlagen.
    console.error('[promoteAnfrageZuLead] Anfrage-Marker fehlgeschlagen:', markErr)
  }

  return { ok: true, leadId: created.leadId }
}

/**
 * Beauftragung (Y-Modell, flow_key='beauftragung') — generischer Per-Phase-Save.
 * Schreibt die DynamicWizard-Feldwerte EINER Phase auf den (promoteten) Lead.
 * Token-validiert + service_role: `leads` ist anon-RLS-gesperrt, der Beauftragung-
 * Save darf also NICHT der anon `saveOnboardingStep`-Pfad sein (s. Spec §6 Constraint 1).
 *
 * Routing via db_target: in der Beauftragung landen Werte auf `leads` (der Lead wird
 * Feld-fuer-Feld vollstaendig). `allowedTables={leads}` ist die harte Sicherheitsgrenze —
 * ein manipuliertes db_target kann nie auf eine fremde Tabelle zielen. Die Gruppierung
 * selbst ist der geteilte, getestete `groupFelderByTarget`-Helper.
 *
 * `phaseKey` = Kontext fuer den Caller (WizardClient-Save-Adapter, P1c); die uebergebene
 * Feld-Liste scopt den Save bereits auf die aktuelle Phase. Phasen ohne leads-Felder
 * (reine Info-/UI-Phasen) sind ein No-op mit { ok: true }.
 */
export async function speichereBeauftragungStep(
  token: string,
  phaseKey: string,
  values: Record<string, unknown>,
  felder: OnboardingFeld[],
): Promise<{ ok: boolean; error?: string }> {
  const { admin, anfrage, error } = await ladeAnfrageByToken(token)
  if (!admin || !anfrage) return { ok: false, error: error ?? 'Dieser Link ist ungültig.' }

  const leadId = (anfrage.konvertiert_zu_lead_id as string | null) ?? null
  if (!leadId) return { ok: false, error: 'Vorgang wurde noch nicht gestartet.' }

  const grouped = groupFelderByTarget(felder, values, { allowedTables: new Set(['leads']) })
  const leadPayload = grouped.leads
  if (!leadPayload || Object.keys(leadPayload).length === 0) {
    // Phase ohne leads-Felder (reine Info/UI-Phase) — nichts zu persistieren.
    return { ok: true }
  }

  const { data: updated, error: updErr } = await admin
    .from('leads')
    .update(leadPayload)
    .eq('id', leadId)
    .select('id')
  if (updErr) return { ok: false, error: updErr.message }
  if (!updated || updated.length === 0) return { ok: false, error: 'Vorgang nicht gefunden.' }

  // phaseKey ist Teil des Save-Adapter-Kontrakts (P1c) — aktuell rein informativ.
  void phaseKey

  revalidatePath('/dispatch/leads')
  return { ok: true }
}

/**
 * Phase 3: Selbst-Quali — speichert die Schuldfrage-Antwort auf dem (promoteten)
 * Lead und wendet das Gate an (Policy: nur Eigenverschulden disqualifiziert).
 *   abbruch (eigenverantwortung) -> Lead disqualifiziert, KEIN Termin.
 *   weiter / weiter_mit_flag      -> Lead bleibt quali-offen; 'unklar'/Anomalie
 *                                    wird per Notiz fuer den Dispatcher geflaggt.
 * service_role (Token-validiert). Adversarial: jeder Nicht-eigenverantwortung-Wert
 * fuehrt weiter (siehe bewerteSchuldfrage-Tests).
 */
export async function speichereQuali(
  token: string,
  schuldfrage: string,
): Promise<{ ok: boolean; ergebnis?: 'weiter' | 'abbruch'; error?: string }> {
  const { admin, anfrage, error } = await ladeAnfrageByToken(token)
  if (!admin || !anfrage) return { ok: false, error: error ?? 'Dieser Link ist ungültig.' }

  const leadId = (anfrage.konvertiert_zu_lead_id as string | null) ?? null
  if (!leadId) return { ok: false, error: 'Vorgang wurde noch nicht gestartet.' }

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

  // weiter / weiter_mit_flag: Schuldfrage persistieren; bei Flag eine Dispatcher-Notiz.
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
 * Phase 4: SV-Matching fuer den (promoteten) Lead. Liefert AUSSCHLIESSLICH die
 * kundensichere OeffentlichesSvProfil-Projektion (matchAndSlots = Leak-sicher).
 * SV-Weiche: zugeordneter_sv_id NULL (self-service-eligible) => globales Matching.
 */
export async function ladeMatching(
  token: string,
): Promise<{ ok: boolean; svs?: OeffentlichesSvProfil[]; error?: string }> {
  const { admin, anfrage, error } = await ladeAnfrageByToken(token)
  if (!admin || !anfrage) return { ok: false, error: error ?? 'Dieser Link ist ungültig.' }

  const leadId = (anfrage.konvertiert_zu_lead_id as string | null) ?? null
  if (!leadId) return { ok: false, error: 'Vorgang wurde noch nicht gestartet.' }

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

  // self-service-eligible (native/Cluster-LP) => zugeordneter_sv_id NULL => global.
  const fixerSvId = (anfrage.zugeordneter_sv_id as string | null) ?? null
  const svs = await matchAndSlots({
    lat: Number(lat),
    lng: Number(lng),
    wunschterminIso: (lead.wunschtermin as string | null) ?? null,
    fixerSvId,
  })
  return { ok: true, svs }
}

/**
 * Phase 4: Self-Service-Termin reservieren. Setzt NUR lead_id auf gutachter_termine
 * (claim-korrekt, 31.05.-Befund) — signSAandCreateFall findet via lead_id, setzt
 * fall_id, Trigger fuellt claim_id. Konflikt-Check (Race) + Idempotenz (alte
 * Reservierung dieses Leads stornieren bei Re-Auswahl). start/end = Wall-Clock
 * wie SlotField/reserviereSlot-Konvention. SV-Notify laeuft via signSAandCreateFall (SA).
 */
export async function bucheTermin(
  token: string,
  svId: string,
  startIso: string,
  endIso: string,
): Promise<{ ok: boolean; terminId?: string; error?: string }> {
  if (!svId || !startIso || !endIso) return { ok: false, error: 'Termin-Daten fehlen.' }
  const { admin, anfrage, error } = await ladeAnfrageByToken(token)
  if (!admin || !anfrage) return { ok: false, error: error ?? 'Dieser Link ist ungültig.' }

  const leadId = (anfrage.konvertiert_zu_lead_id as string | null) ?? null
  if (!leadId) return { ok: false, error: 'Vorgang wurde noch nicht gestartet.' }

  // Konflikt-Check: SV im Zeitfenster bereits belegt (Race zwischen Match + Buchung)?
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

  // Idempotenz: offene Reservierung dieses Leads stornieren (Re-Auswahl eines Slots).
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

/**
 * Phase 4: SA-Unterschrift -> Fall/Claim. Reuse signSAandCreateFall (claim-nativ:
 * convertLeadToClaim, schreibt SSoT auf claims, faelle-Bridge automatisch).
 * Findet den reservierten Termin via lead_id, bestaetigt ihn, erzeugt Claim.
 * flowLinkId=null: Self-Service nutzt GFA-Token, keinen flow_links-Eintrag.
 */
export async function unterschreibeUndErstelleFall(
  token: string,
  signatureDataUrl: string,
): Promise<{ ok: boolean; fallId?: string; magicLink?: string | null; error?: string }> {
  if (!signatureDataUrl || signatureDataUrl.length < 100) {
    return { ok: false, error: 'Bitte unterschreiben Sie zuerst.' }
  }
  const { admin, anfrage, error } = await ladeAnfrageByToken(token)
  if (!admin || !anfrage) return { ok: false, error: error ?? 'Dieser Link ist ungültig.' }

  const leadId = (anfrage.konvertiert_zu_lead_id as string | null) ?? null
  if (!leadId) return { ok: false, error: 'Vorgang wurde noch nicht gestartet.' }

  const r = await signSAandCreateFall(leadId, signatureDataUrl, null)
  if (!r.ok) return { ok: false, error: r.error }

  // Anfrage-Marker: Fall-Verweis (Anfrage bleibt read-only Capture).
  await admin
    .from('gutachter_finder_anfragen')
    .update({ konvertiert_zu_fall_id: r.fallId })
    .eq('id', anfrage.id as string)

  // Kunden-Account + Welcome-Magic-Link (Portalzugang). Non-fatal: der Fall
  // existiert bereits; ein Account-Fehler darf den Abschluss nicht brechen.
  let magicLink: string | null = null
  try {
    const { data: lead } = await admin
      .from('leads')
      .select('email, vorname, nachname, telefon')
      .eq('id', leadId)
      .maybeSingle()
    const email = (lead?.email as string | null) ?? null
    if (email) {
      const acc = await createKundeAccount(
        r.fallId,
        email,
        (lead?.vorname as string | null) ?? '',
        (lead?.nachname as string | null) ?? '',
        (lead?.telefon as string | null) ?? null,
      )
      if (acc.success) magicLink = acc.magicLink
    }
  } catch (err) {
    console.error('[unterschreibeUndErstelleFall] Account-Anlage (non-fatal):', err)
  }

  return { ok: true, fallId: r.fallId, magicLink }
}
