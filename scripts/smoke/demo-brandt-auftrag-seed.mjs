// Demo-Seed fuer Meetings: vollstaendige Beispielauftraege beim SV Brandt, mit Besichtigungsort
// und Termin HEUTE — damit /gutachter/heute die Tagesroute zeigt.
//
// Aaron 23.09.2026: „bitte gib mir einen beispielauftrag mit besichtigungsort mit allem drum und
// dran zum zeigen im meeting für den brandt" · „mit termin heute damit ich die route zeigen kann"
//
// Was angelegt wird (je Stopp, alles ueber dieselbe Kette wie im echten Betrieb):
//   vehicles  -> Fahrzeug (FIN, Kennzeichen, EZ, km, Farbe, Kraftstoff)
//   leads     -> Kunde + Unfalldaten + Gegner + Besichtigungsort, Status 'umgewandelt'
//   claims    -> Fall (Haftpflicht, SV Brandt, Kundenbetreuerin, operative_status 'sv-termin',
//                Sicherungsabtretung unterschrieben)
//                (die Bridge fall_id <-> claim_id legt der Trigger trg_sync_claims_to_bridge an)
//   personen + claim_parties + claim_vehicle_involvements + Gegner-Fahrzeug
//             -> wie convertLeadToClaim Schritt 4/5 (src/lib/leads/convert-lead-to-claim.ts).
//                Die Fallakte liest Kundenadresse und Gegner-Namen NUR von dort (v_claim_base:
//                kunde_p/gp -> personen), nicht vom Lead — ohne Parteien bleiben die Felder leer.
//   auftraege -> Erstgutachten-Auftrag mit SV-Briefing
//   gutachter_termine -> Besichtigung HEUTE, bestaetigt, mit geocodiertem Besichtigungsort
//
// ⚠ Die Sicherungsabtretung (SA) ist Pflicht, sonst sieht der SV nur die Route: Aufträge-Liste
//   (`.filter(sa_unterschrieben === true)`) und Fallakte (`notFound()`, CMM-25) zeigen einen Fall
//   erst NACH der Unterschrift — vorher ist der Termin ein reiner Kalenderblock. Gesetzt werden
//   dieselben Felder wie beim echten Unterschrift-Schritt (signSAandCreateFall in
//   src/app/flow/[token]/actions.ts): Lead + Claim `sa_unterschrieben(_am)`, Lead 'konvertiert'.
//   Ein SA-PDF wird bewusst NICHT erzeugt (abtretung_pdf bleibt leer) — keine erfundene
//   Unterschrift, kein Link auf eine Datei, die es nicht gibt.
//
// Standard: 3 Stopps (Nord -> Sued durch Bremerhaven), damit die Route als Route sichtbar ist.
// Mit --anzahl 1 entsteht nur der Hauptauftrag.
//
// REGEL 7 (AGENTS.md): keine erfundenen Namen/Nummern, die wie echte Kunden aussehen.
//   Namen   -> „Mustermann" (der deutsche Platzhalter; istInterneIdentitaet erkennt ihn)
//   Telefon -> +49 123 … (in Deutschland NICHT vergebene Vorwahl; istDummyTelefon erkennt sie,
//              der WhatsApp-Chokepoint unterdrueckt sie — erreicht strukturell niemanden)
//   E-Mail  -> demo-brandt-<n>@claimondo.test (.test ist reserviert, stellt nie zu)
//   Fall    -> claims.ist_testfall = true
// Adressen der Besichtigungsorte sind reale Strassen in Bremerhaven (fuer eine glaubwuerdige
// Route), die Koordinaten per Mapbox geocodiert (Relevanz 1, exakte Adresse) — nicht geschaetzt.
//
// SCHUTZ VOR DEM AUFRAEUM-CRON: alle angelegten Zeilen stehen in testdaten_fixtures. Der Cron
// `cron_testdaten_aufraeumen` prueft `id NOT IN (SELECT id FROM testdaten_fixtures)` fuer Leads,
// Claims und Fahrzeuge; Termine und Auftraege haengen daran. Ohne Eintrag waeren die Demodaten
// nach 48 h weg (ueber einen SMOKE-Werkstatt-Bezug sogar nach 2 h — den gibt es hier nicht).
// personen kennt das Register nicht (CHECK auf testdaten_fixtures.tabelle) — die Demo-Personen
// tragen deshalb `notiz = FIXTURE_GRUND`, daran findet --clean sie wieder (nie am Namen: ein
// „Mustermann" kann auch fremd sein).
//
// Keine Kunden-Kommunikation: reine Inserts, keine Sende-Funktion wird aufgerufen. Der einzige
// Trigger mit Nebenwirkung (trg_claim_sv_zuweisung_ins) schreibt eine Aktivitaet
// „Fall zugewiesen" in partner_aktivitaeten — die raeumt --clean mit ab.
//
// Nutzung (aus dem Repo-Root; .env.local mit NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY):
//   node scripts/smoke/demo-brandt-auftrag-seed.mjs              # alte Demo raeumen + neu anlegen
//   node scripts/smoke/demo-brandt-auftrag-seed.mjs --anzahl 1   # nur der Hauptauftrag
//   node scripts/smoke/demo-brandt-auftrag-seed.mjs --ab 15:30   # erster Termin um 15:30 (Berlin)
//   node scripts/smoke/demo-brandt-auftrag-seed.mjs --clean      # nur aufraeumen
//
// Ansehen: als SV Brandt anmelden -> /gutachter/heute (Tagesroute) bzw. /gutachter/auftraege.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

