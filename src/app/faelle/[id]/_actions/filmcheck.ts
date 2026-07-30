'use server'

// AAR-684 Phase 2: Filmcheck + QC-Checkliste — aus dem Monolith extrahiert.
// Gruppe für QC-Prüfung durch KB:
// - upsertQcCheckliste: select→update-or-insert auf qc_checkliste
// - qcBestanden: ruft intern saveFilmcheck auf (Status-Übergang + Tasks + Mail)
// - qcNachbesserung: erzeugt SV-Task + WA + Email + Mitteilung
// - saveFilmcheck: setzt Mandatsnummer, Status 'kanzlei-uebergeben', Kanzlei-Mail

import { createClient } from '@/lib/supabase/server'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { revalidatePath } from 'next/cache'
import { emailFilmcheckBestanden } from '@/lib/email'
import { sendFallCommunication } from '@/lib/communications/send-fall'
import { triggerKanzleiPaketTask, triggerAsSendedatumTask, autoCompleteTask } from '@/lib/tasking'
import { createGutachterMitteilung } from '@/lib/mitteilungen'
import { checkFallAutoPhase } from '@/lib/autoPhase'
import { kundeHatBestaetigt } from '@/lib/faelle/onboarding-gate'
import { triggerSV05 } from '@/lib/gutachterTasking'
import { createNotification } from '@/lib/notifications'
import { transitionFallStatus } from '@/lib/faelle/state-machine'
import { can } from '@/lib/permissions/helpers'
import {
  qcChecklisteVollstaendig,
  fehlendeQcFelder,
  QC_FIELD_LABELS,
  type QcCheckValues,
} from '@/lib/qc/checkliste-validation'
import { kanzleiHandoffBereitsErfolgt, kanzleiHandoffMoeglich } from '@/lib/kanzlei/handoff-guard'

// Filmcheck-Audit 29.06.2026: serverseitiges Rollen-Gate fuer ALLE QC-Actions.
// Vorher pruefte jede Action nur "eingeloggt ja/nein" -> jeder authentifizierte
// User konnte (fuer einen sichtbaren Claim) das QC-Gate selbst bestehen + den
// Kanzlei-Handoff ausloesen. Gated jetzt auf can(rolle, 'dokumente.qc') = admin + KB
// (matrix.ts). Liefert die userId fuer geprueft_von/erstellt_von.
async function requireQcBerechtigung(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }
  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .maybeSingle()
  if (!can((profile?.rolle as string | null) ?? null, 'dokumente.qc')) {
    return { ok: false, error: 'Keine Berechtigung für die QC-Prüfung' }
  }
  return { ok: true, userId: user.id }
}

