'use server'

// AAR-684 Phase 2: Filmcheck + QC-Checkliste — aus dem Monolith extrahiert.
// Gruppe für QC-Prüfung durch KB:
// - upsertQcCheckliste: select→update-or-insert auf qc_checkliste
// - qcBestanden: ruft intern saveFilmcheck auf (Status-Übergang + Tasks + Mail)
// - qcNachbesserung: erzeugt SV-Task + WA + Email + Mitteilung
// - saveFilmcheck: setzt Mandatsnummer, Status 'kanzlei-uebergeben', Kanzlei-Mail

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { emailFilmcheckBestanden } from '@/lib/email'
import { sendFallCommunication } from '@/lib/communications/send-fall'
import { triggerKanzleiPaketTask, triggerAsSendedatumTask, autoCompleteTask } from '@/lib/tasking'
import { createGutachterMitteilung } from '@/lib/mitteilungen'
import { checkFallAutoPhase } from '@/lib/autoPhase'
import { triggerSV05 } from '@/lib/gutachterTasking'
import { createNotification } from '@/lib/notifications'
import { transitionFallStatus } from '@/lib/faelle/state-machine'

export async function saveFilmcheck(
  fallId: string,
  notizen: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  // Mandatsnummer generieren (CLM-YYYY-XXXX)
  const year = new Date().getFullYear()
  const { data: maxRow } = await supabase
    .from('faelle')
    .select('mandatsnummer')
    .like('mandatsnummer', `CLM-${year}-%`)
    .order('mandatsnummer', { ascending: false })
    .limit(1)
    .maybeSingle()

  let nextNum = 1
  if (maxRow?.mandatsnummer) {
    const match = maxRow.mandatsnummer.match(/(\d+)$/)
    if (match) nextNum = parseInt(match[1], 10) + 1
  }
  const mandatsnummer = `CLM-${year}-${String(nextNum).padStart(4, '0')}`

  // CMM-44 SP-H PR2: filmcheck_ok/_am/_notizen sind auf die auftraege-Sub-Tabelle
  // gewandert (Reader lesen sie von auftraege). mandatsnummer bleibt auf faelle.
  const { data: fallClaimRow, error } = await supabase
    .from('faelle')
    .update({ mandatsnummer })
    .eq('id', fallId)
    .select('claim_id')
    .single()

  if (error) return { success: false, error: error.message }

  // filmcheck_* auf den aktuellen Auftrag des Claims schreiben (ORDER BY
  // reihenfolge DESC LIMIT 1). Kein Auftrag/claim_id -> warn + skip.
  const claimId = (fallClaimRow?.claim_id as string | null) ?? null
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

  // KFZ-202: Status via State-Machine
  await transitionFallStatus(fallId, 'kanzlei-uebergeben')

  const { data: fallInfo } = await supabase.from('faelle').select('claims:claim_id(claim_nummer)').eq('id', fallId).single()
  const fallInfoClaim = fallInfo ? (Array.isArray(fallInfo.claims) ? fallInfo.claims[0] : fallInfo.claims) : null
  const fallNr = fallInfoClaim?.claim_nummer ?? fallId.slice(0, 8)
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

  const { data: fallForSv } = await supabase.from('faelle').select('sv_id, claims:claim_id(claim_nummer)').eq('id', fallId).single()
  const fallForSvClaim = fallForSv ? (Array.isArray(fallForSv.claims) ? fallForSv.claims[0] : fallForSv.claims) : null
  if (fallForSv?.sv_id) {
    createGutachterMitteilung(fallForSv.sv_id, 'qc_bestanden', fallId, {
      claim_nummer: fallForSvClaim?.claim_nummer ?? undefined,
    }).catch(() => {})
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
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { data: existing } = await supabase
    .from('qc_checkliste')
    .select('id')
    .eq('fall_id', fallId)
    .single()

  if (existing) {
    const { error } = await supabase.from('qc_checkliste').update(checks).eq('fall_id', fallId)
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
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const now = new Date().toISOString()
  const { data: existing } = await supabase
    .from('qc_checkliste')
    .select('id')
    .eq('fall_id', fallId)
    .single()

  const qcData = {
    status: 'bestanden',
    kommentar: kommentar || null,
    geprueft_von: user.id,
    geprueft_am: now,
  }

  if (existing) {
    await supabase.from('qc_checkliste').update(qcData).eq('fall_id', fallId)
  } else {
    await supabase.from('qc_checkliste').insert({ fall_id: fallId, ...qcData })
  }

  // Trigger Filmcheck-Flow (State-Machine + Mails + Tasks)
  const filmcheckResult = await saveFilmcheck(fallId, kommentar)
  if (!filmcheckResult.success) {
    return filmcheckResult
  }

  // CMM-44 SP-A: kundenbetreuer_id ist claims-Duplikat-Spalte (claims = SSoT)
  // -> via claim_id aus claims nested embed laden statt aus faelle.
  const { data: fallForTask } = await supabase
    .from('faelle')
    .select('claims:claim_id(kundenbetreuer_id)')
    .eq('id', fallId)
    .single()
  const fallForTaskClaim = Array.isArray(fallForTask?.claims) ? fallForTask.claims[0] : fallForTask?.claims
  const fallForTaskKbId = (fallForTaskClaim?.kundenbetreuer_id as string | null) ?? null
  triggerKanzleiPaketTask(fallId, fallForTaskKbId).catch(() => {})
  triggerAsSendedatumTask(fallId, fallForTaskKbId).catch(() => {})
  return { success: true }
}

export async function qcNachbesserung(
  fallId: string,
  kommentar: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const now = new Date().toISOString()
  const { data: existing } = await supabase
    .from('qc_checkliste')
    .select('id')
    .eq('fall_id', fallId)
    .single()

  const qcData = {
    status: 'nachbesserung',
    kommentar: kommentar || null,
    geprueft_von: user.id,
    geprueft_am: now,
  }

  if (existing) {
    await supabase.from('qc_checkliste').update(qcData).eq('fall_id', fallId)
  } else {
    await supabase.from('qc_checkliste').insert({ fall_id: fallId, ...qcData })
  }

  const { data: fallInfo } = await supabase
    .from('faelle')
    .select('sv_id, claims:claim_id(claim_nummer)')
    .eq('id', fallId)
    .single()

  const fallInfoClaim = fallInfo ? (Array.isArray(fallInfo.claims) ? fallInfo.claims[0] : fallInfo.claims) : null
  const fallNr = fallInfoClaim?.claim_nummer ?? fallId.slice(0, 8)

  // KFZ-204: Task für SV mit profile_id (damit SV ihn im Portal sieht)
  let svProfileId: string | null = null
  if (fallInfo?.sv_id) {
    const { data: svd } = await supabase.from('sachverstaendige').select('profile_id').eq('id', fallInfo.sv_id).single()
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
    erstellt_von: user.id,
  })

  if (fallInfo?.sv_id) {
    createGutachterMitteilung(fallInfo.sv_id, 'qc_nachbesserung', fallId, {
      kommentar: kommentar || undefined,
      claim_nummer: fallInfoClaim?.claim_nummer ?? undefined,
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

  sendFallCommunication(fallId, 'nachbesserung_gutachten').catch(() => {})

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
