#!/usr/bin/env node
/**
 * Wächter: Ist JEDER aktive, echte Sachverständige für Kunden auffindbar?
 *
 * Das Kriterium ist bewusst hart und ohne Grauzone:
 *   **Ein SV muss an seiner EIGENEN Standort-PLZ in der öffentlichen Termin-API erscheinen.**
 * Wer dort nicht auftaucht, ist für Kunden (und für jeden KI-Assistenten) unsichtbar —
 * egal wie sauber sein Datensatz aussieht.
 *
 * WARUM das nötig ist: Die Kette bis zur Buchbarkeit hat mehrere Glieder (aktiv → Koordinaten
 * → Isochrone → Verifizierungs-Gate → freie Slots → Ranking), und **jedes einzelne versagt
 * still**. Am 21.08.2026 waren 2 von 10 SVs unsichtbar, ohne dass es jemandem aufgefallen war:
 *   - einer mit Koordinaten ~600 km neben seiner PLZ (Adresse ohne Ort → Geocoder riet),
 *   - einer seit >3 Monaten gesperrt, obwohl er VIER TAGE nach der Fristüberschreitung
 *     verifiziert wurde — der Status wurde nie zurückgesetzt.
 * Beide Datensätze sahen in der Admin-Liste unauffällig aus.
 *
 * Das Skript nennt bei jedem Fehltreffer die WAHRSCHEINLICHE URSACHE, statt nur „fehlt" zu
 * melden — sonst beginnt die Diagnose jedes Mal von vorn.
 *
 * Nutzung (Service-Key nötig, liest nur):
 *   node --env-file=.env.local scripts/sv-buchbarkeit-check.mjs
 *   node --env-file=.env.local scripts/sv-buchbarkeit-check.mjs --json
 *
 * Exit 0 = alle sichtbar · 1 = mindestens einer unsichtbar · 2 = nicht messbar (Instrument tot).
 */

const API_BASE = 'https://app.claimondo.de/api/v1'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const alsJson = process.argv.includes('--json')

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('FEHLT: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.')
  console.error('Aufruf: node --env-file=.env.local scripts/sv-buchbarkeit-check.mjs')
  process.exit(2)
}

/** Entfernung in km (Haversine) — für den Geo-Plausibilitätscheck. */
function distanzKm(aLat, aLng, bLat, bLng) {
  const R = 6371, r = (d) => (d * Math.PI) / 180
  const dLat = r(bLat - aLat), dLng = r(bLng - aLng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

async function db(pfad) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pfad}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  })
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

// Nur ECHTE aktive SVs. ist_testaccount reicht als Filter NICHT: die ZZ-Smoke-Konten sind
// nicht so markiert, tragen aber gesperrt_seit — deshalb beide Kriterien.
// ⚠ Die Beziehung MUSS über den FK-Namen adressiert werden: `sachverstaendige` hat ZWEI
// Fremdschlüssel nach `profiles` (profile_id und gesperrt_von_user_id). Ein schlichtes
// `profiles(vorname)` beantwortet PostgREST mit HTTP 300 (PGRST201, mehrdeutig).
const svs = await db(
  'sachverstaendige?select=id,standort_plz,standort_lat,standort_lng,isochrone_polygon,' +
    'verifizierung_status,verifiziert,gesperrt_seit,paket_umkreis_km,urlaub_von,urlaub_bis,' +
    'profiles!sachverstaendige_profile_id_fkey(vorname)' +
    '&ist_aktiv=eq.true&ist_testaccount=not.is.true&geloescht_am=is.null',
).catch((e) => {
  console.error(`Supabase nicht erreichbar: ${e.message}`)
  process.exit(2)
})

const aktiv = svs.filter((s) => !s.gesperrt_seit)
const zeilen = []
let unsichtbar = 0, nichtPruefbar = 0