// --- env: process.env zuerst, sonst .env.local (Muster wie sa-vollmacht-seed.mjs) ---
const ENV_CANDIDATES = [
  new URL('../../.env.local', import.meta.url),
  'C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/.env.local',
  '/var/www/claimondo-v2/.env.local',
]
const env = {}
for (const c of ENV_CANDIDATES) {
  try {
    for (const line of readFileSync(c, 'utf8').split('\n')) {
      const l = line.replace(/\r$/, '')
      if (!l.includes('=') || l.trimStart().startsWith('#')) continue
      const i = l.indexOf('=')
      env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    }
    break
  } catch { /* naechster Kandidat */ }
}
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen')
const db = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } })

// --- Argumente ---
const argv = process.argv.slice(2)
const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined }
const NUR_CLEAN = argv.includes('--clean')
const ANZAHL = Math.min(3, Math.max(1, Number(arg('--anzahl') ?? 3) || 3))
const AB = arg('--ab') // 'HH:MM' Berlin

// --- Feste Bezuege (nachgeschlagen auf prod, 23.09.2026) ---
const SV_ID = 'b7387f81-482c-4cc5-8ced-bcaa5e92a5ff' // Kfz-Sachverstaendigenbuero Brandt, Bremerhaven
const KB_ID = 'aa000001-0000-0000-0000-000000000001' // bestehende Test-Kundenbetreuerin (rolle geprueft)
const EMAIL_PREFIX = 'demo-brandt-'
const EMAIL_DOMAIN = '@claimondo.test'
const FIXTURE_GRUND = 'DEMO Brandt-Meeting — scripts/smoke/demo-brandt-auftrag-seed.mjs (--clean entfernt)'
const log = (...a) => console.log(...a)