export async function saveFilmcheck(
  fallId: string,
  notizen: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const auth = await requireQcBerechtigung(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  // CMM-44 SP-I2: mandatsnummer-Generierung entfernt — claim_nummer ist die kanonische Fallnummer.
  // Die Kanzlei-Mandat-ID (Salesforce) kommt via mandatsnummer_vergeben-Webhook in kanzlei_faelle.
  // CMM-44 SP-H PR2: filmcheck_ok/_am/_notizen sind auf die auftraege-Sub-Tabelle
  // gewandert (Reader lesen sie von auftraege).
  // filmcheck_* auf den aktuellen Auftrag des Claims schreiben (ORDER BY
  // reihenfolge DESC LIMIT 1). Kein Auftrag/claim_id -> warn + skip.
  const claimId = await resolveClaimId(supabase, fallId)
  if (claimId) {
    const { data: aktAuftrag } = await supabase
      .from('auftraege')
      .select('id')
      .eq('claim_id', claimId)
      .order('reihenfolge', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (aktAuftrag) {
      const { error: auftragErr } = await supabase
        .from('auftraege')
        .update({
          filmcheck_ok: true,
          filmcheck_am: new Date().toISOString(),
          filmcheck_notizen: notizen || null,
        })
        .eq('id', aktAuftrag.id)
      if (auftragErr) return { success: false, error: auftragErr.message }
    } else {
      console.warn(`[CMM-44 SP-H] kein Auftrag fuer claim ${claimId} — filmcheck_* skip`)
    }
  } else {
    console.warn(`[CMM-44 SP-H] fall ${fallId} ohne claim_id — filmcheck_* skip`)
  }

  // service_typ-Gate (Aaron): nur 'komplett' wird an die Kanzlei uebergeben.
  // 'nur_gutachter' hat kein Mandat -> kein Kanzlei-Handoff (Status-Transition,
  // Kanzlei-Mails, Anschlussschreiben-Task, kanzlei_uebergabe-Communication).
  // checkFallAutoPhase (unten) progressed den Claim regulaer. Default true, damit
  // Faelle ohne aufloesbare claim_id das bisherige Verhalten behalten.
  let istKomplett = true
  let opStatus: string | null = null
  let saUnterschrieben: boolean | null = null
  if (claimId) {
    const { data: claimSvc } = await supabase.from('claims').select('service_typ, operative_status, sa_unterschrieben').eq('id', claimId).single()
    istKomplett = (claimSvc?.service_typ as string | null) !== 'nur_gutachter'
    opStatus = (claimSvc?.operative_status as string | null) ?? null
    saUnterschrieben = ((claimSvc as { sa_unterschrieben?: boolean | null } | null)?.sa_unterschrieben as boolean | null) ?? null
  }

  // Idempotenz (Filmcheck-Audit 29.06.2026): beide KB-Approve-Buttons (qcBestanden +
  // gibKanzleipaketFrei) routen durch saveFilmcheck. Handoff nur wenn noch nicht
  // uebergeben — sonst wuerfe transitionFallStatus (kanzlei-uebergeben -> kanzlei-
  // uebergeben ist kein gueltiger Uebergang) bei einem zweiten Klick.
  if (istKomplett && !kanzleiHandoffBereitsErfolgt(opStatus)) {
    // Robustheit (Filmcheck-Audit 01.07.2026): 'kanzlei-uebergeben' ist laut State-Machine
    // nur aus 'filmcheck'/'qc-pruefung' gueltig. Ein komplett-Claim, der noch davorhaengt
    // (z.B. 'begutachtung-laeuft' — Gutachten noch nicht abgegeben), wuerfe sonst in
    // transitionFallStatus einen ungueltigen Uebergang -> rohe 500 statt sauberem Toast.
    // Defense-in-depth: das QC-Gate in qcBestanden blockt den Regelfall schon vorher.
    if (!kanzleiHandoffMoeglich(opStatus)) {
      return {
        success: false,
        error:
          'Der Fall ist noch nicht im Filmcheck — die Übergabe an die Kanzlei ist erst nach vollständigem Gutachten möglich.',
      }
    }

    // P4 (Invariante Spec 3 §4): der Kanzlei-Handoff loest Anschlussschreiben/VS aus — erst
    // nach Kunden-Bestaetigung (sa_unterschrieben). Ein SV-Vermittlungs-Sofort-Claim haengt
    // vor filmcheck (AutoPhase-Gate), dieser Guard ist Defense-in-Depth gegen manuelle
    // Handoffs. Inert fuer Normalfall-Claims (am SA-Signing geboren; claimId-lose Faelle
    // behalten via null-Check unten das Alt-Verhalten NICHT — konservativ blocken nur bei
    // explizit vorhandenem Claim mit sa!=true).
    if (claimId && !kundeHatBestaetigt({ sa_unterschrieben: saUnterschrieben })) {
      return {
        success: false,
        error: 'Der Kunde hat noch nicht bestätigt — die Kanzlei-Übergabe ist blockiert.',
      }
    }

    // KFZ-202: Status via State-Machine
    await transitionFallStatus(fallId, 'kanzlei-uebergeben')

    // CMM-49: claims-direkt statt faelle-Embed (claimId via resolveClaimId oben)
    let fallNr = fallId.slice(0, 8)
    if (claimId) {
      const { data: claimInfo } = await supabase.from('claims').select('claim_nummer').eq('id', claimId).single()
      if (claimInfo?.claim_nummer) fallNr = claimInfo.claim_nummer
    }
    const { data: kanzleiUsers } = await supabase.from('profiles').select('email').eq('rolle', 'kanzlei')
    for (const k of kanzleiUsers ?? []) {
      if (k.email) emailFilmcheckBestanden(k.email, fallNr).catch(() => {})
    }

    // KFZ-137: Kanzlei Auftragszusammenfassung
    try {
      const { sendKanzleiAuftragszusammenfassung } = await import('@/lib/email/google/flows')
      for (const k of kanzleiUsers ?? []) {
        if (k.email) await sendKanzleiAuftragszusammenfassung(fallId, k.email)
      }
    } catch (err) { console.error('[KFZ-137] Kanzlei-Email fehlgeschlagen:', err) }

    await supabase.from('tasks').insert({
      fall_id: fallId,
      typ: 'kanzlei-anschlussschreiben',
      titel: 'Anschlussschreiben an Kanzlei senden',
      beschreibung: 'Automatisch erstellt nach abgeschlossenem Filmcheck.',
      status: 'offen',
    })

    sendFallCommunication(fallId, 'kanzlei_uebergabe').catch(() => {})
  }

  // CMM-49: claims-direkt (sv_id + claim_nummer claim-native)
  if (claimId) {
    const { data: claimForSv } = await supabase.from('claims').select('sv_id, claim_nummer').eq('id', claimId).single()
    if (claimForSv?.sv_id) {
      createGutachterMitteilung(claimForSv.sv_id, 'qc_bestanden', fallId, {
        claim_nummer: claimForSv.claim_nummer ?? undefined,
      }).catch(() => {})
    }
  }

  autoCompleteTask(fallId, 'qc_bestanden').catch(() => {})
  checkFallAutoPhase(fallId).catch(() => {})

  revalidatePath(`/faelle/${fallId}`)
  revalidatePath('/admin/faelle')
  revalidatePath('/admin/aufgaben/alle')
  return { success: true }
}

export async function upsertQcCheckliste(
  fallId: string,
  // AAR-170: Kommentar-Feld (string) neben booleans
  checks: Record<string, boolean | string | null>,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const auth = await requireQcBerechtigung(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  // CMM-49: qc_checkliste claim-nativ filtern; Insert behaelt fall_id (Trigger derive_claim_id fuellt claim_id)
  const claimId = await resolveClaimId(supabase, fallId)
  if (!claimId) return { success: false, error: 'Fall nicht gefunden' }

  const { data: existing } = await supabase
    .from('qc_checkliste')
    .select('id')
    .eq('claim_id', claimId)
    .single()

  if (existing) {
    const { error } = await supabase.from('qc_checkliste').update(checks).eq('claim_id', claimId)
    if (error) return { success: false, error: error.message }
  } else {
    const { error } = await supabase.from('qc_checkliste').insert({ fall_id: fallId, ...checks })
    if (error) return { success: false, error: error.message }
  }

  revalidatePath(`/faelle/${fallId}`)
  return { success: true }
}

export async function qcBestanden(
  fallId: string,
  kommentar: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const auth = await requireQcBerechtigung(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  // CMM-49: claim-nativ
  const claimId = await resolveClaimId(supabase, fallId)
  if (!claimId) return { success: false, error: 'Fall nicht gefunden' }

  const now = new Date().toISOString()
  const { data: existing } = await supabase
    .from('qc_checkliste')
    .select(
      'id, gutachten_vorhanden, gutachten_vollstaendig, fin_17_zeichen, schadenspositionen_erfasst, fotos_ausreichend, sa_vorhanden, vollmacht_vorhanden, kundendaten_vollstaendig, vorschaeden_beruecksichtigt',
    )
    .eq('claim_id', claimId)
    .single()

  // Filmcheck-Audit 29.06.2026: Gate haerten — vor der Kanzlei-Uebergabe muessen ALLE
  // Pflicht-Checks affirmativ auf true stehen (Nein/ungeprueft blockt). Die UI upsertet
  // den Checklisten-Stand direkt vor diesem Call; defense-in-depth weist auch einen
  // unvollstaendigen Direkt-Call ab. Verhindert Rubber-Stamping des QC-Gates.
  if (!existing || !qcChecklisteVollstaendig(existing as unknown as QcCheckValues)) {
    const offen = fehlendeQcFelder((existing ?? {}) as unknown as QcCheckValues)
      .map((f) => QC_FIELD_LABELS[f])
      .join(', ')
    return { success: false, error: `Bitte erst alle Pflicht-Checks bestätigen. Offen: ${offen}` }
  }

  const qcData = {
    status: 'bestanden',
    kommentar: kommentar || null,
    geprueft_von: auth.userId,
    geprueft_am: now,
  }

  await supabase.from('qc_checkliste').update(qcData).eq('claim_id', claimId)

  // Trigger Filmcheck-Flow (State-Machine + Mails + Tasks)
  const filmcheckResult = await saveFilmcheck(fallId, kommentar)
  if (!filmcheckResult.success) {
    return filmcheckResult
  }

  // CMM-44 SP-A / CMM-49: kundenbetreuer_id ist claims-nativ (claims = SSoT) — claims-direkt via claim_id.
  const { data: claimForTask } = await supabase
    .from('claims')
    .select('kundenbetreuer_id')
    .eq('id', claimId)
    .single()
  const fallForTaskKbId = (claimForTask?.kundenbetreuer_id as string | null) ?? null
  triggerKanzleiPaketTask(fallId, fallForTaskKbId).catch(() => {})
  triggerAsSendedatumTask(fallId, fallForTaskKbId).catch(() => {})
  return { success: true }
}

export async function qcNachbesserung(
  fallId: string,
  kommentar: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const auth = await requireQcBerechtigung(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  // CMM-49: claim-nativ
  const claimId = await resolveClaimId(supabase, fallId)
  if (!claimId) return { success: false, error: 'Fall nicht gefunden' }

  const now = new Date().toISOString()
  const { data: existing } = await supabase
    .from('qc_checkliste')
    .select('id')
    .eq('claim_id', claimId)
    .single()

  const qcData = {
    status: 'nachbesserung',
    kommentar: kommentar || null,
    geprueft_von: auth.userId,
    geprueft_am: now,
  }

  if (existing) {
    await supabase.from('qc_checkliste').update(qcData).eq('claim_id', claimId)
  } else {
    await supabase.from('qc_checkliste').insert({ fall_id: fallId, ...qcData })
  }

  // Filmcheck-Audit 29.06.2026: Reject-Marker auf den aktuellen Auftrag setzen
  // (vereinheitlicht mit weiseGutachtenZurueck/qc.ts). Damit zeigt der SV-Banner die
  // Rueckweisung UND gutachtenAbgeben erkennt den korrigierten Re-Upload (warReject)
  // -> der KB wird automatisch re-benachrichtigt (Loop geschlossen, s. qc.ts).
  // filmcheck_ok=false = "geprueft + nicht bestanden" (vs. null = nie geprueft).
  const { data: aktAuftragNb } = await supabase
    .from('auftraege')
    .select('id')
    .eq('claim_id', claimId)
    .order('reihenfolge', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (aktAuftragNb) {
    await supabase
      .from('auftraege')
      .update({
        filmcheck_ok: false,
        zurueckgewiesen_am: now,
        zurueckweisung_grund: kommentar || 'Nachbesserung angefordert',
      })
      .eq('id', aktAuftragNb.id)
  }

  // CMM-49: claims-direkt (sv_id + claim_nummer claim-native)
  const { data: claimInfo } = await supabase
    .from('claims')
    .select('sv_id, claim_nummer')
    .eq('id', claimId)
    .single()
  const fallNr = claimInfo?.claim_nummer ?? fallId.slice(0, 8)

  // KFZ-204: Task für SV mit profile_id (damit SV ihn im Portal sieht)
  let svProfileId: string | null = null
  if (claimInfo?.sv_id) {
    const { data: svd } = await supabase.from('sachverstaendige').select('profile_id').eq('id', claimInfo.sv_id).single()
    svProfileId = svd?.profile_id ?? null
  }

  await supabase.from('tasks').insert({
    fall_id: fallId,
    typ: 'filmcheck',
    titel: `Gutachten korrigieren für Fall ${fallNr}`,
    beschreibung: kommentar || 'Bitte Unterlagen nachbessern. Prüfe die Anmerkungen im Portal.',
    status: 'offen',
    prioritaet: 'dringend',
    zugewiesen_an: svProfileId,
  })

  await supabase.from('timeline').insert({
    fall_id: fallId,
    typ: 'system',
    titel: 'QC nicht bestanden — Nachbesserung angefordert',
    beschreibung: kommentar || null,
    erstellt_von: auth.userId,
  })

  if (claimInfo?.sv_id) {
    createGutachterMitteilung(claimInfo.sv_id, 'qc_nachbesserung', fallId, {
      kommentar: kommentar || undefined,
      claim_nummer: claimInfo.claim_nummer ?? undefined,
    }).catch(() => {})
  }

  if (svProfileId) {
    createNotification(
      svProfileId,
      'qc-fehlgeschlagen',
      `Gutachten nachbessern: Fall ${fallNr}`,
      kommentar || 'QC nicht bestanden. Bitte Anmerkungen im Portal prüfen.',
      `/gutachter/fall/${fallId}`,
    ).catch(() => {})
  }

  // Filmcheck-Audit 29.06.2026: KEINE Kunden-WhatsApp bei Nachbesserung mehr — das
  // Event 'nachbesserung_gutachten' war auf Template 'gutachten_fertig' (recipient
  // kunde) verdrahtet -> der Kunde bekam "Gutachten fertig", obwohl es zur Korrektur
  // zurueckging. QC-Iterationen sind ein interner SV<->KB-Loop (kein Kunden-Signal).

  if (svProfileId) {
    triggerSV05(fallId, svProfileId, kommentar || 'Nachbesserung erforderlich').catch(() => {})
  }

  // AAR-86: Email an SV mit QC-Kommentaren
  if (svProfileId) {
    const { data: svProfile } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', svProfileId)
      .single()
    if (svProfile?.email) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://claimondo.de'
      const fallUrl = `${baseUrl}/gutachter/fall/${fallId}`
      const { emailFilmcheckNichtBestanden } = await import('@/lib/email')
      emailFilmcheckNichtBestanden(svProfile.email, fallNr, kommentar || 'Bitte Anmerkungen im Portal pruefen', fallUrl).catch(() => {})
    }
  }

  revalidatePath(`/faelle/${fallId}`)
  revalidatePath('/admin/aufgaben/alle')
  return { success: true }
}
