'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { randomBytes } from 'node:crypto'
import { PAKET_KONFIG, type AnlegePaket, type AnlegeSvFormData, type AnlegeBueroFormData } from './constants'

// ARCH-1 Phase 2 (BLOCK C): Server Actions fuer Admin-Anlage von SVs.
// Drei Modi: Solo / Buero / Sub-SV-zu-bestehendem-Buero.
// Akademie + Community kommen mit KFZ-152 Phase 2/3.
// WICHTIG: Konstanten + Types kommen aus constants.ts wegen Next.js 'use server' Regel
// (nur async functions duerfen aus 'use server' Files exportiert werden).

// ─── Helper ────────────────────────────────────────────────────────────────

/**
 * Generiert ein sicheres 16-Zeichen Random-Passwort fuer Initial-Login.
 * Mix aus alphanum + Sonderzeichen, leicht zu lesen (keine 0/O/1/l/I).
 */
function randomPassword(length = 16): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!#$%&*+-='
  const bytes = randomBytes(length)
  let pw = ''
  for (let i = 0; i < length; i++) {
    pw += alphabet[bytes[i] % alphabet.length]
  }
  return pw
}

async function ensureAdmin(): Promise<{ ok: true; user_id: string; admin_name: string } | { ok: false; error: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }
  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle, vorname, nachname')
    .eq('id', user.id)
    .single()
  if (profile?.rolle !== 'admin') return { ok: false, error: 'Nur Admins koennen SVs anlegen' }
  const admin_name = [profile.vorname, profile.nachname].filter(Boolean).join(' ') || 'Admin'
  return { ok: true, user_id: user.id, admin_name }
}

function paketKonfig(paket: AnlegePaket, override?: {
  kontingent?: number; radius_km?: number; preis_anzahlung_eur?: number
}): { kontingent: number; radius_km: number; preis_anzahlung_eur: number } {
  if (paket === 'individuell') {
    return {
      kontingent: override?.kontingent ?? 10,
      radius_km: override?.radius_km ?? 15,
      preis_anzahlung_eur: override?.preis_anzahlung_eur ?? 1500,
    }
  }
  const cfg = PAKET_KONFIG[paket]
  // Override erlaubt auch fuer Standard-Pakete (Sonder-Konditionen)
  return {
    kontingent: override?.kontingent ?? cfg.kontingent,
    radius_km: override?.radius_km ?? cfg.radius_km,
    preis_anzahlung_eur: override?.preis_anzahlung_eur ?? cfg.preis_anzahlung_eur,
  }
}

// ─── Action 1: anlegeSv (Solo) ─────────────────────────────────────────────