// --- Die Stopps (Nord -> Sued, passend zu Brandts Buero Weg 10, 27580 Bremerhaven) ---
const STOPPS = [
  {
    kunde: { anrede: 'herr', vorname: 'Max', nachname: 'Mustermann', telefon: '+491231230001' },
    ort: { strasse: 'Hafenstraße 140', plz: '27576', stadt: 'Bremerhaven', lat: 53.560071, lng: 8.586159 },
    fahrzeug: {
      hersteller: 'Volkswagen', modell: 'Golf VIII', variante: '1.5 eTSI Life', farbe: 'Reflexsilber Metallic',
      lack: 'silber', metallic: true, kraftstoff: 'Benzin', kw: 110, ez: '2022-03-15', km: 38420,
      kennzeichen: 'HB-CL 2601', fin: 'WVWZZZCDZMW000001',
    },
    schaden: {
      typ: 'auffahrunfall', datumOffsetTage: 3, uhrzeit: '17:40',
      ort: 'Columbusstraße / Ecke Lloydstraße', ortPlz: '27568',
      hergang: 'Ich stand an der roten Ampel. Der Hintermann hat zu spät gebremst und ist aufgefahren.',
      beschreibung: 'Heckstoßfänger eingedrückt, Heckklappe verzogen, Einparksensor hinten links ohne Funktion.',
      polizei: true, aktenzeichen: 'BHV-DEMO-2601',
      gegnerName: 'Erika Mustermann', gegnerKennzeichen: 'HB-CL 2611', gegnerSchadennummer: 'DEMO-HUK-2601',
      gegnerFahrzeug: 'Opel Astra', gegnerPolice: 'DEMO-POL-2601',
      versicherungId: '72018706-a652-4b43-8f27-c69a757f6054', versicherungName: 'HUK-COBURG',
      nutzungsausfall: true, fahrbereit: true,
    },
    briefing:
      'Haftpflichtschaden, unverschuldet — Auffahrunfall an der Ampel (Columbusstraße/Lloydstraße). ' +
      'Heckstoßfänger eingedrückt, Heckklappe verzogen, Einparksensor hinten links ohne Funktion. ' +
      'Gegner versichert bei der HUK-COBURG, Polizei war vor Ort (Aktenzeichen liegt vor). ' +
      'Bitte Spaltmaße der Heckklappe prüfen, Unterboden hinten sichten und die Sensorik dokumentieren. ' +
      'Kunde ist beim Termin vor Ort und benötigt das Fahrzeug täglich — Nutzungsausfall ist angemeldet.',
    ortNotiz: 'Fahrzeug steht vor dem Haus am Straßenrand. Kunde ist zum Termin vor Ort.',
    kundeNotiz: 'Bitte vorher kurz anrufen, ich komme dann runter.',
    interneNotiz: 'Kunde bittet um zügige Begutachtung — Fahrzeug wird für den Arbeitsweg gebraucht.',
  },
  {
    kunde: { anrede: 'frau', vorname: 'Lisa', nachname: 'Mustermann', telefon: '+491231230002' },
    ort: { strasse: 'Bürgermeister-Smidt-Straße 12', plz: '27568', stadt: 'Bremerhaven', lat: 53.541887, lng: 8.580464 },
    fahrzeug: {
      hersteller: 'Audi', modell: 'A3 Sportback', variante: '35 TFSI', farbe: 'Navarrablau Metallic',
      lack: 'blau', metallic: true, kraftstoff: 'Benzin', kw: 110, ez: '2021-06-10', km: 52100,
      kennzeichen: 'HB-CL 2602', fin: 'WAUZZZGY0MA000002',
    },
    schaden: {
      typ: 'parkplatz', datumOffsetTage: 2, uhrzeit: '11:15',
      ort: 'Parkplatz Hermann-Henrich-Meier-Straße', ortPlz: '27568',
      hergang: 'Beim Ausparken hat ein anderes Fahrzeug meine Fahrertür gestreift. Der Fahrer hat seine Daten hinterlassen.',
      beschreibung: 'Fahrertür und hinterer Kotflügel links mit Schrammen und Delle.',
      polizei: false, aktenzeichen: null,
      gegnerName: 'Jan Mustermann', gegnerKennzeichen: 'HB-CL 2612', gegnerSchadennummer: 'DEMO-ALZ-2602',
      gegnerFahrzeug: 'Skoda Octavia Combi', gegnerPolice: 'DEMO-POL-2602',
      versicherungId: '3519d5bb-96cc-447b-9857-42b2e196d093', versicherungName: 'Allianz',
      nutzungsausfall: false, fahrbereit: true,
    },
    briefing:
      'Parkplatzschaden, unverschuldet — Gegner hat beim Ausparken die Fahrerseite gestreift. ' +
      'Fahrertür und hinterer Kotflügel links: Schrammen und Delle. Gegner bei der Allianz versichert. ' +
      'Bitte Lackschichtdicke messen und prüfen, ob die Tür instand gesetzt oder ersetzt werden muss.',
    ortNotiz: 'Fahrzeug steht auf dem Kundenparkplatz hinter dem Haus.',
    kundeNotiz: null,
    interneNotiz: null,
  },
  {
    kunde: { anrede: 'herr', vorname: 'Paul', nachname: 'Mustermann', telefon: '+491231230003' },
    ort: { strasse: 'Georgstraße 50', plz: '27570', stadt: 'Bremerhaven', lat: 53.531523, lng: 8.589339 },
    fahrzeug: {
      hersteller: 'Ford', modell: 'Focus Turnier', variante: '1.0 EcoBoost', farbe: 'Magnetic-Grau Metallic',
      lack: 'grau', metallic: true, kraftstoff: 'Benzin', kw: 92, ez: '2020-09-01', km: 71350,
      kennzeichen: 'HB-CL 2603', fin: 'WF0XXXGCDXL000003',
    },
    schaden: {
      typ: 'spurwechsel', datumOffsetTage: 1, uhrzeit: '08:05',
      ort: 'Stresemannstraße', ortPlz: '27570',
      hergang: 'Beim Spurwechsel hat der Unfallgegner mein Fahrzeug vorne links touchiert.',
      beschreibung: 'Kotflügel vorne links, Außenspiegel links und Stoßfänger vorne links beschädigt.',
      polizei: true, aktenzeichen: 'BHV-DEMO-2603',
      gegnerName: 'Tom Mustermann', gegnerKennzeichen: 'HB-CL 2613', gegnerSchadennummer: 'DEMO-LVM-2603',
      gegnerFahrzeug: 'BMW 3er Touring', gegnerPolice: 'DEMO-POL-2603',
      versicherungId: 'a1ef7a38-a502-4e36-955d-8dbcb45735f0', versicherungName: 'LVM',
      nutzungsausfall: false, fahrbereit: true,
    },
    briefing:
      'Haftpflichtschaden, unverschuldet — Spurwechselunfall. Kotflügel vorne links, Außenspiegel und ' +
      'Stoßfänger vorne links beschädigt. Gegner bei der LVM versichert, Polizei war vor Ort. ' +
      'Bitte Außenspiegel-Elektrik und Frontsensorik mitprüfen.',
    ortNotiz: 'Fahrzeug steht in der Einfahrt.',
    kundeNotiz: null,
    interneNotiz: null,
  },
].slice(0, ANZAHL)

