import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { emailSvZugewiesen } from '@/lib/email'
import { haversineKm } from '@/lib/gps/geofence'
// AAR-87: nachgelagerte Trigger
import { triggerGutachterTerminTask } from '@/lib/tasking'
import { triggerSV01 } from '@/lib/gutachterTasking'
import { enqueue, buildDedupKey } from '@/lib/notifications/outbox'
import { createGutachterMitteilung } from '@/lib/mitteilungen'
import { applyDispatchableFilter } from '@/lib/sv/queries'
import { sendNachricht } from '@/lib/whatsapp/send'
import { setSvIdForFall } from '@/lib/faelle/sv-assignment'
// C1a (Fundament): operative_status-Übergang der SV-Findung durch die State-Machine-Engine funneln.
import { transitionFallStatus } from '@/lib/faelle/state-machine'
import { bezugOrExpr } from '@/lib/termine/bezug-filter'
import { ladeZahlendeSvSet } from '@/lib/netzwerk/entitlement'
import { sortiereMitNetzwerk } from './sortiere-mit-netzwerk'

// ─── Point-in-Polygon (Ray Casting) ─────────────────────────────────────────

function pointInPolygon(point: { lat: number; lng: number }, polygon: { lat: number; lng: number }[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat, yi = polygon[i].lng
    const xj = polygon[j].lat, yj = polygon[j].lng
    if ((yi > point.lng) !== (yj > point.lng) &&
        point.lat < (xj - xi) * (point.lng - yi) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

// ─── POST /api/sv-zuweisung ──────────────────────────────────────────────────

export async function POST(request: Request) {
  const supabase = await createClient()

  // Write-Path-Audit (28.06.): Autorisierung. Vorher reichte JEDER Login (nur getUser) →
  // Privilege-Escalation: Kunde/Makler/Werkstatt konnten einen SV zuweisen (admin-client-
  // Write, RLS-Bypass) + Leadpreis abziehen + Notification-Chain triggern.
  // (a) Interner Auto-Dispatch (z.B. nach SV-Ablehnung) ruft server-to-server mit
  //     Bearer CRON_SECRET (kein User-Cookie). (b) Sonst: eingeloggter Staff.
  // NB Follow-up: die nachfolgenden Reads laufen über den RLS-Client `supabase` — beim
  // internen (user-losen) Aufruf liefern sie 0 Rows; damit der Auto-Dispatch voll greift,
  // müssten die Reads im internen Pfad auf admin-client umgestellt werden (separater Fix;
  // bisher war der interne Aufruf ohnehin 401 → keine Regression).
  const authHeader = request.headers.get('authorization') ?? ''
  const isInternal =
    !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`
  // AAR (06.07. E2E-Hunt): interner Auto-Dispatch (Bearer CRON_SECRET, user-los) MUSS
  // ueber den Admin-Client lesen — sonst liefern die RLS-gegateten Reads (faelle_claim_bridge
  // etc.) 0 Zeilen -> 404 -> nach SV-Ablehnung wird NIE ein Ersatz-SV zugewiesen (nur ein
  // manueller Fallback-Task). Der eingeloggte Staff-Pfad bleibt auf dem RLS-Client
  // (db === supabase), behaelt also exakt die Case-Visibility des Users.
  const db = isInternal ? createAdminClient() : supabase
  // C1a: den handelnden Staff-User fuer den Engine-Funnel (transitionFallStatus) festhalten.
  // Interner Auto-Dispatch (Bearer CRON_SECRET) ist user-los -> null (System-Actor).
  let actorUserId: string | null = null
  if (!isInternal) {
    const user = (await db.auth.getUser())?.data?.user ?? null
    if (!user) {
      return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })
    }
    actorUserId = user.id
    const { data: profile } = await db
      .from('profiles')
      .select('rolle')
      .eq('id', user.id)
      .single()
    if (!['admin', 'dispatch', 'kundenbetreuer'].includes((profile?.rolle as string) ?? '')) {
      return NextResponse.json({ error: 'Nicht berechtigt' }, { status: 403 })
    }
  }

  // Body
  const body = await request.json().catch(() => null)
  const fallId: string | undefined = body?.fall_id
  if (!fallId) {
    return NextResponse.json({ error: 'fall_id fehlt' }, { status: 400 })
  }

  // 1. Fall laden — KFZ-154: zusätzlich spezifikation + schadenart für Match
  // CMM-44 SP-A: spezifikation ist faelle<->claims-DUP-Spalte — über
  // claims-Embed gelesen (claims ist SSoT).
  // CMM-44 SP-A2 (Cluster 1): schadenort_plz aus dem claims-Embed.
  // CMM-44 SP-A2 (Cluster 2): schadens_art → claims.schadenart — ebenfalls
  // aus dem claims-Embed (claims ist SSoT).
  // CMM-74 b″: status aus dem Select entfernt — war ungenutzt (nur sv_id +
  // claims-Embed werden gelesen). faelle.status wird weiter unten geschrieben,
  // aber nirgends in dieser Route gelesen.
  // CMM-49 (faelle-Drop-Runway): Anker auf faelle_claim_bridge statt .from('faelle')
  // (Policy faelle_claim_bridge_select_consolidated spiegelt faelle's Case-Access exakt
  // -> gleiche Sichtbarkeit; bridge.fall_id == faelle.id, 1:1). sv_id aus claims.sv_id
  // (SSoT, div=0 vs faelle.sv_id).
  const { data: fall, error: fallErr } = await db
    .from('faelle_claim_bridge')
    // FK-Hint Pflicht (PGRST201, s. Mig 20260708071538): ohne ihn liefert die Query HTTP 300,
    // `fallErr` greift und die Route antwortete IMMER 404 "Fall nicht gefunden".
    .select('fall_id, claim_id, claims:claims!fk_bridge_claim(sv_id, spezifikation, schadenort_plz, schadenart)')
    .eq('fall_id', fallId)
    .single()

  if (fallErr || !fall) {
    return NextResponse.json({ error: 'Fall nicht gefunden' }, { status: 404 })
  }
  const fallClaim = Array.isArray(fall.claims) ? fall.claims[0] : fall.claims
  const fallSpezifikation = (fallClaim?.spezifikation as string | null) ?? null
  const fallSchadenPlz = (fallClaim?.schadenort_plz as string | null) ?? null
  const fallSchadenart = (fallClaim?.schadenart as string | null) ?? null
  if (fallClaim?.sv_id) {
    return NextResponse.json({ error: 'Bereits ein SV zugewiesen' }, { status: 409 })
  }
  if (!fallSchadenPlz) {
    return NextResponse.json({ error: 'Keine Schadens-PLZ hinterlegt' }, { status: 422 })
  }

  // 2. PLZ-Koordinaten des Schadens laden
  const { data: schadenGeo } = await db
    .from('plz_geo')
    .select('lat, lng')
    .eq('plz', fallSchadenPlz)
    .single()

  // KFZ-152 Phase 3: Exklusivitaets-Check VOR der SV-Auswahl. Wenn der Lead
  // in einem exklusiven Community-Gebiet liegt, duerfen nur SVs aus DIESER Org
  // den Lead bekommen.
  let exklusivOrgId: string | null = null
  if (schadenGeo) {
    try {
      const { checkExklusivitaet } = await import('@/lib/dispatch/exklusivitaet')
      const ex = await checkExklusivitaet(db, Number(schadenGeo.lat), Number(schadenGeo.lng))
      if (ex.exklusiv) {
        exklusivOrgId = ex.organisation_id
        console.log(`[KFZ-152] Lead ${fallId} im exklusiven Gebiet von Community ${ex.community_name} (org=${ex.organisation_id})`)
      }
    } catch (err) {
      console.error('[KFZ-152] Exklusivitaets-Check fehlgeschlagen:', err)
    }
  }

  // 3. Alle dispatchbaren SVs laden — einheitlicher Filter aus lib/sv/queries.
  // AAR SV-Audit-Konsolidierung: gesperrt_seit + geloescht_am waren hier
  // bisher nicht gefiltert. Jetzt via applyDispatchableFilter konsistent.
  const svBaseQuery = db
    .from('sachverstaendige')
    .select('id, partner_seit, offene_faelle, paket_faelle_gesamt, paket_faelle_genutzt, standort_lat, standort_lng, isochrone_polygon, paket_umkreis_km, spezifikationen, schadenarten, organisation_id, rolle_in_organisation')
  let svQuery = applyDispatchableFilter(svBaseQuery)

  // Wenn Exklusivitaet aktiv: Hard-Filter auf nur die Mitglieder dieser Org
  if (exklusivOrgId) {
    svQuery = svQuery.eq('organisation_id', exklusivOrgId)
  }

  const { data: svList, error: svErr } = await svQuery

  if (svErr || !svList || svList.length === 0) {
    return NextResponse.json(
      { error: 'Keine aktiven Sachverständigen gefunden' },
      { status: 404 },
    )
  }

  // 4. Filtern: Kapazität + Umkreis 40 km
  // KFZ-154: spezifikation als Hard-Filter mit Fallback, schadens_art als Soft-Priority
  type Candidate = (typeof svList)[number] & { distanz_km: number | null; spez_match: boolean; schaden_match: boolean }

  const candidates: Candidate[] = []

  for (const sv of svList) {
    // Kapazitätsprüfung
    // AAR SV-Audit-Konsolidierung: Fallback auf 10 (Standard-Paket) statt 0.
    // Bei ?? 0 wurden alle SVs mit paket_faelle_gesamt=null rausgefiltert,
    // weil svGenutzt >= 0 immer true ist. Standard-Paket-Default ist konservativ:
    // der SV kriegt Fälle bis 10, falls max korrekt konfiguriert wird, kommt
    // der echte Wert bei der nächsten Iteration.
    const svMax = sv.paket_faelle_gesamt ?? 10
    const svGenutzt = sv.paket_faelle_genutzt ?? sv.offene_faelle ?? 0
    if (svGenutzt >= svMax) continue

    let distanz: number | null = null
    let inRange = false

    const svLat = sv.standort_lat
    const svLng = sv.standort_lng
    const maxRadius = sv.paket_umkreis_km ?? 40

    // a) Haversine-Distanz
    if (schadenGeo && svLat != null && svLng != null) {
      distanz = haversineKm(
        Number(schadenGeo.lat), Number(schadenGeo.lng),
        Number(svLat), Number(svLng),
      )
      inRange = distanz <= maxRadius
    }

    // b) Isochrone Point-in-Polygon (ersetzt PLZ-Matching)
    if (!inRange && schadenGeo && sv.isochrone_polygon && Array.isArray(sv.isochrone_polygon)) {
      if (pointInPolygon({ lat: Number(schadenGeo.lat), lng: Number(schadenGeo.lng) }, sv.isochrone_polygon as { lat: number; lng: number }[])) {
        inRange = true
        if (distanz === null && svLat != null && svLng != null) {
          distanz = haversineKm(Number(schadenGeo.lat), Number(schadenGeo.lng), Number(svLat), Number(svLng))
        }
      }
    }

    if (inRange) {
      // KFZ-154 Match-Flags pro Kandidat
      const svSpez = (sv.spezifikationen as string[] | null) ?? []
      const svSchaden = (sv.schadenarten as string[] | null) ?? []
      const spezMatch = !fallSpezifikation || svSpez.includes(fallSpezifikation)
      const schadenMatch = !!fallSchadenart && svSchaden.includes(fallSchadenart)
      candidates.push({ ...sv, distanz_km: distanz, spez_match: spezMatch, schaden_match: schadenMatch })
    }
  }

  if (candidates.length === 0) {
    return NextResponse.json(
      { error: 'Kein passender SV im Umkreis von 40 km gefunden' },
      { status: 404 },
    )
  }

  // KFZ-154: Hard-Filter Spezifikation mit Fallback. Wenn der Fall eine
  // Spezifikation gesetzt hat und es Kandidaten mit Spez-Match gibt, NUR die
  // verwenden. Sonst (kein Match) Fallback auf alle (besser einer als keiner)
  // mit Warning-Log.
  let matchedCandidates = candidates
  if (fallSpezifikation) {
    const withSpez = candidates.filter(c => c.spez_match)
    if (withSpez.length > 0) {
      matchedCandidates = withSpez
    } else {
      console.warn(`[KFZ-154] sv-zuweisung fall=${fallId} spezifikation='${fallSpezifikation}' kein passender SV — Fallback auf ${candidates.length} ohne Spez-Match`)
    }
  }

  // 5. Sortieren (K4/13b): Netzwerkpartner zuerst, dann schadens_art-Match, dann partner_seit ASC.
  //    Batch EINMAL (K10). Admin-Client, weil sv_netzwerk_abonnements per-User-RLS ist (der Staff-`db`
  //    saehe 0 Zeilen). Pure Sort in ./sortiere-mit-netzwerk (DB-frei testbar).
  const zahlendeSet = await ladeZahlendeSvSet(createAdminClient(), matchedCandidates.map((c) => c.id))
  matchedCandidates = sortiereMitNetzwerk(matchedCandidates, zahlendeSet)

  // KFZ-152 Phase 2+3 + Follow-up: Organisations-aware Routing
  // - akademie_sub: Pool-Routing (sv_id=null, organisation_id=org).
  //   Akademie-Verwalter verteilt manuell ueber /gutachter/team.
  // - community_member: Round-Robin innerhalb der Community.
  //   Wir picken den Member mit der NIEDRIGSTEN paket_faelle_genutzt-Quote
  //   aus den matchedCandidates (sortiert nach freier Kapazitaet).
  // - mitarbeiter (Buero): direkt an den Sub-Buero (existing).
  // - solo / kein org: direkt zugewiesen (existing).
  let bestSv = matchedCandidates[0]
  const firstRolle = (bestSv.rolle_in_organisation ?? '').toLowerCase()

  if (firstRolle === 'community_member') {
    // KFZ-152 Follow-up: Round-Robin per niedrigste Auslastung
    const communityCandidates = matchedCandidates.filter(c =>
      (c.rolle_in_organisation ?? '').toLowerCase() === 'community_member'
    )
    // Sort by 'free capacity' = max - genutzt, hoechster freier Slot zuerst
    communityCandidates.sort((a, b) => {
      const aFree = (a.paket_faelle_gesamt ?? 0) - (a.paket_faelle_genutzt ?? a.offene_faelle ?? 0)
      const bFree = (b.paket_faelle_gesamt ?? 0) - (b.paket_faelle_genutzt ?? b.offene_faelle ?? 0)
      return bFree - aFree
    })
    if (communityCandidates.length > 0) bestSv = communityCandidates[0]
  }

  const bestRolle = (bestSv.rolle_in_organisation ?? '').toLowerCase()
  // Akademie bleibt Pool. Community wird durch Round-Robin oben direkt zugewiesen.
  const orgPool = bestRolle === 'akademie_sub'

  // 6. Fall updaten: SV zuweisen ODER an Org-Pool.
  // CMM-44 SP-B PR2a: sv_zugewiesen_am lebt auf claims (SSoT), nicht mehr auf
  // faelle. Org-Pool-Zweig setzt sv_zugewiesen_am auf null → claims-Write nötig.
  const now = new Date().toISOString()
  // Claim-ID fuer claims-Write holen.
  const fallClaimId = await resolveClaimId(db, fallId)

  // CMM-44 SP-B PR2a: sv_zugewiesen_am → claims (SSoT).
  // CMM-74: faelle.status-Write retired — operative_status (Engine-Cursor, claims=SSoT) traegt
  // den Dispatch-Status ('sv-gesucht' Org-Pool / 'sv-zugewiesen' direkt). faelle.status war ein
  // reiner Dual-Write (0-divergent verifiziert). Record-Bridge (operative_status fehlt in gen. Typen).
  // C1a (Fundament): der operative_status-Übergang läuft durch die State-Machine-Engine
  // (Single-Writer-Funnel) statt als Direkt-Cast-Write auf claims — so erbt die SV-Findung
  // Event (fall.status_changed) + Timeline + phase_transitions + SLA-Hook (schließt A2-#6,
  // den bisher leeren Event-Fan-out bei SV-Findung). sv_zugewiesen_am bleibt Direkt-Write
  // (kein Status-Feld).
  let updateErr: { message: string } | null = null
  if (fallClaimId) {
    const adminDb = createAdminClient()
    const { error } = await adminDb
      .from('claims')
      .update({ sv_zugewiesen_am: orgPool ? null : now })
      .eq('id', fallClaimId)
    updateErr = error

    // operative_status via Engine. transitionFallStatus WIRFT bei ungültigem Übergang
    // (state-machine.ts:141). Der Normalfall (Claim auf 'ersterfassung'/'sv-gesucht') ist valide.
    // Läuft die Zuweisung (Edge) auf einem bereits fortgeschritteneren Claim (z.B. 'sv-termin'),
    // wäre der Rückwärts-Übergang ungültig -> non-fatal fangen: sv_id + sv_zugewiesen_am sind
    // gesetzt (behavior-preserving), der Status bleibt auf seinem fortgeschritteneren Wert. Das
    // ist strikt besser als der frühere Force-Cast-Write, der einen 'sv-termin'-Claim fälschlich
    // auf 'sv-zugewiesen' zurückgesetzt hätte.
    if (!updateErr) {
      try {
        await transitionFallStatus(fallId, orgPool ? 'sv-gesucht' : 'sv-zugewiesen', {
          user_id: actorUserId ?? undefined,
          grund: 'sv_zuweisung',
        })
      } catch (err) {
        console.warn(
          `[C1a sv-zuweisung] transitionFallStatus(${orgPool ? 'sv-gesucht' : 'sv-zugewiesen'}) fall=${fallId} abgelehnt (non-fatal):`,
          err instanceof Error ? err.message : err,
        )
      }
    }
  }

  // CMM-60 Schritt 3: SV-Zuweisung auf der SSoT claims.sv_id (Reverse-Trigger
  // spiegelt nach faelle.sv_id). Nur im Nicht-Org-Pool-Zweig — Org-Pool laesst
  // sv_id unveraendert (wie bisher).
  if (!orgPool) {
    await setSvIdForFall(db, fallId, bestSv.id)
  }

  if (updateErr) {
    return NextResponse.json(
      { error: `Zuweisung fehlgeschlagen: ${updateErr.message}` },
      { status: 500 },
    )
  }

  // 7. offene_faelle beim SV um 1 erhöhen — NICHT bei org-pool routing.
  // increment_offene_faelle ist SECURITY DEFINER und EXECUTE wurde
  // für anon/authenticated revoked (#953) — Aufruf via service_role.
  if (!orgPool) {
    const admin = createAdminClient()
    const { error: svUpdateErr } = await admin.rpc('increment_offene_faelle', {
      sv_id_param: bestSv.id,
    })

    // Fallback: direktes Update wenn RPC nicht existiert
    if (svUpdateErr) {
      await db
        .from('sachverstaendige')
        .update({ offene_faelle: (bestSv.offene_faelle ?? 0) + 1 })
        .eq('id', bestSv.id)
    }
  }

  // 7b. AAR-87: Trigger nachgelagerte Aktionen — nur bei direktem SV-Routing (nicht Pool)
  if (!orgPool) {
    // CMM-44 SP-A2 (Cluster 1): schadenort_* aus claims (SSoT) via claim_id-Embed.
    // CMM-44 SP-A2 (Cluster 3): regulierung_betrag → claims.regulierungs_betrag (SSoT).
    // CMM-44 SP-A3: Aktennummer kommt aus claims.claim_nummer (gleiches Embed).
    // CMM-44 SP-B PR2c: schadens_ursache lebt auf claims (SSoT) — ins Embed.
    // CMM-44 SP-D PR2a: wunschtermin aus gutachter_termine (aktueller Termin, SSoT). Null-safe: beim
    // ersten Dispatch existiert noch kein Termin — fallback auf leads.wunschtermin.
    // CMM-49 (faelle-Drop-Runway): Anker auf faelle_claim_bridge statt .from('faelle')
    // (gleiche RLS-Sichtbarkeit). lead_id aus claims.lead_id (SSoT, div=0). Das frühere
    // sv_id-Select war vestigial (nirgends gelesen — Zuweisung nutzt bestSv.id) -> weg.
    const { data: fallFull } = await db
      .from('faelle_claim_bridge')
      .select('fall_id, claim_id, claims:claims!fk_bridge_claim(lead_id, claim_nummer, schadenort_adresse, schadenort_plz, schadenort_ort, schadens_ursache)')
      .eq('fall_id', fallId)
      .single()

    if (fallFull) {
      const fallFullClaim = Array.isArray(fallFull.claims) ? fallFull.claims[0] : fallFull.claims
      const fallFullLeadId = (fallFullClaim?.lead_id as string | null) ?? null

      // CMM-50 Phase-B: Kennzeichen aus vehicles (via v_claim_full), nicht mehr aus
      // faelle.kennzeichen. Prescoped auf den RLS-verifizierten claim_id (der faelle-Read
      // oben war RLS-gegatet) -> Admin-Read leak-safe. Nur fuer den Notification-Text.
      let kennzeichen: string | null = null
      if (fallFull.claim_id) {
        const adminVeh = createAdminClient()
        const { data: vsnap } = await adminVeh
          .from('v_claim_full')
          .select('kennzeichen')
          .eq('id', fallFull.claim_id)
          .single()
        kennzeichen = (vsnap?.kennzeichen as string | null) ?? null
      }

      // wunschtermin: aus dem neuesten Termin (falls vorhanden), sonst aus leads
      let wunschtermin: string | null = null
      if (fallFull.claim_id) {
        const { data: neuestTermin } = await db
          .from('gutachter_termine')
          .select('wunschtermin')
          .or(bezugOrExpr('claim', fallFull.claim_id))
          .order('start_zeit', { ascending: false })
          .limit(1)
          .maybeSingle()
        wunschtermin = (neuestTermin?.wunschtermin as string | null) ?? null
      }
      if (!wunschtermin && fallFullLeadId) {
        const { data: leadWt } = await db
          .from('leads')
          .select('wunschtermin')
          .eq('id', fallFullLeadId)
          .maybeSingle()
        wunschtermin = (leadWt?.wunschtermin as string | null) ?? null
      }
      // Auto-Task: Gutachter soll Termin bestaetigen
      // AAR-719: Silent-Catch durch Logging ersetzt.
      triggerGutachterTerminTask(fallId, bestSv.id).catch((err) => {
        console.error('[sv-zuweisung] triggerGutachterTerminTask:', err instanceof Error ? err.message : err)
      })

      // Kunde-Daten + Adresse fuer Trigger
      let kundeName = ''
      if (fallFullLeadId) {
        const { data: lead } = await db.from('leads').select('vorname, nachname').eq('id', fallFullLeadId).single()
        kundeName = [lead?.vorname, lead?.nachname].filter(Boolean).join(' ')
      }
      const adresse = [fallFullClaim?.schadenort_adresse, fallFullClaim?.schadenort_plz, fallFullClaim?.schadenort_ort].filter(Boolean).join(', ') || ''

      // SV-01 Task + In-App Notification (braucht profile_id)
      // Telefon mitladen fuer die WhatsApp-Benachrichtigung weiter unten.
      const { data: svProfileData } = await db
        .from('sachverstaendige')
        .select('profile_id, profiles!sachverstaendige_profile_id_fkey(telefon)')
        .eq('id', bestSv.id)
        .single()

      if (svProfileData?.profile_id) {
        triggerSV01(
          fallId,
          svProfileData.profile_id,
          kundeName,
          adresse,
          kennzeichen ?? '',
          fallFullClaim?.schadens_ursache ?? '',
          wunschtermin,
        ).catch((err) => {
          console.error('[sv-zuweisung] triggerSV01:', err instanceof Error ? err.message : err)
        })
      }

      // Gutachter-Mitteilung (Legacy-Tabelle)
      createGutachterMitteilung(bestSv.id, 'neuer_auftrag', fallId, {
        kunde_name: kundeName || undefined,
        schadentyp: fallFullClaim?.schadens_ursache ?? undefined,
        adresse: adresse || undefined,
        // claim_nummer ist das Akten-Label-Property des MitteilungExtras-Interfaces
        // (src/lib/mitteilungen.ts, Task 6) — befüllt mit claims.claim_nummer.
        claim_nummer: fallFullClaim?.claim_nummer ?? undefined,
      }).catch((err) => {
        console.error('[sv-zuweisung] createGutachterMitteilung:', err instanceof Error ? err.message : err)
      })

      // AAR-229 W4: Mitteilung in neue zentrale Tabelle (Dual-Write).
      if (svProfileData?.profile_id) {
        import('@/lib/mitteilungen/create-mitteilung')
          .then(({ createMitteilung }) => createMitteilung({
            empfaenger_id: svProfileData.profile_id,
            empfaenger_rolle: 'sachverstaendiger',
            kategorie: 'update',
            titel: 'Neuer Auftrag zugewiesen',
            inhalt: kundeName ? `${kundeName} — ${kennzeichen ?? ''} — ${adresse}` : undefined,
            kontext_typ: 'fall',
            kontext_id: fallId,
          }))
          .catch(err => console.error('[AAR-229] createMitteilung fehlgeschlagen:', err))
      }

      // WhatsApp an Kunden
      // C3a: durable via Notification-Outbox — der Kunde wartet auf den SV, ein
      // verschluckter Send liess ihn ohne Info. dedupKey mit Tages-Fenster: derselbe
      // Anlass am selben Tag genau einmal, aber ein Re-Dispatch an einem anderen Tag
      // (SV abgesagt, neuer SV faehrt) bekommt wieder eine Nachricht.
      await enqueue({
        dedupKey: buildDedupKey({
          template: 'sv_losgefahren',
          claimId: fallId,
          fenster: new Date().toISOString().slice(0, 10),
        }),
        kanal: 'whatsapp',
        template: 'sv_losgefahren',
        claimId: fallId,
      }).catch((err) => {
        console.error('[sv-zuweisung] sv_losgefahren-Outbox-enqueue:', err instanceof Error ? err.message : err)
      })

      // WhatsApp an SV — bei Fall-direkter Zuweisung (Kanzlei/LexDrive)
      // bekommt der SV jetzt eine Push mit Deep-Link zum Fall. Non-blocking:
      // kein WhatsApp / Baileys down / kein Telefon bricht die Zuweisung
      // nicht. In-App-Mitteilung + Email (emailSvZugewiesen) bleiben parallel.
      {
        const svProfileEmbed = Array.isArray(svProfileData?.profiles)
          ? svProfileData?.profiles[0]
          : svProfileData?.profiles
        const svPhone = (svProfileEmbed as { telefon: string | null } | null)?.telefon ?? null
        const svProfileId = (svProfileData?.profile_id as string | null) ?? null
        if (svPhone && svProfileId) {
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'
          const link = `${baseUrl}/gutachter/fall/${fallId}`
          const text =
            `📋 Neuer Auftrag — Claimondo\n\n` +
            `Kunde: ${kundeName || 'Kunde'}\n` +
            `Schadentyp: ${fallFullClaim?.schadens_ursache ?? 'unbekannt'}\n` +
            `Adresse: ${adresse || '—'}\n` +
            `Fall-Nr.: ${fallFullClaim?.claim_nummer ?? fallId.slice(0, 8)}\n\n` +
            `Details + Navigation:\n${link}`
          // Kein Email-Fallback: der SV bekommt bei Fall-Zuweisung ohnehin
          // emailSvZugewiesen (Schritt 9) — ein WA-Email-Fallback waere eine
          // doppelte Mail. WhatsApp ist hier reiner Zusatz-Kanal.
          sendNachricht({
            entity: 'profile',
            entityId: svProfileId,
            phone: svPhone,
            text,
            templateKey: 'sv_neuer_auftrag_fall',
            empfaengerRolle: 'sachverstaendiger',
            fallId,
          }).catch((err) => {
            console.error('[sv-zuweisung] SV-WhatsApp-Notify:', err instanceof Error ? err.message : err)
          })
        }
      }

      // Leadpreis-Abzug entfernt (Billing-Konsolidierung 2026-07-01): der SV wird
      // NICHT mehr bei Zuweisung belastet. Der Abzug laeuft ausschliesslich ueber
      // processCaseBilling (State-Machine-Hook @ gutachten-eingegangen, AAR-924) —
      // idempotent, MIN(150)-Guthaben-Modell, claims-SSoT. Behebt den frueheren
      // Dreifach-Abzug (Zuweisung + Gutachten-Upload + Cron).
    }
  }

  // 8. SV-Profil laden für Response
  const { data: svProfile } = await db
    .from('sachverstaendige')
    .select('id, paket, profiles!sachverstaendige_profile_id_fkey(vorname, nachname, telefon, email)')
    .eq('id', bestSv.id)
    .single()

  // 9. E-Mail an SV senden (fire & forget)
  if (svProfile) {
    const p = Array.isArray(svProfile.profiles) ? svProfile.profiles[0] : svProfile.profiles
    const svEmail = (p as { email?: string })?.email
    if (svEmail) {
      // CMM-44 SP-A2 (Cluster 1): schadenort_* aus claims (SSoT) via claim_id.
      // CMM-44 SP-A3: Aktennummer kommt aus claims.claim_nummer.
      // CMM-49 (faelle-Drop-Runway): claim_nummer + schadenort_* + lead_id faelle-frei
      // via claims (ein Read statt zusätzlichem faelle.lead_id-Read).
      const zuwClaimId = await resolveClaimId(db, fallId)
      const { data: fallDataClaim } = zuwClaimId
        ? await db.from('claims').select('lead_id, claim_nummer, schadenort_adresse, schadenort_plz, schadenort_ort').eq('id', zuwClaimId).maybeSingle()
        : { data: null }

      let kundenName = '—'
      const emailLeadId = (fallDataClaim?.lead_id as string | null) ?? null
      if (emailLeadId) {
        const { data: lead } = await db
          .from('leads')
          .select('vorname, nachname')
          .eq('id', emailLeadId)
          .single()
        if (lead) kundenName = `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() || '—'
      }
      const fallNr = fallDataClaim?.claim_nummer ?? fallId.slice(0, 8)
      const adresse = [fallDataClaim?.schadenort_adresse, fallDataClaim?.schadenort_plz, fallDataClaim?.schadenort_ort].filter(Boolean).join(', ') || '—'
      emailSvZugewiesen(svEmail, fallNr, kundenName, adresse).catch((err) => {
        console.error('[sv-zuweisung] emailSvZugewiesen für', svEmail, ':', err instanceof Error ? err.message : err)
      })
    }
  }

  return NextResponse.json({
    success: true,
    sv_id: bestSv.id,
    distanz_km: bestSv.distanz_km != null ? Math.round(bestSv.distanz_km) : null,
    sv: svProfile,
  })
}