export async function anlegeSv(data: AnlegeSvFormData): Promise<{ success: boolean; error?: string; sv_id?: string; profile_id?: string; initial_password?: string }> {
  const auth = await ensureAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  if (!data.vorname || !data.nachname || !data.email || !data.steuernummer) {
    return { success: false, error: 'vorname, nachname, email, steuernummer sind Pflicht' }
  }
  if (data.paket === 'individuell' && !data.paket_override_anzahlung_eur) {
    return { success: false, error: 'Bei Individuell-Paket muss Anzahlung angegeben werden' }
  }

  const adminDb = createAdminClient()
  const initialPassword = randomPassword(16)
  const cfg = paketKonfig(data.paket, {
    kontingent: data.paket_override_kontingent,
    radius_km: data.paket_override_radius_km,
    preis_anzahlung_eur: data.paket_override_anzahlung_eur,
  })

  // 1. auth.users
  const { data: authUser, error: authErr } = await adminDb.auth.admin.createUser({
    email: data.email,
    password: initialPassword,
    email_confirm: true,
    user_metadata: { force_password_change: true, von_admin: auth.user_id },
  })
  if (authErr || !authUser?.user) {
    return { success: false, error: `Auth-User fehlgeschlagen: ${authErr?.message ?? 'unbekannt'}` }
  }

  // 2. profiles
  const { error: profileErr } = await adminDb.from('profiles').insert({
    id: authUser.user.id,
    email: data.email,
    rolle: 'sachverstaendiger',
    anrede: data.anrede || null,
    titel: data.titel || null,
    vorname: data.vorname,
    nachname: data.nachname,
    telefon: data.telefon || null,
    force_password_change: true,
  })
  if (profileErr) {
    // Rollback auth user
    await adminDb.auth.admin.deleteUser(authUser.user.id)
    return { success: false, error: `Profil fehlgeschlagen: ${profileErr.message}` }
  }

  // 3. sachverstaendige (mit ARCH-1 Status)
  const { data: svRow, error: svErr } = await adminDb.from('sachverstaendige').insert({
    profile_id: authUser.user.id,
    paket: data.paket === 'individuell' ? 'standard' : data.paket, // 'individuell' wird intern als 'standard' geflaggt mit Override
    gutachter_typ: data.gutachter_typ,
    qualifikationen: data.qualifikationen,
    standort_adresse: data.anschrift,
    standort_plz: data.anschrift_plz,
    standort_lat: data.anschrift_lat,
    standort_lng: data.anschrift_lng,
    standort_place_id: data.anschrift_place_id || null,
    gebiet_plz: data.anschrift_plz ? [data.anschrift_plz] : [],
    max_faelle_monat: cfg.kontingent,
    paket_faelle_gesamt: cfg.kontingent,
    paket_faelle_genutzt: 0,
    paket_umkreis_km: cfg.radius_km,
    radius_km: cfg.radius_km,
    anzahlung_faellig: cfg.preis_anzahlung_eur,
    onboarding_anzahlung_betrag: cfg.preis_anzahlung_eur, // KFZ-149 BUG-FOLLOW-4
    anzahlung_status: 'offen',
    onboarding_status: 'vom_admin_angelegt', // ARCH-1 neuer Status
    portal_zugang_freigeschaltet: false, // Hard-Blocker bis Vertrag + Stripe
    onboarding_abgeschlossen: false,
    ist_aktiv: true,
    partner_seit: new Date().toISOString().slice(0, 10),
  }).select('id').single()

  if (svErr || !svRow) {
    // Rollback profile + auth
    await adminDb.from('profiles').delete().eq('id', authUser.user.id)
    await adminDb.auth.admin.deleteUser(authUser.user.id)
    return { success: false, error: `SV-Eintrag fehlgeschlagen: ${svErr?.message}` }
  }

  // 4. Welcome-Mail (fire & forget — Auch wenn Mail failt, SV ist da)
  try {
    const { sendWillkommenSv } = await import('@/lib/email/google/flows')
    await sendWillkommenSv({
      to: data.email,
      anrede: data.anrede,
      titel: data.titel,
      vorname: data.vorname,
      nachname: data.nachname,
      paket_name: data.paket === 'individuell' ? 'Individuell' : data.paket.charAt(0).toUpperCase() + data.paket.slice(1),
      kontingent: cfg.kontingent,
      radius_km: cfg.radius_km,
      anzahlung_betrag_eur: cfg.preis_anzahlung_eur,
      initial_password: initialPassword,
      von_admin_name: auth.admin_name,
    })
  } catch (err) {
    console.error('[ARCH-1] Welcome-Mail an Solo-SV fehlgeschlagen:', err)
  }

  revalidatePath('/admin/sachverstaendige', 'page')
  return {
    success: true,
    sv_id: svRow.id,
    profile_id: authUser.user.id,
    initial_password: initialPassword,
  }
}

// ─── Action 2: anlegeBuero ─────────────────────────────────────────────────

