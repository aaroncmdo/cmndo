import type { SupabaseClient } from '@supabase/supabase-js'

// Kanonische, STABILE Identitaet des Golden-Path-Test-SV. Anker fuer die Auflosung der
// sachverstaendige-Row-id — die Row-id selbst churnt: die Prod-Golive-Cleanups (13.–17.07.)
// loeschten/rekreierten die Fixture-Konten, wodurch die SV-Row von 1da11741… auf 0469524f…
// wanderte und die Golden-Path-Completion-Spec (hardcoded 1da11741…) einen toten sv_id-FK schrieb.
// Die Email aendert sich NICHT -> ueber sie aufloesen statt eine Row-id hardcoden.
// Quelle der Wahrheit: scripts/test-fixtures/README.md + Memory reference-internal-test-account-logins.
export const TEST_SV_EMAIL = 'test-sv@claimondo.de'

/**
 * Loest die AKTUELLE sachverstaendige-Row-id des kanonischen (ist_testaccount=true) Test-SV auf.
 * NUR fuer Nicht-Matching-Faelle brauchbar (z.B. Completion: schreibt claims.sv_id direkt) —
 * fuer den globalen Finder-Buchungspfad ist ein Test-Account seit Befund #6 UNbrauchbar
 * (applyDispatchableFilter .eq('ist_testaccount', false)); dort seedThrowawayFinderSv nutzen.
 *
 * Reihenfolge: GOLDEN_SV_ID (Override) -> DB-Aufloesung ueber die stabile Email -> harter Fehler.
 * Self-healing: ueberlebt eine Neuanlage der SV-Row OHNE Code-Change. Braucht service-role.
 */
export async function resolveTestSvId(db: SupabaseClient): Promise<string> {
  const override = process.env.GOLDEN_SV_ID
  if (override) return override

  const { data: profil, error: profilErr } = await db
    .from('profiles')
    .select('id')
    .eq('email', TEST_SV_EMAIL)
    .maybeSingle()
  if (profilErr) throw new Error(`resolveTestSvId: profiles-Lookup fehlgeschlagen: ${profilErr.message}`)
  if (!profil) throw new Error(`resolveTestSvId: kein profiles-Eintrag fuer ${TEST_SV_EMAIL}`)

  const { data: sv, error: svErr } = await db
    .from('sachverstaendige')
    .select('id')
    .eq('profile_id', profil.id)
    .maybeSingle()
  if (svErr) throw new Error(`resolveTestSvId: sachverstaendige-Lookup fehlgeschlagen: ${svErr.message}`)
  if (!sv) throw new Error(`resolveTestSvId: keine sachverstaendige-Row fuer ${TEST_SV_EMAIL} (profile ${profil.id})`)

  return sv.id as string
}

// ─────────────────────────────────────────────────────────────────────────────
// Golden-Path-FINDER: transienter Wegwerf-SV (voller globaler Buchungs-Guard)
// ─────────────────────────────────────────────────────────────────────────────
// Seit Befund #6 (17.07., src/lib/sv/queries.ts: applyDispatchableFilter .eq('ist_testaccount',
// false)) ist ein Test-Account aus dem globalen Embed-Matching (findBestSV) AUSGESCHLOSSEN — die
// urspruengliche „obskurer Test-SV"-Strategie des Finder-Specs kann daher keinen Slot mehr
// erzeugen. Der Guard braucht einen ECHTEN (ist_testaccount=false) dispatchbaren SV. Wir seeden
// ihn TRANSIENT an einem faehr-isolierten Offshore-Ort (Pellworm, ~0 Finder-Traffic) und LOESCHEN
// ihn im Teardown -> kein persistenter Footprint, minimales Kollateralrisiko (Aaron-Entscheid).

/** Stabiler Email-Prefix + Standort-Marker -> Selbstheilung findet Leichen abgestuerzter Laeufe. */
export const FINDER_SV_EMAIL_PREFIX = 'claimondo-e2e-finder-sv-'
export const FINDER_SV_STANDORT_MARKER = 'Pellworm (E2E-Wegwerf-Finder-SV)'
/** Bucher-Identitaet des Finder-Guards (@claimondo.de -> istInterneIdentitaet -> Send-Isolation). */
export const FINDER_BUCHER_EMAIL_PREFIX = 'e2e-finder-'

