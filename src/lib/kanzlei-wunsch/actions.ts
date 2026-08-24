'use server'

// CMM-32 Polish: Kanzlei-Wunsch-Workflow.
//   - setKanzleiWunsch (KB/Admin): toggelt zwischen Komplettservice und
//     eigene Kanzlei
//   - updateKanzleiAnsprechpartner (Kunde, sofern eigene_kanzlei):
//     Kunde traegt Email/Name/Telefon der eigenen Kanzlei ein
//   - versendeKanzleiPaketAnEigeneKanzlei (Kunde): triggert Email mit
//     Gutachten + Stammdaten an die externe Kanzlei, setzt
//     kanzlei_uebergeben_am und claim.status='an_externe_kanzlei_uebergeben'
//     → Lifecycle springt auf Abschluss, wir kuemmern uns nicht weiter um
//     die Kommunikation.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { revalidatePath } from 'next/cache'

type KanzleiWunsch =
  | 'partnerkanzlei'
  | 'eigene_kanzlei'
  | 'keine_kanzlei'
  | 'noch_unentschieden'
  | 'nicht_gefragt'

async function requireKundeOfClaim(claimId: string): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string }
> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }
  const admin = createAdminClient()
  const { data: claim } = await admin
    .from('claims')
    .select('geschaedigter_user_id')
    .eq('id', claimId)
    .maybeSingle()
  if (!claim) return { ok: false, error: 'Claim nicht gefunden' }
  if (claim.geschaedigter_user_id !== user.id) {
    // Admin/KB darf auch — pragmatischer Override
    const { data: profile } = await supabase
      .from('profiles')
      .select('rolle')
      .eq('id', user.id)
      .maybeSingle()
    if (!profile || !['admin', 'kundenbetreuer'].includes(profile.rolle as string)) {
      return { ok: false, error: 'Nur der Geschaedigte oder Admin/KB' }
    }
  }
  return { ok: true, userId: user.id }
}

function revalidateClaim(_claimId: string, fallId: string | null) {
  if (fallId) {
    revalidatePath(`/faelle/${fallId}`)
    revalidatePath(`/kunde/faelle/${fallId}`)
    revalidatePath(`/gutachter/fall/${fallId}`)
  }
  revalidatePath('/admin/faelle')
  // Layout (Sidebar mit LexDrive-QR-Card) rendert pro Route — wir
  // revalidieren den Layout-Root, damit die Sidebar bei einem Vollmacht-
  // Update neu rendert und die Card erscheint.
  revalidatePath('/kunde', 'layout')
}

/**
 * Setzt den Kanzlei-Wunsch. Erlaubte Caller:
 *   - Admin/KB jederzeit (setzen pro Claim)
 *   - Kunde des Claims, solange noch nicht uebergeben (eigenstaendige
 *     Wahl im Kunde-Portal: partnerkanzlei / eigene_kanzlei / keine_kanzlei)
 */
