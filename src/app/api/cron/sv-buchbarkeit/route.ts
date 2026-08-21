import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * Waechter: Ist JEDER aktive, echte Sachverstaendige fuer Kunden auffindbar?
 *
 * Kriterium bewusst hart und ohne Grauzone: ein SV muss an seiner EIGENEN Standort-PLZ
 * in der oeffentlichen Termin-API erscheinen. Wer dort fehlt, ist fuer Kunden UND fuer
 * jeden KI-Assistenten unsichtbar — egal wie sauber sein Datensatz in der Admin-Liste
 * aussieht.
 *
 * WARUM als Cron: Die Kette bis zur Buchbarkeit hat viele Glieder (aktiv → Koordinaten →
 * Isochrone → Verifizierungs-Gate → freie Slots → Ranking) und JEDES versagt still.
 * Gemessen am 21.08.2026: 2 von 10 SVs unsichtbar, beide monatelang unbemerkt —
 *   - einer mit Koordinaten 565 km neben seiner PLZ (Adresse ohne Ort → Geocoder riet),
 *   - einer seit >3 Monaten dispatch-gesperrt, obwohl er VIER TAGE nach der
 *     Fristueberschreitung verifiziert wurde (Status nie zurueckgesetzt).
 * Ohne diesen Cron faellt so etwas erst auf, wenn jemand zufaellig danach sucht.
 *
 * BEWUSST ueber die oeffentliche HTTP-API statt direkt ueber planeTerminOeffentlich:
 * geprueft werden soll die KUNDENSICHT inklusive PLZ-Geocoding — also genau der Weg,
 * den ein Kunde oder ein KI-Assistent nimmt. Ein interner Direktaufruf wuerde das
 * Geocoding ueberspringen und damit ausgerechnet den Fehler verstecken, der real auftrat.
 */

const TASK_TYP = 'sv_nicht_auffindbar'