// --- Zeit: Berlin-Wanduhr -> UTC, sommerzeitsicher (per Intl gegengeprueft) ---
const berlinDatum = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date()) // YYYY-MM-DD
// ⚠ Nicht .format() mit Locale 'de-DE' und nur der Stunde: das liefert „14 Uhr", Number() daraus
//    ist NaN. formatToParts liest die Teile locale-unabhaengig.
function berlinTeile(d) {
  const teile = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d)
  const get = (t) => teile.find((p) => p.type === t)?.value
  return { stunde: Number(get('hour')), minute: Number(get('minute')) }
}
function berlinStunde() {
  return berlinTeile(new Date()).stunde
}
function berlinZuUtcIso(datum, zeit) {
  const [hh, mm] = zeit.split(':').map(Number)
  for (const off of ['+02:00', '+01:00']) {
    const d = new Date(`${datum}T${zeit}:00${off}`)
    const probe = berlinTeile(d)
    if (probe.stunde === hh && probe.minute === mm) return d.toISOString()
  }
  throw new Error(`Zeitumrechnung fehlgeschlagen fuer ${datum} ${zeit}`)
}
function tagMinus(tage) {
  const d = new Date(`${berlinDatum}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - tage)
  return d.toISOString().slice(0, 10)
}
// 'HH:MM' + Minuten, am selben Tag gedeckelt (23:59) — fuer „SA zwei Stunden nach dem Unfall"
function plusMinuten(zeit, minuten) {
  const [hh, mm] = zeit.split(':').map(Number)
  const t = Math.min(hh * 60 + mm + minuten, 23 * 60 + 59)
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}
function terminZeiten() {
  let [h, m] = AB ? AB.split(':').map(Number) : [berlinStunde() + 2, 0]
  const slots = []
  for (let i = 0; i < STOPPS.length; i++) {
    const hh = Math.min(h + i, 22)
    const start = `${String(hh).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    const endeMin = hh * 60 + m + 45
    const ende = `${String(Math.floor(endeMin / 60)).padStart(2, '0')}:${String(endeMin % 60).padStart(2, '0')}`
    slots.push({ start, ende, startIso: berlinZuUtcIso(berlinDatum, start), endeIso: berlinZuUtcIso(berlinDatum, ende) })
  }
  return slots
}

// Spiegel von normalizeName (src/lib/entities/normalize.ts) — damit die Kennzeichen-Suche
// (vehicles.kennzeichen_normalized, Trigram-Index) die Demo-Fahrzeuge findet wie echte.
function normalizeKennzeichen(kz) {
  return String(kz).toLowerCase().replace(/[._/\-,]+/g, ' ').replace(/\s+/g, ' ').trim()
}

// --- Pruefhilfe: supabase-js wirft nicht, das Ergebnis muss gelesen werden ---
function pruefe(res, was) {
  if (res.error) throw new Error(`${was}: ${res.error.message}`)
  return res.data
}

// Schutzliste SOFORT nach dem Anlegen — nicht erst am Ende der Schleife: bricht ein Lauf
// dazwischen ab, findet --clean die Zeile trotzdem wieder (und der Cron laesst sie stehen).
// testdaten_fixtures.tabelle erlaubt per CHECK nur leads/claims/profiles/werkstaetten/firmen/
// sachverstaendige/vehicles — genau die Tabellen, die der Cron direkt loescht. Termin und Auftrag
// erfasst er nur ueber Lead/Fall, sie sind mit deren Eintrag geschuetzt.
async function registriere(id, tabelle) {
  pruefe(
    await db.from('testdaten_fixtures').insert({ id, tabelle, grund: FIXTURE_GRUND }).select('id'),
    `Fixture ${tabelle}`,
  )
}

// ---------------------------------------------------------------- CLEAN
async function clean() {
  const leads = pruefe(
    await db.from('leads').select('id').ilike('email', `${EMAIL_PREFIX}%${EMAIL_DOMAIN}`),
    'Demo-Leads suchen',
  ) ?? []
  const leadIds = leads.map((l) => l.id)
  let claimIds = []
  if (leadIds.length) {
    claimIds = (pruefe(await db.from('claims').select('id, vehicle_id').in('lead_id', leadIds), 'Demo-Claims suchen') ?? [])
  }
  // Fahrzeuge NUR aus eigenen Quellen: die Demo-Faelle und die eigenen Fixture-Eintraege.
  // (Eine Suche per FIN-Muster wuerde auch fremde Fahrzeuge treffen.)
  const eigeneFixtures = pruefe(
    await db.from('testdaten_fixtures').select('id, tabelle').eq('grund', FIXTURE_GRUND),
    'Eigene Fixtures lesen',
  ) ?? []
  const vehicleIds = [
    ...new Set([
      ...claimIds.map((c) => c.vehicle_id).filter(Boolean),
      ...eigeneFixtures.filter((f) => f.tabelle === 'vehicles').map((f) => f.id),
    ]),
  ]
  const cIds = claimIds.map((c) => c.id)
  const fallIds = cIds.length
    ? (pruefe(await db.from('faelle_claim_bridge').select('fall_id').in('claim_id', cIds), 'Bridge lesen') ?? []).map((b) => b.fall_id)
    : []

  // FK-Reihenfolge: Termine -> Auftraege -> Aktivitaeten -> Bridge -> Claims (claim_parties und
  // claim_vehicle_involvements haengen per CASCADE daran) -> Personen -> Fixtures -> Leads -> Fahrzeuge.
  // Fahrzeuge zuletzt: claim_vehicle_involvements.vehicle_id ist ON DELETE RESTRICT.
  if (cIds.length) {
    pruefe(await db.from('gutachter_termine').delete().in('claim_id', cIds), 'Termine loeschen')
    if (fallIds.length) pruefe(await db.from('gutachter_termine').delete().in('fall_id', fallIds), 'Termine (fall_id) loeschen')
    pruefe(await db.from('auftraege').delete().in('claim_id', cIds), 'Auftraege loeschen')
    for (const cid of cIds) {
      pruefe(await db.from('partner_aktivitaeten').delete().eq('meta->>claim_id', cid), 'Aktivitaeten loeschen')
    }
    pruefe(await db.from('faelle_claim_bridge').delete().in('claim_id', cIds), 'Bridge loeschen')
    pruefe(await db.from('claims').delete().in('id', cIds), 'Claims loeschen')
  }
  // Personen am Marker, nie am Namen (auch Reste eines abgebrochenen Laufs ohne Claim)
  const personen = pruefe(
    await db.from('personen').delete().eq('notiz', FIXTURE_GRUND).select('id'),
    'Personen loeschen',
  ) ?? []
  pruefe(await db.from('testdaten_fixtures').delete().eq('grund', FIXTURE_GRUND), 'Fixtures loeschen')
  if (leadIds.length) pruefe(await db.from('leads').delete().in('id', leadIds), 'Leads loeschen')
  if (vehicleIds.length) pruefe(await db.from('vehicles').delete().in('id', vehicleIds), 'Fahrzeuge loeschen')
  log(`  aufgeraeumt: ${cIds.length} Fall/Faelle, ${leadIds.length} Lead(s), ${vehicleIds.length} Fahrzeug(e), ${personen.length} Person(en)`)
}

// ---------------------------------------------------------------- SEED
async function seed() {
  const zeiten = terminZeiten()
  const ergebnis = []

  for (let i = 0; i < STOPPS.length; i++) {
    const s = STOPPS[i]
    const n = i + 1
    const z = zeiten[i]
    const email = `${EMAIL_PREFIX}${n}${EMAIL_DOMAIN}`
    const adresse = `${s.ort.strasse}, ${s.ort.plz} ${s.ort.stadt}`
    const schadentag = tagMinus(s.schaden.datumOffsetTage)
    const jetzt = new Date().toISOString()
    // SA am Unfalltag, zwei Stunden nach dem Unfall (Anruf -> FlowLink -> Unterschrift) —
    // liegt damit immer in der Vergangenheit und vor dem heutigen Termin.
    const saAm = berlinZuUtcIso(schadentag, plusMinuten(s.schaden.uhrzeit, 120))

    // 1) Fahrzeug
    const fz = pruefe(await db.from('vehicles').insert({
      fin: s.fahrzeug.fin,
      kennzeichen_aktuell: s.fahrzeug.kennzeichen,
      kennzeichen_normalized: normalizeKennzeichen(s.fahrzeug.kennzeichen),
      hersteller: s.fahrzeug.hersteller,
      modell_haupttyp: s.fahrzeug.modell,
      variante: s.fahrzeug.variante,
      // Baujahr = Monat der Erstzulassung (Akte: „Baujahr" liest EXTRACT(year FROM baujahr_monat))
      baujahr_monat: `${s.fahrzeug.ez.slice(0, 7)}-01`,
      farbe_klartext: s.fahrzeug.farbe,
      farbcode: s.fahrzeug.lack, // LackfarbeCode (src/lib/fahrzeug/imagin.ts), nicht der Hersteller-Code
      ist_metallic: s.fahrzeug.metallic,
      kraftstoff: s.fahrzeug.kraftstoff,
      leistung_kw: s.fahrzeug.kw,
      erstzulassung: s.fahrzeug.ez,
      aktueller_kilometerstand: s.fahrzeug.km,
      aktueller_kilometerstand_at: jetzt,
    }).select('id').single(), `Fahrzeug ${n}`)
    await registriere(fz.id, 'vehicles')

    // 2) Lead (Kunde + Unfall + Gegner + Besichtigungsort)
    const lead = pruefe(await db.from('leads').insert({
      anrede: s.kunde.anrede,
      vorname: s.kunde.vorname,
      nachname: s.kunde.nachname,
      email,
      telefon: s.kunde.telefon,
      status: 'flow-gesendet',
      qualifizierungs_phase: 'gutachtertermin',
      service_typ: 'komplett',
      abrechnungsweg: 'haftpflicht',
      schuldfrage: 'gegner',
      schadentyp: s.schaden.typ,
      sprache: 'de',
      kennzeichen: s.fahrzeug.kennzeichen,
      fahrzeug_hersteller: s.fahrzeug.hersteller,
      fahrzeug_modell: s.fahrzeug.modell,
      fahrzeug_farbe: s.fahrzeug.farbe,
      erstzulassung: s.fahrzeug.ez,
      fin: s.fahrzeug.fin,
      kilometerstand: s.fahrzeug.km,
      fahrzeug_fahrbereit: s.schaden.fahrbereit,
      vehicle_id: fz.id,
      unfalldatum: schadentag,
      unfall_uhrzeit: s.schaden.uhrzeit,
      unfallort: `${s.schaden.ort}, ${s.schaden.ortPlz} Bremerhaven`,
      unfallort_plz: s.schaden.ortPlz,
      unfallort_ort: 'Bremerhaven',
      unfallhergang: s.schaden.hergang,
      fahrzeugschaden_beschreibung: s.schaden.beschreibung,
      polizei_vor_ort: s.schaden.polizei,
      polizei_aktenzeichen: s.schaden.aktenzeichen,
      gegner_bekannt: true,
      gegner_name: s.schaden.gegnerName,
      gegner_kennzeichen: s.schaden.gegnerKennzeichen,
      gegner_fahrzeugtyp: s.schaden.gegnerFahrzeug,
      gegner_versicherung: s.schaden.versicherungName,
      gegner_versicherung_id: s.schaden.versicherungId,
      gegner_versicherungsnummer: s.schaden.gegnerPolice,
      gegner_schadennummer: s.schaden.gegnerSchadennummer,
      ist_fahrzeughalter: true,
      kunde_strasse: s.ort.strasse,
      kunde_plz: s.ort.plz,
      kunde_stadt: s.ort.stadt,
      kunde_adresse: adresse,
      kunde_lat: s.ort.lat,
      kunde_lng: s.ort.lng,
      besichtigungsort_adresse: adresse,
      besichtigungsort_lat: s.ort.lat,
      besichtigungsort_lng: s.ort.lng,
      besichtigungsort_notiz: s.ortNotiz,
      fahrzeug_standort_adresse: adresse,
      fahrzeug_standort_plz: s.ort.plz,
      fahrzeug_standort_lat: s.ort.lat,
      fahrzeug_standort_lng: s.ort.lng,
    }).select('id').single(), `Lead ${n}`)
    await registriere(lead.id, 'leads')

    // 3) Fall (Claim) — die Bridge fall_id <-> claim_id legt trg_sync_claims_to_bridge an
    const claim = pruefe(await db.from('claims').insert({
      lead_id: lead.id,
      vehicle_id: fz.id,
      schadentag,
      schadenzeit: `${s.schaden.uhrzeit}:00`,
      schadenort_adresse: `${s.schaden.ort}, ${s.schaden.ortPlz} Bremerhaven`,
      schadenort_plz: s.schaden.ortPlz,
      schadenort_ort: 'Bremerhaven',
      schadenort_land: 'DE',
      hergang_kunde_text: s.schaden.hergang,
      fahrzeugschaden_beschreibung: s.schaden.beschreibung,
      schadenart: 'haftpflicht',
      schadenskategorie: 'karosserie',
      abrechnungsweg: 'haftpflicht',
      schuldfrage: 'gegner',
      szenario: 'normalfall',
      service_typ: 'komplett',
      gegner_bekannt: true,
      gegner_versicherung_id: s.schaden.versicherungId,
      anzahl_beteiligte_total: 2,
      polizei_vor_ort: s.schaden.polizei,
      polizei_aktenzeichen: s.schaden.aktenzeichen,
      hat_personenschaden: false,
      hat_mietwagen: false,
      hat_nutzungsausfall: s.schaden.nutzungsausfall,
      fahrzeug_fahrbereit: s.schaden.fahrbereit,
      sv_id: SV_ID,
      sv_zugewiesen_am: jetzt,
      kundenbetreuer_id: KB_ID,
      kundenbetreuer_zugewiesen_am: jetzt,
      operative_status: 'sv-termin',
      created_via: 'manuell_admin',
      konvertiert_am: jetzt,
      datenschutz_akzeptiert: true,
      datenschutz_akzeptiert_am: jetzt,
      // Sicherungsabtretung unterschrieben — ohne das bleibt die Fallakte fuer den SV gesperrt
      sa_unterschrieben: true,
      sa_unterschrieben_am: saAm,
      sv_datenschutz_widerruf_zugestimmt_am: saAm,
      onboarding_complete: true,
      notizen: s.interneNotiz,
      sprache: 'de',
      ist_testfall: true,
      ist_aktiv: true,
    }).select('id, claim_nummer').single(), `Fall ${n}`)
    await registriere(claim.id, 'claims')

    const bridge = pruefe(
      await db.from('faelle_claim_bridge').select('fall_id').eq('claim_id', claim.id).single(),
      `Bridge ${n} (legt der Trigger an)`,
    )

    // 4) Lead als umgewandelt markieren — dieselben Felder wie signSAandCreateFall
    pruefe(await db.from('leads').update({
      status: 'umgewandelt',
      qualifizierungs_phase: 'konvertiert',
      sa_unterschrieben: true,
      sa_unterschrieben_am: saAm,
      flow_link_abgeschlossen: true,
      konvertiert_zu_claim_id: claim.id,
      konvertiert_zu_fall_id: bridge.fall_id,
      konvertiert_am: jetzt,
    }).eq('id', lead.id).select('id').single(), `Lead ${n} umwandeln`)

    // 4b) Beteiligte — wie convertLeadToClaim Schritt 4/5: Gegner-Fahrzeug (provisorisch per
    //     Kennzeichen, wie ensureVehicleFromKennzeichen), je Partei eine personen-Zeile (wie
    //     ensurePersonForData ohne Konto: immer neu, kein Auto-Merge), dann claim_parties OHNE die
    //     flachen Personenfelder (personen ist die Quelle) und die Fahrzeug-Beteiligungen.
    const gegnerFz = pruefe(await db.from('vehicles').insert({
      kennzeichen_aktuell: s.schaden.gegnerKennzeichen,
      kennzeichen_normalized: normalizeKennzeichen(s.schaden.gegnerKennzeichen),
      hersteller: 'Unbekannt',
      bauart: s.schaden.gegnerFahrzeug,
      fin_quelle: 'kennzeichen_provisorisch',
    }).select('id').single(), `Gegner-Fahrzeug ${n}`)
    await registriere(gegnerFz.id, 'vehicles')

    const kundePerson = pruefe(await db.from('personen').insert({
      anrede: s.kunde.anrede,
      vorname: s.kunde.vorname,
      nachname: s.kunde.nachname,
      ist_gewerbe: false,
      email,
      telefon: s.kunde.telefon,
      mobil: s.kunde.telefon,
      adresse_strasse: s.ort.strasse,
      adresse_plz: s.ort.plz,
      adresse_ort: s.ort.stadt,
      adresse_land: 'DE',
      notiz: FIXTURE_GRUND,
    }).select('id').single(), `Person Kunde ${n}`)

    // Wie im Produkt: der Gegner-Freitext steht komplett im Nachnamen
    const gegnerPerson = pruefe(await db.from('personen').insert({
      nachname: s.schaden.gegnerName,
      ist_gewerbe: false,
      adresse_land: 'DE',
      notiz: FIXTURE_GRUND,
    }).select('id').single(), `Person Gegner ${n}`)

    const parteiBasis = {
      claim_id: claim.id,
      ist_aktiv: true,
      ist_anonymisiert: false,
      ist_eingeladen_via_airdrop: false,
      hat_personenschaden: false,
      quelle: 'lead_konvertierung',
    }
    pruefe(await db.from('claim_parties').insert([
      {
        ...parteiBasis,
        rolle: 'geschaedigter',
        reihenfolge: 1,
        person_id: kundePerson.id,
        ist_halter: true,
        ist_fahrer: true,
        vehicle_id: fz.id,
        kennzeichen: s.fahrzeug.kennzeichen,
      },
      {
        ...parteiBasis,
        rolle: 'verursacher',
        reihenfolge: 2,
        person_id: gegnerPerson.id,
        ist_halter: false,
        ist_fahrer: false,
        vehicle_id: gegnerFz.id,
        kennzeichen: s.schaden.gegnerKennzeichen,
        fahrzeugtyp_klartext: s.schaden.gegnerFahrzeug,
        versicherung_id: s.schaden.versicherungId,
        versicherung_klartext: s.schaden.versicherungName,
        versicherungs_aktenzeichen: s.schaden.gegnerSchadennummer,
        versicherungsnummer: s.schaden.gegnerPolice,
      },
    ]).select('id'), `Beteiligte ${n}`)

    pruefe(await db.from('claim_vehicle_involvements').insert([
      { claim_id: claim.id, vehicle_id: fz.id, rolle: 'geschaedigter', reihenfolge: 1 },
      { claim_id: claim.id, vehicle_id: gegnerFz.id, rolle: 'verursacher', reihenfolge: 2 },
    ]).select('id'), `Fahrzeug-Beteiligungen ${n}`)

    // 5) Auftrag (Erstgutachten) mit SV-Briefing
    const auftrag = pruefe(await db.from('auftraege').insert({
      fall_id: bridge.fall_id,
      claim_id: claim.id,
      sv_id: SV_ID,
      typ: 'erstgutachten',
      status: 'termin',
      reihenfolge: 1,
      sv_briefing_text: s.briefing,
      sv_briefing_generated_at: jetzt,
    }).select('id').single(), `Auftrag ${n}`)

    // 6) Besichtigungstermin HEUTE beim SV Brandt
    const termin = pruefe(await db.from('gutachter_termine').insert({
      fall_id: bridge.fall_id,
      claim_id: claim.id,
      auftrag_id: auftrag.id,
      start_zeit: z.startIso,
      end_zeit: z.endeIso,
      status: 'bestaetigt',
      typ: 'sv_begutachtung',
      quelle: 'dispatch',
      assignee_typ: 'sachverstaendiger',
      assignee_id: SV_ID,
      besichtigungsort_adresse: adresse,
      besichtigungsort_lat: s.ort.lat,
      besichtigungsort_lng: s.ort.lng,
      besichtigungsort_notiz: s.ortNotiz,
      besichtigungsort_bestaetigt_am: jetzt,
      notiz_kunde: s.kundeNotiz,
    }).select('id').single(), `Termin ${n}`)

    ergebnis.push({
      n, zeit: `${z.start}–${z.ende}`, fall: claim.claim_nummer,
      kunde: `${s.kunde.vorname} ${s.kunde.nachname}`,
      fahrzeug: `${s.fahrzeug.hersteller} ${s.fahrzeug.modell} (${s.fahrzeug.kennzeichen})`,
      ort: adresse, claimId: claim.id, fallId: bridge.fall_id, terminId: termin.id,
    })
  }

  log(`\n  --- DEMO ANGELEGT (${berlinDatum}, SV Brandt) ---`)
  for (const e of ergebnis) {
    log(`  ${e.n}. ${e.zeit}  ${e.fall}  ${e.kunde}  ·  ${e.fahrzeug}`)
    log(`     Besichtigungsort: ${e.ort}`)
    log(`     Fallakte: /gutachter/fall/${e.fallId}`)
  }
  log('\n  Ansehen: als SV Brandt anmelden -> /gutachter/heute (Tagesroute) · /gutachter/auftraege')
  log('  Aufraeumen: node scripts/smoke/demo-brandt-auftrag-seed.mjs --clean\n')
  return ergebnis
}

// ---------------------------------------------------------------- DISPATCH
async function main() {
  log(`\n== Demo Brandt [${NUR_CLEAN ? 'CLEAN' : `SEED ${ANZAHL} Stopp(s)`}] gegen ${URL_} ==`)
  await clean()
  if (NUR_CLEAN) return
  await seed()
}
main().catch((e) => { console.error('FEHLER:', e.message); process.exit(1) })