export async function setKanzleiWunsch(
  claimId: string,
  wunsch: KanzleiWunsch,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const admin = createAdminClient()
  const { data: profile } = await supabase
    .from('profiles').select('rolle').eq('id', user.id).maybeSingle()
  const istAdminKb = profile && ['admin', 'kundenbetreuer'].includes(profile.rolle as string)

  if (!istAdminKb) {
    const { data: c } = await admin
      .from('claims')
      .select('geschaedigter_user_id, kanzlei_uebergeben_am')
      .eq('id', claimId)
      .maybeSingle()
    if (!c) return { ok: false, error: 'Claim nicht gefunden' }
    // CMM-49: faelle.kunde_id-Fallback entfernt — war beweisbar tot. 0-diff
    // kunde_id==geschaedigter_user_id + kunde_set_gesch_null=0 ⇒ wenn geschaedigter_user_id
    // null ist, ist kunde_id auch null → der Fallback haette nie zusaetzlich gegriffen.
    // Der claims-Check ist vollstaendig. (Tiefere claim_parties-Ownership = CMM-63.)
    if (c.geschaedigter_user_id !== user.id) {
      return { ok: false, error: 'Nur Admin/KB oder Geschaedigter darf den Wunsch setzen' }
    }
    if (c.kanzlei_uebergeben_am) {
      return { ok: false, error: 'Paket wurde bereits versendet — Wunsch nicht mehr aenderbar' }
    }
  }

  const { data: claim, error: selErr } = await admin
    .from('claims')
    .select('id, kanzlei_wunsch')
    .eq('id', claimId)
    .maybeSingle()
  if (selErr || !claim) return { ok: false, error: selErr?.message ?? 'Claim nicht gefunden' }

  const { error } = await admin
    .from('claims')
    .update({
      kanzlei_wunsch: wunsch,
      kanzlei_wunsch_gefragt_am: new Date().toISOString(),
    })
    .eq('id', claimId)
  if (error) return { ok: false, error: error.message }

  // A3 (CMM Phase 1.5e): Bei 'keine_kanzlei' den Kanzleifall entfernen.
  // Wenn der Kunde selbst regelt, gibt es keinen Regulierungs-Lifecycle
  // (versicherungskontakt → auszahlung) auf unserer Seite — also kein
  // kanzlei_faelle. SV-„Meine Fälle" zeigt den Fall dadurch nicht mehr
  // (Phase 1.5b query joint via kanzlei_faelle). Bei späterer Wahl
  // 'partnerkanzlei' oder 'eigene_kanzlei' wird er durch ensureKanzleiFall
  // unten wieder angelegt.
  //
  // Side-Quests (Nachbesichtigung, Stellungnahme) sind danach via DB-Trigger
  // 1.5c automatisch blockiert — solange kein kanzlei_faelle existiert,
  // kann nichts angefordert werden. Korrektes Verhalten: wer selbst regelt,
  // braucht keine SV-Folgeleistung.
  if (wunsch === 'keine_kanzlei') {
    // Defensive: nur löschen wenn noch nicht ausgezahlt — eine bereits
    // abgeschlossene Regulierung darf nicht historisch verschwinden.
    const { error: delErr } = await admin
      .from('kanzlei_faelle')
      .delete()
      .eq('claim_id', claimId)
      .is('ausgezahlt_am', null)
    if (delErr) {
      console.warn('[setKanzleiWunsch] kanzlei_faelle delete:', delErr.message)
    }
  } else if (wunsch === 'partnerkanzlei' || wunsch === 'eigene_kanzlei') {
    // Idempotent re-create wenn vorher gelöscht (Kunde hat von 'keine_kanzlei'
    // gewechselt). Status startet wieder bei versicherungskontakt.
    const { data: existing } = await admin
      .from('kanzlei_faelle').select('id').eq('claim_id', claimId).maybeSingle()
    if (!existing) {
      const { error: insErr } = await admin
        .from('kanzlei_faelle')
        .insert({ claim_id: claimId, status: 'versicherungskontakt' })
      if (insErr) {
        console.warn('[setKanzleiWunsch] kanzlei_faelle re-insert:', insErr.message)
      }
    }

    // 2026-05-11: Post-hoc Partnerkanzlei-Wahl loest Mandat-Push aus.
    // Greift wenn Kunde im nur_gutachter-Pfad startet und am Ende doch
    // die Partnerkanzlei waehlt — pushMandatToKanzlei pruefte vorher nur
    // service_typ='komplett' und hat das verpasst. Idempotent via
    // pushMandatToKanzlei (skipt wenn mandatsnummer schon gesetzt).
    if (wunsch === 'partnerkanzlei') {
      try {
        const { data: fallRow } = await admin
          .from('faelle_claim_bridge')
          .select('id:fall_id')
          .eq('claim_id', claimId)
          .maybeSingle()
        // CMM-44 SP-I2: mandatsnummer lebt auf kanzlei_faelle — Idempotenz-Guard
        // dort lesen (faelle.mandatsnummer ist fuer neue Faelle null -> sonst Doppel-Push).
        const { data: kfRow } = await admin
          .from('kanzlei_faelle')
          .select('mandatsnummer')
          .eq('claim_id', claimId)
          .maybeSingle()
        if (fallRow?.id && !kfRow?.mandatsnummer) {
          const { pushMandatToKanzlei } = await import('@/lib/kanzlei/push-mandat')
          pushMandatToKanzlei(fallRow.id as string).catch((err) =>
            console.warn('[setKanzleiWunsch] pushMandatToKanzlei async fail:', err),
          )
        }
      } catch (err) {
        console.warn('[setKanzleiWunsch] pushMandatToKanzlei trigger:', err)
      }
    }
  }

  // Timeline-Audit
  try {
    const { data: fall } = await admin
      .from('faelle_claim_bridge').select('id:fall_id').eq('claim_id', claimId).maybeSingle()
    if (fall?.id) {
      await admin.from('timeline').insert({
        fall_id: fall.id,
        typ: 'system',
        titel: 'Kanzlei-Wunsch geaendert',
        beschreibung: `KB hat kanzlei_wunsch=${wunsch} gesetzt.`,
      })
    }
    revalidateClaim(claimId, fall?.id ?? null)
  } catch (err) {
    console.warn('[setKanzleiWunsch] Timeline/Revalidate:', err)
  }
  return { ok: true }
}

