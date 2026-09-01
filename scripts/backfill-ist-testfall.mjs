#!/usr/bin/env node
// Backfill fuer claims.ist_testfall (Mig 20260831222740).
//
// WARUM: claims_lead_id_fkey ist ON DELETE SET NULL. Loescht ein Smoke-/Ops-Test-Cleanup
// seinen Test-Lead, wird claims.lead_id NULL -- und mit dem Lead verschwindet der einzige
// Testmarker. Der Code setzt das Flag ab jetzt beim Anlegen; dieses Skript holt den Bestand
// nach (gemessen 31.08.: 26 von 57 Komplettservice-Claims ohne Lead).
//
// ⭐ ZWEI MODI, bewusst getrennt -- weil ihre BEWEISLAGE verschieden ist:
//
//   A) --beweisbar  Der Claim hat NOCH einen Lead, dessen Email auf einer RFC-2606-
//                   reservierten Domain liegt (@*.test, @example.com/org/net, @*.invalid).
//                   Solche Domains sind nicht registrierbar -> ein Treffer ist BEWIESEN.
//                   Exakt dieselbe Regel, die convert-lead-to-claim.ts ab jetzt anwendet;
//                   dieser Modus stellt also nur den Zustand her, den ein heutiger Lauf
//                   erzeugt haette. Braucht keine Einzelfall-Freigabe.
//
//   B) --fenster    Der Claim hat KEINEN Lead mehr (Waise). Dann gibt es keinen Beweis,
//                   nur ein Indiz: eine Haeufung in wenigen Minuten mit fortlaufenden
//                   claim_nummer -- bei ~1 echten Claim/Tag ist das kein Kundenaufkommen.
//                   MUSS explizit mit Zeitfenster + --apply aufgerufen werden, damit
//                   niemand versehentlich eine ganze Tabelle markiert.
//
// ⚠ SICHERHEITSNETZE (beide Modi):
//   • Es wird NUR auf true gesetzt, nie geloescht, nie ein anderes Feld angefasst.
//   • Claims mit geschaedigter_user_id (= es gibt einen echten Kundenzugang) werden in
//     Modus B NIE angefasst -- ein wartender Kunde ist das Gegenteil eines Testfalls.
//   • Ohne --apply passiert nichts: Default ist Dry-Run.
//
// ⭐ Das Flag ist zum Zeitpunkt dieses Skripts REIN BUCHHALTERISCH: es filtert noch keine
// Liste. Ein falsch gesetztes Flag hat daher keine operative Wirkung und ist reversibel
// (--zuruecksetzen). Erst wenn die Listen darauf filtern, wird es wirksam -- diese
// Reihenfolge ist Absicht.
//
//   node --env-file=.env.local scripts/backfill-ist-testfall.mjs --beweisbar
//   node --env-file=.env.local scripts/backfill-ist-testfall.mjs --beweisbar --apply
//   node --env-file=.env.local scripts/backfill-ist-testfall.mjs --fenster="2026-08-11T16:30,2026-08-11T17:10"
//   node --env-file=.env.local scripts/backfill-ist-testfall.mjs --zuruecksetzen --apply

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('ENV fehlt — mit --env-file=.env.local starten')
  process.exit(1)
}
const db = createClient(url, key, { auth: { persistSession: false } })

const argv = process.argv.slice(2)
const apply = argv.includes('--apply')
const modusBeweisbar = argv.includes('--beweisbar')
const modusMarker = argv.includes('--marker')
const modusZuruecksetzen = argv.includes('--zuruecksetzen')
const fensterArg = argv.find((a) => a.startsWith('--fenster='))?.split('=')[1]

if (!modusBeweisbar && !modusMarker && !fensterArg && !modusZuruecksetzen) {
  console.error(
    'Kein Modus gewaehlt. Nutze --beweisbar, --marker, --fenster="VON,BIS" oder --zuruecksetzen.\n' +
      'Ohne --apply laeuft jeder Modus als Dry-Run.',
  )
  process.exit(1)
}

