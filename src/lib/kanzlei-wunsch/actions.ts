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
    await admin.from('leads').update({
      vollmacht_signiert_am: nowIso,
    }).eq('id', claim.lead_id as string)
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

/**
 * SMOKE-Helper: Setzt einen bestehenden Fall in den Zustand
 * "Erfassung -> Kanzlei-Wunsch offen, ohne Vollmacht" zurueck, damit der
 * Walkthrough (Banner-Wahl LexDrive/eigene Kanzlei/selbst, Vollmacht-
 * Bestaetigung) erneut durchgespielt werden kann.
 *
 * Setzt:
 *  - leads.sa_unterschrieben=true, vollmacht_signiert_am=null,
 *    onboarding_complete=true
 *  - faelle.vollmacht_signiert_am=null, vollmacht_datum=null,
 *    onboarding_complete=true, status='regulierung'
 *  - claims.kanzlei_wunsch='noch_unentschieden', kanzlei_uebergeben_am=null,
 *    kanzlei_ansprechpartner_*=null, phase='4_gutachten_fertig'
 *  - auftraege.gutachten_final_freigegeben=true (latest erstgutachten)
 *  - loescht kanzlei_faelle Eintraege
 *
 * Auth: Admin oder KB (Security-Haertung 18.07. — Kunden-Zweig entfernt).
 */
// Security-Haertung (18.07., coordination-an-security-sweep-smoke-actions-in-prod-src):
// Die smoke*-Helper unten sind exportierte Server-Actions, die ECHTE Claims mutieren
// (Vollmacht-Reset, operative_status-Sprung, claim_nummer-Overwrite, Fake-OCR). Frueher
// erlaubte das Gate "der Kunde selbst ODER admin/kb" — ein Endkunde haette (per Action-ID-
// Discovery) seinen EIGENEN Claim korrumpieren koennen. Jetzt admin/kb-only; die Konsole-
// Smokes laufen ohnehin als Admin. (Fixture-Only-Guard = dokumentierter Follow-up: der naive
// 'CLM-2026-000%'-Vorschlag ist UNSICHER, weil echte fruehe Prod-Claims ihn matchen.)
async function assertSmokeAdminOrKb(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }
  const { data: profile } = await supabase
    .from('profiles').select('rolle').eq('id', user.id).maybeSingle()
  if (!profile || !['admin', 'kundenbetreuer'].includes(profile.rolle as string)) {
    return { ok: false, error: 'Nur Admin/KB (Smoke-Helper)' }
  }
  return { ok: true }
}

