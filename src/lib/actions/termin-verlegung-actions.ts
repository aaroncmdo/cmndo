'use server'

// AAR-864: Server-Actions für SV-Termin-Verlegung.
// Phase 3 liefert hier nur den Loader (Top-3 Vorschläge); die State-
// Machine-Actions (Vorschlagen / Bestätigen / Ablehnen) folgen in
// Phase 4 in derselben Datei.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { findVerlegungsVorschlaege, type VerlegungsVorschlag, istSlotFrei, findAlternativenZuWunschslot, type KundenAlternative } from '@/lib/termine/verlegung-vorschlaege'
import { emitEvent } from '@/lib/notifications/emit'
import { touchClaimRecency } from '@/lib/claims/touch-recency'
import { verlege, entscheideVerlegung } from '@/lib/termine/engine'
import { formatBerlin } from '@/lib/google-calendar/timezone'
import { bezugOrExpr } from '@/lib/termine/bezug-filter'
// ⭐⭐ ANLASS (Regel-4-Smoke 29.08.): Diese Datei las durchgehend nur `termin.fall_id` —
// die LEGACY-Spalte. Die Termin-Engine schreibt neue Termine aber BEZUG-NATIV
// (`bezug_typ`+`bezug_id`, Legacy-Spalten NULL). Folge, live nachgestellt:
//
//   Der Kunde klickt „Verlegung bestätigen" → `terminVerlegungBestaetigen` bricht bei
//   `if (!neu.fall_id)` ab („Pending-Slot hat keine fall_id"). POST 200, die Oberfläche
//   geht weiter — und in der DB ändert sich NICHTS. Der Termin bleibt ewig pending.
//
// Dieselbe Lücke traf `terminVerlegungAblehnen` + `kundeTerminVerlegungVorschlagen`
// (harte Abbrüche) sowie Revalidierung und SV-Benachrichtigung, die still ins Leere
// liefen — ohne Fehler, nur ohne Wirkung.
//
// ⚠ Die Klasse war BEKANNT und BENANNT: der Kopf von `effektive-bezug-ids.ts` beschreibt
// sie wörtlich („Consumer, die … NUR über die Legacy-Spalten auflösen, verfehlen
// bezug-native Termine"), und `effektiveFallClaimId` ist das fertige Werkzeug dagegen.
// Ein dokumentiertes Werkzeug schützt nicht, solange eine Datei es nicht benutzt.
//
// ⚠ Jeder Select hier muss `bezug_typ, bezug_id` mitladen, sonst löst der Helper ins Leere.
import { effektiveFallClaimId } from '@/lib/termine/effektive-bezug-ids'