// Dieselbe Regel wie src/lib/testdaten/ist-test-email.ts -> istReservierteTestDomain.
// Bewusst dupliziert: dieses Skript laeuft als plain node ohne TS-Pfad-Aliase. Die
// Aussage ist unit-getestet in src/lib/testdaten/__tests__/ist-test-email.test.ts.
const RESERVIERTE_TEST_DOMAIN =
  /@(?:[a-z0-9-]+\.)*(?:test|example|invalid|localhost)$|@example\.(?:com|net|org)$/i

function trenner(titel) {
  console.log(`\n=== ${titel} ===`)
}

/** Setzt das Flag und PRUEFT die betroffenen Zeilen (kein stiller Write). */
async function setzeFlag(ids, wert) {
  if (!apply) {
    console.log(`  [DRY-RUN] ${ids.length} Claim(s) wuerden auf ist_testfall=${wert} gesetzt.`)
    return
  }
  const { data, error } = await db
    .from('claims')
    .update({ ist_testfall: wert })
    .in('id', ids)
    .select('id')
  if (error) {
    console.error('  FEHLER beim Update:', error.message)
    process.exitCode = 1
    return
  }
  console.log(`  ✅ ${data?.length ?? 0} Claim(s) auf ist_testfall=${wert} gesetzt.`)
  if ((data?.length ?? 0) !== ids.length) {
    console.error(
      `  ⚠ Erwartet ${ids.length}, geschrieben ${data?.length ?? 0} — RLS/Filter pruefen.`,
    )
    process.exitCode = 1
  }
}

// ── Modus A: beweisbar (Lead existiert noch, reservierte Domain) ───────────────
if (modusBeweisbar) {
  trenner('Modus A — beweisbar (RFC-2606-Domain am noch vorhandenen Lead)')
  const { data: rows, error } = await db
    .from('claims')
    // FK explizit benennen: zwischen claims und leads existiert mehr als eine Beziehung,
    // ein blosses `leads(...)` laesst PostgREST mit "more than one relationship" abbrechen.
    .select('id, claim_nummer, ist_testfall, created_at, leads!claims_lead_id_fkey!inner(email)')
    .eq('ist_testfall', false)
  if (error) {
    console.error('Read fehlgeschlagen:', error.message)
    process.exit(1)
  }
  const treffer = (rows ?? []).filter((r) => {
    const lead = Array.isArray(r.leads) ? r.leads[0] : r.leads
    return RESERVIERTE_TEST_DOMAIN.test(lead?.email ?? '')
  })
  console.log(`  ${rows?.length ?? 0} Claims mit Lead und ist_testfall=false geprueft.`)
  for (const t of treffer) {
    const lead = Array.isArray(t.leads) ? t.leads[0] : t.leads
    // Nur die Domain ausgeben — der Local-Part ist personenbezogen.
    console.log(`   · ${t.claim_nummer}  @${String(lead?.email ?? '').split('@')[1] ?? '?'}`)
  }
  if (treffer.length === 0) console.log('  Keine Kandidaten.')
  else await setzeFlag(treffer.map((t) => t.id), true)
}

