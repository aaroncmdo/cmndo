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

function revalidateClaim(claimId: string, fallId: string | null) {
  if (fallId) {
    revalidatePath(`/faelle/${fallId}`)
    revalidatePath(`/kunde/faelle/${fallId}`)
    revalidatePath(`/gutachter/fall/${fallId}`)
  }
  revalidatePath(`/admin/claims/${claimId}`)
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
    // geschaedigter_user_id kann null sein (Legacy/Backfill) →
    // Fallback: Ownership über faelle.kunde_id prüfen
    const istGeschaedigter = c.geschaedigter_user_id === user.id
    if (!istGeschaedigter) {
      const { data: fallRow } = await admin
        .from('faelle')
        .select('kunde_id')
        .eq('claim_id', claimId)
        .maybeSingle()
      if (!fallRow || fallRow.kunde_id !== user.id) {
        return { ok: false, error: 'Nur Admin/KB oder Geschaedigter darf den Wunsch setzen' }
      }
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

  // Timeline-Audit
  try {
    const { data: fall } = await admin
      .from('faelle').select('id').eq('claim_id', claimId).maybeSingle()
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
      .from('faelle').select('id').eq('claim_id', claimId).maybeSingle()
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
    .from('faelle').select('id').eq('claim_id', claimId).maybeSingle()
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
      'id, status, kanzlei_wunsch, kanzlei_ansprechpartner_email, kanzlei_ansprechpartner_name, kanzlei_uebergeben_am',
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
    .from('faelle').select('id').eq('claim_id', claimId).maybeSingle()
  if (!fall?.id) return { ok: false, error: 'Kein Fall am Claim' }

  const { data: erstgutachten } = await admin
    .from('auftraege')
    .select('id, gutachten_url, gutachten_final_freigegeben')
    .eq('fall_id', fall.id)
    .eq('typ', 'erstgutachten')
    .order('created_at', { ascending: false })
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

  // DB: Übergabe-Marker + Endzustand
  const now = new Date().toISOString()
  const { error: uErr } = await admin
    .from('claims')
    .update({
      kanzlei_uebergeben_am: now,
      status: 'an_externe_kanzlei_uebergeben',
    })
    .eq('id', claimId)
  if (uErr) return { ok: false, error: uErr.message }

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
    .select('id, status, kanzlei_wunsch, kanzlei_uebergeben_am')
    .eq('id', claimId)
    .maybeSingle()
  if (!claim) return { ok: false, error: 'Claim nicht gefunden' }
  if (claim.kanzlei_wunsch !== 'keine_kanzlei') {
    return { ok: false, error: 'Nicht im keine-Kanzlei-Pfad' }
  }
  if (claim.kanzlei_uebergeben_am) return { ok: true }

  const { data: fall } = await admin
    .from('faelle').select('id').eq('claim_id', claimId).maybeSingle()
  if (!fall?.id) return { ok: false, error: 'Kein Fall am Claim' }

  // Sanity: Gutachten muss freigegeben sein, sonst hat der Kunde nichts in der Hand.
  const { data: erstgutachten } = await admin
    .from('auftraege')
    .select('gutachten_final_freigegeben')
    .eq('fall_id', fall.id)
    .eq('typ', 'erstgutachten')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!erstgutachten?.gutachten_final_freigegeben) {
    return { ok: false, error: 'Gutachten ist noch nicht freigegeben' }
  }

  const now = new Date().toISOString()
  const { error: uErr } = await admin
    .from('claims')
    .update({
      kanzlei_uebergeben_am: now,
      status: 'an_externe_kanzlei_uebergeben',
    })
    .eq('id', claimId)
  if (uErr) return { ok: false, error: uErr.message }

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
  const { data: fall } = await admin
    .from('faelle')
    .select('id, kunde_id, claim_id, vollmacht_signiert_am')
    .eq('id', fallId)
    .maybeSingle()
  if (!fall) return { ok: false, error: 'Fall nicht gefunden' }
  if (fall.vollmacht_signiert_am) return { ok: true }

  // Ownership-Check
  const istKunde = fall.kunde_id === user.id
  if (!istKunde) {
    const { data: profile } = await supabase
      .from('profiles').select('rolle').eq('id', user.id).maybeSingle()
    if (!profile || !['admin', 'kundenbetreuer'].includes(profile.rolle as string)) {
      return { ok: false, error: 'Nur der Kunde oder Admin/KB' }
    }
  }

  try {
    const { confirmVollmacht } = await import('@/app/flow/[token]/actions')
    await confirmVollmacht(fallId)
  } catch (err) {
    console.warn('[bestaetigeVollmachtKunde] confirmVollmacht:', err)
    // Fallback: zumindest den Timestamp setzen, damit das UI den Gate verlaesst
    const nowIso = new Date().toISOString()
    const { error: uErr } = await admin
      .from('faelle')
      .update({ vollmacht_signiert_am: nowIso, vollmacht_datum: nowIso })
      .eq('id', fallId)
    if (uErr) return { ok: false, error: uErr.message }
  }

  if (fall.claim_id) revalidateClaim(fall.claim_id as string, fallId)
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
 * Auth: Geschaedigter, Admin oder KB.
 */
export async function smokeResetAufKanzleiWunsch(
  fallId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const admin = createAdminClient()
  const { data: fall } = await admin
    .from('faelle')
    .select('id, kunde_id, claim_id, lead_id')
    .eq('id', fallId)
    .maybeSingle()
  if (!fall) return { ok: false, error: 'Fall nicht gefunden' }

  const istKunde = fall.kunde_id === user.id
  if (!istKunde) {
    const { data: profile } = await supabase
      .from('profiles').select('rolle').eq('id', user.id).maybeSingle()
    if (!profile || !['admin', 'kundenbetreuer'].includes(profile.rolle as string)) {
      return { ok: false, error: 'Nur der Kunde oder Admin/KB' }
    }
  }

  // 1) Lead — SA bleibt, Vollmacht raus, Onboarding bleibt komplett.
  if (fall.lead_id) {
    await admin.from('leads').update({
      sa_unterschrieben: true,
      vollmacht_signiert_am: null,
      onboarding_complete: true,
    }).eq('id', fall.lead_id as string)
  }

  // 2) Fall — Vollmacht-Felder leer, Onboarding fertig, Status regulierung.
  await admin.from('faelle').update({
    vollmacht_signiert_am: null,
    vollmacht_datum: null,
    onboarding_complete: true,
    status: 'regulierung',
  }).eq('id', fallId)

  // 3) Claim — Kanzlei-Wunsch zurueck, Phase auf 4_gutachten_fertig.
  if (fall.claim_id) {
    await admin.from('claims').update({
      kanzlei_wunsch: 'noch_unentschieden',
      kanzlei_wunsch_gefragt_am: null,
      kanzlei_uebergeben_am: null,
      kanzlei_ansprechpartner_name: null,
      kanzlei_ansprechpartner_email: null,
      kanzlei_ansprechpartner_telefon: null,
      phase: '4_gutachten_fertig',
      status: 'in_bearbeitung',
    }).eq('id', fall.claim_id as string)

    // 4) kanzlei_faelle - alle Eintraege fuer diesen Claim entfernen
    await admin.from('kanzlei_faelle').delete().eq('claim_id', fall.claim_id as string)
  }

  // 5) Erstgutachten als QC-freigegeben markieren — sonst zeigt der Stepper
  //    den Banner gar nicht. Wenn keiner existiert, nichts tun.
  const { data: erstgutachten } = await admin
    .from('auftraege')
    .select('id')
    .eq('fall_id', fallId)
    .eq('typ', 'erstgutachten')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (erstgutachten?.id) {
    await admin.from('auftraege').update({
      gutachten_final_freigegeben: true,
      gutachten_url: 'https://example.com/smoke-gutachten.pdf',
    }).eq('id', erstgutachten.id as string)
  }

  if (fall.claim_id) revalidateClaim(fall.claim_id as string, fallId)
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
  const { data: fall } = await admin
    .from('faelle').select('claim_id, lead_id').eq('id', fallId).maybeSingle()
  if (!fall?.claim_id) return { ok: false, error: 'Kein Claim am Fall' }

  const nowIso = new Date().toISOString()

  // Lead: Vollmacht signiert
  if (fall.lead_id) {
    await admin.from('leads').update({
      vollmacht_signiert_am: nowIso,
    }).eq('id', fall.lead_id as string)
  }

  // Fall: Vollmacht + Stammdaten
  await admin.from('faelle').update({
    vollmacht_signiert_am: nowIso,
    vollmacht_datum: nowIso,
    kennzeichen: 'K-AS 2014',
    fahrzeug_hersteller: 'BMW',
    fahrzeug_modell: '5er',
    status: 'regulierung',
  }).eq('id', fallId)

  // Claim: LexDrive gewaehlt, OCR-Werte fuer 7000 EUR Anspruch,
  // Phase weiter Richtung VS-Kontakt.
  await admin.from('claims').update({
    kanzlei_wunsch: 'partnerkanzlei',
    kanzlei_wunsch_gefragt_am: nowIso,
    claim_nummer: 'CLM-2026-00043',
    reparaturkosten_brutto: 6500,
    minderwert: 500,
    totalschaden: false,
    gutachten_ocr_processed_at: nowIso,
    nutzungsausfall_tage: 12,
    gutachten_nutzungsausfall_tagessatz_eur: 65,
    phase: '6_kommunikation_versicherung',
    status: 'in_kommunikation_vs',
  }).eq('id', fall.claim_id as string)

  // Erstgutachten als final freigegeben markieren (uebernimmt smokeResetAufKanzleiWunsch
  // bereits, aber sicherheitshalber)
  const { data: erstgutachten } = await admin
    .from('auftraege')
    .select('id')
    .eq('fall_id', fallId)
    .eq('typ', 'erstgutachten')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (erstgutachten?.id) {
    await admin.from('auftraege').update({
      gutachten_final_freigegeben: true,
      abgeschlossen_am: nowIso,
    }).eq('id', erstgutachten.id as string)
  }

  revalidateClaim(fall.claim_id as string, fallId)
  return { ok: true }
}

/**
 * SMOKE-Helper: Setzt den Fall in den Zustand
 * "LexDrive gewaehlt, Vollmacht ausstehend" — der blaue Vollmacht-Gate
 * ist sichtbar, der Kunde kann hier oder via WhatsApp bestaetigen.
 *
 * Auth: Geschaedigter, Admin oder KB.
 */
export async function smokeResetAufLexDriveVollmachtOffen(
  fallId: string,
): Promise<{ ok: boolean; error?: string }> {
  const base = await smokeResetAufKanzleiWunsch(fallId)
  if (!base.ok) return base

  const admin = createAdminClient()
  const { data: fall } = await admin
    .from('faelle').select('claim_id').eq('id', fallId).maybeSingle()
  if (!fall?.claim_id) return { ok: false, error: 'Kein Claim am Fall' }

  const { error } = await admin.from('claims').update({
    kanzlei_wunsch: 'partnerkanzlei',
    kanzlei_wunsch_gefragt_am: new Date().toISOString(),
  }).eq('id', fall.claim_id as string)
  if (error) return { ok: false, error: error.message }

  revalidateClaim(fall.claim_id as string, fallId)
  return { ok: true }
}