/** Test-Helper: Setzt kanzlei_wunsch + kanzlei_uebergeben_am zurück. */
export async function resetKanzleiWunsch(
  claimId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }
  const admin = createAdminClient()
  const { error } = await admin
    .from('claims')
    .update({
      kanzlei_wunsch: 'noch_unentschieden',
      kanzlei_wunsch_gefragt_am: null,
      kanzlei_uebergeben_am: null,
    })
    .eq('id', claimId)
  if (error) return { ok: false, error: error.message }
  try {
    const { data: fall } = await admin
      .from('faelle_claim_bridge').select('id:fall_id').eq('claim_id', claimId).maybeSingle()
    revalidateClaim(claimId, fall?.id ?? null)
  } catch { /* ignore */ }
  return { ok: true }
}

export async function updateKanzleiAnsprechpartner(
  claimId: string,
  patch: { name?: string | null; email?: string | null; telefon?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireKundeOfClaim(claimId)
  if (!auth.ok) return { ok: false, error: auth.error }
  const admin = createAdminClient()

  // Nur erlaubt wenn kanzlei_wunsch='eigene_kanzlei' — sonst hat es keinen Effekt.
  const { data: claim } = await admin
    .from('claims')
    .select('kanzlei_wunsch, kanzlei_uebergeben_am')
    .eq('id', claimId)
    .maybeSingle()
  if (claim?.kanzlei_wunsch !== 'eigene_kanzlei') {
    return { ok: false, error: 'Nicht im eigene-Kanzlei-Pfad' }
  }
  if (claim.kanzlei_uebergeben_am) {
    return { ok: false, error: 'Paket wurde bereits versendet — Aenderung nicht moeglich' }
  }

  const update: Record<string, string | null> = {}
  if (patch.name !== undefined) update.kanzlei_ansprechpartner_name = patch.name?.trim() || null
  if (patch.email !== undefined) update.kanzlei_ansprechpartner_email = patch.email?.trim() || null
  if (patch.telefon !== undefined)
    update.kanzlei_ansprechpartner_telefon = patch.telefon?.trim() || null
  if (Object.keys(update).length === 0) return { ok: true }

  const { error } = await admin.from('claims').update(update).eq('id', claimId)
  if (error) return { ok: false, error: error.message }

  const { data: fall } = await admin
    .from('faelle_claim_bridge').select('id:fall_id').eq('claim_id', claimId).maybeSingle()
  revalidateClaim(claimId, fall?.id ?? null)
  return { ok: true }
}

export async function versendeKanzleiPaketAnEigeneKanzlei(
  claimId: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireKundeOfClaim(claimId)
  if (!auth.ok) return { ok: false, error: auth.error }
  const admin = createAdminClient()

  // Daten + Vorbedingungen pruefen
  const { data: claim } = await admin
    .from('claims')
    .select(
      'id, kanzlei_wunsch, kanzlei_ansprechpartner_email, kanzlei_ansprechpartner_name, kanzlei_uebergeben_am',
    )
    .eq('id', claimId)
    .maybeSingle()
  if (!claim) return { ok: false, error: 'Claim nicht gefunden' }
  if (claim.kanzlei_wunsch !== 'eigene_kanzlei') {
    return { ok: false, error: 'Nicht im eigene-Kanzlei-Pfad' }
  }
  if (claim.kanzlei_uebergeben_am) {
    return { ok: false, error: 'Paket wurde bereits versendet' }
  }
  const email = claim.kanzlei_ansprechpartner_email as string | null
  if (!email) return { ok: false, error: 'Bitte zuerst Email der Kanzlei eintragen' }

  // Gutachten-Freigabe als Sanity — wir versenden nur wenn das Gutachten
  // QC-bestanden ist. Sonst hat der Kunde nichts in der Hand.
  const { data: fall } = await admin
    .from('faelle_claim_bridge').select('id:fall_id').eq('claim_id', claimId).maybeSingle()
  if (!fall?.id) return { ok: false, error: 'Kein Fall am Claim' }

  // CMM-Drift-Fix (16.07.): auftraege hat erstellt_am, NICHT created_at — der Order warf
  // PostgREST-400 -> erstgutachten=null -> Sanity-Check blockierte den Kanzlei-Wunsch-Flow
  // faelschlich mit "Gutachten ist noch nicht freigegeben". (4 Stellen in dieser Datei.)
  const { data: erstgutachten } = await admin
    .from('auftraege')
    .select('id, gutachten_url, gutachten_final_freigegeben')
    .eq('fall_id', fall.id)
    .eq('typ', 'erstgutachten')
    .order('erstellt_am', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!erstgutachten?.gutachten_final_freigegeben) {
    return { ok: false, error: 'Gutachten ist noch nicht freigegeben' }
  }

  // Email-Versand fire-and-forget — wir verlassen uns auf den existierenden
  // Communications-Layer (Resend via lib/communications/send wenn vorhanden).
  // Falls der Versand scheitert, brechen wir trotzdem nicht ab — Admin sieht
  // den Fail in den Logs und kann manuell nachsenden.
  try {
    const { sendCommunication } = await import('@/lib/communications/send')
    await (sendCommunication as unknown as (
      kategorie: string,
      payload: Record<string, unknown>,
    ) => Promise<unknown>)('kanzlei_paket_an_externe_kanzlei', {
      fall_id: fall.id,
      kanzlei_email: email,
      kanzlei_name: (claim.kanzlei_ansprechpartner_name as string | null) ?? null,
      gutachten_url: erstgutachten.gutachten_url ?? null,
    }).catch((e: unknown) => {
      console.warn('[versendeKanzleiPaket] Email-Send fehlgeschlagen (nicht-kritisch):', e)
    })
  } catch (err) {
    console.warn('[versendeKanzleiPaket] Communications-Layer nicht verfuegbar:', err)
  }

  // DB: Übergabe-Marker (Nicht-Status-Spalte) + Endzustand via ENGINE (Fundament C1-Funnel).
  // Frueher ein Direkt-Write auf claims.operative_status (Ratchet-Baseline) -> umging
  // transitionFallStatus: kein phase_transitions-Event-Log, keine Timeline, kein
  // fall.status_changed-Emit. 'an_externe_kanzlei_uebergeben' ist in der Engine ein
  // BROADLY_REACHABLE_TERMINAL (aus jedem AKTIVEN Zustand erreichbar = das frueher
  // guard-lose Verhalten) und setzt abgeschlossen_am selbst.
  const now = new Date().toISOString()
  const { error: uErr } = await admin
    .from('claims')
    .update({ kanzlei_uebergeben_am: now })
    .eq('id', claimId)
  if (uErr) return { ok: false, error: uErr.message }

  try {
    const { transitionFallStatus } = await import('@/lib/faelle/state-machine')
    await transitionFallStatus(fall.id, 'an_externe_kanzlei_uebergeben', { user_id: auth.userId })
  } catch (err) {
    console.error(
      '[versendeKanzleiPaket] Terminal-Close via Engine fehlgeschlagen (non-fatal, Uebergabe-Marker steht):',
      err instanceof Error ? err.message : err,
    )
  }

  // Timeline-Audit
  try {
    await admin.from('timeline').insert({
      fall_id: fall.id,
      typ: 'system',
      titel: 'Kanzleipaket an externe Kanzlei versendet',
      beschreibung: `An ${email} — Fall geht in Eigenregie weiter.`,
    })
  } catch (err) {
    console.warn('[versendeKanzleiPaket] Timeline:', err)
  }

  revalidateClaim(claimId, fall.id)
  return { ok: true }
}

/**
 * CMM-32 Polish: Kunde regelt komplett selbst (keine Kanzlei). Setzt den
 * Claim auf den gleichen Endzustand 'an_externe_kanzlei_uebergeben' wie
 * der eigene-Kanzlei-Pfad — semantisch passt das, weil "wir sind raus" in
 * beiden Faellen identisch ist. Trigger: Kunde drueckt im UI „Ich reiche
 * selbst ein" nachdem er Gutachten + Anlagen heruntergeladen hat.
 */
export async function bestaetigeSelbstEinreichungOhneKanzlei(
  claimId: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireKundeOfClaim(claimId)
  if (!auth.ok) return { ok: false, error: auth.error }
  const admin = createAdminClient()

  const { data: claim } = await admin
    .from('claims')
    .select('id, kanzlei_wunsch, kanzlei_uebergeben_am')
    .eq('id', claimId)
    .maybeSingle()
  if (!claim) return { ok: false, error: 'Claim nicht gefunden' }
  if (claim.kanzlei_wunsch !== 'keine_kanzlei') {
    return { ok: false, error: 'Nicht im keine-Kanzlei-Pfad' }
  }
  if (claim.kanzlei_uebergeben_am) return { ok: true }

  const { data: fall } = await admin
    .from('faelle_claim_bridge').select('id:fall_id').eq('claim_id', claimId).maybeSingle()
  if (!fall?.id) return { ok: false, error: 'Kein Fall am Claim' }

  // Sanity: Gutachten muss freigegeben sein, sonst hat der Kunde nichts in der Hand.
  const { data: erstgutachten } = await admin
    .from('auftraege')
    .select('gutachten_final_freigegeben')
    .eq('fall_id', fall.id)
    .eq('typ', 'erstgutachten')
    .order('erstellt_am', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!erstgutachten?.gutachten_final_freigegeben) {
    return { ok: false, error: 'Gutachten ist noch nicht freigegeben' }
  }

  // Uebergabe-Marker + Endzustand via ENGINE (Fundament C1-Funnel, analog
  // versendeKanzleiPaketAnEigeneKanzlei): der Terminal laeuft ueber transitionFallStatus
  // (Event-Log + Timeline + Emit), abgeschlossen_am setzt die Engine.
  const now = new Date().toISOString()
  const { error: uErr } = await admin
    .from('claims')
    .update({ kanzlei_uebergeben_am: now })
    .eq('id', claimId)
  if (uErr) return { ok: false, error: uErr.message }

  try {
    const { transitionFallStatus } = await import('@/lib/faelle/state-machine')
    await transitionFallStatus(fall.id, 'an_externe_kanzlei_uebergeben', { user_id: auth.userId })
  } catch (err) {
    console.error(
      '[bestaetigeSelbstEinreichung] Terminal-Close via Engine fehlgeschlagen (non-fatal, Uebergabe-Marker steht):',
      err instanceof Error ? err.message : err,
    )
  }

  try {
    await admin.from('timeline').insert({
      fall_id: fall.id,
      typ: 'system',
      titel: 'Kunde reicht selbst ein',
      beschreibung: 'Kunde hat bestaetigt, dass er Gutachten + Anlagen selbst bei der Versicherung einreicht.',
    })
  } catch (err) {
    console.warn('[bestaetigeSelbstEinreichung] Timeline:', err)
  }

  revalidateClaim(claimId, fall.id)
  return { ok: true }
}

/**
 * CMM-32 Polish: Kunde bestaetigt die Vollmacht direkt aus dem Stepper
 * (statt ueber den WhatsApp-Flow). Ruft die zentrale confirmVollmacht-Logik
 * (Termin-Bestaetigung, Kalender-Sync) auf.
 *
 * Auth: nur der Geschaedigte des Falls (oder Admin/KB) darf das aendern.
 */
export async function bestaetigeVollmachtKunde(
  fallId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const admin = createAdminClient()
  // CMM-49: faelle-frei — claims = SSoT. vollmacht_signiert_am + geschaedigter_user_id
  // (==kunde_id, 0-diff) + lead_id direkt aus claims. claimId IST der claims-PK.
  const claimId = await resolveClaimId(admin, fallId)
  if (!claimId) return { ok: false, error: 'Fall nicht gefunden' }
  const { data: claim } = await admin
    .from('claims')
    .select('geschaedigter_user_id, vollmacht_signiert_am, lead_id')
    .eq('id', claimId)
    .maybeSingle()
  if (!claim) return { ok: false, error: 'Fall nicht gefunden' }
  if (claim.vollmacht_signiert_am) return { ok: true }

  // Ownership-Check
  const istKunde = claim.geschaedigter_user_id === user.id
  if (!istKunde) {
    const { data: profile } = await supabase
      .from('profiles').select('rolle').eq('id', user.id).maybeSingle()
    if (!profile || !['admin', 'kundenbetreuer'].includes(profile.rolle as string)) {
      return { ok: false, error: 'Nur der Kunde oder Admin/KB' }
    }
  }

  // Direkt schreiben — verlassen uns nicht auf confirmVollmacht (das skippt
  // bei service_typ != 'komplett' und liest nur reservierte Termine).
  // CMM-44 SP-B PR2b: vollmacht_signiert_am lebt auf claims (SSoT) — Write
  // nach claims verschoben (kein faelle-Write mehr). Fehlendes claim_id ist ein
  // harter Fehler statt stillem Skip (sonst Datenverlust im Race-Fenster).
  const nowIso = new Date().toISOString()
  const { error: uErr } = await admin
    .from('claims')
    .update({ vollmacht_signiert_am: nowIso })
    .eq('id', claimId)
  if (uErr) return { ok: false, error: uErr.message }

  // Lead synchronisieren (manche Loader lesen aus leads, nicht faelle).
  // leads.vollmacht_signiert_am ist die eigene Lead-Spalte (kein SP-B-Ziel).
  if (claim.lead_id) {
    // Spiegel der Vollmacht auf den Lead — mehrere Loader lesen von dort (s. Kommentar
    // oben). Bleibt er aus, sehen diese Sichten die Vollmacht als fehlend an.
    const { error: spiegelFehler } = await admin.from('leads').update({
      vollmacht_signiert_am: nowIso,
    }).eq('id', claim.lead_id as string)
    if (spiegelFehler) {
      console.error(`[kanzlei-wunsch] Vollmacht nicht auf den Lead gespiegelt (${claim.lead_id}):`, spiegelFehler.message)
    }
  }

  // Side-Effects (Termin-Bestaetigung, Kalender-Sync) im Hintergrund —
  // Fehler werden geloggt, blockieren aber das Ergebnis nicht.
  try {
    const { confirmVollmacht } = await import('@/lib/vollmacht/confirm-vollmacht')
    await confirmVollmacht(fallId)
  } catch (err) {
    console.warn('[bestaetigeVollmachtKunde] confirmVollmacht (non-critical):', err)
  }

  if (claimId) revalidateClaim(claimId as string, fallId)
  return { ok: true }
}