export type ThrowawayFinderSv = { svId: string; uid: string; email: string }

/**
 * Seedet einen VOLL dispatchbaren (ist_testaccount=false) Wegwerf-SV am gegebenen Ort mit der
 * gegebenen Isochrone. Spiegelt einen echten kfz-gutachter (paket/typ/verifizierung_status aus
 * dem Prod-Bestand), damit applyDispatchableFilter + Kontingent + Isochrone-Match + Slot-Gen
 * (arbeitszeiten=null -> Default Mo–Fr) durchlaufen. Erzeugt die FK-Kette auth.user -> profiles
 * -> sachverstaendige (handle_new_user-Trigger ist inaktiv -> profiles manuell). Braucht service-role.
 */
export async function seedThrowawayFinderSv(
  db: SupabaseClient,
  opts: { lat: number; lng: number; isochrone: unknown; runId: string },
): Promise<ThrowawayFinderSv> {
  const email = `${FINDER_SV_EMAIL_PREFIX}${opts.runId}@claimondo.de`

  // 1. Auth-User (FK-Wurzel: profiles.id -> auth.users.id). Loggt sich nie ein.
  const { data: created, error: authErr } = await db.auth.admin.createUser({
    email,
    password: `E2eFinderSv-${opts.runId}-Xq9!`,
    email_confirm: true,
  })
  if (authErr || !created?.user) throw new Error(`seedThrowawayFinderSv: createUser: ${authErr?.message ?? 'kein user'}`)
  const uid = created.user.id

  // 2. profiles (Trigger inaktiv -> manuell upserten).
  const { error: profErr } = await db
    .from('profiles')
    .upsert({ id: uid, email, rolle: 'sachverstaendiger' }, { onConflict: 'id' })
  if (profErr) {
    await db.auth.admin.deleteUser(uid).catch(() => {})
    throw new Error(`seedThrowawayFinderSv: profiles: ${profErr.message}`)
  }

  // 3. sachverstaendige — VOLL dispatchable (spiegelt einen echten kfz-gutachter), ist_testaccount=FALSE.
  const { data: sv, error: svErr } = await db
    .from('sachverstaendige')
    .insert({
      profile_id: uid,
      ist_testaccount: false,
      verifiziert: true,
      verifizierung_status: 'geprueft',
      ist_aktiv: true,
      portal_zugang_freigeschaltet: true,
      onboarding_status: 'abgeschlossen',
      gutachter_typ: 'kfz-gutachter',
      paket: 'standard',
      paket_umkreis_km: 20,
      paket_faelle_gesamt: 100,
      paket_faelle_genutzt: 0,
      offene_faelle: 0,
      ablehnungen_30_tage: 0,
      urlaub_von: null,
      urlaub_bis: null,
      gesperrt_seit: null,
      geloescht_am: null,
      standort_lat: opts.lat,
      standort_lng: opts.lng,
      standort_adresse: FINDER_SV_STANDORT_MARKER,
      isochrone_polygon: opts.isochrone,
    })
    .select('id')
    .single()
  if (svErr || !sv) {
    await db.from('profiles').delete().eq('id', uid).then(() => {}, () => {})
    await db.auth.admin.deleteUser(uid).catch(() => {})
    throw new Error(`seedThrowawayFinderSv: sachverstaendige: ${svErr?.message ?? 'kein row'}`)
  }
  return { svId: sv.id as string, uid, email }
}

/**
 * Loescht einen Wegwerf-SV + alle Artefakte, die ein FULL-Submit (bucherEmail) erzeugt haben
 * koennte: gfa (+ dessen Termin), bezug-native Termine (assignee), Lead. Danach die FK-Kette
 * sachverstaendige -> profiles -> auth.user. Best-effort — ein Fehler darf den Teardown nicht werfen.
 */