export async function smokeResetAufKanzleiWunsch(
  fallId: string,
): Promise<{ ok: boolean; error?: string }> {
  const gate = await assertSmokeAdminOrKb()
  if (!gate.ok) return { ok: false, error: gate.error }

  const admin = createAdminClient()
  // CMM-49: faelle-frei (Read) — claims = SSoT (lead_id, 0-diff).
  const claimId = await resolveClaimId(admin, fallId)
  if (!claimId) return { ok: false, error: 'Fall nicht gefunden' }
  const { data: claim } = await admin
    .from('claims')
    .select('lead_id')
    .eq('id', claimId)
    .maybeSingle()
  if (!claim) return { ok: false, error: 'Fall nicht gefunden' }

  // 1) Lead — SA bleibt, Vollmacht raus, Onboarding bleibt komplett.
  if (claim.lead_id) {
    await admin.from('leads').update({
      sa_unterschrieben: true,
      vollmacht_signiert_am: null,
      // onboarding_complete lebt auf claims (SP-B SSoT) — leads hat die Spalte nicht.
    }).eq('id', claim.lead_id as string)
  }

  // 2) Status regulierung -> claims.operative_status (Engine-Cursor/SSoT).
  // CMM-74: faelle.status-Write retired (war reiner Dual-Write, 0-divergent verifiziert);
  // operative_status traegt den Status (im claims-Update unten via Record-Bridge).

  // 3) Claim — Kanzlei-Wunsch zurueck, Phase auf 4_gutachten_fertig.
  // onboarding_complete=true ebenfalls auf claims (SP-B SSoT).
  // CMM-44 SP-B PR2b: vollmacht_signiert_am=null auf claims (SSoT).
  if (claimId) {
    const claimsUpd = {
      onboarding_complete: true,
      kanzlei_wunsch: 'noch_unentschieden' as const,
      kanzlei_wunsch_gefragt_am: null,
      kanzlei_uebergeben_am: null,
      kanzlei_ansprechpartner_name: null,
      kanzlei_ansprechpartner_email: null,
      kanzlei_ansprechpartner_telefon: null,
      // B3/T4: work_state-Write entfernt — die Dispatch/Processing-Achse ist eliminiert,
      // operative_status ist die eine Status-Achse.
      vollmacht_signiert_am: null,
    }
    // CMM-74: operative_status (Engine-Cursor/SSoT) ersetzt den retired faelle.status-Write.
    // Record-Bridge — operative_status fehlt in gen. Typen (b''-Konvention wie sv-zuweisung/#2884).
    ;(claimsUpd as Record<string, unknown>).operative_status = 'regulierung'
    await admin.from('claims').update(claimsUpd).eq('id', claimId as string)

    // 4) kanzlei_faelle - alle Eintraege fuer diesen Claim entfernen
    await admin.from('kanzlei_faelle').delete().eq('claim_id', claimId as string)
  }

  // 5) Erstgutachten als QC-freigegeben markieren — sonst zeigt der Stepper
  //    den Banner gar nicht. Wenn keiner existiert, nichts tun.
  const { data: erstgutachten } = await admin
    .from('auftraege')
    .select('id')
    .eq('fall_id', fallId)
    .eq('typ', 'erstgutachten')
    .order('erstellt_am', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (erstgutachten?.id) {
    await admin.from('auftraege').update({
      gutachten_final_freigegeben: true,
      gutachten_url: 'https://example.com/smoke-gutachten.pdf',
    }).eq('id', erstgutachten.id as string)
  }

  if (claimId) revalidateClaim(claimId as string, fallId)
  return { ok: true }
}

/**
 * SMOKE-Helper: Setzt den Fall auf den Stand "LexDrive gewaehlt + Vollmacht
 * signiert + Anspruch 7000 EUR + Stammdaten BMW 5er, K-AS 2014,
 * CLM-2026-00043". Damit kann das volle Regulierungs-Panel + die
 * Sidebar-LexDrive-QR-Card gleichzeitig getestet werden.
 */
export async function smokeResetAufLexDriveVollmachtSigniert(
  fallId: string,
): Promise<{ ok: boolean; error?: string }> {
  const base = await smokeResetAufKanzleiWunsch(fallId)
  if (!base.ok) return base

  const admin = createAdminClient()
  // CMM-49 Reader-Sweep: faelle-frei (Read) — claimId via resolveClaimId, lead_id aus claims
  // (0-diff). Der faelle-Stammdaten-WRITE unten bleibt bewusst (P5/Entity-W-track).
  const claimId = await resolveClaimId(admin, fallId)
  if (!claimId) return { ok: false, error: 'Kein Claim am Fall' }
  const { data: claim } = await admin
    .from('claims')
    .select('lead_id')
    .eq('id', claimId)
    .maybeSingle()

  const nowIso = new Date().toISOString()

  // Lead: Vollmacht signiert
  if (claim?.lead_id) {
    await admin.from('leads').update({
      vollmacht_signiert_am: nowIso,
    }).eq('id', claim.lead_id as string)
  }

  // CMM-49 faelle-DROP: faelle ist gedroppt — der Smoke-Reset der Stammdaten (kennzeichen/
  // fahrzeug_*/status) entfaellt. Reader lesen vehicles + claims.operative_status (SSoT).

  // Claim: LexDrive gewaehlt, Phase weiter Richtung VS-Kontakt.
  // Cluster F+G PR-2b: OCR-Werte landen nicht mehr direkt auf claims, sondern
  // via apply_gutachten_ocr() in der gutachten-Tabelle.
  // CMM-44 SP-B PR2b: vollmacht_signiert_am auf claims (SSoT).
  await admin.from('claims').update({
    kanzlei_wunsch: 'partnerkanzlei',
    kanzlei_wunsch_gefragt_am: nowIso,
    claim_nummer: 'CLM-2026-00043',
    // T3-S4: operative_status traegt den Non-Terminal-Outcome (einzige Achse).
    // phase ist derived-first (Engine) — claims hat keine phase-Spalte (prod-verifiziert); status-Writes retired (T3-S4).
    operative_status: 'in_kommunikation_vs',
    vollmacht_signiert_am: nowIso,
  }).eq('id', claimId)

  // Smoke-OCR-Werte über die zentrale RPC schreiben → gutachten-Tabelle.
  await admin.rpc('apply_gutachten_ocr', {
    p_claim_id: claimId,
    p_values: {
      reparaturkosten_brutto: 6500,
      minderwert: 500,
      totalschaden: false,
      nutzungsausfall_tage: 12,
      gutachten_ocr_processed_at: nowIso,
      gutachten_nutzungsausfall_tagessatz_eur: 65,
    },
  })

  // Erstgutachten als final freigegeben markieren (uebernimmt smokeResetAufKanzleiWunsch
  // bereits, aber sicherheitshalber)
  const { data: erstgutachten } = await admin
    .from('auftraege')
    .select('id')
    .eq('fall_id', fallId)
    .eq('typ', 'erstgutachten')
    .order('erstellt_am', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (erstgutachten?.id) {
    await admin.from('auftraege').update({
      gutachten_final_freigegeben: true,
      abgeschlossen_am: nowIso,
    }).eq('id', erstgutachten.id as string)
  }

  revalidateClaim(claimId, fallId)
  return { ok: true }
}

/**
 * SMOKE-Helper: Erzeugt offene Pflichtdokumente fuer den aktuellen Fall —
 * triggert den gelben Pflichtdokumente-Banner ueber dem Layout-Inhalt.
 * Nutzt die kanonische createPflichtdokumenteFromKatalog-Logik, ergaenzt
 * fallback-direkte Inserts wenn der Katalog keine Eintraege erzeugt.
 */
export async function smokePflichtdokumenteAnlegen(
  fallId: string,
): Promise<{ ok: boolean; error?: string; angelegt: number }> {
  // Security-Haertung (18.07.): admin/kb-only. Vorher NUR "angemeldet" -> jeder eingeloggte
  // User konnte auf beliebigen Faellen Pflichtdokumente anlegen (schwaecher als die anderen
  // smoke*-Gates). Marker: coordination-an-security-sweep-smoke-actions-in-prod-src.
  const gate = await assertSmokeAdminOrKb()
  if (!gate.ok) return { ok: false, error: gate.error, angelegt: 0 }

  const admin = createAdminClient()
  // CMM-49 Reader-Sweep: claimId via resolveClaimId (faelle-frei), lead_id aus claims (0-diff).
  const claimId = await resolveClaimId(admin, fallId)
  if (!claimId) return { ok: false, error: 'Fall nicht gefunden', angelegt: 0 }
  const { data: claim } = await admin
    .from('claims')
    .select('lead_id')
    .eq('id', claimId)
    .maybeSingle()

  // Katalog-Pfad
  let lead: Record<string, unknown> | null = null
  if (claim?.lead_id) {
    const { data } = await admin.from('leads').select('*').eq('id', claim.lead_id as string).maybeSingle()
    lead = (data as Record<string, unknown> | null) ?? null
  }
  // CMM-49 faelle-DROP: createPflichtdokumenteFromKatalog nutzt den optionalen fall-Parameter
  // nicht (Katalog-Block ist entfernt; es liest nur lead + fallId) -> kein faelle-Read noetig.
  try {
    const { createPflichtdokumenteFromKatalog } = await import('@/lib/dokumente/create-pflicht')
    await createPflichtdokumenteFromKatalog(admin as unknown as Parameters<typeof createPflichtdokumenteFromKatalog>[0], fallId, lead)
  } catch (err) {
    console.warn('[smokePflichtdokumenteAnlegen] Katalog-Pfad:', err)
  }

  // Fallback: ein paar haendisch eingefuegte Slots damit der Banner sicher
  // etwas zu zeigen hat. status='ausstehend' + pflicht=true triggert den
  // Banner-Filter.
  const fallback = ['personalausweis', 'fahrzeugschein', 'schadenmeldung']
  const { data: existing } = await admin
    .from('pflichtdokumente')
    .select('dokument_typ').eq('fall_id', fallId)
  const existingTypen = new Set((existing ?? []).map((r) => r.dokument_typ as string))
  const toInsert = fallback
    .filter((t) => !existingTypen.has(t))
    .map((typ, i) => ({
      fall_id: fallId,
      dokument_typ: typ,
      pflicht: true,
      status: 'ausstehend',
      quelle: 'smoke',
      sort_order: i,
    }))
  if (toInsert.length > 0) {
    await admin.from('pflichtdokumente').insert(toInsert)
  }

  // CMM-49: claimId via resolveClaimId immer gesetzt → revalidateClaim deckt /kunde/faelle/${fallId}
  // + /kunde-Layout (frueherer else-Zweig) mit ab.
  revalidateClaim(claimId, fallId)
  return { ok: true, angelegt: toInsert.length }
}

/**
 * SMOKE-Helper: Setzt den Fall in den Zustand
 * "LexDrive gewaehlt, Vollmacht ausstehend" — der blaue Vollmacht-Gate
 * ist sichtbar, der Kunde kann hier oder via WhatsApp bestaetigen.
 *
 * Auth: Admin oder KB (Security-Haertung 18.07. — Kunden-Zweig entfernt).
 */
export async function smokeResetAufLexDriveVollmachtOffen(
  fallId: string,
): Promise<{ ok: boolean; error?: string }> {
  const base = await smokeResetAufKanzleiWunsch(fallId)
  if (!base.ok) return base

  const admin = createAdminClient()
  const kwClaimId = await resolveClaimId(admin, fallId)
  if (!kwClaimId) return { ok: false, error: 'Kein Claim am Fall' }

  const { error } = await admin.from('claims').update({
    kanzlei_wunsch: 'partnerkanzlei',
    kanzlei_wunsch_gefragt_am: new Date().toISOString(),
  }).eq('id', kwClaimId)
  if (error) return { ok: false, error: error.message }

  revalidateClaim(kwClaimId, fallId)
  return { ok: true }
}
