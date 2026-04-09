import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST() {
  // Auth check: only admins
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) {
    return Response.json({ error: 'Nicht eingeloggt' }, { status: 401 })
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  if (profile?.rolle !== 'admin') {
    return Response.json({ error: 'Nur Admins' }, { status: 403 })
  }

  const admin = createAdminClient()
  const now = new Date()
  const summary: string[] = []

  // Helper: create auth user
  const ensureAuthUser = async (email: string): Promise<string> => {
    const { data: authUser, error } = await admin.auth.admin.createUser({
      email,
      password: 'Test1234!',
      email_confirm: true,
    })
    if (error) throw new Error(`Auth ${email}: ${error.message}`)
    return authUser.user.id
  }

  try {
    // ═══════════════════════════════════════════════════════════════════
    // 0. CLEANUP - Delete existing test data for idempotency
    // ═══════════════════════════════════════════════════════════════════
    const allTestEmails = [
      'aaron@claimondo.de', 'lisa@claimondo.de', 'max@claimondo.de', 'sarah@claimondo.de',
      'thomas@gutachter-becker.de', 'info@ib-hartmann.de', 'wagner@dat-sv.de', 'fischer@akademie-sv.de',
      'kanzlei@lex-drive.de',
      'julia.braun@kunde.de', 'michael.hoffmann@kunde.de', 'sandra.lehmann@kunde.de',
      'robert.zimmermann@kunde.de', 'christina.bauer@kunde.de',
    ]

    // Get existing auth users list once
    const { data: existingAuthData } = await admin.auth.admin.listUsers({ perPage: 1000 })
    const existingUsers = existingAuthData?.users ?? []

    // Collect test user IDs for cascade cleanup
    const testUserIds: string[] = []
    for (const email of allTestEmails) {
      const found = existingUsers.find(u => u.email === email)
      if (found) testUserIds.push(found.id)
    }

    // Delete dependent data first (cascade may not cover everything via service role)
    if (testUserIds.length > 0) {
      // Get sachverstaendige IDs for these profiles
      const { data: svRows } = await admin
        .from('sachverstaendige')
        .select('id')
        .in('profile_id', testUserIds)
      const svIdsToDelete = (svRows ?? []).map(s => s.id)

      if (svIdsToDelete.length > 0) {
        await admin.from('gutachter_mitteilungen').delete().in('sv_id', svIdsToDelete)
        await admin.from('gutachter_abrechnungen').delete().in('sv_id', svIdsToDelete)
        await admin.from('gutachter_einzahlungen').delete().in('sv_id', svIdsToDelete)
        await admin.from('gutachter_termine').delete().in('sv_id', svIdsToDelete)
      }

      // Get faelle IDs for these users (as kunde or kundenbetreuer)
      const { data: faelleRows } = await admin
        .from('faelle')
        .select('id')
        .or(`kunde_id.in.(${testUserIds.join(',')}),kundenbetreuer_id.in.(${testUserIds.join(',')})`)
      const fallIdsToDelete = (faelleRows ?? []).map(f => f.id)

      if (fallIdsToDelete.length > 0) {
        await admin.from('timeline').delete().in('fall_id', fallIdsToDelete)
        await admin.from('tasks').delete().in('fall_id', fallIdsToDelete)
        await admin.from('nachrichten').delete().in('fall_id', fallIdsToDelete)
        await admin.from('pflichtdokumente').delete().in('fall_id', fallIdsToDelete)
        await admin.from('dokumente').delete().in('fall_id', fallIdsToDelete)
        await admin.from('qc_checkliste').delete().in('fall_id', fallIdsToDelete)
        await admin.from('faelle').delete().in('id', fallIdsToDelete)
      }

      // Delete leads by test emails
      const leadEmails = [
        'max@email.de', 'anna@email.de', 'peter@email.de', 'julia@email.de',
        'thomas.n@email.de', 'sandra@email.de', 'michael@email.de', 'laura@email.de',
        'stefan@email.de', 'martina@email.de',
      ]
      await admin.from('leads').delete().in('email', leadEmails)

      // Delete finance reports
      await admin.from('finance_monatsberichte').delete().in('monat', ['April', 'Mai', 'Juni'])

      // Delete sachverstaendige entries
      if (svIdsToDelete.length > 0) {
        await admin.from('sachverstaendige').delete().in('id', svIdsToDelete)
      }

      // Delete profiles
      await admin.from('profiles').delete().in('id', testUserIds)

      // Delete auth users
      for (const uid of testUserIds) {
        await admin.auth.admin.deleteUser(uid)
      }
    }
    summary.push('Cleanup: Bestehende Testdaten entfernt')

    // ═══════════════════════════════════════════════════════════════════
    // 1. TEAM (4 users + profiles)
    // ═══════════════════════════════════════════════════════════════════
    const teamUsers = [
      { email: 'aaron@claimondo.de', vorname: 'Aaron', nachname: 'Sprafke', rolle: 'admin' as const },
      { email: 'lisa@claimondo.de', vorname: 'Lisa', nachname: 'Mueller', rolle: 'leadbearbeiter' as const },
      { email: 'max@claimondo.de', vorname: 'Max', nachname: 'Schmidt', rolle: 'kundenbetreuer' as const },
      { email: 'sarah@claimondo.de', vorname: 'Sarah', nachname: 'Weber', rolle: 'kundenbetreuer' as const },
    ]

    const teamIds: Record<string, string> = {}
    for (const u of teamUsers) {
      const uid = await ensureAuthUser(u.email)
      teamIds[u.email] = uid
      await admin.from('profiles').upsert({
        id: uid, email: u.email, rolle: u.rolle,
        vorname: u.vorname, nachname: u.nachname,
        force_password_change: false,
      })
    }
    summary.push(`Team: ${teamUsers.length} User erstellt`)

    // ═══════════════════════════════════════════════════════════════════
    // 2. GUTACHTER (4 + profiles + sachverstaendige entries)
    // ═══════════════════════════════════════════════════════════════════
    const gutachterDefs = [
      {
        email: 'thomas@gutachter-becker.de', vorname: 'Thomas', nachname: 'Becker',
        telefon: '0221-5551234',
        gutachter_typ: 'kfz-gutachter',
        standort_adresse: 'Hohe Str. 1, 50667 Koeln', standort_plz: '50667',
        standort_lat: 50.9375, standort_lng: 6.9603,
        paket: 'standard-25' as const, paket_faelle_gesamt: 25, paket_umkreis_km: 40,
        guthaben: 3750, anzahlung_status: 'bezahlt' as const,
        onboarding_abgeschlossen: true, ist_parent_account: false,
        qualifikationen_neu: ['Haftpflichtschaden', 'Kaskoschaden'],
      },
      {
        email: 'info@ib-hartmann.de', vorname: 'Stefan', nachname: 'Hartmann',
        telefon: '0211-5559876',
        gutachter_typ: 'gutachterbuero',
        standort_adresse: 'Koenigsallee 10, 40213 Duesseldorf', standort_plz: '40213',
        standort_lat: 51.2277, standort_lng: 6.7735,
        paket: 'premium-50' as const, paket_faelle_gesamt: 50, paket_umkreis_km: 100,
        guthaben: 7500, anzahlung_status: 'bezahlt' as const,
        onboarding_abgeschlossen: true, ist_parent_account: true,
        qualifikationen_neu: ['Haftpflichtschaden', 'Kaskoschaden'],
        spezifikationen: ['LKW', 'Nutzfahrzeuge'],
      },
      {
        email: 'wagner@dat-sv.de', vorname: 'Klaus', nachname: 'Wagner',
        telefon: '0228-5554321',
        gutachter_typ: 'dat-gutachter',
        standort_adresse: 'Muensterplatz 5, 53111 Bonn', standort_plz: '53111',
        standort_lat: 50.7374, standort_lng: 7.0982,
        paket: 'standard' as const, paket_faelle_gesamt: 10, paket_umkreis_km: 15,
        guthaben: 1500, anzahlung_status: 'bezahlt' as const,
        onboarding_abgeschlossen: true, ist_parent_account: false,
        qualifikationen_neu: ['Haftpflichtschaden', 'Kaskoschaden'],
      },
      {
        email: 'fischer@akademie-sv.de', vorname: 'Maria', nachname: 'Fischer',
        telefon: '0241-5556789',
        gutachter_typ: 'akademie',
        standort_adresse: 'Templergraben 20, 52062 Aachen', standort_plz: '52062',
        standort_lat: 50.7753, standort_lng: 6.0839,
        paket: 'standard-25' as const, paket_faelle_gesamt: 25, paket_umkreis_km: 40,
        guthaben: 3750, anzahlung_status: 'bezahlt' as const,
        onboarding_abgeschlossen: true, ist_parent_account: false,
        qualifikationen_neu: ['Haftpflichtschaden', 'Gerichtsgutachten', 'Beweissicherung'],
        spezifikationen: ['Oldtimer'],
      },
    ]

    const svIds: Record<string, string> = {} // email -> sachverstaendige.id
    const svProfileIds: Record<string, string> = {} // email -> profile.id

    for (const sv of gutachterDefs) {
      const profileId = await ensureAuthUser(sv.email)
      svProfileIds[sv.email] = profileId
      await admin.from('profiles').upsert({
        id: profileId, email: sv.email, rolle: 'sachverstaendiger',
        vorname: sv.vorname, nachname: sv.nachname, telefon: sv.telefon,
        force_password_change: false,
      })

      const { data: newSv, error: svErr } = await admin.from('sachverstaendige').insert({
        profile_id: profileId,
        gutachter_typ: sv.gutachter_typ,
        standort_adresse: sv.standort_adresse, standort_plz: sv.standort_plz,
        standort_lat: sv.standort_lat, standort_lng: sv.standort_lng,
        lat: sv.standort_lat, lng: sv.standort_lng,
        gebiet_plz: [sv.standort_plz],
        paket: sv.paket, paket_faelle_gesamt: sv.paket_faelle_gesamt,
        paket_umkreis_km: sv.paket_umkreis_km, radius_km: sv.paket_umkreis_km,
        max_faelle_monat: sv.paket_faelle_gesamt,
        guthaben: sv.guthaben,
        anzahlung_status: sv.anzahlung_status,
        onboarding_abgeschlossen: sv.onboarding_abgeschlossen,
        qualifikationen_neu: sv.qualifikationen_neu,
        spezifikationen: ('spezifikationen' in sv ? (sv as { spezifikationen?: string[] }).spezifikationen : null) ?? [],
        ist_aktiv: true,
        ist_parent_account: sv.ist_parent_account,
      }).select('id').single()
      if (svErr) throw new Error(`SV ${sv.email}: ${svErr.message}`)
      svIds[sv.email] = newSv!.id
    }
    summary.push(`Gutachter: ${gutachterDefs.length} erstellt`)

    // ═══════════════════════════════════════════════════════════════════
    // 3. KANZLEI (1 user)
    // ═══════════════════════════════════════════════════════════════════
    {
      const kEmail = 'kanzlei@lex-drive.de'
      const uid = await ensureAuthUser(kEmail)
      await admin.from('profiles').upsert({
        id: uid, email: kEmail, rolle: 'kanzlei',
        vorname: 'Lex-Drive', nachname: 'Kanzlei',
        force_password_change: false,
      })
      summary.push('Kanzlei: 1 User erstellt')
    }

    // ═══════════════════════════════════════════════════════════════════
    // 4. LEADS (10 in various statuses)
    // ═══════════════════════════════════════════════════════════════════
    const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000).toISOString()

    const hoursFromNow = (h: number) => new Date(now.getTime() + h * 3600000).toISOString()

    const leadDefs = [
      {
        vorname: 'Max', nachname: 'Mustermann', telefon: '+491633628571', email: 'max@email.de',
        fahrzeug_hersteller: 'BMW', fahrzeug_modell: '3er',
        schadenfall_typ: 'sf-01', kunden_konstellation: 'kk-01',
        status: 'neu' as const, qualifizierungs_phase: 'neu', created_at: daysAgo(2),
      },
      {
        vorname: 'Anna', nachname: 'Klein', telefon: '+491633628571', email: 'anna@email.de',
        fahrzeug_hersteller: 'VW', fahrzeug_modell: 'Golf',
        schadenfall_typ: 'sf-01', kunden_konstellation: 'kk-01',
        status: 'quali-offen' as const, qualifizierungs_phase: 'rueckruf',
        mietwagen_flag: true, created_at: daysAgo(5),
        rueckruf_datum: hoursFromNow(1), rueckruf_notiz: 'Kunde ab 14 Uhr erreichbar',
      },
      {
        vorname: 'Peter', nachname: 'Gross', telefon: '+491633628571', email: 'peter@email.de',
        fahrzeug_hersteller: 'Audi', fahrzeug_modell: 'A4',
        schadenfall_typ: 'sf-02', kunden_konstellation: 'kk-01',
        status: 'flow-gesendet' as const, qualifizierungs_phase: 'sa-ausstehend',
        sa_unterschrieben: true, created_at: daysAgo(8),
      },
      {
        vorname: 'Julia', nachname: 'Braun', telefon: '+491633628571', email: 'julia@email.de',
        fahrzeug_hersteller: 'Mercedes', fahrzeug_modell: 'C-Klasse',
        schadenfall_typ: 'sf-01', kunden_konstellation: 'kk-02',
        status: 'umgewandelt' as const, qualifizierungs_phase: 'konvertiert',
        leasing_flag: true, personenschaden_flag: true, created_at: daysAgo(15),
      },
      {
        vorname: 'Thomas', nachname: 'Neumann', telefon: '+491633628571', email: 'thomas.n@email.de',
        fahrzeug_hersteller: 'Ford', fahrzeug_modell: 'Focus',
        schadenfall_typ: 'sf-01', kunden_konstellation: 'kk-01',
        status: 'neu' as const, qualifizierungs_phase: 'rueckruf', created_at: daysAgo(1),
        rueckruf_datum: hoursFromNow(0.5), rueckruf_notiz: 'Dringend - Unfall gestern',
      },
      {
        vorname: 'Sandra', nachname: 'Hoffmann', telefon: '+491633628571', email: 'sandra@email.de',
        fahrzeug_hersteller: 'Opel', fahrzeug_modell: 'Astra',
        schadenfall_typ: 'sf-03', kunden_konstellation: 'kk-01',
        status: 'rueckruf' as const, qualifizierungs_phase: 'nicht-erreicht',
        polizeibericht_pflicht: true, created_at: daysAgo(3),
        anruf_versuche: 3, letzter_anruf_am: daysAgo(1), letzter_anruf_status: 'nicht-erreicht',
      },
      {
        vorname: 'Michael', nachname: 'Richter', telefon: '+491633628571', email: 'michael@email.de',
        fahrzeug_hersteller: 'Toyota', fahrzeug_modell: 'Corolla',
        schadenfall_typ: 'sf-01', kunden_konstellation: 'kk-01',
        status: 'quali-offen' as const, qualifizierungs_phase: 'in-qualifizierung',
        created_at: daysAgo(4),
      },
      {
        vorname: 'Laura', nachname: 'Bauer', telefon: '+491633628571', email: 'laura@email.de',
        fahrzeug_hersteller: 'Skoda', fahrzeug_modell: 'Octavia',
        schadenfall_typ: 'sf-04', kunden_konstellation: 'kk-01',
        status: 'disqualifiziert' as const, qualifizierungs_phase: 'schadentyp-erfasst',
        disqualifizierung_grund: 'Kein Anspruch - Eigenverschulden', created_at: daysAgo(10),
      },
      {
        vorname: 'Stefan', nachname: 'Koch', telefon: '+491633628571', email: 'stefan@email.de',
        fahrzeug_hersteller: 'Hyundai', fahrzeug_modell: 'i30',
        schadenfall_typ: 'sf-01', kunden_konstellation: 'kk-04',
        status: 'flow-gesendet' as const, qualifizierungs_phase: 'flow-versendet',
        gewerbe_flag: true, created_at: daysAgo(6),
      },
      {
        vorname: 'Martina', nachname: 'Wolf', telefon: '+491633628571', email: 'martina@email.de',
        fahrzeug_hersteller: 'Renault', fahrzeug_modell: 'Clio',
        schadenfall_typ: 'sf-01', kunden_konstellation: 'kk-01',
        status: 'kalt' as const, qualifizierungs_phase: 'gutachtertermin',
        created_at: daysAgo(20),
      },
    ]

    const leadIds: string[] = []
    for (const l of leadDefs) {
      const lx = l as Record<string, unknown>
      const insertData: Record<string, unknown> = {
        vorname: l.vorname, nachname: l.nachname, telefon: l.telefon, email: l.email,
        fahrzeug_hersteller: l.fahrzeug_hersteller, fahrzeug_modell: l.fahrzeug_modell,
        schadenfall_typ: l.schadenfall_typ, kunden_konstellation: l.kunden_konstellation,
        status: l.status, created_at: l.created_at, updated_at: l.created_at,
        source_channel: 'google-ads',
        qualifizierungs_phase: lx.qualifizierungs_phase ?? 'neu',
        mietwagen_flag: lx.mietwagen_flag ?? false,
        leasing_flag: lx.leasing_flag ?? false,
        personenschaden_flag: lx.personenschaden_flag ?? false,
        gewerbe_flag: lx.gewerbe_flag ?? false,
        sa_unterschrieben: lx.sa_unterschrieben ?? false,
        polizeibericht_pflicht: lx.polizeibericht_pflicht ?? false,
        disqualifizierung_grund: lx.disqualifizierung_grund ?? null,
        rueckruf_datum: lx.rueckruf_datum ?? null,
        rueckruf_notiz: lx.rueckruf_notiz ?? null,
        rueckruf_erledigt: false,
        anruf_versuche: lx.anruf_versuche ?? 0,
        letzter_anruf_am: lx.letzter_anruf_am ?? null,
        letzter_anruf_status: lx.letzter_anruf_status ?? null,
        fahrzeug_standort_plz: '50667',
        zugewiesen_an: teamIds['lisa@claimondo.de'],
      }
      const { data: lead, error } = await admin.from('leads').insert(insertData).select('id').single()
      if (error) throw new Error(`Lead ${l.vorname} ${l.nachname}: ${error.message}`)
      leadIds.push(lead!.id)
    }
    summary.push(`Leads: ${leadDefs.length} erstellt`)

    // ═══════════════════════════════════════════════════════════════════
    // 5. FAELLE (5 in various phases) - first create Kunden auth users
    // ═══════════════════════════════════════════════════════════════════
    const sv1Id = svIds['thomas@gutachter-becker.de']
    const sv2Id = svIds['info@ib-hartmann.de']
    const sv3Id = svIds['wagner@dat-sv.de']
    const sv4Id = svIds['fischer@akademie-sv.de']
    const maxId = teamIds['max@claimondo.de']
    const sarahId = teamIds['sarah@claimondo.de']
    const aaronId = teamIds['aaron@claimondo.de']

    // Create Kunden auth users for cases
    const kundenEmails = [
      { email: 'julia.braun@kunde.de', vorname: 'Julia', nachname: 'Braun' },
      { email: 'michael.hoffmann@kunde.de', vorname: 'Michael', nachname: 'Hoffmann' },
      { email: 'sandra.lehmann@kunde.de', vorname: 'Sandra', nachname: 'Lehmann' },
      { email: 'robert.zimmermann@kunde.de', vorname: 'Robert', nachname: 'Zimmermann' },
      { email: 'christina.bauer@kunde.de', vorname: 'Christina', nachname: 'Bauer' },
    ]
    const kundenIds: string[] = []
    for (const k of kundenEmails) {
      const uid = await ensureAuthUser(k.email)
      kundenIds.push(uid)
      await admin.from('profiles').upsert({
        id: uid, email: k.email, rolle: 'kunde',
        vorname: k.vorname, nachname: k.nachname,
        force_password_change: false,
      })
    }

    const fallDefs = [
      {
        fall_nummer: 'CLM-20260325-001',
        status: 'sv-zugewiesen' as const,
        kunde_id: kundenIds[0], lead_id: leadIds[3], // Julia Braun from Lead4
        sv_id: sv1Id, kundenbetreuer_id: maxId,
        fahrzeug_hersteller: 'Mercedes', fahrzeug_modell: 'C-Klasse', fahrzeug_baujahr: 2022,
        kennzeichen: 'K-JB-2022',
        schadenfall_typ: 'sf-01', kunden_konstellation: 'kk-02',
        leasing_flag: true, personenschaden_flag: true,
        schadens_datum: daysAgo(16).split('T')[0],
        sv_zugewiesen_am: daysAgo(12),
        konvertiert_am: daysAgo(14), konvertiert_von_lead: leadIds[3],
        versicherung_name: 'Allianz', gegner_versicherung: 'HUK-Coburg',
        gegner_bekannt: true, gegner_kennzeichen: 'D-XX-5678',
        created_at: daysAgo(14),
      },
      {
        fall_nummer: 'CLM-20260320-002',
        status: 'gutachten-eingegangen' as const,
        kunde_id: kundenIds[1],
        sv_id: sv1Id, kundenbetreuer_id: maxId,
        fahrzeug_hersteller: 'BMW', fahrzeug_modell: '3er', fahrzeug_baujahr: 2020,
        kennzeichen: 'D-MH-1234',
        schadenfall_typ: 'sf-01', kunden_konstellation: 'kk-01',
        schadens_datum: daysAgo(25).split('T')[0],
        sv_zugewiesen_am: daysAgo(20),
        gutachten_eingegangen_am: daysAgo(5),
        schadenhoehe_netto: 4500, gutachter_honorar: 850,
        wiederbeschaffungswert: 28000, restwert: 23500,
        nutzungsausfall_tage: 7, reparaturdauer_tage: 5,
        vorschaden_vorhanden: true, vorschaden_anzahl: 1, vorschaden_geprueft: true,
        versicherung_name: 'DEVK', gegner_versicherung: 'AXA',
        gegner_bekannt: true, gegner_kennzeichen: 'BN-AB-9012',
        created_at: daysAgo(22),
      },
      {
        fall_nummer: 'CLM-20260315-003',
        status: 'kanzlei-uebergeben' as const,
        kunde_id: kundenIds[2],
        sv_id: sv2Id, kundenbetreuer_id: sarahId,
        fahrzeug_hersteller: 'Audi', fahrzeug_modell: 'A4', fahrzeug_baujahr: 2021,
        kennzeichen: 'E-SL-5678',
        schadenfall_typ: 'sf-01', kunden_konstellation: 'kk-01',
        schadens_datum: daysAgo(35).split('T')[0],
        sv_zugewiesen_am: daysAgo(30),
        gutachten_eingegangen_am: daysAgo(15),
        kanzlei_uebergeben_am: daysAgo(20),
        anschlussschreiben_am: daysAgo(10),
        schadenhoehe_netto: 6200, gutachter_honorar: 1100,
        vs_eskalationsstufe: 'vs-02',
        versicherung_name: 'Zurich', gegner_versicherung: 'Generali',
        gegner_bekannt: true, gegner_kennzeichen: 'E-CD-7890',
        created_at: daysAgo(32),
      },
      {
        fall_nummer: 'CLM-20260310-004',
        status: 'regulierung' as const,
        kunde_id: kundenIds[3],
        sv_id: sv3Id, kundenbetreuer_id: sarahId,
        fahrzeug_hersteller: 'VW', fahrzeug_modell: 'Passat', fahrzeug_baujahr: 2019,
        kennzeichen: 'BN-RZ-9012',
        schadenfall_typ: 'sf-01', kunden_konstellation: 'kk-01',
        schadens_datum: daysAgo(45).split('T')[0],
        sv_zugewiesen_am: daysAgo(40),
        gutachten_eingegangen_am: daysAgo(25),
        kanzlei_uebergeben_am: daysAgo(20),
        regulierung_angekuendigt_am: daysAgo(5),
        schadenhoehe_netto: 3800, gutachter_honorar: 750, regulierung_betrag: 3800,
        versicherung_name: 'ADAC', gegner_versicherung: 'Ergo',
        gegner_bekannt: true, gegner_kennzeichen: 'AC-EF-1234',
        created_at: daysAgo(42),
      },
      {
        fall_nummer: 'CLM-20260301-005',
        status: 'abgeschlossen' as const,
        kunde_id: kundenIds[4],
        sv_id: sv4Id, kundenbetreuer_id: maxId,
        fahrzeug_hersteller: 'Toyota', fahrzeug_modell: 'Corolla', fahrzeug_baujahr: 2022,
        kennzeichen: 'AC-CB-3456',
        schadenfall_typ: 'sf-01', kunden_konstellation: 'kk-01',
        schadens_datum: daysAgo(60).split('T')[0],
        sv_zugewiesen_am: daysAgo(55),
        gutachten_eingegangen_am: daysAgo(40),
        kanzlei_uebergeben_am: daysAgo(35),
        regulierung_am: daysAgo(5),
        abgeschlossen_am: daysAgo(3),
        zahlung_eingegangen_am: daysAgo(5),
        schadenhoehe_netto: 8500, gutachter_honorar: 1400, regulierung_betrag: 8500,
        totalschaden: false,
        versicherung_name: 'LVM', gegner_versicherung: 'R+V',
        gegner_bekannt: true, gegner_kennzeichen: 'K-GH-5678',
        created_at: daysAgo(58),
      },
    ]

    const fallIds: string[] = []
    for (const f of fallDefs) {
      const { data: fall, error } = await admin.from('faelle').insert({
        fall_nummer: f.fall_nummer,
        status: f.status,
        kunde_id: f.kunde_id, lead_id: f.lead_id ?? null,
        sv_id: f.sv_id, kundenbetreuer_id: f.kundenbetreuer_id,
        fahrzeug_hersteller: f.fahrzeug_hersteller, fahrzeug_modell: f.fahrzeug_modell,
        fahrzeug_baujahr: f.fahrzeug_baujahr, kennzeichen: f.kennzeichen,
        schadenfall_typ: f.schadenfall_typ, kunden_konstellation: f.kunden_konstellation,
        schadens_datum: f.schadens_datum,
        leasing_flag: (f as Record<string, unknown>).leasing_flag ?? false,
        personenschaden_flag: (f as Record<string, unknown>).personenschaden_flag ?? false,
        sv_zugewiesen_am: f.sv_zugewiesen_am ?? null,
        gutachten_eingegangen_am: (f as Record<string, unknown>).gutachten_eingegangen_am ?? null,
        kanzlei_uebergeben_am: (f as Record<string, unknown>).kanzlei_uebergeben_am ?? null,
        anschlussschreiben_am: (f as Record<string, unknown>).anschlussschreiben_am ?? null,
        regulierung_angekuendigt_am: (f as Record<string, unknown>).regulierung_angekuendigt_am ?? null,
        regulierung_am: (f as Record<string, unknown>).regulierung_am ?? null,
        regulierung_betrag: (f as Record<string, unknown>).regulierung_betrag ?? null,
        abgeschlossen_am: (f as Record<string, unknown>).abgeschlossen_am ?? null,
        zahlung_eingegangen_am: (f as Record<string, unknown>).zahlung_eingegangen_am ?? null,
        schadenhoehe_netto: (f as Record<string, unknown>).schadenhoehe_netto ?? null,
        gutachter_honorar: (f as Record<string, unknown>).gutachter_honorar ?? null,
        wiederbeschaffungswert: (f as Record<string, unknown>).wiederbeschaffungswert ?? null,
        restwert: (f as Record<string, unknown>).restwert ?? null,
        nutzungsausfall_tage: (f as Record<string, unknown>).nutzungsausfall_tage ?? null,
        reparaturdauer_tage: (f as Record<string, unknown>).reparaturdauer_tage ?? null,
        totalschaden: (f as Record<string, unknown>).totalschaden ?? false,
        vorschaden_vorhanden: (f as Record<string, unknown>).vorschaden_vorhanden ?? null,
        vorschaden_anzahl: (f as Record<string, unknown>).vorschaden_anzahl ?? null,
        vorschaden_geprueft: (f as Record<string, unknown>).vorschaden_geprueft ?? false,
        vs_eskalationsstufe: (f as Record<string, unknown>).vs_eskalationsstufe ?? 'vs-01',
        konvertiert_am: (f as Record<string, unknown>).konvertiert_am ?? null,
        konvertiert_von_lead: (f as Record<string, unknown>).konvertiert_von_lead ?? null,
        versicherung_name: (f as Record<string, unknown>).versicherung_name ?? null,
        gegner_versicherung: (f as Record<string, unknown>).gegner_versicherung ?? null,
        gegner_bekannt: f.gegner_bekannt ?? true,
        gegner_kennzeichen: (f as Record<string, unknown>).gegner_kennzeichen ?? null,
        onboarding_complete: true,
        created_at: f.created_at,
        updated_at: f.created_at,
      }).select('id').single()
      if (error) throw new Error(`Fall ${f.fall_nummer}: ${error.message}`)
      fallIds.push(fall!.id)
    }
    summary.push(`Faelle: ${fallDefs.length} erstellt`)

    // ═══════════════════════════════════════════════════════════════════
    // 6. PFLICHTDOKUMENTE for each Fall
    // ═══════════════════════════════════════════════════════════════════
    const pflichtDokTypen = [
      { titel: 'Fahrzeugschein', beschreibung: 'Kopie des Fahrzeugscheins (Zulassungsbescheinigung Teil I)' },
      { titel: 'Fuehrerschein', beschreibung: 'Kopie des Fuehrerscheins des Fahrzeughalters' },
      { titel: 'Schadensfotos', beschreibung: 'Fotos des Schadens am Fahrzeug (mind. 4 Perspektiven)' },
      { titel: 'Abtretungserklaerung', beschreibung: 'Unterschriebene Abtretungserklaerung' },
      { titel: 'Vollmacht', beschreibung: 'Anwaltliche Vollmacht' },
    ]
    let dokCount = 0
    for (let i = 0; i < fallIds.length; i++) {
      for (let j = 0; j < pflichtDokTypen.length; j++) {
        const dt = pflichtDokTypen[j]
        // Later cases have more docs uploaded
        const uploaded = i >= 2 || j < 3
        await admin.from('pflichtdokumente').insert({
          fall_id: fallIds[i],
          titel: dt.titel,
          beschreibung: dt.beschreibung,
          pflicht: true,
          status: uploaded ? 'hochgeladen' : 'ausstehend',
          datei_url: uploaded ? 'https://placeholder.com/doc.pdf' : null,
          datei_name: uploaded ? `${dt.titel.toLowerCase().replace(/\s+/g, '_')}.pdf` : null,
        })
        dokCount++
      }
    }

    // Dokumente in dokumente-Tabelle (actual files)
    const dokumenteDefs = [
      { fall_id: fallIds[1], typ: 'gutachten' as const, datei_name: 'Gutachten_BMW3er.pdf', kategorie: 'gutachten', sichtbar_fuer: ['admin', 'kanzlei', 'sachverstaendiger'] },
      { fall_id: fallIds[2], typ: 'gutachten' as const, datei_name: 'Gutachten_AudiA4.pdf', kategorie: 'gutachten', sichtbar_fuer: ['admin', 'kanzlei', 'sachverstaendiger'] },
      { fall_id: fallIds[2], typ: 'kanzlei-paket' as const, datei_name: 'Kanzleipaket_CLM-003.pdf', kategorie: 'kanzlei', sichtbar_fuer: ['admin', 'kanzlei'] },
      { fall_id: fallIds[3], typ: 'gutachten' as const, datei_name: 'Gutachten_VWPassat.pdf', kategorie: 'gutachten', sichtbar_fuer: ['admin', 'kanzlei', 'sachverstaendiger'] },
      { fall_id: fallIds[3], typ: 'kanzlei-paket' as const, datei_name: 'Kanzleipaket_CLM-004.pdf', kategorie: 'kanzlei', sichtbar_fuer: ['admin', 'kanzlei'] },
      { fall_id: fallIds[4], typ: 'gutachten' as const, datei_name: 'Gutachten_ToyotaCorolla.pdf', kategorie: 'gutachten', sichtbar_fuer: ['admin', 'kanzlei', 'sachverstaendiger'] },
      { fall_id: fallIds[4], typ: 'regulierungsbescheid' as const, datei_name: 'Regulierung_CLM-005.pdf', kategorie: 'kanzlei', sichtbar_fuer: ['admin', 'kanzlei'] },
    ]
    for (const d of dokumenteDefs) {
      await admin.from('dokumente').insert({
        fall_id: d.fall_id,
        typ: d.typ,
        datei_url: `https://placeholder.com/docs/${d.datei_name}`,
        datei_name: d.datei_name,
        datei_groesse: Math.floor(Math.random() * 5000000) + 500000,
        kategorie: d.kategorie,
        sichtbar_fuer: d.sichtbar_fuer,
        hochgeladen_von_rolle: 'admin',
      })
    }
    summary.push(`Dokumente: ${dokCount} Pflichtdokumente + ${dokumenteDefs.length} Dokumente`)

    // ═══════════════════════════════════════════════════════════════════
    // 7. GUTACHTER_TERMINE
    // ═══════════════════════════════════════════════════════════════════
    const tomorrow = new Date(now.getTime() + 86400000)
    const dayAfter = new Date(now.getTime() + 2 * 86400000)

    const terminDefs = [
      // SV1 (Becker): 3 appointments - today+10h, tomorrow+10h, day-after+14h
      { sv_id: sv1Id, fall_id: fallIds[0], start_zeit: setTime(now, 10, 0), end_zeit: setTime(now, 12, 0) },
      { sv_id: sv1Id, fall_id: fallIds[1], start_zeit: setTime(tomorrow, 10, 0), end_zeit: setTime(tomorrow, 12, 0) },
      { sv_id: sv1Id, fall_id: null, start_zeit: setTime(dayAfter, 14, 0), end_zeit: setTime(dayAfter, 16, 0) },
      // SV2 (Hartmann): 2 appointments
      { sv_id: sv2Id, fall_id: fallIds[2], start_zeit: setTime(tomorrow, 10, 0), end_zeit: setTime(tomorrow, 12, 0) },
      { sv_id: sv2Id, fall_id: null, start_zeit: setTime(dayAfter, 15, 0), end_zeit: setTime(dayAfter, 17, 0) },
      // SV3 (Wagner): 1 appointment
      { sv_id: sv3Id, fall_id: fallIds[3], start_zeit: setTime(tomorrow, 11, 0), end_zeit: setTime(tomorrow, 13, 0) },
    ]
    for (const t of terminDefs) {
      await admin.from('gutachter_termine').insert({
        sv_id: t.sv_id,
        fall_id: t.fall_id,
        start_zeit: t.start_zeit,
        end_zeit: t.end_zeit,
        status: 'bestaetigt',
      })
    }
    summary.push(`Gutachter-Termine: ${terminDefs.length} erstellt`)

    // ═══════════════════════════════════════════════════════════════════
    // 8. NACHRICHTEN (Chat)
    // ═══════════════════════════════════════════════════════════════════
    const chatMessages = [
      // Fall1: 5 WhatsApp messages
      { fall_id: fallIds[0], kanal: 'whatsapp', sender_rolle: 'system', nachricht: 'Willkommen bei Claimondo! Ihr Fall wurde angelegt.', created_at: daysAgo(14) },
      { fall_id: fallIds[0], kanal: 'whatsapp', sender_id: kundenIds[0], sender_rolle: 'kunde', nachricht: 'Danke, wann kommt der Gutachter?', created_at: daysAgo(13) },
      { fall_id: fallIds[0], kanal: 'whatsapp', sender_rolle: 'system', nachricht: 'Ihr Gutachter Thomas Becker wurde zugewiesen.', created_at: daysAgo(12) },
      { fall_id: fallIds[0], kanal: 'whatsapp', sender_id: kundenIds[0], sender_rolle: 'kunde', nachricht: 'Super, ich bin unter der Woche ab 14 Uhr erreichbar.', created_at: daysAgo(11) },
      { fall_id: fallIds[0], kanal: 'whatsapp', sender_rolle: 'system', nachricht: 'Termin bestaetigt: Montag 14:00 Uhr.', created_at: daysAgo(10) },
      // Fall1: 3 portal-kunde-claimondo messages
      { fall_id: fallIds[0], kanal: 'portal-kunde-claimondo', sender_id: maxId, sender_rolle: 'kundenbetreuer', nachricht: 'Frau Braun, bitte laden Sie noch den Fahrzeugschein hoch.', created_at: daysAgo(13) },
      { fall_id: fallIds[0], kanal: 'portal-kunde-claimondo', sender_id: kundenIds[0], sender_rolle: 'kunde', nachricht: 'Erledigt, Fahrzeugschein ist hochgeladen.', created_at: daysAgo(12) },
      { fall_id: fallIds[0], kanal: 'portal-kunde-claimondo', sender_id: maxId, sender_rolle: 'kundenbetreuer', nachricht: 'Perfekt, vielen Dank!', created_at: daysAgo(12) },
      // Fall2: 2 portal-kunde-gutachter messages
      { fall_id: fallIds[1], kanal: 'portal-kunde-gutachter', sender_id: svProfileIds['thomas@gutachter-becker.de'], sender_rolle: 'sachverstaendiger', nachricht: 'Gutachten ist fertig und hochgeladen.', created_at: daysAgo(5) },
      { fall_id: fallIds[1], kanal: 'portal-kunde-gutachter', sender_id: kundenIds[1], sender_rolle: 'kunde', nachricht: 'Vielen Dank fuer die schnelle Bearbeitung!', created_at: daysAgo(4) },
    ]
    for (const m of chatMessages) {
      await admin.from('nachrichten').insert({
        fall_id: m.fall_id,
        kanal: m.kanal,
        sender_id: m.sender_id ?? null,
        sender_rolle: m.sender_rolle,
        nachricht: m.nachricht,
        created_at: m.created_at,
      })
    }
    summary.push(`Nachrichten: ${chatMessages.length} erstellt`)

    // ═══════════════════════════════════════════════════════════════════
    // 9. GUTACHTER_ABRECHNUNGEN
    // ═══════════════════════════════════════════════════════════════════
    const abrechnungen = [
      // SV1: 3 entries
      { sv_id: sv1Id, fall_id: fallIds[0], schadenhoehe: 0, leadpreis: 150, preistyp: 'paket', guthaben_vorher: 3750, guthaben_nachher: 3600, monat: '2026-03' },
      { sv_id: sv1Id, fall_id: fallIds[1], schadenhoehe: 4500, leadpreis: 150, preistyp: 'paket', guthaben_vorher: 3600, guthaben_nachher: 3450, monat: '2026-03' },
      { sv_id: sv1Id, fall_id: null, schadenhoehe: 2200, leadpreis: 150, preistyp: 'paket', guthaben_vorher: 3450, guthaben_nachher: 3300, monat: '2026-02' },
      // SV3: 1 entry
      { sv_id: sv3Id, fall_id: fallIds[3], schadenhoehe: 3800, leadpreis: 150, preistyp: 'paket', guthaben_vorher: 1500, guthaben_nachher: 1350, monat: '2026-02' },
    ]
    for (const a of abrechnungen) {
      await admin.from('gutachter_abrechnungen').insert({
        sv_id: a.sv_id, fall_id: a.fall_id,
        schadenhoehe: a.schadenhoehe, leadpreis: a.leadpreis,
        preistyp: a.preistyp, guthaben_vorher: a.guthaben_vorher,
        guthaben_nachher: a.guthaben_nachher, monat: a.monat,
        abgerechnet_am: daysAgo(5),
      })
    }
    summary.push(`Gutachter-Abrechnungen: ${abrechnungen.length} erstellt`)

    // ═══════════════════════════════════════════════════════════════════
    // 10. TIMELINE entries (at least 5 per Fall)
    // ═══════════════════════════════════════════════════════════════════
    const timelineEntries = [
      // Fall 1 (sv-zugewiesen) - 5 entries
      { fall_id: fallIds[0], typ: 'status', titel: 'Fall angelegt', beschreibung: 'Lead konvertiert zu Fall CLM-20260325-001', created_at: daysAgo(14) },
      { fall_id: fallIds[0], typ: 'zuweisung', titel: 'SV zugewiesen', beschreibung: 'Thomas Becker als Sachverstaendiger zugewiesen', created_at: daysAgo(12) },
      { fall_id: fallIds[0], typ: 'dokument', titel: 'Fahrzeugschein hochgeladen', beschreibung: 'Kunde hat Fahrzeugschein hochgeladen', created_at: daysAgo(12) },
      { fall_id: fallIds[0], typ: 'termin', titel: 'Gutachter-Termin', beschreibung: 'Termin bestaetigt fuer Montag 14:00', created_at: daysAgo(10) },
      { fall_id: fallIds[0], typ: 'nachricht', titel: 'WhatsApp gesendet', beschreibung: 'Terminbestaetigung per WhatsApp', created_at: daysAgo(10) },
      // Fall 2 (gutachten-eingegangen) - 5 entries
      { fall_id: fallIds[1], typ: 'status', titel: 'Fall angelegt', beschreibung: 'Neuer Fall CLM-20260320-002', created_at: daysAgo(22) },
      { fall_id: fallIds[1], typ: 'zuweisung', titel: 'SV zugewiesen', beschreibung: 'Thomas Becker zugewiesen', created_at: daysAgo(20) },
      { fall_id: fallIds[1], typ: 'termin', titel: 'Besichtigung durchgefuehrt', beschreibung: 'Gutachter hat Fahrzeug besichtigt', created_at: daysAgo(10) },
      { fall_id: fallIds[1], typ: 'dokument', titel: 'Gutachten eingegangen', beschreibung: 'Gutachten BMW 3er hochgeladen', created_at: daysAgo(5) },
      { fall_id: fallIds[1], typ: 'status', titel: 'Status: Gutachten eingegangen', beschreibung: 'Wechsel zu gutachten-eingegangen', created_at: daysAgo(5) },
      // Fall 3 (kanzlei-uebergeben) - 5 entries
      { fall_id: fallIds[2], typ: 'status', titel: 'Fall angelegt', beschreibung: 'Neuer Fall CLM-20260315-003', created_at: daysAgo(32) },
      { fall_id: fallIds[2], typ: 'zuweisung', titel: 'SV zugewiesen', beschreibung: 'Ingenieurbuero Hartmann zugewiesen', created_at: daysAgo(30) },
      { fall_id: fallIds[2], typ: 'dokument', titel: 'Gutachten eingegangen', beschreibung: 'Gutachten Audi A4', created_at: daysAgo(15) },
      { fall_id: fallIds[2], typ: 'status', titel: 'Kanzlei uebergeben', beschreibung: 'Paket an Lex-Drive Kanzlei gesendet', created_at: daysAgo(20) },
      { fall_id: fallIds[2], typ: 'eskalation', titel: 'VS-Eskalation Stufe 2', beschreibung: 'Versicherung reagiert nicht, Eskalation auf VS-02', created_at: daysAgo(3) },
      // Fall 4 (regulierung) - 5 entries
      { fall_id: fallIds[3], typ: 'status', titel: 'Fall angelegt', beschreibung: 'Neuer Fall CLM-20260310-004', created_at: daysAgo(42) },
      { fall_id: fallIds[3], typ: 'zuweisung', titel: 'SV zugewiesen', beschreibung: 'Klaus Wagner zugewiesen', created_at: daysAgo(40) },
      { fall_id: fallIds[3], typ: 'dokument', titel: 'Gutachten eingegangen', beschreibung: 'Gutachten VW Passat', created_at: daysAgo(25) },
      { fall_id: fallIds[3], typ: 'status', titel: 'Kanzlei uebergeben', beschreibung: 'Paket an Kanzlei', created_at: daysAgo(20) },
      { fall_id: fallIds[3], typ: 'status', titel: 'Regulierung', beschreibung: 'Versicherung hat Regulierung angekuendigt', created_at: daysAgo(5) },
      // Fall 5 (abgeschlossen) - 6 entries
      { fall_id: fallIds[4], typ: 'status', titel: 'Fall angelegt', beschreibung: 'Neuer Fall CLM-20260301-005', created_at: daysAgo(58) },
      { fall_id: fallIds[4], typ: 'zuweisung', titel: 'SV zugewiesen', beschreibung: 'Dr. Maria Fischer zugewiesen', created_at: daysAgo(55) },
      { fall_id: fallIds[4], typ: 'dokument', titel: 'Gutachten eingegangen', beschreibung: 'Gutachten Toyota Corolla', created_at: daysAgo(40) },
      { fall_id: fallIds[4], typ: 'status', titel: 'Kanzlei uebergeben', beschreibung: 'Paket an Kanzlei', created_at: daysAgo(35) },
      { fall_id: fallIds[4], typ: 'zahlung', titel: 'Regulierung eingegangen', beschreibung: 'Zahlung 8.500 EUR eingegangen', created_at: daysAgo(5) },
      { fall_id: fallIds[4], typ: 'status', titel: 'Fall abgeschlossen', beschreibung: 'Fall erfolgreich abgeschlossen', created_at: daysAgo(3) },
    ]
    for (const t of timelineEntries) {
      await admin.from('timeline').insert({
        fall_id: t.fall_id,
        typ: t.typ,
        titel: t.titel,
        beschreibung: t.beschreibung,
        erstellt_von: aaronId,
        created_at: t.created_at,
      })
    }
    summary.push(`Timeline: ${timelineEntries.length} Eintraege erstellt`)

    // ═══════════════════════════════════════════════════════════════════
    // 11. TASKS (5 open tasks)
    // ═══════════════════════════════════════════════════════════════════
    const taskDefs = [
      { fall_id: fallIds[0], typ: 'sv-termin', titel: 'SV-Termin bestaetigen', beschreibung: 'Gutachter-Termin mit Kunde abstimmen', status: 'offen' as const, faellig_am: setTime(tomorrow, 12, 0), zugewiesen_an: maxId, prioritaet: 'dringend' },
      { fall_id: fallIds[1], typ: 'filmcheck', titel: 'Filmcheck durchfuehren', beschreibung: 'Gutachten BMW 3er pruefen', status: 'offen' as const, faellig_am: setTime(now, 17, 0), zugewiesen_an: aaronId, prioritaet: 'dringend' },
      { fall_id: fallIds[2], typ: 'versicherung-kontakt', titel: 'Versicherung nachfassen', beschreibung: 'Generali hat nicht reagiert, VS-02 Eskalation', status: 'offen' as const, faellig_am: setTime(tomorrow, 10, 0), zugewiesen_an: sarahId, prioritaet: 'kritisch' },
      { fall_id: fallIds[3], typ: 'zahlung-pruefen', titel: 'Zahlung pruefen', beschreibung: 'Regulierungsbetrag abgleichen mit Gutachten', status: 'offen' as const, faellig_am: setTime(dayAfter, 12, 0), zugewiesen_an: sarahId, prioritaet: 'normal' },
      { fall_id: fallIds[0], typ: 'kunde-rueckfrage', titel: 'Kunde kontaktieren', beschreibung: 'Fehlende Unterlagen nachfordern', status: 'offen' as const, faellig_am: setTime(dayAfter, 14, 0), zugewiesen_an: maxId, prioritaet: 'normal' },
    ]
    for (const t of taskDefs) {
      await admin.from('tasks').insert({
        fall_id: t.fall_id,
        typ: t.typ,
        titel: t.titel,
        beschreibung: t.beschreibung,
        status: t.status,
        faellig_am: t.faellig_am,
        zugewiesen_an: t.zugewiesen_an,
        prioritaet: t.prioritaet,
      })
    }
    summary.push(`Tasks: ${taskDefs.length} erstellt`)

    // ═══════════════════════════════════════════════════════════════════
    // 12. GUTACHTER_MITTEILUNGEN
    // ═══════════════════════════════════════════════════════════════════
    const mitteilungen = [
      // SV1: 8 entries (5 gelesen=true, 3 gelesen=false)
      { sv_id: sv1Id, fall_id: fallIds[0], typ: 'neuer_auftrag', titel: 'Neuer Fall zugewiesen', nachricht: 'Fall CLM-20260325-001 wurde Ihnen zugewiesen.', gelesen: true, created_at: daysAgo(12) },
      { sv_id: sv1Id, fall_id: fallIds[0], typ: 'termin_bestaetigt', titel: 'Termin bestaetigt', nachricht: 'Kunde hat Termin bestaetigt.', gelesen: true, created_at: daysAgo(10) },
      { sv_id: sv1Id, fall_id: fallIds[1], typ: 'neuer_auftrag', titel: 'Neuer Fall zugewiesen', nachricht: 'Fall CLM-20260320-002 wurde Ihnen zugewiesen.', gelesen: true, created_at: daysAgo(20) },
      { sv_id: sv1Id, fall_id: fallIds[1], typ: 'kunde_dokument_hochgeladen', titel: 'Dokument hochgeladen', nachricht: 'Kunde hat neue Dokumente hochgeladen.', gelesen: true, created_at: daysAgo(8) },
      { sv_id: sv1Id, fall_id: fallIds[1], typ: 'qc_bestanden', titel: 'Filmcheck bestanden', nachricht: 'Ihr Gutachten hat den QC-Check bestanden.', gelesen: true, created_at: daysAgo(3) },
      { sv_id: sv1Id, fall_id: null, typ: 'paket_fast_voll', titel: 'Paket fast ausgeschoepft', nachricht: 'Sie haben 80% Ihres Standard-25 Pakets verbraucht.', gelesen: false, created_at: daysAgo(1) },
      { sv_id: sv1Id, fall_id: null, typ: 'guthaben_niedrig', titel: 'Guthaben-Info', nachricht: 'Ihr Guthaben betraegt 3.300 EUR.', gelesen: false, created_at: daysAgo(1) },
      { sv_id: sv1Id, fall_id: fallIds[0], typ: 'kunde_chat_nachricht', titel: 'Neue Kundennachricht', nachricht: 'Kunde hat eine neue Nachricht im Portal geschrieben.', gelesen: false, created_at: daysAgo(0) },
      // SV2: 4 entries (2 gelesen=true, 2 gelesen=false)
      { sv_id: sv2Id, fall_id: fallIds[2], typ: 'neuer_auftrag', titel: 'Neuer Fall zugewiesen', nachricht: 'Fall CLM-20260315-003 wurde Ihnen zugewiesen.', gelesen: true, created_at: daysAgo(30) },
      { sv_id: sv2Id, fall_id: fallIds[2], typ: 'termin_bestaetigt', titel: 'Termin bestaetigt', nachricht: 'Besichtigungstermin bestaetigt.', gelesen: true, created_at: daysAgo(25) },
      { sv_id: sv2Id, fall_id: fallIds[2], typ: 'kanzlei_as_gesendet', titel: 'Anschlussschreiben gesendet', nachricht: 'Kanzlei hat Anschlussschreiben an Versicherung gesendet.', gelesen: false, created_at: daysAgo(10) },
      { sv_id: sv2Id, fall_id: null, typ: 'vorschaden_warnung', titel: 'Vorschaden erkannt', nachricht: 'Bei einem Ihrer Faelle wurde ein Vorschaden erkannt.', gelesen: false, created_at: daysAgo(2) },
    ]
    for (const m of mitteilungen) {
      await admin.from('gutachter_mitteilungen').insert({
        sv_id: m.sv_id,
        fall_id: m.fall_id ?? null,
        typ: m.typ,
        titel: m.titel,
        nachricht: m.nachricht,
        gelesen: m.gelesen,
        created_at: m.created_at,
      })
    }
    summary.push(`Gutachter-Mitteilungen: ${mitteilungen.length} erstellt`)

    // ═══════════════════════════════════════════════════════════════════
    // 13. QC_CHECKLISTE
    // ═══════════════════════════════════════════════════════════════════
    const qcEntries = [
      {
        fall_id: fallIds[1], status: 'bestanden',
        gutachten_vorhanden: true, gutachten_vollstaendig: true,
        fin_17_zeichen: true, schadenspositionen_erfasst: true,
        fotos_ausreichend: true, sa_vorhanden: true,
        vollmacht_vorhanden: true, kundendaten_vollstaendig: true,
        vorschaeden_beruecksichtigt: true,
        geprueft_von: aaronId, geprueft_am: daysAgo(4),
      },
      {
        fall_id: fallIds[2], status: 'bestanden',
        gutachten_vorhanden: true, gutachten_vollstaendig: true,
        fin_17_zeichen: true, schadenspositionen_erfasst: true,
        fotos_ausreichend: true, sa_vorhanden: true,
        vollmacht_vorhanden: true, kundendaten_vollstaendig: true,
        vorschaeden_beruecksichtigt: true,
        geprueft_von: aaronId, geprueft_am: daysAgo(12),
      },
    ]
    for (const q of qcEntries) {
      await admin.from('qc_checkliste').insert(q)
    }
    summary.push(`QC-Checklisten: ${qcEntries.length} erstellt`)

    // ═══════════════════════════════════════════════════════════════════
    // 14. FINANCE_MONATSBERICHTE
    // ═══════════════════════════════════════════════════════════════════
    const financeReports = [
      {
        monat: 'April', jahr: 2026,
        neue_faelle: 15, aktive_faelle: 25, leads_gesamt: 30,
        lead_conversion_rate: 0.50, vollmacht_quote: 0.60,
        delta_paket_einnahmen: 7500, delta_einzel_einnahmen: 1200,
        kanzlei_provision: 2400, gesamt_einnahmen: 11100,
        fixkosten: 3500, betreuungskosten: 1500,
        db_ii: 6100, kum_db_ii: 6100,
        claimondo_gewinn_75: 4575, kanzlei_gewinn_25: 1525,
        marketing_budget_netto: 2000, marketing_budget_brutto: 2380,
        kontingent_gutachter: 85, gutachter_anzahlungen_gesamt: 16500,
      },
      {
        monat: 'Mai', jahr: 2026,
        neue_faelle: 22, aktive_faelle: 38, leads_gesamt: 40,
        lead_conversion_rate: 0.55, vollmacht_quote: 0.65,
        delta_paket_einnahmen: 11250, delta_einzel_einnahmen: 1800,
        kanzlei_provision: 3600, gesamt_einnahmen: 16650,
        fixkosten: 3500, betreuungskosten: 2200,
        db_ii: 10950, kum_db_ii: 17050,
        claimondo_gewinn_75: 8213, kanzlei_gewinn_25: 2738,
        marketing_budget_netto: 3000, marketing_budget_brutto: 3570,
        kontingent_gutachter: 110, gutachter_anzahlungen_gesamt: 24000,
      },
      {
        monat: 'Juni', jahr: 2026,
        neue_faelle: 28, aktive_faelle: 50, leads_gesamt: 48,
        lead_conversion_rate: 0.58, vollmacht_quote: 0.70,
        delta_paket_einnahmen: 15000, delta_einzel_einnahmen: 2400,
        kanzlei_provision: 4800, gesamt_einnahmen: 22200,
        fixkosten: 3500, betreuungskosten: 3000,
        db_ii: 15700, kum_db_ii: 32750,
        claimondo_gewinn_75: 11775, kanzlei_gewinn_25: 3925,
        marketing_budget_netto: 4000, marketing_budget_brutto: 4760,
        kontingent_gutachter: 135, gutachter_anzahlungen_gesamt: 33750,
      },
    ]
    for (const f of financeReports) {
      await admin.from('finance_monatsberichte').upsert(f, { onConflict: 'monat,jahr' })
    }
    summary.push(`Finance-Monatsberichte: ${financeReports.length} erstellt`)

    // ═══════════════════════════════════════════════════════════════════
    // 15. GUTACHTER_EINZAHLUNGEN (Anzahlungen)
    // ═══════════════════════════════════════════════════════════════════
    const einzahlungen = [
      { sv_id: sv1Id, betrag: 3750, typ: 'anzahlung', beschreibung: 'Anzahlung Standard-25 Paket', eingezahlt_am: daysAgo(30) },
      { sv_id: sv2Id, betrag: 7500, typ: 'anzahlung', beschreibung: 'Anzahlung Premium-50 Paket', eingezahlt_am: daysAgo(28) },
      { sv_id: sv3Id, betrag: 750, typ: 'anzahlung', beschreibung: 'Anzahlung Standard Paket', eingezahlt_am: daysAgo(25) },
      { sv_id: sv4Id, betrag: 3750, typ: 'anzahlung', beschreibung: 'Anzahlung Standard-25 Paket', eingezahlt_am: daysAgo(20) },
    ]
    for (const e of einzahlungen) {
      await admin.from('gutachter_einzahlungen').insert(e)
    }
    summary.push(`Gutachter-Einzahlungen: ${einzahlungen.length} erstellt`)

    // Update SV paket_faelle_genutzt and offene_faelle
    await admin.from('sachverstaendige').update({ paket_faelle_genutzt: 2, offene_faelle: 1 }).eq('id', sv1Id)
    await admin.from('sachverstaendige').update({ paket_faelle_genutzt: 1, offene_faelle: 1 }).eq('id', sv2Id)
    await admin.from('sachverstaendige').update({ paket_faelle_genutzt: 1, offene_faelle: 0 }).eq('id', sv3Id)
    await admin.from('sachverstaendige').update({ paket_faelle_genutzt: 1, offene_faelle: 0 }).eq('id', sv4Id)

    return Response.json({
      success: true,
      summary,
      details: {
        teamUsers: Object.keys(teamIds).length,
        gutachter: Object.keys(svIds).length,
        kunden: kundenIds.length,
        leads: leadIds.length,
        faelle: fallIds.length,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message, summary }, { status: 500 })
  }
}

function setTime(date: Date, hours: number, minutes: number): string {
  const d = new Date(date)
  d.setHours(hours, minutes, 0, 0)
  return d.toISOString()
}