export async function purgeThrowawayFinderSv(
  db: SupabaseClient,
  handle: { svId?: string | null; uid?: string | null; bucherEmail?: string | null },
): Promise<void> {
  try {
    // 1. Termine der reservierten Buchung zuerst (assignee = Wegwerf-SV). Loest zugleich den
    //    NO-ACTION-FK gutachter_termine.lead_id -> leads (Termin muss VOR dem Lead weg).
    if (handle.svId) await db.from('gutachter_termine').delete().eq('assignee_id', handle.svId)
    // 2. Bucher-Artefakte eines FULL-Submits. Die NO-ACTION-Kinder von leads
    //    (gfa.konvertiert_zu_lead_id, gutachter_termine.lead_id, tasks.lead_id) MUESSEN vor dem
    //    Lead weg; danach raeumt der Lead-Delete via CASCADE flow_links/timeline/lead_historie/
    //    anruf_log/dokument_upload_anfragen/personenschaden_personen selbst ab.
    if (handle.bucherEmail) {
      const { data: leads } = await db.from('leads').select('id').eq('email', handle.bucherEmail)
      const leadIds = (leads ?? []).map((l) => l.id as string)
      await db.from('gutachter_finder_anfragen').delete().eq('email', handle.bucherEmail)
      for (const id of leadIds) {
        await db.from('gutachter_termine').delete().eq('lead_id', id) // Legacy-Bezug (falls nicht assignee-erfasst)
        await db.from('tasks').delete().eq('lead_id', id) // Rueckruf-Task (send-isolation -> i.d.R. keiner)
      }
      await db.from('leads').delete().eq('email', handle.bucherEmail)
    }
    // 3. SV-Kette (Termine sind ab Schritt 1 weg -> sachverstaendige-Delete nicht mehr blockiert).
    if (handle.svId) await db.from('sachverstaendige').delete().eq('id', handle.svId)
    if (handle.uid) {
      await db.from('profiles').delete().eq('id', handle.uid)
      await db.auth.admin.deleteUser(handle.uid).catch(() => {})
    }
  } catch (err) {
    console.error('[golden-finder] purgeThrowawayFinderSv:', (err as Error).message)
  }
}

/**
 * Selbstheilung: entfernt Wegwerf-SVs abgestuerzter Vorlaeufe — auf ZWEI Achsen gefunden
 * (profiles-Email-Prefix UND sachverstaendige-Standort-Marker), damit auch ein halb-geseedeter
 * Rest verschwindet. Vor dem Seeden aufrufen. Best-effort.
 */
export async function purgeStaleThrowawayFinderSvs(db: SupabaseClient): Promise<void> {
  // a) Bucher-Artefakte (gfa/Lead/Termine/tasks) abgestuerzter FULL-Submits per Email-Prefix.
  const staleEmails = new Set<string>()
  const { data: staleLeads } = await db
    .from('leads')
    .select('email')
    .like('email', `${FINDER_BUCHER_EMAIL_PREFIX}%@claimondo.de`)
  for (const l of staleLeads ?? []) if (l.email) staleEmails.add(l.email as string)
  const { data: staleGfas } = await db
    .from('gutachter_finder_anfragen')
    .select('email')
    .like('email', `${FINDER_BUCHER_EMAIL_PREFIX}%@claimondo.de`)
  for (const g of staleGfas ?? []) if (g.email) staleEmails.add(g.email as string)
  for (const email of staleEmails) await purgeThrowawayFinderSv(db, { bucherEmail: email })

  // b) Wegwerf-SV-Ketten (auth+profiles+sachverstaendige) — zwei Achsen: Email-Prefix + Standort-Marker.
  const handles = new Map<string, { svId?: string; uid?: string }>()
  const { data: profs } = await db
    .from('profiles')
    .select('id')
    .like('email', `${FINDER_SV_EMAIL_PREFIX}%`)
  for (const p of profs ?? []) handles.set(`uid:${p.id}`, { uid: p.id as string })
  const { data: svs } = await db
    .from('sachverstaendige')
    .select('id, profile_id')
    .eq('standort_adresse', FINDER_SV_STANDORT_MARKER)
  for (const s of svs ?? []) {
    const uid = (s.profile_id as string | null) ?? null
    if (uid) handles.set(`uid:${uid}`, { ...(handles.get(`uid:${uid}`) ?? {}), uid, svId: s.id as string })
    else handles.set(`sv:${s.id}`, { svId: s.id as string })
  }
  for (const h of handles.values()) await purgeThrowawayFinderSv(db, h)
}
