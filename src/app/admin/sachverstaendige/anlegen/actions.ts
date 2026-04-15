'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { randomBytes } from 'node:crypto'
import { calculateIsochrone } from '@/lib/isochrone/calculate-isochrone'
import { PAKET_KONFIG, type AnlegePaket, type AnlegeSvFormData, type AnlegeBueroFormData, type AnlegeAkademieFormData, type AnlegeCommunityFormData } from './constants'

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

/**
 * AAR-129: Baut Geo-Felder für `organisationen`-Insert.
 * Berechnet die Isochrone via HERE API (AAR-132). Fehler werden geloggt,
 * isochrone_polygon bleibt null und die Org wird trotzdem angelegt —
 * findBestSV fällt dann auf den Radius-Check zurück.
 */
async function buildOrgGeoFields(input: {
  lat: number | null | undefined
  lng: number | null | undefined
  adresse: string | null | undefined
  plz: string | null | undefined
  placeId: string | null | undefined
  radiusKm: number | null | undefined
}): Promise<{
  standort_lat: number | null
  standort_lng: number | null
  standort_adresse: string | null
  standort_plz: string | null
  standort_place_id: string | null
  einsatzgebiet_km: number | null
  isochrone_polygon: { type: 'Polygon'; coordinates: number[][][] } | null
}> {
  const fields = {
    standort_lat: input.lat ?? null,
    standort_lng: input.lng ?? null,
    standort_adresse: input.adresse ?? null,
    standort_plz: input.plz ?? null,
    standort_place_id: input.placeId ?? null,
    einsatzgebiet_km: input.radiusKm ?? null,
    isochrone_polygon: null as { type: 'Polygon'; coordinates: number[][][] } | null,
  }

  if (input.lat == null || input.lng == null || !input.radiusKm || input.radiusKm <= 0) {
    return fields
  }

  try {
    const points = await calculateIsochrone(Number(input.lat), Number(input.lng), Number(input.radiusKm))
    if (points.length >= 3) {
      // GeoJSON: [lng, lat] — Ring schließen wenn erstes ≠ letztes Paar
      const ring = points.map((p) => [p.lng, p.lat])
      const first = ring[0]
      const last = ring[ring.length - 1]
      if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]])
      fields.isochrone_polygon = { type: 'Polygon', coordinates: [ring] }
    }
  } catch (err) {
    console.error('[AAR-129] Isochrone-Berechnung für Organisation fehlgeschlagen:', err)
  }

  return fields
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
  // KFZ-154 Cleanup: legacy 'qualifikationen' Spalte ist gedroppt, nur noch
  // qualifikationen_neu + spezifikationen + schadenarten.
  const { data: svRow, error: svErr } = await adminDb.from('sachverstaendige').insert({
    profile_id: authUser.user.id,
    // AAR-206: user_id mit setzen — Legacy-Queries joinen teilweise via
    // user_id statt profile_id. Siehe AAR-185.
    user_id: authUser.user.id,
    // AAR-207: Firma-Stammdaten aus dem Wizard durchreichen — vorher waren
    // diese Felder auf sachverstaendige trotz vorhandener Spalten null.
    firmenname: data.firmenname || null,
    rechtsform: data.rechtsform || null,
    steuernummer: data.steuernummer || null,
    ust_id: data.ust_id || null,
    hrb: data.hrb || null,
    paket: data.paket === 'individuell' ? 'standard' : data.paket, // 'individuell' wird intern als 'standard' geflaggt mit Override
    gutachter_typ: data.gutachter_typ,
    qualifikationen_neu: data.qualifikationen,
    spezifikationen: data.spezifikationen ?? [],
    schadenarten: data.schadenarten ?? [],
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

  // BUG-90: Isochrone direkt nach SV-Anlage berechnen damit /gutachter/gebiet
  // sofort eine Karte anzeigen kann. Defensive try/catch — wenn OSRM/Fallback
  // failt, ist der SV trotzdem angelegt; das Polygon kann spaeter via
  // /api/recalc-isochrones nachgezogen werden.
  if (data.anschrift_lat != null && data.anschrift_lng != null) {
    try {
      const polygon = await calculateIsochrone(
        data.anschrift_lat,
        data.anschrift_lng,
        cfg.radius_km,
      )
      if (polygon.length > 0) {
        await adminDb
          .from('sachverstaendige')
          .update({ isochrone_polygon: polygon })
          .eq('id', svRow.id)
      }
    } catch (err) {
      console.error('[BUG-90] Isochrone-Berechnung fuer Solo-SV fehlgeschlagen:', err)
    }
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
  // BUG-93 Aaron-Option C: Inhaber-Email darf jetzt im Hauptbuero (standorte[0])
  // wiederverwendet werden — der Inhaber teilt sich dann seinen Login mit dem
  // Hauptbuero-SV-Eintrag (kein zweiter auth.user). Multi-SV-Tolerance via
  // getGutachterForUser ist seit ARCH-1 Phase 2 vorhanden.
  // Aber: nur das HAUPTBUERO darf diese Email haben, NICHT die Filialen 1+.
  const inhaberEmailLower = data.inhaber_email.toLowerCase()
  if (data.inhaber_ist_hauptbuero_mitarbeiter !== true) {
    // Klassischer Fall: Inhaber-Email darf gar nicht als Sub-Email vorkommen
    if (data.sub_standorte.some(s => s.sub_email.toLowerCase() === inhaberEmailLower)) {
      return { success: false, error: 'Inhaber-Email darf nicht als Sub-Standort-Email verwendet werden' }
    }
  } else {
    // Option-C Fall: Hauptbuero-Email muss Inhaber-Email sein, Filialen 1+ duerfen sie NICHT haben
    const hauptbueroEmail = data.sub_standorte[0]?.sub_email?.toLowerCase()
    if (hauptbueroEmail !== inhaberEmailLower) {
      return { success: false, error: 'Wenn Inhaber=Hauptbuero-Mitarbeiter aktiv ist, muss die Hauptbuero-Email der Inhaber-Email entsprechen' }
    }
    if (data.sub_standorte.slice(1).some(s => s.sub_email.toLowerCase() === inhaberEmailLower)) {
      return { success: false, error: 'Inhaber-Email darf nur im Hauptbuero verwendet werden, nicht in Filialen' }
    }
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
  // AAR-129: Für Büro gibt es aktuell keine separate Geo-Auswahl im UI —
  // Büro-Adresse ist frei-Text ohne Google Places. standort_* bleibt daher leer;
  // Wizard-UI-Erweiterung ist Follow-up. Isochrone kann erst mit Koordinaten berechnet werden.
  const bueroGeo = await buildOrgGeoFields({
    lat: null,
    lng: null,
    adresse: data.buero_anschrift || null,
    plz: null,
    placeId: null,
    radiusKm: null,
  })
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
    ...bueroGeo,
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
    // AAR-206: user_id mit setzen (siehe AAR-185-Begründung)
    user_id: inhaberUserId,
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

  // BUG-93 Option C: Inhaber-Email vorseeden, damit der Hauptbuero-Sub-SV die
  // existing inhaberUserId reused (kein neuer auth.user, kein duplicate Profil).
  // Welcome-Mail wird ohnehin separat als Inhaber-Mail versendet — markieren.
  if (data.inhaber_ist_hauptbuero_mitarbeiter === true) {
    emailToUserId.set(data.inhaber_email, inhaberUserId)
    welcomeMailSent.add(data.inhaber_email)
  }

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
    // KFZ-154 Cleanup: nur noch qualifikationen_neu + spezifikationen + schadenarten.
    const subQual = std.qualifikationen ?? []
    const { data: subSvRow } = await adminDb.from('sachverstaendige').insert({
      profile_id: subUserId,
      // AAR-206: user_id mit setzen
      user_id: subUserId,
      organisation_id: organisationId,
      rolle_in_organisation: 'mitarbeiter',
      paket: std.paket === 'individuell' ? 'standard' : std.paket,
      gutachter_typ: 'kfz-gutachter',
      qualifikationen_neu: subQual,
      spezifikationen: std.spezifikationen ?? [],
      schadenarten: std.schadenarten ?? [],
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

      // Mail-Kopie an Inhaber: immer pro Sub-Standort.
      // BUG-93 Option C: NICHT wenn das Hauptbuero der Inhaber selbst ist
      // (er wuerde sich sonst eine 'neuer Mitarbeiter angelegt: YOU' Mail schicken).
      if (std.sub_email.toLowerCase() !== data.inhaber_email.toLowerCase()) {
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
  // KFZ-154: pro Sub-SV eigene Spezialisierungen
  qualifikationen?: string[]
  spezifikationen?: string[]
  schadenarten?: string[]
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

  // KFZ-154 Cleanup: nur noch qualifikationen_neu + spezifikationen + schadenarten
  const subQual = params.qualifikationen ?? []
  const { data: svRow, error: svErr } = await adminDb.from('sachverstaendige').insert({
    profile_id: subUserId,
    // AAR-206: user_id mit setzen
    user_id: subUserId,
    organisation_id: params.organisation_id,
    rolle_in_organisation: 'mitarbeiter',
    paket: params.paket === 'individuell' ? 'standard' : params.paket,
    gutachter_typ: 'kfz-gutachter',
    qualifikationen_neu: subQual,
    spezifikationen: params.spezifikationen ?? [],
    schadenarten: params.schadenarten ?? [],
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

// ═══════════════════════════════════════════════════════════════════════════
// KFZ-152 Phase 2: anlegeAkademie
// ═══════════════════════════════════════════════════════════════════════════

export async function anlegeAkademie(data: AnlegeAkademieFormData): Promise<{
  success: boolean
  error?: string
  organisation_id?: string
  verwalter_sv_id?: string
  sub_sv_ids?: string[]
}> {
  const auth = await ensureAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  if (!data.akademie_name?.trim() || !data.steuernummer?.trim()) {
    return { success: false, error: 'Akademie-Name und Steuernummer sind Pflicht' }
  }
  if (data.anschrift_lat === null || data.anschrift_lng === null) {
    return { success: false, error: 'Anschrift muss via Google Places ausgewaehlt werden' }
  }
  if (!data.verwalter_email?.trim() || !data.verwalter_vorname?.trim() || !data.verwalter_nachname?.trim()) {
    return { success: false, error: 'Verwalter-Stammdaten unvollstaendig' }
  }
  if (data.erst_anzahlung_eur <= 0) {
    return { success: false, error: 'Erst-Anzahlung muss > 0 sein' }
  }

  const adminDb = createAdminClient()

  // Initial-Passwoerter sammeln
  const initialPasswords: Record<string, string> = {}
  initialPasswords['_verwalter'] = randomPassword(16)
  for (const sub of data.sub_svs) {
    if (!initialPasswords[sub.email]) initialPasswords[sub.email] = randomPassword(16)
  }

  // 1. Verwalter auth.users anlegen
  const { data: verwAuth, error: verwAuthErr } = await adminDb.auth.admin.createUser({
    email: data.verwalter_email,
    password: initialPasswords['_verwalter'],
    email_confirm: true,
    user_metadata: { force_password_change: true, von_admin: auth.user_id, rolle: 'akademie_verwalter' },
  })
  if (verwAuthErr || !verwAuth?.user) {
    return { success: false, error: `Verwalter-Auth fehlgeschlagen: ${verwAuthErr?.message ?? 'unbekannt'}` }
  }
  const verwalterUserId = verwAuth.user.id

  // 2. Verwalter profile
  const { error: verwProfileErr } = await adminDb.from('profiles').insert({
    id: verwalterUserId,
    email: data.verwalter_email,
    rolle: 'sachverstaendiger',
    anrede: data.verwalter_anrede || null,
    titel: data.verwalter_titel || null,
    vorname: data.verwalter_vorname,
    nachname: data.verwalter_nachname,
    telefon: data.verwalter_telefon || null,
    force_password_change: true,
  })
  if (verwProfileErr) {
    await adminDb.auth.admin.deleteUser(verwalterUserId)
    return { success: false, error: `Verwalter-Profil fehlgeschlagen: ${verwProfileErr.message}` }
  }

  // 3. Akademie-Org anlegen
  // AAR-129: neue standort_* + isochrone_polygon Felder zusätzlich zu Legacy-Feldern
  const akademieGeo = await buildOrgGeoFields({
    lat: data.anschrift_lat,
    lng: data.anschrift_lng,
    adresse: data.anschrift,
    plz: data.anschrift_plz ?? null,
    placeId: data.anschrift_place_id ?? null,
    radiusKm: data.radius_km,
  })
  const { data: orgRow, error: orgErr } = await adminDb.from('organisationen').insert({
    name: data.akademie_name,
    typ: 'akademie',
    rechtsform: data.rechtsform || null,
    anschrift: data.anschrift,
    steuernummer: data.steuernummer,
    ust_id: data.ust_id || null,
    hauptansprechpartner_user_id: verwalterUserId,
    parent_user_id: verwalterUserId,
    onboarding_status: 'pending',
    einsatzgebiet_zentrum_lat: data.anschrift_lat,
    einsatzgebiet_zentrum_lng: data.anschrift_lng,
    einsatzgebiet_radius_km: data.radius_km,
    akademie_max_faelle_monat: data.max_faelle_monat,
    akademie_radius_km: data.radius_km,
    akademie_erst_anzahlung_eur: data.erst_anzahlung_eur,
    ...akademieGeo,
  }).select('id').single()

  if (orgErr || !orgRow) {
    await adminDb.from('profiles').delete().eq('id', verwalterUserId)
    await adminDb.auth.admin.deleteUser(verwalterUserId)
    return { success: false, error: `Akademie-Anlage fehlgeschlagen: ${orgErr?.message}` }
  }
  const organisationId = orgRow.id

  // 4. Verwalter-sachverstaendige (Verwaltung, kein eigenes Kontingent)
  const { data: verwSvRow, error: verwSvErr } = await adminDb.from('sachverstaendige').insert({
    profile_id: verwalterUserId,
    // AAR-206: user_id mit setzen
    user_id: verwalterUserId,
    organisation_id: organisationId,
    rolle_in_organisation: 'inhaber',
    paket: 'standard',
    gebiet_plz: data.anschrift_plz ? [data.anschrift_plz] : [],
    max_faelle_monat: 0,
    paket_faelle_gesamt: 0,
    paket_faelle_genutzt: 0,
    paket_umkreis_km: 0,
    standort_adresse: data.anschrift,
    standort_plz: data.anschrift_plz,
    standort_lat: data.anschrift_lat,
    standort_lng: data.anschrift_lng,
    qualifikationen_neu: data.qualifikationen,
    spezifikationen: data.spezifikationen,
    schadenarten: data.schadenarten,
    onboarding_status: 'vom_admin_angelegt',
    onboarding_anzahlung_betrag: 0,
    anzahlung_status: 'offen',
    portal_zugang_freigeschaltet: false,
    ist_aktiv: false,
    ist_parent_account: true,
    onboarding_abgeschlossen: false,
  }).select('id').single()

  if (verwSvErr || !verwSvRow) {
    await adminDb.from('organisationen').delete().eq('id', organisationId)
    await adminDb.from('profiles').delete().eq('id', verwalterUserId)
    await adminDb.auth.admin.deleteUser(verwalterUserId)
    return { success: false, error: `Verwalter-SV fehlgeschlagen: ${verwSvErr?.message}` }
  }

  // 5. Sub-SVs anlegen (analog Buero-Loop)
  const subSvIds: string[] = []
  const createdAuthIds: string[] = []
  const emailToUserId = new Map<string, string>()
  emailToUserId.set(data.verwalter_email, verwalterUserId)

  for (const sub of data.sub_svs) {
    const subCfg = paketKonfig(sub.paket)
    let subUserId: string
    if (emailToUserId.has(sub.email)) {
      subUserId = emailToUserId.get(sub.email)!
    } else {
      const { data: subAuth, error: subAuthErr } = await adminDb.auth.admin.createUser({
        email: sub.email,
        password: initialPasswords[sub.email],
        email_confirm: true,
        user_metadata: { force_password_change: true, von_admin: auth.user_id, rolle: 'akademie_sub' },
      })
      if (subAuthErr || !subAuth?.user) {
        for (const uid of createdAuthIds) {
          await adminDb.from('profiles').delete().eq('id', uid)
          await adminDb.auth.admin.deleteUser(uid)
        }
        await adminDb.from('sachverstaendige').delete().eq('organisation_id', organisationId)
        await adminDb.from('organisationen').delete().eq('id', organisationId)
        await adminDb.from('profiles').delete().eq('id', verwalterUserId)
        await adminDb.auth.admin.deleteUser(verwalterUserId)
        return { success: false, error: `Sub-SV-Auth fehlgeschlagen fuer ${sub.email}: ${subAuthErr?.message}` }
      }
      subUserId = subAuth.user.id
      createdAuthIds.push(subUserId)
      emailToUserId.set(sub.email, subUserId)

      await adminDb.from('profiles').insert({
        id: subUserId,
        email: sub.email,
        rolle: 'sachverstaendiger',
        anrede: sub.anrede || null,
        titel: sub.titel || null,
        vorname: sub.vorname,
        nachname: sub.nachname,
        telefon: sub.telefon || null,
        force_password_change: true,
      })
    }

    const { data: subSvRow } = await adminDb.from('sachverstaendige').insert({
      profile_id: subUserId,
      // AAR-206: user_id mit setzen
      user_id: subUserId,
      organisation_id: organisationId,
      rolle_in_organisation: 'akademie_sub',
      paket: sub.paket === 'individuell' ? 'standard' : sub.paket,
      gutachter_typ: 'kfz-gutachter',
      qualifikationen_neu: data.qualifikationen,
      spezifikationen: data.spezifikationen,
      schadenarten: data.schadenarten,
      gebiet_plz: data.anschrift_plz ? [data.anschrift_plz] : [],
      max_faelle_monat: subCfg.kontingent,
      paket_faelle_gesamt: subCfg.kontingent,
      paket_faelle_genutzt: 0,
      paket_umkreis_km: data.radius_km,
      radius_km: data.radius_km,
      standort_adresse: data.anschrift,
      standort_plz: data.anschrift_plz,
      standort_lat: data.anschrift_lat,
      standort_lng: data.anschrift_lng,
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

  // 6. Welcome-Mails
  try {
    const { sendWillkommenSv, sendWillkommenSvAnBuero } = await import('@/lib/email/google/flows')
    await sendWillkommenSv({
      to: data.verwalter_email,
      anrede: data.verwalter_anrede,
      titel: data.verwalter_titel,
      vorname: data.verwalter_vorname,
      nachname: data.verwalter_nachname,
      paket_name: 'Akademie-Verwalter',
      kontingent: 0,
      radius_km: data.radius_km,
      anzahlung_betrag_eur: data.erst_anzahlung_eur,
      initial_password: initialPasswords['_verwalter'],
      organisation_name: data.akademie_name,
      rolle_in_organisation: 'Akademie-Verwalter',
      von_admin_name: auth.admin_name,
    })

    const sentSubMails = new Set<string>()
    for (const sub of data.sub_svs) {
      if (sentSubMails.has(sub.email)) continue
      const subCfg = paketKonfig(sub.paket)
      await sendWillkommenSv({
        to: sub.email,
        anrede: sub.anrede,
        titel: sub.titel,
        vorname: sub.vorname,
        nachname: sub.nachname,
        paket_name: sub.paket === 'individuell' ? 'Individuell' : sub.paket.charAt(0).toUpperCase() + sub.paket.slice(1),
        kontingent: subCfg.kontingent,
        radius_km: data.radius_km,
        anzahlung_betrag_eur: subCfg.preis_anzahlung_eur,
        initial_password: initialPasswords[sub.email],
        organisation_name: data.akademie_name,
        rolle_in_organisation: 'Akademie-Mitglied',
        von_admin_name: auth.admin_name,
      })
      sentSubMails.add(sub.email)
      // Mail-Kopie an Verwalter (analog Buero-Pattern)
      if (sub.email.toLowerCase() !== data.verwalter_email.toLowerCase()) {
        await sendWillkommenSvAnBuero({
          to: data.verwalter_email,
          inhaber_vorname: data.verwalter_vorname,
          buero_name: data.akademie_name,
          neuer_sv_vorname: sub.vorname,
          neuer_sv_nachname: sub.nachname,
          neuer_sv_email: sub.email,
          paket_name: sub.paket === 'individuell' ? 'Individuell' : sub.paket.charAt(0).toUpperCase() + sub.paket.slice(1),
          standort_adresse: data.anschrift,
        })
      }
    }
  } catch (err) {
    console.error('[KFZ-152] Welcome-Mails Akademie fehlgeschlagen:', err)
  }

  revalidatePath('/admin/sachverstaendige', 'page')
  revalidatePath('/admin/organisationen', 'page')

  return {
    success: true,
    organisation_id: organisationId,
    verwalter_sv_id: verwSvRow.id,
    sub_sv_ids: subSvIds,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// KFZ-152 Phase 3: anlegeCommunity
// ═══════════════════════════════════════════════════════════════════════════

export async function anlegeCommunity(data: AnlegeCommunityFormData): Promise<{
  success: boolean
  error?: string
  organisation_id?: string
  member_sv_ids?: string[]
}> {
  const auth = await ensureAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  if (!data.name?.trim()) return { success: false, error: 'Community-Name ist Pflicht' }
  if (data.zentrum_lat === null || data.zentrum_lng === null) {
    return { success: false, error: 'Gebiet-Zentrum muss via Google Places ausgewaehlt werden' }
  }
  if (data.radius_km <= 0) return { success: false, error: 'Radius muss > 0 sein' }
  if (!data.mitglieder?.length) return { success: false, error: 'Mindestens 1 Mitglied erforderlich' }

  const adminDb = createAdminClient()

  // 1. Community-Org anlegen
  // AAR-129: neue standort_* + isochrone_polygon Felder zusätzlich zu Legacy-Feldern.
  // Wenn im Wizard ein manuelles Polygon gezeichnet wurde, nutzen wir DAS für die
  // Isochrone statt HERE — der Admin hat Exklusivitäts-Polygone manuell festgelegt.
  const communityGeo = await (async () => {
    // Manuelles Polygon hat Vorrang (KFZ-152 Phase 3)
    if (data.polygon && data.polygon.length >= 3) {
      const ring = data.polygon.map((p) => [p.lng, p.lat])
      const first = ring[0]
      const last = ring[ring.length - 1]
      if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]])
      return {
        standort_lat: data.zentrum_lat,
        standort_lng: data.zentrum_lng,
        standort_adresse: data.zentrum_anschrift || null,
        standort_plz: data.zentrum_plz || null,
        standort_place_id: data.zentrum_place_id ?? null,
        einsatzgebiet_km: data.radius_km,
        isochrone_polygon: { type: 'Polygon' as const, coordinates: [ring] },
      }
    }
    return buildOrgGeoFields({
      lat: data.zentrum_lat,
      lng: data.zentrum_lng,
      adresse: data.zentrum_anschrift || null,
      plz: data.zentrum_plz || null,
      placeId: data.zentrum_place_id ?? null,
      radiusKm: data.radius_km,
    })
  })()
  const { data: orgRow, error: orgErr } = await adminDb.from('organisationen').insert({
    name: data.name,
    typ: 'community',
    anschrift: data.zentrum_anschrift || null,
    onboarding_status: 'aktiv', // Community ist sofort aktiv (kein eigener Anzahlungs-Flow)
    einsatzgebiet_zentrum_lat: data.zentrum_lat,
    einsatzgebiet_zentrum_lng: data.zentrum_lng,
    einsatzgebiet_radius_km: data.radius_km,
    community_exklusiv: data.exklusiv,
    community_max_faelle_monat: data.max_faelle_monat,
    community_leaderboard_aktiv: true,
    ...communityGeo,
  }).select('id').single()

  if (orgErr || !orgRow) {
    return { success: false, error: `Community-Anlage fehlgeschlagen: ${orgErr?.message}` }
  }
  const organisationId = orgRow.id

  // 2. Wenn Exklusivitaet: Eintrag in gebiet_exklusivitaeten
  // KFZ-152 Phase 3 Follow-up: Polygon hat Vorrang vor Circle. Wenn der Admin
  // im Wizard ein Polygon gezeichnet hat, speichern wir es als GeoJSON Polygon
  // (coordinates = [[[lng,lat], ...]]). Sonst Fallback auf Circle (MVP).
  if (data.exklusiv) {
    let isochronGeoJson: Record<string, unknown>
    if (data.polygon && data.polygon.length >= 3) {
      // GeoJSON-Polygon: erster Ring geschlossen (erstes = letztes Pair)
      const ring = data.polygon.map(p => [p.lng, p.lat])
      const first = ring[0]
      const last = ring[ring.length - 1]
      if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]])
      isochronGeoJson = {
        type: 'Polygon',
        coordinates: [ring],
      }
    } else {
      isochronGeoJson = {
        type: 'Circle',
        coordinates: [data.zentrum_lng, data.zentrum_lat],
        radius_km: data.radius_km,
      }
    }
    await adminDb.from('gebiet_exklusivitaeten').insert({
      organisation_id: organisationId,
      isochron_geojson: isochronGeoJson,
    })
  }

  // 3. Mitglieder anlegen (jeder eigener Account, Solo-aehnlich)
  const memberSvIds: string[] = []
  const createdAuthIds: string[] = []
  const initialPasswords: Record<string, string> = {}

  for (const m of data.mitglieder) {
    if (!initialPasswords[m.email]) initialPasswords[m.email] = randomPassword(16)
    const cfg = paketKonfig(m.paket)

    const { data: memAuth, error: memAuthErr } = await adminDb.auth.admin.createUser({
      email: m.email,
      password: initialPasswords[m.email],
      email_confirm: true,
      user_metadata: { force_password_change: true, von_admin: auth.user_id, rolle: 'community_member' },
    })
    if (memAuthErr || !memAuth?.user) {
      // Rollback
      for (const uid of createdAuthIds) {
        await adminDb.from('profiles').delete().eq('id', uid)
        await adminDb.auth.admin.deleteUser(uid)
      }
      await adminDb.from('sachverstaendige').delete().eq('organisation_id', organisationId)
      await adminDb.from('gebiet_exklusivitaeten').delete().eq('organisation_id', organisationId)
      await adminDb.from('organisationen').delete().eq('id', organisationId)
      return { success: false, error: `Mitglied-Auth fehlgeschlagen fuer ${m.email}: ${memAuthErr?.message}` }
    }
    const memUserId = memAuth.user.id
    createdAuthIds.push(memUserId)

    await adminDb.from('profiles').insert({
      id: memUserId,
      email: m.email,
      rolle: 'sachverstaendiger',
      anrede: m.anrede || null,
      titel: m.titel || null,
      vorname: m.vorname,
      nachname: m.nachname,
      telefon: m.telefon || null,
      force_password_change: true,
    })

    const { data: memSvRow } = await adminDb.from('sachverstaendige').insert({
      profile_id: memUserId,
      // AAR-206: user_id mit setzen
      user_id: memUserId,
      organisation_id: organisationId,
      rolle_in_organisation: 'community_member',
      paket: m.paket === 'individuell' ? 'standard' : m.paket,
      gutachter_typ: 'kfz-gutachter',
      gebiet_plz: [],
      max_faelle_monat: cfg.kontingent,
      paket_faelle_gesamt: cfg.kontingent,
      paket_faelle_genutzt: 0,
      paket_umkreis_km: data.radius_km,
      radius_km: data.radius_km,
      standort_lat: data.zentrum_lat,
      standort_lng: data.zentrum_lng,
      standort_adresse: data.zentrum_anschrift,
      standort_plz: data.zentrum_plz,
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
    if (memSvRow) memberSvIds.push(memSvRow.id)
  }

  // 4. Welcome-Mails
  try {
    const { sendWillkommenSv } = await import('@/lib/email/google/flows')
    for (const m of data.mitglieder) {
      const cfg = paketKonfig(m.paket)
      await sendWillkommenSv({
        to: m.email,
        anrede: m.anrede,
        titel: m.titel,
        vorname: m.vorname,
        nachname: m.nachname,
        paket_name: m.paket === 'individuell' ? 'Individuell' : m.paket.charAt(0).toUpperCase() + m.paket.slice(1),
        kontingent: cfg.kontingent,
        radius_km: data.radius_km,
        anzahlung_betrag_eur: cfg.preis_anzahlung_eur,
        initial_password: initialPasswords[m.email],
        organisation_name: data.name,
        rolle_in_organisation: 'Community-Mitglied',
        von_admin_name: auth.admin_name,
      })
    }
  } catch (err) {
    console.error('[KFZ-152] Welcome-Mails Community fehlgeschlagen:', err)
  }

  revalidatePath('/admin/communities', 'page')
  revalidatePath('/admin/sachverstaendige', 'page')

  return {
    success: true,
    organisation_id: organisationId,
    member_sv_ids: memberSvIds,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// KFZ-152 Phase 3: Listing-Helper fuer Communities
// ═══════════════════════════════════════════════════════════════════════════

export async function listCommunities(): Promise<Array<{
  id: string
  name: string
  exklusiv: boolean
  radius_km: number | null
  max_faelle_monat: number | null
  member_count: number
  created_at: string
}>> {
  const auth = await ensureAdmin()
  if (!auth.ok) return []

  const adminDb = createAdminClient()
  const { data: orgs } = await adminDb.from('organisationen')
    .select('id, name, community_exklusiv, einsatzgebiet_radius_km, community_max_faelle_monat, created_at')
    .eq('typ', 'community')
    .order('created_at', { ascending: false })

  if (!orgs?.length) return []

  // Mitglieder-Counts
  const ids = orgs.map(o => o.id)
  const { data: counts } = await adminDb.from('sachverstaendige')
    .select('organisation_id')
    .in('organisation_id', ids)

  const countMap = new Map<string, number>()
  for (const c of counts ?? []) {
    if (c.organisation_id) countMap.set(c.organisation_id, (countMap.get(c.organisation_id) ?? 0) + 1)
  }

  return orgs.map(o => ({
    id: o.id,
    name: o.name,
    exklusiv: !!o.community_exklusiv,
    radius_km: o.einsatzgebiet_radius_km ? Number(o.einsatzgebiet_radius_km) : null,
    max_faelle_monat: o.community_max_faelle_monat,
    member_count: countMap.get(o.id) ?? 0,
    created_at: o.created_at,
  }))
}