export async function anlegeBuero(data: AnlegeBueroFormData): Promise<{
  success: boolean
  error?: string
  organisation_id?: string
  inhaber_sv_id?: string
  sub_sv_ids?: string[]
}> {
  const auth = await ensureAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  if (!data.buero_name || !data.inhaber_email) {
    return { success: false, error: 'Buero-Name und Inhaber-Email sind Pflicht' }
  }
  if (!data.sub_standorte?.length) {
    return { success: false, error: 'Mindestens ein Sub-Standort erforderlich' }
  }
  if (data.sub_standorte.some(s => !s.sub_email || !s.name)) {
    return { success: false, error: 'Jeder Sub-Standort braucht Name + Email' }
  }
  if (data.sub_standorte.some(s => s.anschrift_lat === null || s.anschrift_lng === null)) {
    return { success: false, error: 'Jeder Sub-Standort braucht Geo-Koordinaten (via Google Places auswaehlen)' }
  }
  // ARCH-1 Phase 2 Update: Inhaber-Email darf NICHT als Sub-Email auftauchen
  // (sonst Konflikt im auth.users Insert + Mapping). Mehrere Subs mit gleicher
  // Email sind erlaubt — die werden zusammengelegt.
  if (data.sub_standorte.some(s => s.sub_email.toLowerCase() === data.inhaber_email.toLowerCase())) {
    return { success: false, error: 'Inhaber-Email darf nicht als Sub-Standort-Email verwendet werden' }
  }

  const adminDb = createAdminClient()
  // Initial-Passworter gesammelt damit wir sie pro Sub mit der Welcome-Mail versenden koennen
  const initialPasswords: Record<string, string> = {}
  initialPasswords['_inhaber'] = randomPassword(16)
  for (const std of data.sub_standorte) {
    initialPasswords[std.sub_email] = randomPassword(16)
  }

  // 1. Inhaber auth.users
  const { data: inhaberAuth, error: inhaberAuthErr } = await adminDb.auth.admin.createUser({
    email: data.inhaber_email,
    password: initialPasswords['_inhaber'],
    email_confirm: true,
    user_metadata: { force_password_change: true, von_admin: auth.user_id, rolle: 'buero_inhaber' },
  })
  if (inhaberAuthErr || !inhaberAuth?.user) {
    return { success: false, error: `Inhaber-Auth fehlgeschlagen: ${inhaberAuthErr?.message ?? 'unbekannt'}` }
  }
  const inhaberUserId = inhaberAuth.user.id

  // 2. Inhaber profile
  const { error: inhaberProfileErr } = await adminDb.from('profiles').insert({
    id: inhaberUserId,
    email: data.inhaber_email,
    rolle: 'sachverstaendiger',
    anrede: data.inhaber_anrede || null,
    titel: data.inhaber_titel || null,
    vorname: data.inhaber_vorname,
    nachname: data.inhaber_nachname,
    telefon: data.inhaber_telefon || null,
    force_password_change: true,
  })
  if (inhaberProfileErr) {
    await adminDb.auth.admin.deleteUser(inhaberUserId)
    return { success: false, error: `Inhaber-Profil fehlgeschlagen: ${inhaberProfileErr.message}` }
  }

  // 3. Organisation
  const { data: orgRow, error: orgErr } = await adminDb.from('organisationen').insert({
    name: data.buero_name,
    typ: 'buero',
    rechtsform: data.buero_rechtsform || null,
    anschrift: data.buero_anschrift || null,
    steuernummer: data.buero_steuernummer || null,
    ust_id: data.buero_ust_id || null,
    hauptansprechpartner_user_id: inhaberUserId,
    parent_user_id: inhaberUserId,
    onboarding_status: 'pending',
  }).select('id').single()

  if (orgErr || !orgRow) {
    await adminDb.from('profiles').delete().eq('id', inhaberUserId)
    await adminDb.auth.admin.deleteUser(inhaberUserId)
    return { success: false, error: `Org-Anlage fehlgeschlagen: ${orgErr?.message}` }
  }
  const organisationId = orgRow.id

  // 4. Inhaber-sachverstaendige (kein eigenes Kontingent, ist nur Verwaltung)
  const { data: inhaberSvRow, error: inhaberSvErr } = await adminDb.from('sachverstaendige').insert({
    profile_id: inhaberUserId,
    organisation_id: organisationId,
    rolle_in_organisation: 'inhaber',
    paket: 'standard', // Pflichtfeld, wird nicht genutzt
    gebiet_plz: [],
    max_faelle_monat: 0,
    paket_faelle_gesamt: 0,
    paket_faelle_genutzt: 0,
    paket_umkreis_km: 0,
    onboarding_status: 'vom_admin_angelegt',
    onboarding_anzahlung_betrag: 0,
    anzahlung_status: 'offen',
    portal_zugang_freigeschaltet: false,
    ist_aktiv: false, // erst aktiv nach Buero-Anzahlung
    ist_parent_account: true,
    onboarding_abgeschlossen: false,
  }).select('id').single()

  if (inhaberSvErr || !inhaberSvRow) {
    await adminDb.from('organisationen').delete().eq('id', organisationId)
    await adminDb.from('profiles').delete().eq('id', inhaberUserId)
    await adminDb.auth.admin.deleteUser(inhaberUserId)
    return { success: false, error: `Inhaber-SV fehlgeschlagen: ${inhaberSvErr?.message}` }
  }

  // 5. Pro Sub-Standort: auth.users + profiles + sachverstaendige
  // ARCH-1 Phase 2 Update: gleiche Email darf MEHRFACH vorkommen (z.B. eine
  // Person managed mehrere Sub-Standorte). Pro unique Email wird nur EIN
  // auth.users + profiles + Welcome-Mail angelegt; alle Sub-Standorte mit
  // dieser Email teilen sich den selben profile_id und bekommen jeweils einen
  // eigenen sachverstaendige-Eintrag.
  const subSvIds: string[] = []
  const createdAuthUserIds: string[] = []
  // Mapping: Email → User-ID (fuer Wiederverwendung im selben Buero-Anlege-Flow)
  const emailToUserId = new Map<string, string>()
  // Mapping: Email → wurde Welcome-Mail schon versendet?
  const welcomeMailSent = new Set<string>()

  for (const std of data.sub_standorte) {
    const subCfg = paketKonfig(std.paket)
    let subUserId: string

    if (emailToUserId.has(std.sub_email)) {
      // ARCH-1 Update: Email schon im Wizard verwendet → existing User wiederverwenden
      subUserId = emailToUserId.get(std.sub_email)!
    } else {
      // Neuer User: auth.users + profiles + Welcome-Mail (spaeter im Mail-Block)
      const subPw = initialPasswords[std.sub_email]
      const { data: subAuth, error: subAuthErr } = await adminDb.auth.admin.createUser({
        email: std.sub_email,
        password: subPw,
        email_confirm: true,
        user_metadata: { force_password_change: true, von_admin: auth.user_id, rolle: 'buero_mitarbeiter' },
      })

      if (subAuthErr || !subAuth?.user) {
        // Rollback alles bisher angelegte
        for (const uid of createdAuthUserIds) {
          await adminDb.from('profiles').delete().eq('id', uid)
          await adminDb.auth.admin.deleteUser(uid)
        }
        await adminDb.from('sachverstaendige').delete().eq('organisation_id', organisationId)
        await adminDb.from('organisationen').delete().eq('id', organisationId)
        await adminDb.from('profiles').delete().eq('id', inhaberUserId)
        await adminDb.auth.admin.deleteUser(inhaberUserId)
        return { success: false, error: `Sub-Auth fehlgeschlagen fuer ${std.sub_email}: ${subAuthErr?.message}` }
      }
      subUserId = subAuth.user.id
      createdAuthUserIds.push(subUserId)
      emailToUserId.set(std.sub_email, subUserId)

      // Sub profile (nur einmal pro unique Email)
      await adminDb.from('profiles').insert({
        id: subUserId,
        email: std.sub_email,
        rolle: 'sachverstaendiger',
        anrede: std.sub_anrede || null,
        titel: std.sub_titel || null,
        vorname: std.sub_vorname,
        nachname: std.sub_nachname,
        force_password_change: true,
      })
    }

    // 5c. Sub sachverstaendige (immer ein neuer Eintrag, auch wenn Email wiederverwendet)
    const { data: subSvRow } = await adminDb.from('sachverstaendige').insert({
      profile_id: subUserId,
      organisation_id: organisationId,
      rolle_in_organisation: 'mitarbeiter',
      paket: std.paket === 'individuell' ? 'standard' : std.paket,
      gutachter_typ: 'kfz-gutachter',
      gebiet_plz: std.anschrift_plz ? [std.anschrift_plz] : [],
      max_faelle_monat: subCfg.kontingent,
      paket_faelle_gesamt: subCfg.kontingent,
      paket_faelle_genutzt: 0,
      paket_umkreis_km: subCfg.radius_km,
      radius_km: subCfg.radius_km,
      standort_adresse: std.anschrift,
      standort_plz: std.anschrift_plz,
      standort_lat: std.anschrift_lat,
      standort_lng: std.anschrift_lng,
      standort_place_id: std.anschrift_place_id || null,
      anzahlung_faellig: subCfg.preis_anzahlung_eur,
      onboarding_anzahlung_betrag: subCfg.preis_anzahlung_eur,
      anzahlung_status: 'offen',
      onboarding_status: 'vom_admin_angelegt',
      portal_zugang_freigeschaltet: false,
      ist_aktiv: false,
      ist_parent_account: false,
      onboarding_abgeschlossen: false,
      partner_seit: new Date().toISOString().slice(0, 10),
    }).select('id').single()
    if (subSvRow) subSvIds.push(subSvRow.id)
  }

  // 6. Welcome-Mails (fire & forget)
  try {
    const { sendWillkommenSv, sendWillkommenSvAnBuero } = await import('@/lib/email/google/flows')

    // Mail 1: Welcome an Inhaber
    await sendWillkommenSv({
      to: data.inhaber_email,
      anrede: data.inhaber_anrede,
      titel: data.inhaber_titel,
      vorname: data.inhaber_vorname,
      nachname: data.inhaber_nachname,
      paket_name: 'Buero-Inhaber',
      kontingent: 0,
      radius_km: 0,
      anzahlung_betrag_eur: data.sub_standorte.reduce((sum, s) => sum + paketKonfig(s.paket).preis_anzahlung_eur, 0),
      initial_password: initialPasswords['_inhaber'],
      organisation_name: data.buero_name,
      rolle_in_organisation: 'Inhaber',
      von_admin_name: auth.admin_name,
    })

    // Pro Sub-Standort: Welcome an Sub (nur einmal pro unique Email) +
    // Mail-Kopie an Inhaber (immer pro Sub-Standort, weil Inhaber wissen
    // soll dass ein neuer Standort angelegt wurde)
    for (const std of data.sub_standorte) {
      const subCfg = paketKonfig(std.paket)

      // Welcome-Mail nur EINMAL pro unique Email (Spam-Schutz bei gleicher
      // Email fuer mehrere Sub-Standorte)
      if (!welcomeMailSent.has(std.sub_email)) {
        await sendWillkommenSv({
          to: std.sub_email,
          anrede: std.sub_anrede,
          titel: std.sub_titel,
          vorname: std.sub_vorname,
          nachname: std.sub_nachname,
          paket_name: std.paket === 'individuell' ? 'Individuell' : std.paket.charAt(0).toUpperCase() + std.paket.slice(1),
          kontingent: subCfg.kontingent,
          radius_km: subCfg.radius_km,
          anzahlung_betrag_eur: subCfg.preis_anzahlung_eur,
          initial_password: initialPasswords[std.sub_email],
          organisation_name: data.buero_name,
          rolle_in_organisation: 'Mitarbeiter',
          von_admin_name: auth.admin_name,
        })
        welcomeMailSent.add(std.sub_email)
      }

      // Mail-Kopie an Inhaber: immer pro Sub-Standort
      await sendWillkommenSvAnBuero({
        to: data.inhaber_email,
        inhaber_vorname: data.inhaber_vorname,
        buero_name: data.buero_name,
        neuer_sv_vorname: std.sub_vorname,
        neuer_sv_nachname: std.sub_nachname,
        neuer_sv_email: std.sub_email,
        paket_name: std.paket === 'individuell' ? 'Individuell' : std.paket.charAt(0).toUpperCase() + std.paket.slice(1),
        standort_adresse: std.anschrift,
      })
    }
  } catch (err) {
    console.error('[ARCH-1] Welcome-Mails Buero fehlgeschlagen:', err)
  }

  revalidatePath('/admin/sachverstaendige', 'page')
  revalidatePath('/admin/organisationen', 'page')

  return {
    success: true,
    organisation_id: organisationId,
    inhaber_sv_id: inhaberSvRow.id,
    sub_sv_ids: subSvIds,
  }
}