/** Entfernung in km (Haversine) — fuer die Geo-Plausibilitaet gegen die eigene PLZ. */
function distanzKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371
  const r = (d: number) => (d * Math.PI) / 180
  const dLat = r(bLat - aLat)
  const dLng = r(bLng - aLng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const db = createAdminClient()
  const basis = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'

  // ⚠ ist_testaccount reicht als Filter NICHT: die ZZ-Smoke-Konten sind nicht so markiert,
  // tragen aber gesperrt_seit. Ohne beide Kriterien zaehlt man Testdaten als Ausfaelle.
  // ⚠ Bewusst OHNE eingebettetes profiles(...): `sachverstaendige` hat ZWEI Fremdschluessel
  // nach `profiles` (profile_id, gesperrt_von_user_id). PostgREST verlangt deshalb den
  // FK-Alias — und mit dem kann der generierte Supabase-Typ die Spalten nicht mehr
  // aufloesen (alles wird `GenericStringError`). Zwei schlanke Queries sind hier
  // typsicher UND lesbarer als ein Cast, der die Typpruefung stilllegt.
  const { data: svs, error: ladeFehler } = await db
    .from('sachverstaendige')
    // ⚠ EIN durchgehendes String-Literal — kein `+`-Concat und kein Template mit
    // Interpolation: supabase-js leitet die Spaltentypen zur COMPILE-Zeit aus dem Literal
    // ab. Ein zusammengesetzter Ausdruck ist fuer den Typ-Parser opak, und dann wird jede
    // Zeile zu `GenericStringError` — tsc meldet dann 21 Fehler, die wie ein Schema-Problem
    // aussehen, aber reine Formatierung sind.
    .select('id, profile_id, standort_plz, standort_lat, standort_lng, isochrone_polygon, verifizierung_status, verifiziert, urlaub_von, urlaub_bis')
    .eq('ist_aktiv', true)
    .not('ist_testaccount', 'is', true)
    .is('geloescht_am', null)
    .is('gesperrt_seit', null)
  if (ladeFehler) {
    return NextResponse.json({ ok: false, error: ladeFehler.message }, { status: 500 })
  }

  const echte = svs ?? []
  const profilIds = echte.map((s) => s.profile_id).filter((id): id is string => typeof id === 'string')
  const { data: profile } = profilIds.length
    ? await db.from('profiles').select('id, vorname').in('id', profilIds)
    : { data: [] as Array<{ id: string; vorname: string | null }> }
  const namen = new Map((profile ?? []).map((p) => [p.id, p.vorname ?? null]))
  const unsichtbar: Array<{ id: string; name: string; plz: string | null; grund: string }> = []
  let nichtMessbar = 0

  for (const sv of echte) {
    const name = (sv.profile_id ? namen.get(sv.profile_id) : null) ?? '(ohne Namen)'
    const plz = sv.standort_plz

    const maengel: string[] = []
    if (!plz) maengel.push('keine standort_plz')
    if (sv.standort_lat == null || sv.standort_lng == null) maengel.push('keine Koordinaten')
    if (!sv.isochrone_polygon) maengel.push('keine Isochrone (Radius-Fallback)')
    // Nur DIESER Status sperrt (src/lib/sv/dispatch-gate.ts, Entscheidung FG3);
    // 'ausstehend' und NULL sind ausdruecklich erlaubt.
    if (sv.verifizierung_status === 'frist_ueberschritten') {
      maengel.push(
        sv.verifiziert
          ? 'GESPERRT (frist_ueberschritten) OBWOHL verifiziert=true — Status nach Nachverifizierung nicht zurueckgesetzt?'
          : 'gesperrt: Verifizierungsfrist ueberschritten',
      )
    }
    const heute = new Date().toISOString().slice(0, 10)
    if (sv.urlaub_von && sv.urlaub_bis && sv.urlaub_von <= heute && heute <= sv.urlaub_bis) {
      maengel.push(`Urlaub bis ${sv.urlaub_bis}`)
    }

    if (!plz) {
      unsichtbar.push({ id: sv.id, name, plz: null, grund: maengel.join(' · ') })
      continue
    }

    let treffer: Array<{ id: string }> = []
    let center: { lat: number; lng: number } | null = null
    try {
      const res = await fetch(`${basis}/api/v1/gutachter-termine?plz=${encodeURIComponent(plz)}`, {
        headers: { 'User-Agent': 'claimondo-cron-sv-buchbarkeit/1.0' },
        cache: 'no-store',
      })
      const d = (await res.json()) as { gutachter?: Array<{ id: string }>; center?: { lat: number; lng: number } }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      treffer = d.gutachter ?? []
      center = d.center ?? null
    } catch (err) {
      // Ein Netzfehler ist KEIN Befund — sonst meldet ein API-Ausfall "alle SVs kaputt"
      // und die Aufgabenliste fuellt sich mit Phantom-Alarmen.
      nichtMessbar++
      console.error(`[sv-buchbarkeit] nicht messbar (${name}, ${plz}):`, err instanceof Error ? err.message : err)
      continue
    }

    if (center && sv.standort_lat != null && sv.standort_lng != null) {
      const km = distanzKm(Number(sv.standort_lat), Number(sv.standort_lng), center.lat, center.lng)
      if (km > 30) maengel.push(`Koordinaten ${Math.round(km)} km von der eigenen PLZ entfernt (Geocoding!)`)
    }

    if (treffer.some((g) => g.id === sv.id)) continue // sichtbar → nichts zu tun

    if (maengel.length === 0) {
      maengel.push(
        treffer.length > 0
          ? `nicht unter den ${treffer.length} Treffern (Ranking zeigt nur die Bestplatzierten)`
          : 'keine Treffer an dieser PLZ — Slot-Ebene pruefen',
      )
    }
    unsichtbar.push({ id: sv.id, name, plz, grund: maengel.join(' · ') })
  }

  // --- Alarm: je unsichtbarem SV eine offene Admin-Aufgabe -----------------------------
  let angelegt = 0
  for (const fall of unsichtbar) {
    const { count, error: zaehlFehler } = await db
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('typ', TASK_TYP)
      .eq('status', 'offen')
      .eq('entity_type', 'gutachter')
      .eq('entity_id', fall.id)
    // Zaehlfehler NICHT ignorieren: sonst legt der Cron taeglich Dubletten an und die
    // Aufgabenliste erstickt an sich selbst.
    if (zaehlFehler) {
      console.error(`[sv-buchbarkeit] Dubletten-Check fehlgeschlagen (${fall.name}):`, zaehlFehler.message)
      continue
    }
    if ((count ?? 0) > 0) continue

    const { error: insertFehler } = await db.from('tasks').insert({
      titel: `SV nicht auffindbar: ${fall.name} (${fall.plz ?? 'ohne PLZ'}) — ${fall.grund}`,
      typ: TASK_TYP,
      prioritaet: 'dringend',
      status: 'offen',
      entity_type: 'gutachter',
      entity_id: fall.id,
      faellig_am: new Date().toISOString(),
    })
    // Ohne diesen Task meldet niemand den Ausfall — der Cron ist die einzige Instanz,
    // die ihn sieht. Ein stiller Insert-Fehler waere derselbe Blindflug wie vorher.
    if (insertFehler) {
      console.error(`[sv-buchbarkeit] Task NICHT angelegt (${fall.name}):`, insertFehler.message)
      continue
    }
    angelegt++
  }

  return NextResponse.json({
    ok: true,
    geprueft: echte.length,
    unsichtbar: unsichtbar.length,
    nichtMessbar,
    tasksAngelegt: angelegt,
    details: unsichtbar,
  })
}