// Datum/Uhrzeit-Formatter für Notifikations-Payloads (de-DE)
function fmtDatum(iso: string): string {
  return formatBerlin(iso, {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}
function fmtUhrzeit(iso: string): string {
  return formatBerlin(iso, {
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function lookupSvVorname(svId: string): Promise<string> {
  try {
    const admin = createAdminClient()
    const { data: sv } = await admin
      .from('sachverstaendige')
      .select('profile_id')
      .eq('id', svId)
      .maybeSingle()
    if (!sv?.profile_id) return ''
    const { data: prof } = await admin
      .from('profiles')
      .select('vorname, anzeigename')
      .eq('id', sv.profile_id)
      .maybeSingle()
    return (prof?.vorname ?? prof?.anzeigename ?? '') as string
  } catch {
    return ''
  }
}

async function lookupKundenVorname(kundeUserId: string | null): Promise<string> {
  if (!kundeUserId) return ''
  try {
    const admin = createAdminClient()
    const { data: prof } = await admin
      .from('profiles')
      .select('vorname, anzeigename')
      .eq('id', kundeUserId)
      .maybeSingle()
    return (prof?.vorname ?? prof?.anzeigename ?? '') as string
  } catch {
    return ''
  }
}

async function lookupUserRolle(userId: string): Promise<'kunde' | 'kundenbetreuer' | 'admin' | 'unknown'> {
  try {
    const admin = createAdminClient()
    const { data: prof } = await admin
      .from('profiles')
      .select('rolle')
      .eq('id', userId)
      .maybeSingle()
    const r = (prof?.rolle as string | undefined) ?? ''
    if (r === 'admin' || r === 'staff') return 'admin'
    if (r === 'kundenbetreuer') return 'kundenbetreuer'
    if (r === 'kunde') return 'kunde'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

type LoaderResult =
  | { ok: true; vorschlaege: VerlegungsVorschlag[]; slotDauerMin: number }
  | { ok: false; error: string }

/**
 * Lädt Top-3 Vorschläge für die Verlegung eines bestätigten Termins.
 * Nutzt Admin-Client für alle Loads — SV-RLS auf `faelle` (Schaden-
 * Adresse, Besichtigungsort) und `sachverstaendige` ist nicht garantiert
 * vollständig, und die Engine braucht zudem fall-übergreifende Termin-
 * Adressen für die Routen-Berechnung. Auth-Guard prüft dass der eingelogte
 * User der SV des Termins ist (oder Admin/Staff).
 */
export async function getVerlegungsVorschlaegeAction(input: {
  terminId: string
  fallId: string
}): Promise<LoaderResult> {
  const supabase = await createClient()
  const admin = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht eingeloggt.' }

  if (!input.terminId) {
    return { ok: false, error: 'Kein Termin in der Auftragsansicht — Verlegung nicht möglich.' }
  }

  // Termin laden über Admin-Client. Datenmodell-Pfad bis zur SSoT-Migration:
  // Termin → Auftrag → Fall → Claim. fall_id ist als Shortcut gesetzt, aber
  // bei manchen Rows nur über auftrag_id.fall_id auflösbar.
  const { data: termin, error: terminErr } = await admin
    .from('gutachter_termine')
    .select('id, assignee_id, start_zeit, end_zeit, status, fall_id, claim_id, lead_id, bezug_typ, bezug_id, auftrag_id')
    .eq('id', input.terminId)
    .maybeSingle()
  if (terminErr || !termin) {
    return { ok: false, error: `Termin ${input.terminId} nicht gefunden.` }
  }

  // Auth-Guard: User muss der SV des Termins sein, oder Admin/Staff
  if (termin.assignee_id) {
    const { data: sv } = await admin
      .from('sachverstaendige')
      .select('profile_id')
      .eq('id', termin.assignee_id as string)
      .maybeSingle()
    const istEigenerTermin = sv?.profile_id === user.id
    if (!istEigenerTermin) {
      const rolle = await lookupUserRolle(user.id)
      if (rolle !== 'admin') {
        return { ok: false, error: 'Keine Berechtigung für diesen Termin.' }
      }
    }
  }

  // AAR-864 — Aaron-Datenmodell-Spec: Termin → Auftrag → Fall → Claim.
  // 1) Direkt am Termin — über BEIDE Bezug-Achsen (Legacy + bezug_typ/bezug_id).
  //    Vorher nur `termin.fall_id`: bei einem bezug-nativen Termin fiel die Auflösung
  //    stumm auf Stufe 2/3 durch und lieferte im Zweifel den Caller-Prop.
  // 2) Sonst über termin.auftrag_id → auftraege.fall_id
  // 3) Sonst Caller-Prop als letzter Fallback
  let fallId: string | null = effektiveFallClaimId(termin)
  if (!fallId && termin.auftrag_id) {
    const { data: auftrag } = await admin
      .from('auftraege')
      .select('fall_id')
      .eq('id', termin.auftrag_id as string)
      .maybeSingle()
    fallId = (auftrag?.fall_id as string | null) ?? null
  }
  if (!fallId) fallId = input.fallId || null
  if (!fallId) {
    return { ok: false, error: 'Termin ist nicht mit einem Fall verknüpft (weder fall_id noch auftrag_id auflösbar).' }
  }

  // Fall laden mit Koordinaten + Anzeige-Adresse. Aaron-Spec: ein
  // Besichtigungsort wird via Lat/Lng zugeordnet (Isochron-Mapping im
  // Dispatch), nicht via PLZ. Daher nutzen wir besichtigungsort_lat/lng
  // direkt für die Routen-Berechnung.
  // CMM-44 SP-A2 (Cluster 1): schadenort_* aus claims (SSoT) via claim_id-Embed.
  // CMM-44 SP-D PR2a: besichtigungsort_* aus gutachter_termine (SSoT).
  // CMM-49 (faelle-Drop-Runway): Anchor faelle_claim_bridge (claim_id nativ fuer den GT-Lookup;
  // schadenort_* via claims-Embed, SSoT). faelle.id war ungenutzt.
  const { data: fallRaw } = await admin
    .from('faelle_claim_bridge')
    .select('claim_id, claims:claims!fk_bridge_claim(schadenort_adresse, schadenort_plz, schadenort_ort)')
    .eq('fall_id', fallId)
    .maybeSingle()
  type VerlClaim = { schadenort_adresse: string | null; schadenort_plz: string | null; schadenort_ort: string | null }
  const fall = fallRaw as unknown as { claim_id: string | null; claims: VerlClaim | VerlClaim[] | null } | null
  if (!fall) return { ok: false, error: `Fall ${fallId} nicht gefunden.` }
  const fallClaim = Array.isArray(fall.claims) ? fall.claims[0] : fall.claims

  let aktTerminVerlegung: { besichtigungsort_adresse: string | null; besichtigungsort_lat: number | null; besichtigungsort_lng: number | null } | null = null
  if (fall.claim_id) {
    const { data: at } = await admin
      .from('gutachter_termine')
      .select('besichtigungsort_adresse, besichtigungsort_lat, besichtigungsort_lng')
      .or(bezugOrExpr('claim', fall.claim_id as string))
      .order('start_zeit', { ascending: false })
      .limit(1)
      .maybeSingle()
    aktTerminVerlegung = at
  }

  const zielLat = (aktTerminVerlegung?.besichtigungsort_lat as number | null) ?? null
  const zielLng = (aktTerminVerlegung?.besichtigungsort_lng as number | null) ?? null
  if (zielLat === null || zielLng === null) {
    return {
      ok: false,
      error: 'Besichtigungsort hat keine Koordinaten — bitte im Dispatch nachpflegen.',
    }
  }
  const zielLabel =
    (aktTerminVerlegung?.besichtigungsort_adresse as string | null) ||
    [fallClaim?.schadenort_adresse, fallClaim?.schadenort_plz, fallClaim?.schadenort_ort].filter(Boolean).join(', ') ||
    'Besichtigungsort'

  // Slot-Dauer aus altem Termin (default 45 wenn unplausibel)
  const dauerMin = Math.round(
    (new Date(termin.end_zeit as string).getTime() -
      new Date(termin.start_zeit as string).getTime()) /
      60_000,
  )
  const slotDauerMin = dauerMin >= 30 && dauerMin <= 240 ? dauerMin : 45

  // SV-Standort als Fallback wenn an einem Tag kein Vor-Termin existiert.
  // Lat/Lng aus sachverstaendige.standort_lat/lng (Isochron-Anker).
  let svStandort: { lat: number; lng: number; label: string } | null = null
  if (termin.assignee_id) {
    const { data: sv } = await admin
      .from('sachverstaendige')
      .select('standort_adresse, standort_lat, standort_lng')
      .eq('id', termin.assignee_id as string)
      .maybeSingle()
    const lat = sv?.standort_lat as number | null
    const lng = sv?.standort_lng as number | null
    if (lat !== null && lat !== undefined && lng !== null && lng !== undefined) {
      svStandort = {
        lat: Number(lat),
        lng: Number(lng),
        label: (sv?.standort_adresse as string | null) ?? 'SV-Standort',
      }
    }
  }

  const vorschlaege = await findVerlegungsVorschlaege(admin, termin.assignee_id as string, {
    besichtigungsortLat: Number(zielLat),
    besichtigungsortLng: Number(zielLng),
    besichtigungsortLabel: zielLabel,
    slotDauerMin,
    exkludiereTerminId: termin.id as string,
    svStandort,
  })

  return { ok: true, vorschlaege, slotDauerMin }
}

type SubmitResult = { ok: true; neuerTerminId: string } | { ok: false; error: string }

/**
 * SV schlägt eine Verlegung vor. State-Machine:
 *  - Alter Termin: status='bestaetigt' → 'verlegt' (Slot bleibt blockiert)
 *  - Neuer Slot: INSERT mit status='verlegung_pending',
 *    verlegung_quelle_id=<alt.id>, eigene start_zeit/end_zeit
 *
 * Idempotenz: doppeltes Submit (z.B. Doppelklick) erzeugt keinen weiteren
 * Pending-Slot — wenn der alte Termin bereits 'verlegt' ist, wird abgebrochen.
 *
 * Notifikationen (WhatsApp/In-App/E-Mail) folgen in Phase 5; hier nur
 * DB-State + revalidatePath.
 */
export async function terminVerlegungVorschlagen(input: {
  terminId: string
  neuesStartIso: string
  neuesEndeIso: string
  grund?: string
}): Promise<SubmitResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht eingeloggt.' }

  // Alter Termin laden — muss bestaetigt sein und dem SV gehören
  const { data: alt, error: altErr } = await supabase
    .from('gutachter_termine')
    .select('id, assignee_id, fall_id, claim_id, lead_id, bezug_typ, bezug_id, kb_id, kanal, typ, status, start_zeit')
    .eq('id', input.terminId)
    .maybeSingle()
  if (altErr || !alt) return { ok: false, error: 'Termin nicht gefunden.' }
  if (alt.status !== 'bestaetigt') {
    return {
      ok: false,
      error: `Termin ist nicht im Status 'bestaetigt' (aktuell: ${alt.status}).`,
    }
  }

  // P3a: DB-Transition via Engine verlege (race-sicher; RLS-Client beibehalten = Auth-Schutz,
  // da diese Action keinen expliziten SV-owns-Guard hat). alt.status==='bestaetigt' ist oben gegatet.
  const verlegeRes = await verlege(input.terminId, {
    neuVon: input.neuesStartIso,
    neuBis: input.neuesEndeIso,
    neuerStatus: 'verlegung_pending',
    grund: input.grund?.trim() || undefined,
    db: supabase,
  })
  if (!verlegeRes.ok) {
    const msg =
      verlegeRes.code === 'belegt'
        ? 'Der neue Slot ist belegt.'
        : verlegeRes.code === 'alt_nicht_aktiv'
          ? 'Termin ist nicht mehr verlegbar.'
          : `Verlegung fehlgeschlagen: ${verlegeRes.error}`
    return { ok: false, error: msg }
  }
  const neu = { id: verlegeRes.neuerTerminId }
  // Paritaet: SV-Flow markiert den neuen Slot als kunde-benachrichtigt.
  const { error: benachrichtigtFehler } = await supabase
    .from('gutachter_termine')
    .update({ verlegung_kunde_benachrichtigt_an: new Date().toISOString() })
    .eq('id', neu.id)
  if (benachrichtigtFehler) {
    console.error(`[termin-verlegung] Benachrichtigungs-Marker nicht gesetzt (Termin ${neu.id}):`, benachrichtigtFehler.message)
  }

  // Beide Bezug-Achsen: bei einem bezug-nativen Termin ist `fall_id` NULL — dann liefen
  // Revalidierung und Recency-Bump still ins Leere und die Oberflächen blieben stehen,
  // obwohl die Verlegung in der DB stand. Kein Fehler, nur nichts.
  const altFallId = effektiveFallClaimId(alt)
  if (altFallId) {
    revalidatePath(`/gutachter/fall/${altFallId}`)
    revalidatePath(`/faelle/${altFallId}`)
    revalidatePath(`/kunde/faelle/${altFallId}`)

    // CMM-65: Recency-Bump auf claims (SSoT) — feuert die claims-Realtime-
    // Subscription in FallRealtimeRefresh (Kunde/SV/Admin). Ersetzt den
    // frueheren faelle.updated_at-Touch (faelle ist nicht mehr der Recency-Ort).
    // fall und claim sind claim-first dieselbe UUID (s. effektive-bezug-ids.ts).
    void touchClaimRecency(createAdminClient(), (alt.claim_id as string | null) ?? altFallId)
  }
  revalidatePath('/gutachter/auftraege')
  revalidatePath('/gutachter/heute')

  // Notifikation fire-and-forget — Worker nimmt's auf, Caller wird nicht blockiert
  if (altFallId && alt.assignee_id) {
    const svVorname = await lookupSvVorname(alt.assignee_id as string)
    emitEvent(
      'termin.verlegung_vorgeschlagen',
      {
        fallId: altFallId,
        terminId: neu.id as string,
        alterTerminId: alt.id as string,
        alterDatum: fmtDatum(alt.start_zeit as string),
        alterUhrzeit: fmtUhrzeit(alt.start_zeit as string),
        neuesDatum: fmtDatum(input.neuesStartIso),
        neuesUhrzeit: fmtUhrzeit(input.neuesStartIso),
        svVorname,
        grund: input.grund?.trim() || undefined,
      },
      { fallId: altFallId, triggeredBy: user.id },
    ).catch((e) => console.error('[AAR-864] emit verlegung_vorgeschlagen failed', e))
  }

  return { ok: true, neuerTerminId: neu.id as string }
}

type DecisionResult = { ok: true } | { ok: false; error: string }

type KundeVorschlaegeResult =
  | { ok: true; vorschlaege: Array<{ start: string; end: string; datum: string }>; slotDauerMin: number }
  | { ok: false; error: string }

/**
 * Lädt Route-aware Top-3-Vorschläge für die Kunden-seitige Termin-Verlegung.
 * Gibt NUR start/end/datum zurück — keine Routen-Details (SV-Privatsphäre).
 * Auth-Guard: User muss Kunde/KB/Admin des Falls sein.
 */
export async function getKundeTerminVorschlaegeAction(
  terminId: string,
): Promise<KundeVorschlaegeResult> {
  const supabase = await createClient()
  const admin = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht eingeloggt.' }

  const { data: termin } = await admin
    .from('gutachter_termine')
    .select('id, assignee_id, fall_id, claim_id, lead_id, bezug_typ, bezug_id, start_zeit, end_zeit, status')
    .eq('id', terminId)
    .maybeSingle()
  if (!termin) return { ok: false, error: 'Termin nicht gefunden.' }
  if (termin.status !== 'bestaetigt') {
    return { ok: false, error: 'Termin ist nicht mehr bestätigt.' }
  }
  const terminFallId = effektiveFallClaimId(termin)
  if (!terminFallId) return { ok: false, error: 'Termin ohne Fall-Verknüpfung.' }

  const guardErr = await assertDarfVerlegungEntscheiden(user.id, terminFallId)
  if (guardErr) return { ok: false, error: guardErr }

  // CMM-44 SP-A2 (Cluster 1): schadenort_* aus claims (SSoT) via claim_id-Embed.
  // CMM-44 SP-D PR2a: besichtigungsort_* aus gutachter_termine (SSoT).
  // CMM-49 (faelle-Drop-Runway): Anchor faelle_claim_bridge (claim_id nativ; schadenort_* via Embed).
  const { data: fallRaw } = await admin
    .from('faelle_claim_bridge')
    .select('claim_id, claims:claims!fk_bridge_claim(schadenort_adresse, schadenort_plz, schadenort_ort)')
    .eq('fall_id', terminFallId)
    .maybeSingle()
  const fall = fallRaw as unknown as { claim_id: string | null; claims: { schadenort_adresse: string | null; schadenort_plz: string | null; schadenort_ort: string | null } | { schadenort_adresse: string | null; schadenort_plz: string | null; schadenort_ort: string | null }[] | null } | null
  if (!fall) return { ok: false, error: 'Fall nicht gefunden.' }
  const fallClaim = Array.isArray(fall.claims) ? fall.claims[0] : fall.claims

  let aktTerminVerlegung2: { besichtigungsort_adresse: string | null; besichtigungsort_lat: number | null; besichtigungsort_lng: number | null } | null = null
  if (fall.claim_id) {
    const { data: at } = await admin
      .from('gutachter_termine')
      .select('besichtigungsort_adresse, besichtigungsort_lat, besichtigungsort_lng')
      .or(bezugOrExpr('claim', fall.claim_id as string))
      .order('start_zeit', { ascending: false })
      .limit(1)
      .maybeSingle()
    aktTerminVerlegung2 = at
  }

  const zielLat = (aktTerminVerlegung2?.besichtigungsort_lat as number | null) ?? null
  const zielLng = (aktTerminVerlegung2?.besichtigungsort_lng as number | null) ?? null
  if (zielLat === null || zielLng === null) {
    return { ok: false, error: 'Besichtigungsort ohne Koordinaten — Routen-Check nicht möglich.' }
  }
  const zielLabel =
    (aktTerminVerlegung2?.besichtigungsort_adresse as string | null) ||
    [fallClaim?.schadenort_adresse, fallClaim?.schadenort_plz, fallClaim?.schadenort_ort].filter(Boolean).join(', ') ||
    'Besichtigungsort'

  const dauerMin = Math.round(
    (new Date(termin.end_zeit as string).getTime() -
      new Date(termin.start_zeit as string).getTime()) / 60_000,
  )
  const slotDauerMin = dauerMin >= 30 && dauerMin <= 240 ? dauerMin : 45

  let svStandort: { lat: number; lng: number; label: string } | null = null
  if (termin.assignee_id) {
    const { data: sv } = await admin
      .from('sachverstaendige')
      .select('standort_adresse, standort_lat, standort_lng')
      .eq('id', termin.assignee_id as string)
      .maybeSingle()
    const lat = sv?.standort_lat as number | null
    const lng = sv?.standort_lng as number | null
    if (lat != null && lng != null) {
      svStandort = { lat: Number(lat), lng: Number(lng), label: (sv?.standort_adresse as string | null) ?? 'SV-Standort' }
    }
  }

  let vorschlaegeRaw: import('@/lib/termine/verlegung-vorschlaege').VerlegungsVorschlag[] = []
  try {
    vorschlaegeRaw = await findVerlegungsVorschlaege(admin, termin.assignee_id as string, {
      besichtigungsortLat: Number(zielLat),
      besichtigungsortLng: Number(zielLng),
      besichtigungsortLabel: zielLabel,
      slotDauerMin,
      exkludiereTerminId: termin.id as string,
      svStandort,
    })
  } catch (e) {
    console.error('[AAR-864] getKundeTerminVorschlaegeAction: findVerlegungsVorschlaege threw', e)
    return { ok: false, error: `Engine-Fehler: ${e instanceof Error ? e.message : String(e)}` }
  }

  // Routen-Details rausfiltern — Kunde sieht nur Datum + Uhrzeit (SV-Privatsphäre)
  const vorschlaege = vorschlaegeRaw.map((v) => ({ start: v.start, end: v.end, datum: v.datum }))
  return { ok: true, vorschlaege, slotDauerMin }
}

/**
 * AAR-864: Kunde schlägt Verlegung vor.
 * Output:
 *  - { ok: true, neuerTerminId } wenn Wunschslot frei + State-Machine angelegt
 *  - { ok: false, alternatives } wenn Wunschslot belegt — Modal zeigt 3 Alternativen
 *  - { ok: false, error } bei Auth-/Datenfehler
 */
type KundeSubmitResult =
  | { ok: true; neuerTerminId: string }
  | { ok: false; error: string; alternatives?: KundenAlternative[] }

export async function kundeTerminVerlegungVorschlagen(input: {
  terminId: string
  neuesStartIso: string
  grund?: string
}): Promise<KundeSubmitResult> {
  const supabase = await createClient()
  const admin = createAdminClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht eingeloggt.' }

  // Termin laden
  const { data: alt } = await admin
    .from('gutachter_termine')
    .select('id, assignee_id, fall_id, claim_id, lead_id, bezug_typ, bezug_id, kb_id, kanal, typ, status, start_zeit, end_zeit')
    .eq('id', input.terminId)
    .maybeSingle()
  if (!alt) return { ok: false, error: 'Termin nicht gefunden.' }
  if (alt.status !== 'bestaetigt') {
    return { ok: false, error: `Termin ist nicht bestaetigt (aktuell: ${alt.status}).` }
  }

  // Auth: User muss Kunde des Falls sein
  const altFallId = effektiveFallClaimId(alt)
  if (!altFallId) return { ok: false, error: 'Termin nicht mit einem Fall verknüpft.' }
  const guardErr = await assertDarfVerlegungEntscheiden(user.id, altFallId)
  if (guardErr) return { ok: false, error: guardErr }

  // Slot-Dauer aus altem Termin
  const dauerMin = Math.round(
    (new Date(alt.end_zeit as string).getTime() -
      new Date(alt.start_zeit as string).getTime()) /
      60_000,
  )
  const slotDauerMin = dauerMin >= 30 && dauerMin <= 240 ? dauerMin : 45

  const wunschStart = new Date(input.neuesStartIso)
  const wunschEnde = new Date(wunschStart.getTime() + slotDauerMin * 60_000)

  // Free-Busy-Check (alter Termin selbst muss exkludiert werden — wir
  // verschieben ihn ja, er soll dafür kein Konflikt sein)
  const frei = await istSlotFrei(
    admin,
    alt.assignee_id as string,
    wunschStart.toISOString(),
    wunschEnde.toISOString(),
    alt.id as string,
  )
  if (!frei) {
    const alternatives = await findAlternativenZuWunschslot(
      admin,
      alt.assignee_id as string,
      input.neuesStartIso,
      slotDauerMin,
      alt.id as string,
    )
    return { ok: false, error: 'Der gewünschte Termin ist beim Gutachter belegt.', alternatives }
  }

  // Kunde ist König: kein Pending — neuer Slot wird sofort 'bestaetigt'.
  // Der SV wird informiert, muss aber nicht bestätigen. Will er den Termin
  // weiter verschieben, schlägt er seinerseits vor (SV-Flow → verlegung_pending
  // beim Kunden). So entsteht der Loop Kunde↔SV bei Bedarf.

  // P3a: DB-Transition via Engine verlege (neuerStatus 'bestaetigt' => alt -> 'verschoben',
  // initiatorKunde; race-sicher via Constraint). Admin-Client (Auth via assertDarfVerlegungEntscheiden oben).
  const verlegeRes = await verlege(input.terminId, {
    neuVon: wunschStart.toISOString(),
    neuBis: wunschEnde.toISOString(),
    neuerStatus: 'bestaetigt',
    initiatorKunde: true,
    grund: input.grund?.trim() || undefined,
    db: admin,
  })
  if (!verlegeRes.ok) {
    if (verlegeRes.code === 'belegt') {
      const alternatives = await findAlternativenZuWunschslot(
        admin,
        alt.assignee_id as string,
        input.neuesStartIso,
        slotDauerMin,
        alt.id as string,
      )
      return { ok: false, error: 'Der gewünschte Termin ist beim Gutachter belegt.', alternatives }
    }
    return { ok: false, error: `Verlegung fehlgeschlagen: ${verlegeRes.error}` }
  }
  const neu = { id: verlegeRes.neuerTerminId }

  revalidateFallPaths(altFallId)

  // Notifikation: SV informieren — kein Bestätigungs-Request, nur Hinweis
  const svVorname = await lookupSvVorname(alt.assignee_id as string)
  emitEvent(
    'termin.verschoben_durch_kunde',
    {
      fallId: altFallId,
      terminId: neu.id as string,
      alterTerminId: alt.id as string,
      alterDatum: fmtDatum(alt.start_zeit as string),
      alterUhrzeit: fmtUhrzeit(alt.start_zeit as string),
      neuesDatum: fmtDatum(wunschStart.toISOString()),
      neuesUhrzeit: fmtUhrzeit(wunschStart.toISOString()),
      svVorname,
      grund: input.grund?.trim() || undefined,
    },
    { fallId: altFallId, triggeredBy: user.id },
  ).catch((e) => console.error('[AAR-864] emit kunde-verlegung_vorgeschlagen failed', e))

  return { ok: true, neuerTerminId: neu.id as string }
}

function revalidateFallPaths(fallId: string | null) {
  if (fallId) {
    revalidatePath(`/gutachter/fall/${fallId}`)
    revalidatePath(`/faelle/${fallId}`)
    revalidatePath(`/kunde/faelle/${fallId}`)
    revalidatePath(`/mitarbeiter/faelle/${fallId}`)
  }
  revalidatePath('/gutachter/auftraege')
  revalidatePath('/gutachter/heute')
  revalidatePath('/kunde')
  revalidatePath('/mitarbeiter/faelle')
  revalidatePath('/admin/faelle')
}

/**
 * Prüft ob der eingeloggte User die Verlegung für diesen Fall entscheiden
 * darf: Kunde des Falls, KB des Falls, SV des Falls, oder Admin/Staff.
 * Liefert null wenn ok, sonst Fehler-String.
 */
async function assertDarfVerlegungEntscheiden(
  userId: string,
  fallId: string,
): Promise<string | null> {
  const admin = createAdminClient()
  const { data: prof } = await admin
    .from('profiles')
    .select('rolle')
    .eq('id', userId)
    .maybeSingle()
  const rolle = (prof?.rolle as string | undefined) ?? ''
  if (rolle === 'admin' || rolle === 'staff' || rolle === 'dispatch') return null

  // CMM-44 SP-A: kundenbetreuer_id liegt auf claims (SSoT). CMM-49: via v_claim_full (flat, faelle-frei).
  const { data: fall } = await admin
    .from('v_claim_full')
    .select('kunde_id, sv_id, kundenbetreuer_id')
    .eq('fall_id', fallId)
    .maybeSingle()
  if (!fall) return 'Fall nicht gefunden.'
  if (fall.kunde_id === userId) return null
  if (fall.kundenbetreuer_id === userId) return null
  // SV-Auth: User muss profile_id des zugewiesenen SV sein
  if (fall.sv_id) {
    const { data: sv } = await admin
      .from('sachverstaendige')
      .select('profile_id')
      .eq('id', fall.sv_id as string)
      .maybeSingle()
    if (sv?.profile_id === userId) return null
  }
  return 'Keine Berechtigung für diese Verlegung.'
}

/**
 * Bestätigt die Verlegung. Aufrufbar durch Kunde, KB oder Admin.
 * Nutzt Admin-Client für UPDATE — der Kunde hat nur SELECT-RLS auf
 * gutachter_termine. Auth-Guard wird vorher manuell geprüft
 * (assertDarfVerlegungEntscheiden).
 *
 * State-Transition:
 *   alter Termin: 'verlegt' → 'verschoben' (terminal) + cancelled_at
 *   neuer Slot:   'verlegung_pending' → 'bestaetigt'
 *
 * Idempotent: wenn der Pending-Slot schon nicht mehr 'verlegung_pending'
 * ist (z.B. weil schon abgelehnt oder doppelt bestätigt), Abbruch.
 */
export async function terminVerlegungBestaetigen(input: {
  neuerTerminId: string
}): Promise<DecisionResult> {
  const supabase = await createClient()
  const admin = createAdminClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht eingeloggt.' }

  const { data: neu, error: neuErr } = await admin
    .from('gutachter_termine')
    .select('id, status, verlegung_quelle_id, fall_id, claim_id, lead_id, bezug_typ, bezug_id, start_zeit')
    .eq('id', input.neuerTerminId)
    .maybeSingle()
  if (neuErr || !neu) return { ok: false, error: 'Verlegungs-Slot nicht gefunden.' }
  if (neu.status !== 'verlegung_pending') {
    return {
      ok: false,
      error: `Slot ist nicht im Status 'verlegung_pending' (aktuell: ${neu.status}).`,
    }
  }
  if (!neu.verlegung_quelle_id) {
    return { ok: false, error: 'Kein verlegung_quelle_id auf dem Pending-Slot.' }
  }
  const neuFallId = effektiveFallClaimId(neu)
  if (!neuFallId) {
    return { ok: false, error: 'Pending-Slot hat keinen Fallbezug.' }
  }

  const guardErr = await assertDarfVerlegungEntscheiden(user.id, neuFallId)
  if (guardErr) return { ok: false, error: guardErr }

  // P3a: DB-Transition via Engine entscheideVerlegung (neu -> bestaetigt, alt(verlegt) -> verschoben+cancelled).
  const entRes = await entscheideVerlegung(input.neuerTerminId, 'bestaetigen', { db: admin })
  if (!entRes.ok) {
    return {
      ok: false,
      error: entRes.code === 'nicht_pending'
        ? "Slot ist nicht im Status 'verlegung_pending'."
        : `Bestätigen fehlgeschlagen: ${entRes.error}`,
    }
  }

  revalidateFallPaths(neuFallId)

  // Notifikation an SV
  if (neuFallId) {
    const { data: fall } = await admin
      .from('v_claim_full')
      .select('kunde_id')
      .eq('fall_id', neuFallId)
      .maybeSingle()
    const kundenVorname = await lookupKundenVorname((fall?.kunde_id as string | null) ?? null)
    const von_wem = await lookupUserRolle(user.id)
    const von_wem_safe: 'kunde' | 'kundenbetreuer' | 'admin' =
      von_wem === 'unknown' ? 'kunde' : von_wem

    emitEvent(
      'termin.verlegung_bestaetigt',
      {
        fallId: neuFallId,
        terminId: neu.id as string,
        alterTerminId: neu.verlegung_quelle_id as string,
        neuesDatum: fmtDatum(neu.start_zeit as string),
        neuesUhrzeit: fmtUhrzeit(neu.start_zeit as string),
        kundenVorname,
        von_wem: von_wem_safe,
      },
      { fallId: neuFallId, triggeredBy: user.id },
    ).catch((e) => console.error('[AAR-864] emit verlegung_bestaetigt failed', e))
  }

  return { ok: true }
}

/**
 * Lehnt die Verlegung ab. Aufrufbar durch Kunde, KB oder Admin.
 * State-Transition:
 *   alter Termin: 'verlegt' → 'bestaetigt' (Rollback)
 *   neuer Slot:   'verlegung_pending' → 'storniert'
 *
 * Optional: Grund wird in verlegung_grund des storno-Slots persistiert
 * (überschreibt den SV-Grund — die Ablehnung ist die finale Wahrheit).
 */
export async function terminVerlegungAblehnen(input: {
  neuerTerminId: string
  grund?: string
}): Promise<DecisionResult> {
  const supabase = await createClient()
  const admin = createAdminClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht eingeloggt.' }

  const { data: neu, error: neuErr } = await admin
    .from('gutachter_termine')
    .select('id, status, verlegung_quelle_id, fall_id')
    .eq('id', input.neuerTerminId)
    .maybeSingle()
  if (neuErr || !neu) return { ok: false, error: 'Verlegungs-Slot nicht gefunden.' }
  if (neu.status !== 'verlegung_pending') {
    return {
      ok: false,
      error: `Slot ist nicht im Status 'verlegung_pending' (aktuell: ${neu.status}).`,
    }
  }
  if (!neu.verlegung_quelle_id) {
    return { ok: false, error: 'Kein verlegung_quelle_id auf dem Pending-Slot.' }
  }
  const neuFallId = effektiveFallClaimId(neu)
  if (!neuFallId) {
    return { ok: false, error: 'Pending-Slot hat keinen Fallbezug.' }
  }

  const guardErr = await assertDarfVerlegungEntscheiden(user.id, neuFallId)
  if (guardErr) return { ok: false, error: guardErr }

  // P3a: DB-Transition via Engine entscheideVerlegung (neu -> storniert+cancelled+grund, alt(verlegt) -> bestaetigt).
  const entRes = await entscheideVerlegung(input.neuerTerminId, 'ablehnen', {
    grund: input.grund?.trim() || undefined,
    db: admin,
  })
  if (!entRes.ok) {
    return {
      ok: false,
      error: entRes.code === 'nicht_pending'
        ? "Slot ist nicht im Status 'verlegung_pending'."
        : `Ablehnen fehlgeschlagen: ${entRes.error}`,
    }
  }

  revalidateFallPaths(neuFallId)

  // Notifikation an SV (mit Grund)
  if (neuFallId) {
    const { data: fall } = await admin
      .from('v_claim_full')
      .select('kunde_id')
      .eq('fall_id', neuFallId)
      .maybeSingle()
    const kundenVorname = await lookupKundenVorname((fall?.kunde_id as string | null) ?? null)
    const von_wem = await lookupUserRolle(user.id)
    const von_wem_safe: 'kunde' | 'kundenbetreuer' | 'admin' =
      von_wem === 'unknown' ? 'kunde' : von_wem

    emitEvent(
      'termin.verlegung_abgelehnt',
      {
        fallId: neuFallId,
        terminId: neu.id as string,
        alterTerminId: neu.verlegung_quelle_id as string,
        kundenVorname,
        grund: input.grund?.trim() || undefined,
        von_wem: von_wem_safe,
      },
      { fallId: neuFallId, triggeredBy: user.id },
    ).catch((e) => console.error('[AAR-864] emit verlegung_abgelehnt failed', e))
  }

  return { ok: true }
}