// ─── Action 3: anlegeSubSv (Sub zu bestehender Org hinzufuegen) ───────────

export async function anlegeSubSv(params: {
  organisation_id: string
  sub_anrede?: string
  sub_titel?: string
  sub_email: string
  sub_vorname: string
  sub_nachname: string
  sub_telefon?: string
  anschrift: string
  anschrift_lat: number | null
  anschrift_lng: number | null
  anschrift_place_id?: string
  anschrift_plz: string
  paket: AnlegePaket
}): Promise<{ success: boolean; error?: string; sv_id?: string }> {
  const auth = await ensureAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  if (!params.organisation_id || !params.sub_email || !params.sub_vorname || !params.sub_nachname) {
    return { success: false, error: 'organisation_id, email, vorname, nachname sind Pflicht' }
  }
  if (params.anschrift_lat === null || params.anschrift_lng === null) {
    return { success: false, error: 'Anschrift muss via Google Places ausgewaehlt werden (Geo-Koordinaten Pflicht)' }
  }

  const adminDb = createAdminClient()

  // Org laden + verifizieren dass sie existiert
  const { data: org } = await adminDb.from('organisationen')
    .select('id, name, typ, hauptansprechpartner_user_id')
    .eq('id', params.organisation_id)
    .maybeSingle()
  if (!org) return { success: false, error: 'Organisation nicht gefunden' }

  const initialPassword = randomPassword(16)
  const cfg = paketKonfig(params.paket)

  // Auth + Profile + SV
  const { data: subAuth, error: subAuthErr } = await adminDb.auth.admin.createUser({
    email: params.sub_email,
    password: initialPassword,
    email_confirm: true,
    user_metadata: { force_password_change: true, von_admin: auth.user_id, rolle: 'buero_mitarbeiter' },
  })
  if (subAuthErr || !subAuth?.user) {
    return { success: false, error: `Auth fehlgeschlagen: ${subAuthErr?.message}` }
  }
  const subUserId = subAuth.user.id

  const { error: profileErr } = await adminDb.from('profiles').insert({
    id: subUserId,
    email: params.sub_email,
    rolle: 'sachverstaendiger',
    anrede: params.sub_anrede || null,
    titel: params.sub_titel || null,
    vorname: params.sub_vorname,
    nachname: params.sub_nachname,
    telefon: params.sub_telefon || null,
    force_password_change: true,
  })
  if (profileErr) {
    await adminDb.auth.admin.deleteUser(subUserId)
    return { success: false, error: `Profil fehlgeschlagen: ${profileErr.message}` }
  }

  const { data: svRow, error: svErr } = await adminDb.from('sachverstaendige').insert({
    profile_id: subUserId,
    organisation_id: params.organisation_id,
    rolle_in_organisation: 'mitarbeiter',
    paket: params.paket === 'individuell' ? 'standard' : params.paket,
    gutachter_typ: 'kfz-gutachter',
    gebiet_plz: params.anschrift_plz ? [params.anschrift_plz] : [],
    max_faelle_monat: cfg.kontingent,
    paket_faelle_gesamt: cfg.kontingent,
    paket_faelle_genutzt: 0,
    paket_umkreis_km: cfg.radius_km,
    radius_km: cfg.radius_km,
    standort_adresse: params.anschrift,
    standort_plz: params.anschrift_plz,
    standort_lat: params.anschrift_lat,
    standort_lng: params.anschrift_lng,
    standort_place_id: params.anschrift_place_id || null,
    anzahlung_faellig: cfg.preis_anzahlung_eur,
    onboarding_anzahlung_betrag: cfg.preis_anzahlung_eur,
    anzahlung_status: 'offen',
    onboarding_status: 'vom_admin_angelegt',
    portal_zugang_freigeschaltet: false,
    ist_aktiv: false,
    ist_parent_account: false,
    onboarding_abgeschlossen: false,
    partner_seit: new Date().toISOString().slice(0, 10),
  }).select('id').single()

  if (svErr || !svRow) {
    await adminDb.from('profiles').delete().eq('id', subUserId)
    await adminDb.auth.admin.deleteUser(subUserId)
    return { success: false, error: `SV-Eintrag fehlgeschlagen: ${svErr?.message}` }
  }

  // Welcome-Mails: an Sub + Kopie an Inhaber
  try {
    const { sendWillkommenSv, sendWillkommenSvAnBuero } = await import('@/lib/email/google/flows')
    await sendWillkommenSv({
      to: params.sub_email,
      anrede: params.sub_anrede,
      titel: params.sub_titel,
      vorname: params.sub_vorname,
      nachname: params.sub_nachname,
      paket_name: params.paket === 'individuell' ? 'Individuell' : params.paket.charAt(0).toUpperCase() + params.paket.slice(1),
      kontingent: cfg.kontingent,
      radius_km: cfg.radius_km,
      anzahlung_betrag_eur: cfg.preis_anzahlung_eur,
      initial_password: initialPassword,
      organisation_name: org.name,
      rolle_in_organisation: 'Mitarbeiter',
      von_admin_name: auth.admin_name,
    })

    // Inhaber-Email holen
    if (org.hauptansprechpartner_user_id) {
      const { data: inhaberProfile } = await adminDb.from('profiles')
        .select('email, vorname')
        .eq('id', org.hauptansprechpartner_user_id)
        .single()
      if (inhaberProfile?.email) {
        await sendWillkommenSvAnBuero({
          to: inhaberProfile.email,
          inhaber_vorname: inhaberProfile.vorname ?? 'Inhaber',
          buero_name: org.name,
          neuer_sv_vorname: params.sub_vorname,
          neuer_sv_nachname: params.sub_nachname,
          neuer_sv_email: params.sub_email,
          paket_name: params.paket === 'individuell' ? 'Individuell' : params.paket.charAt(0).toUpperCase() + params.paket.slice(1),
          standort_adresse: params.anschrift,
        })
      }
    }
  } catch (err) {
    console.error('[ARCH-1] Welcome-Mails Sub-SV fehlgeschlagen:', err)
  }

  revalidatePath('/admin/sachverstaendige', 'page')
  return { success: true, sv_id: svRow.id }
}

// ─── Helper: bestehende Buero-Organisationen laden (fuer Sub-SV-Dropdown) ──

export async function listBueroOrganisationen(): Promise<Array<{ id: string; name: string }>> {
  const auth = await ensureAdmin()
  if (!auth.ok) return []

  const adminDb = createAdminClient()
  const { data } = await adminDb.from('organisationen')
    .select('id, name')
    .eq('typ', 'buero')
    .order('created_at', { ascending: false })
  return data ?? []
}