for (const sv of aktiv) {
  const name = sv.profiles?.vorname ?? '(ohne Namen)'
  const plz = sv.standort_plz

  // --- Vorab-Diagnosen, die OHNE API-Aufruf feststehen -------------------------------
  const maengel = []
  if (!plz) maengel.push('keine standort_plz')
  if (sv.standort_lat == null || sv.standort_lng == null) maengel.push('keine Koordinaten')
  if (!sv.isochrone_polygon) maengel.push('keine Isochrone (Radius-Fallback)')
  // Nur DIESER Status sperrt (src/lib/sv/dispatch-gate.ts, Entscheidung FG3) — 'ausstehend'
  // und NULL sind ausdrücklich erlaubt.
  const gesperrtDurchFrist = sv.verifizierung_status === 'frist_ueberschritten'
  if (gesperrtDurchFrist) {
    maengel.push(
      sv.verifiziert
        ? 'GESPERRT: frist_ueberschritten — ABER verifiziert=true (Status nach Nachverifizierung nie zurückgesetzt?)'
        : 'gesperrt: Verifizierungsfrist überschritten (dispatch-gate)',
    )
  }
  const heute = new Date().toISOString().slice(0, 10)
  if (sv.urlaub_von && sv.urlaub_bis && sv.urlaub_von <= heute && heute <= sv.urlaub_bis) {
    maengel.push(`Urlaub bis ${sv.urlaub_bis}`)
  }

  if (!plz) {
    zeilen.push({ name, plz: null, sichtbar: false, grund: maengel.join(' · ') })
    unsichtbar++
    continue
  }

  // --- Der eigentliche Test: erscheint er an seiner eigenen PLZ? ---------------------
  let treffer = null, selbst = false, center = null
  try {
    const res = await fetch(`${API_BASE}/gutachter-termine?plz=${encodeURIComponent(plz)}`, {
      headers: { 'User-Agent': 'claimondo-sv-buchbarkeit-check/1.0' },
    })
    const d = await res.json()
    if (!res.ok) throw new Error(d?.error ?? `HTTP ${res.status}`)
    treffer = Array.isArray(d.gutachter) ? d.gutachter : []
    selbst = treffer.some((g) => g.id === sv.id)
    center = d.center ?? null
  } catch (e) {
    // Netzfehler ist KEIN Befund — sonst meldet ein Ausfall „alle SVs kaputt".
    zeilen.push({ name, plz, sichtbar: null, grund: `nicht messbar: ${e.message}` })
    nichtPruefbar++
    continue
  }

  // Geo-Plausibilität: liegt der Standort wirklich bei seiner PLZ? Der Geocoder rät bei
  // Adressen ohne Ortsangabe — das Ergebnis sieht in der DB völlig normal aus.
  if (center && sv.standort_lat != null) {
    const km = distanzKm(Number(sv.standort_lat), Number(sv.standort_lng), center.lat, center.lng)
    if (km > 30) maengel.push(`Koordinaten ${Math.round(km)} km von der eigenen PLZ entfernt (Geocoding!)`)
  }

  if (selbst) {
    zeilen.push({ name, plz, sichtbar: true, grund: maengel.length ? `sichtbar, aber: ${maengel.join(' · ')}` : '' })
  } else {
    unsichtbar++
    if (maengel.length === 0) {
      // Alles plausibel und trotzdem weg — das ist der Fall, der eine echte Untersuchung braucht.
      maengel.push(
        treffer.length > 0
          ? `nicht in den ${treffer.length} Treffern (Ranking zeigt nur die Bestplatzierten)`
          : 'keine Treffer an dieser PLZ — Slot-Ebene prüfen (freie Termine?)',
      )
    }
    zeilen.push({ name, plz, sichtbar: false, grund: maengel.join(' · ') })
  }
}

if (alsJson) {
  console.log(JSON.stringify({ geprueft: aktiv.length, unsichtbar, nichtPruefbar, zeilen }, null, 2))
} else {
  console.log(`\nSV-Buchbarkeit — ${aktiv.length} aktive echte Sachverständige\n${'='.repeat(78)}`)
  for (const z of zeilen) {
    const sym = z.sichtbar === true ? '✓' : z.sichtbar === null ? '?' : '✗'
    console.log(`  ${sym} ${(z.name ?? '').padEnd(14)} ${(z.plz ?? '—').padEnd(7)} ${z.grund}`)
  }
  console.log('='.repeat(78))
  console.log(`  sichtbar: ${aktiv.length - unsichtbar - nichtPruefbar}/${aktiv.length}` +
    (unsichtbar ? `   UNSICHTBAR: ${unsichtbar}` : '') +
    (nichtPruefbar ? `   nicht messbar: ${nichtPruefbar}` : ''))
}

if (unsichtbar > 0) process.exit(1)
if (nichtPruefbar > 0) process.exit(2)
process.exit(0)
