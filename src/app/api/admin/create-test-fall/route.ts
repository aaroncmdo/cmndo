import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST() {
  // Auth check
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const admin = createServiceClient()
  const now = new Date().toISOString()

  // Morgen 10:00 Uhr berechnen
  const morgen = new Date()
  morgen.setDate(morgen.getDate() + 1)
  morgen.setHours(10, 0, 0, 0)
  const morgenISO = morgen.toISOString()

  // Morgen + 3 Tage
  const morgenPlus3 = new Date(morgen)
  morgenPlus3.setDate(morgenPlus3.getDate() + 3)

  try {
    // Prüfe ob Testfall schon existiert
    const { data: existing } = await admin
      .from('faelle')
      .select('id')
      .eq('mandatsnummer', 'CLM-TEST-001')
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: 'Testfall CLM-TEST-001 existiert bereits', fallId: existing.id }, { status: 409 })
    }

    // ── 1. Ersten aktiven SV holen ──────────────────────────────────
    const { data: sv } = await admin
      .from('sachverstaendige')
      .select('id, profile_id')
      .eq('ist_aktiv', true)
      .limit(1)
      .single()

    if (!sv) {
      return NextResponse.json({ error: 'Kein aktiver Gutachter gefunden' }, { status: 404 })
    }

    // SV-Name holen
    let svName = 'Gutachter'
    if (sv.profile_id) {
      const { data: profile } = await admin
        .from('profiles')
        .select('vorname, nachname')
        .eq('id', sv.profile_id)
        .single()
      if (profile) svName = `${profile.vorname ?? ''} ${profile.nachname ?? ''}`.trim() || 'Gutachter'
    }

    // ── 2. Lead erstellen ───────────────────────────────────────────
    const { data: lead, error: leadErr } = await admin
      .from('leads')
      .insert({
        vorname: 'Max',
        nachname: 'Mustermann',
        telefon: '+491701234567',
        email: 'max.mustermann@test.de',
        status: 'umgewandelt-sv',
        schadens_fall_typ: 'sf-01',
        kunden_konstellation: 'kk-01',
        qualifizierungs_phase: 'gutachtertermin',
        kennzeichen: 'K-AB 1234',
        fahrzeug_hersteller: 'BMW',
        fahrzeug_modell: '320d',
        erstzulassung: '2020-03-15',
        unfallhergang: 'Auffahrunfall auf der A4 Richtung Koeln. Der Unfallgegner hat beim Spurwechsel mein Fahrzeug touchiert.',
        unfalldatum: '2026-04-01',
        unfallort: 'A4 Koeln-Sued',
        unfallort_lat: 50.9,
        unfallort_lng: 6.95,
        polizei_vor_ort: true,
        polizei_aktenzeichen: '2026-0401-KK-4711',
        gegner_bekannt: true,
        gegner_name: 'Hans Mueller',
        gegner_versicherung: 'Allianz',
        gegner_kennzeichen: 'K-XY 5678',
        sa_unterschrieben: true,
        sa_unterschrieben_am: now,
        sa_datum: now,
        vollmacht_unterschrieben: true,
        vollmacht_datum: now,
        gutachter_termin: morgenISO,
        fahrzeug_standort_adresse: 'Musterstrasse 10, 50667 Koeln',
        fahrzeug_standort_plz: '50667',
        kunde_adresse: 'Musterstrasse 10, 50667 Koeln',
        kunde_lat: 50.9375,
        kunde_lng: 6.9603,
        wa_gesendet: true,
        created_at: now,
        updated_at: now,
      })
      .select('id')
      .single()

    if (leadErr || !lead) {
      console.error('[create-test-fall] Lead Error:', leadErr)
      return NextResponse.json({ error: `Lead-Erstellung fehlgeschlagen: ${leadErr?.message}` }, { status: 500 })
    }

    // ── 3. Fall erstellen mit SV zugewiesen ─────────────────────────
    const { data: fall, error: fallErr } = await admin
      .from('faelle')
      .insert({
        lead_id: lead.id,
        fall_nummer: 'CLM-TEST-001',
        mandatsnummer: 'CLM-TEST-001',
        status: 'sv-termin',
        schadens_fall_typ: 'sf-01',
        kunden_konstellation: 'kk-01',
        kennzeichen: 'K-AB 1234',
        fahrzeug_hersteller: 'BMW',
        fahrzeug_modell: '320d',
        fahrzeug_baujahr: 2020,
        schadens_ursache: 'haftpflicht',
        schadens_beschreibung: 'Auffahrunfall auf der A4 Richtung Koeln. Der Unfallgegner hat beim Spurwechsel mein Fahrzeug touchiert.',
        schadens_datum: '2026-04-01',
        schadens_adresse: 'A4 Koeln-Sued',
        schadens_plz: '50667',
        schadens_ort: 'Koeln',
        unfallhergang: 'Auffahrunfall auf der A4 Richtung Koeln. Der Unfallgegner hat beim Spurwechsel mein Fahrzeug touchiert.',
        unfalldatum: '2026-04-01',
        unfallort: 'A4 Koeln-Sued',
        polizei_vor_ort: true,
        polizei_aktenzeichen: '2026-0401-KK-4711',
        polizei_bericht_vorhanden: true,
        gegner_bekannt: true,
        gegner_name: 'Hans Mueller',
        gegner_versicherung: 'Allianz',
        gegner_kennzeichen: 'K-XY 5678',
        gegner_versicherungsnummer: 'AZ-2026-789456',
        sa_unterschrieben: true,
        sa_unterschrieben_am: now,
        datenschutz_akzeptiert: true,
        datenschutz_akzeptiert_am: now,
        sv_id: sv.id,
        sv_zugewiesen_am: now,
        // AAR-552: sv_termin + gutachter_termin_status ersatzlos entfernt — gutachter_termine.insert unten ist Source of Truth
        besichtigungsort_adresse: 'Musterstrasse 10, 50667 Koeln',
        besichtigungsort_lat: 50.9375,
        besichtigungsort_lng: 6.9603,
        ist_aktiv: true,
        prioritaet: 'normal',
        created_at: now,
        updated_at: now,
      })
      .select('id')
      .single()

    if (fallErr || !fall) {
      console.error('[create-test-fall] Fall Error:', fallErr)
      // Cleanup lead
      await admin.from('leads').delete().eq('id', lead.id)
      return NextResponse.json({ error: `Fall-Erstellung fehlgeschlagen: ${fallErr?.message}` }, { status: 500 })
    }

    // ── 4. Gutachter-Termin (Kalender) ──────────────────────────────
    const terminEnd = new Date(morgen.getTime() + 90 * 60 * 1000) // 60min + 30min Puffer
    await admin.from('gutachter_termine').insert({
      sv_id: sv.id,
      fall_id: fall.id,
      lead_id: lead.id,
      start_zeit: morgenISO,
      end_zeit: terminEnd.toISOString(),
      status: 'bestaetigt',
    })

    // ── 5. Tasks erstellen ──────────────────────────────────────────
    await admin.from('tasks').insert([
      {
        fall_id: fall.id,
        typ: 'gutachten-erstellen',
        titel: 'Gutachten erstellen',
        beschreibung: 'Gutachten fuer BMW 320d (K-AB 1234) erstellen nach Besichtigung.',
        status: 'offen',
        task_typ: 'gutachten-erstellen',
        deadline: morgenPlus3.toISOString(),
        faellig_am: morgenPlus3.toISOString(),
        auto_erstellt: true,
        prioritaet: 'dringend',
        empfaenger_rolle: 'gutachter',
        empfaenger_user_id: sv.profile_id,
        created_at: now,
      },
      {
        fall_id: fall.id,
        typ: 'fotos-hochladen',
        titel: 'Schadensfotos hochladen',
        beschreibung: 'Fotos vom Fahrzeugschaden bei Besichtigung aufnehmen und hochladen.',
        status: 'offen',
        task_typ: 'fotos-hochladen',
        deadline: morgenISO,
        faellig_am: morgenISO,
        auto_erstellt: true,
        prioritaet: 'dringend',
        empfaenger_rolle: 'gutachter',
        empfaenger_user_id: sv.profile_id,
        created_at: now,
      },
      {
        fall_id: fall.id,
        typ: 'termin-bestaetigen',
        titel: 'Termin bestaetigen',
        beschreibung: 'Gutachtertermin wurde bestaetigt.',
        status: 'erledigt',
        task_typ: 'termin-bestaetigen',
        erledigt_am: now,
        auto_erstellt: true,
        prioritaet: 'normal',
        empfaenger_rolle: 'gutachter',
        empfaenger_user_id: sv.profile_id,
        created_at: now,
      },
    ])

    // ── 6. Timeline / Historie erstellen ────────────────────────────
    await admin.from('timeline').insert([
      {
        fall_id: fall.id,
        lead_id: lead.id,
        typ: 'system',
        titel: 'Testfall erstellt',
        beschreibung: 'Testfall CLM-TEST-001 erstellt fuer Max Mustermann. BMW 320d, K-AB 1234.',
        erstellt_von: user.id,
        created_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), // -4h
      },
      {
        fall_id: fall.id,
        lead_id: lead.id,
        typ: 'system',
        titel: 'SA digital unterschrieben',
        beschreibung: 'Schadensaufnahme wurde digital unterschrieben.',
        erstellt_von: user.id,
        created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), // -3h
      },
      {
        fall_id: fall.id,
        lead_id: lead.id,
        typ: 'system',
        titel: 'Gutachter zugewiesen',
        beschreibung: `Gutachter ${svName} zugewiesen. Termin: morgen 10:00 Uhr.`,
        erstellt_von: user.id,
        created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // -2h
      },
      {
        fall_id: fall.id,
        lead_id: lead.id,
        typ: 'system',
        titel: 'Termin bestaetigt',
        beschreibung: `Gutachtertermin morgen 10:00 Uhr bei Musterstrasse 10, 50667 Koeln bestaetigt.`,
        erstellt_von: user.id,
        created_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // -1h
      },
    ])

    // ── 7. Lead-Historie ────────────────────────────────────────────
    await admin.from('lead_historie').insert([
      {
        lead_id: lead.id,
        feld: 'status',
        alter_wert: 'neu',
        neuer_wert: 'umgewandelt-sv',
        geaendert_von: user.id,
        geaendert_am: now,
      },
      {
        lead_id: lead.id,
        feld: 'sa_unterschrieben',
        alter_wert: 'false',
        neuer_wert: 'true',
        geaendert_von: user.id,
        geaendert_am: now,
      },
      {
        lead_id: lead.id,
        feld: 'gutachter_termin',
        alter_wert: null,
        neuer_wert: morgenISO,
        geaendert_von: user.id,
        geaendert_am: now,
      },
    ])

    return NextResponse.json({
      success: true,
      leadId: lead.id,
      fallId: fall.id,
      svId: sv.id,
      svName,
      mandatsnummer: 'CLM-TEST-001',
      termin: morgenISO,
      message: `Testfall CLM-TEST-001 erstellt. SV: ${svName}. Termin: morgen 10:00.`,
    })
  } catch (err) {
    console.error('[create-test-fall] Unerwarteter Fehler:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