// ── Modus A2: Marker AM CLAIM (Seed-Konvention) ───────────────────────────────
// Viele Seeds schreiben ihren Marker direkt in den Claim — `schadenort_adresse: MARKER`
// (SMOKE-…) oder `fall_typ: 'SMOKE-LC-04'` (lifecycle-seed). Das ist genauso beweisbar wie
// eine reservierte Domain: an einem Ort namens "SMOKE-AUSZAHLUNGSART-ERHEBUNG" verunfallt
// niemand. Dieser Modus braucht KEINEN Lead — er greift auch bei Waisen.
if (modusMarker) {
  trenner('Modus A2 — Marker am Claim (schadenort_adresse / fall_typ)')
  const { data: rows, error } = await db
    .from('claims')
    .select('id, claim_nummer, schadenort_adresse, fall_typ')
    .eq('ist_testfall', false)
  if (error) {
    console.error('Read fehlgeschlagen:', error.message)
    process.exit(1)
  }
  // Anker am Zeilenanfang: ein Schadenort, der zufaellig "test" enthaelt
  // ("Testorfer Weg"), wird NICHT getroffen.
  const MARKER_RE = /^(SMOKE|TEST|FIXTURE)/
  const treffer = (rows ?? []).filter(
    (r) => MARKER_RE.test(r.schadenort_adresse ?? '') || /^SMOKE/.test(r.fall_typ ?? ''),
  )
  console.log(`  ${rows?.length ?? 0} unmarkierte Claims geprueft.`)
  for (const t of treffer) {
    const grund = /^SMOKE/.test(t.fall_typ ?? '') ? `fall_typ=${t.fall_typ}` : 'Marker im Schadenort'
    console.log(`   · ${t.claim_nummer}  ${grund}`)
  }
  if (treffer.length === 0) console.log('  Keine Kandidaten.')
  else await setzeFlag(treffer.map((t) => t.id), true)
}

// ── Modus B: Zeitfenster (Waisen ohne Lead) ───────────────────────────────────
if (fensterArg) {
  const [von, bis] = fensterArg.split(',').map((s) => s.trim())
  if (!von || !bis) {
    console.error('--fenster braucht "VON,BIS" als ISO-Zeitstempel.')
    process.exit(1)
  }
  trenner(`Modus B — Zeitfenster ${von} .. ${bis} (nur Waisen ohne Lead)`)
  const { data: rows, error } = await db
    .from('claims')
    .select('id, claim_nummer, created_at, operative_status, geschaedigter_user_id, lead_id')
    .is('lead_id', null)
    .is('geschaedigter_user_id', null) // Sicherheitsnetz: wartender Kunde wird nie markiert
    .eq('ist_testfall', false)
    .gte('created_at', von)
    .lte('created_at', bis)
    .order('created_at')
  if (error) {
    console.error('Read fehlgeschlagen:', error.message)
    process.exit(1)
  }
  console.log(`  ${rows?.length ?? 0} Kandidat(en) im Fenster:`)
  for (const r of rows ?? []) {
    console.log(`   · ${r.claim_nummer}  ${r.created_at}  ${r.operative_status ?? '—'}`)
  }
  // Die Haeufung ist das Indiz — eine einzelne Zeile im Fenster ist keine.
  if ((rows?.length ?? 0) === 1) {
    console.log(
      '  ⚠ Nur EIN Claim im Fenster. Das Indiz dieses Modus ist die HAEUFUNG —\n' +
        '    bei einer einzelnen Zeile traegt es nicht. Fenster pruefen.',
    )
  }
  if ((rows?.length ?? 0) > 0) await setzeFlag(rows.map((r) => r.id), true)
}

// ── Rueckwaerts: alles wieder auf false ───────────────────────────────────────
if (modusZuruecksetzen) {
  trenner('Zuruecksetzen — alle ist_testfall=true wieder auf false')
  const { data: rows, error } = await db
    .from('claims')
    .select('id, claim_nummer')
    .eq('ist_testfall', true)
  if (error) {
    console.error('Read fehlgeschlagen:', error.message)
    process.exit(1)
  }
  console.log(`  ${rows?.length ?? 0} markierte Claim(s).`)
  if ((rows?.length ?? 0) > 0) await setzeFlag(rows.map((r) => r.id), false)
}

// ── Bilanz ────────────────────────────────────────────────────────────────────
const { count: markiert } = await db
  .from('claims')
  .select('id', { count: 'exact', head: true })
  .eq('ist_testfall', true)
const { count: gesamt } = await db.from('claims').select('id', { count: 'exact', head: true })
trenner('Bilanz')
console.log(`  ${markiert ?? 0} von ${gesamt ?? 0} Claims tragen ist_testfall=true.`)
if (!apply) console.log('  (Dry-Run — nichts geaendert. Mit --apply ausfuehren.)')
