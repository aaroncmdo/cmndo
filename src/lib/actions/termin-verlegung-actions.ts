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

// Datum/Uhrzeit-Formatter für Notifikations-Payloads (de-DE)
function fmtDatum(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}
function fmtUhrzeit(iso: string): string {
  return new Date(iso).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin',
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
    .select('id, sv_id, start_zeit, end_zeit, status, fall_id, auftrag_id')
    .eq('id', input.terminId)
    .maybeSingle()
  if (terminErr || !termin) {
    return { ok: false, error: `Termin ${input.terminId} nicht gefunden.` }
  }

  // Auth-Guard: User muss der SV des Termins sein, oder Admin/Staff
  if (termin.sv_id) {
    const { data: sv } = await admin
      .from('sachverstaendige')
      .select('profile_id')
      .eq('id', termin.sv_id as string)
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
  // 1) Direkter Shortcut über termin.fall_id (häufig gesetzt)
  // 2) Sonst über termin.auftrag_id → auftraege.fall_id
  // 3) Sonst Caller-Prop als letzter Fallback
  let fallId: string | null = (termin.fall_id as string | null) ?? null
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
  const { data: fall } = await admin
    .from('faelle')
    .select(
      'id, besichtigungsort_adresse, besichtigungsort_lat, besichtigungsort_lng, schadens_adresse, schadens_plz, schadens_ort',
    )
    .eq('id', fallId)
    .maybeSingle()
  if (!fall) return { ok: false, error: `Fall ${fallId} nicht gefunden.` }

  const zielLat = (fall.besichtigungsort_lat as number | null) ?? null
  const zielLng = (fall.besichtigungsort_lng as number | null) ?? null
  if (zielLat === null || zielLng === null) {
    return {
      ok: false,
      error: 'Besichtigungsort hat keine Koordinaten — bitte im Dispatch nachpflegen.',
    }
  }
  const zielLabel =
    (fall.besichtigungsort_adresse as string | null) ||
    [fall.schadens_adresse, fall.schadens_plz, fall.schadens_ort].filter(Boolean).join(', ') ||
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
  if (termin.sv_id) {
    const { data: sv } = await admin
      .from('sachverstaendige')
      .select('standort_adresse, standort_lat, standort_lng')
      .eq('id', termin.sv_id as string)
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

  const vorschlaege = await findVerlegungsVorschlaege(admin, termin.sv_id as string, {
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
    .select('id, sv_id, fall_id, kb_id, kanal, typ, status, start_zeit')
    .eq('id', input.terminId)
    .maybeSingle()
  if (altErr || !alt) return { ok: false, error: 'Termin nicht gefunden.' }
  if (alt.status !== 'bestaetigt') {
    return {
      ok: false,
      error: `Termin ist nicht im Status 'bestaetigt' (aktuell: ${alt.status}).`,
    }
  }

  // 1) Alten Termin auf 'verlegt' setzen
  const { error: updErr } = await supabase
    .from('gutachter_termine')
    .update({
      status: 'verlegt',
      verlegung_grund: input.grund?.trim() || null,
    })
    .eq('id', alt.id)
    .eq('status', 'bestaetigt') // Idempotenz: nur wenn noch bestaetigt
  if (updErr) {
    return { ok: false, error: `Verlegung fehlgeschlagen: ${updErr.message}` }
  }

  // 2) Neuen Slot anlegen
  const { data: neu, error: insErr } = await supabase
    .from('gutachter_termine')
    .insert({
      sv_id: alt.sv_id,
      fall_id: alt.fall_id,
      kb_id: alt.kb_id,
      kanal: alt.kanal,
      typ: alt.typ ?? 'sv_begutachtung',
      start_zeit: input.neuesStartIso,
      end_zeit: input.neuesEndeIso,
      status: 'verlegung_pending',
      verlegung_quelle_id: alt.id,
      verlegung_grund: input.grund?.trim() || null,
      verlegung_kunde_benachrichtigt_an: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (insErr || !neu) {
    // Rollback: alter Termin zurück auf bestaetigt
    await supabase
      .from('gutachter_termine')
      .update({ status: 'bestaetigt', verlegung_grund: null })
      .eq('id', alt.id)
    return { ok: false, error: `Pending-Slot anlegen fehlgeschlagen: ${insErr?.message ?? 'unbekannt'}` }
  }

  if (alt.fall_id) {
    revalidatePath(`/gutachter/fall/${alt.fall_id}`)
    revalidatePath(`/faelle/${alt.fall_id}`)
    revalidatePath(`/kunde/faelle/${alt.fall_id}`)

    // Realtime-Trigger: faelle.updated_at berühren damit FallRealtimeRefresh
    // auf dem Kunden-Portal feuert (gutachter_termine ist per RLS für den
    // Kunden-Client nicht abonnierbar, faelle schon).
    void createAdminClient()
      .from('faelle')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', alt.fall_id)
  }
  revalidatePath('/gutachter/auftraege')
  revalidatePath('/gutachter/heute')

  // Notifikation fire-and-forget — Worker nimmt's auf, Caller wird nicht blockiert
  if (alt.fall_id && alt.sv_id) {
    const svVorname = await lookupSvVorname(alt.sv_id as string)
    emitEvent(
      'termin.verlegung_vorgeschlagen',
      {
        fallId: alt.fall_id as string,
        terminId: neu.id as string,
        alterTerminId: alt.id as string,
        alterDatum: fmtDatum(alt.start_zeit as string),
        alterUhrzeit: fmtUhrzeit(alt.start_zeit as string),
        neuesDatum: fmtDatum(input.neuesStartIso),
        neuesUhrzeit: fmtUhrzeit(input.neuesStartIso),
        svVorname,
        grund: input.grund?.trim() || undefined,
      },
      { fallId: alt.fall_id as string, triggeredBy: user.id },
    ).catch((e) => console.error('[AAR-864] emit verlegung_vorgeschlagen failed', e))
  }

  return { ok: true, neuerTerminId: neu.id as string }
}

type DecisionResult = { ok: true } | { ok: false; error: string }

type KundeVorschlaegeResult =
  | {
      ok: true
      vorschlaege: Array<{ start: string; end: string; datum: string }>
      slotDauerMin: number
      fallId: string
      besichtigungsort: {
        adresse: string
        lat: number
        lng: number
      }
    }
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
    .select('id, sv_id, fall_id, start_zeit, end_zeit, status')
    .eq('id', terminId)
    .maybeSingle()
  if (!termin) return { ok: false, error: 'Termin nicht gefunden.' }
  // 'bestaetigt' = regulaerer Verlegen-Flow.
  // 'reserviert' / 'gegenvorschlag' / 'verlegung_pending' = blockiert.
  // Verstrichener Termin (start_zeit in der Vergangenheit) bleibt bestaetigt
  // bis abgesagt — fuer die "Neuen Termin vereinbaren"-UX wollen wir die
  // Vorschlaege weiter laden koennen.
  if (!['bestaetigt'].includes(termin.status as string)) {
    return { ok: false, error: 'Termin ist nicht mehr bestätigt.' }
  }
  if (!termin.fall_id) return { ok: false, error: 'Termin ohne Fall-Verknüpfung.' }

  const guardErr = await assertDarfVerlegungEntscheiden(user.id, termin.fall_id as string)
  if (guardErr) return { ok: false, error: guardErr }

  const { data: fall } = await admin
    .from('faelle')
    .select('besichtigungsort_adresse, besichtigungsort_lat, besichtigungsort_lng, schadens_adresse, schadens_plz, schadens_ort')
    .eq('id', termin.fall_id as string)
    .maybeSingle()
  if (!fall) return { ok: false, error: 'Fall nicht gefunden.' }

  const zielLat = (fall.besichtigungsort_lat as number | null) ?? null
  const zielLng = (fall.besichtigungsort_lng as number | null) ?? null
  if (zielLat === null || zielLng === null) {
    return { ok: false, error: 'Besichtigungsort ohne Koordinaten — Routen-Check nicht möglich.' }
  }
  const zielLabel =
    (fall.besichtigungsort_adresse as string | null) ||
    [fall.schadens_adresse, fall.schadens_plz, fall.schadens_ort].filter(Boolean).join(', ') ||
    'Besichtigungsort'

  const dauerMin = Math.round(
    (new Date(termin.end_zeit as string).getTime() -
      new Date(termin.start_zeit as string).getTime()) / 60_000,
  )
  const slotDauerMin = dauerMin >= 30 && dauerMin <= 240 ? dauerMin : 45

  let svStandort: { lat: number; lng: number; label: string } | null = null
  if (termin.sv_id) {
    const { data: sv } = await admin
      .from('sachverstaendige')
      .select('standort_adresse, standort_lat, standort_lng')
      .eq('id', termin.sv_id as string)
      .maybeSingle()
    const lat = sv?.standort_lat as number | null
    const lng = sv?.standort_lng as number | null
    if (lat != null && lng != null) {
      svStandort = { lat: Number(lat), lng: Number(lng), label: (sv?.standort_adresse as string | null) ?? 'SV-Standort' }
    }
  }

  let vorschlaegeRaw: import('@/lib/termine/verlegung-vorschlaege').VerlegungsVorschlag[] = []
  try {
    vorschlaegeRaw = await findVerlegungsVorschlaege(admin, termin.sv_id as string, {
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

  console.log('[AAR-864] getKundeTerminVorschlaegeAction: vorschlaegeRaw.length =', vorschlaegeRaw.length, '| svId =', termin.sv_id, '| fallId =', termin.fall_id, '| zielLat =', zielLat, '| zielLng =', zielLng)

  // Routen-Details rausfiltern — Kunde sieht nur Datum + Uhrzeit (SV-Privatsphäre)
  const vorschlaege = vorschlaegeRaw.map((v) => ({ start: v.start, end: v.end, datum: v.datum }))
  return {
    ok: true,
    vorschlaege,
    slotDauerMin,
    fallId: termin.fall_id as string,
    besichtigungsort: {
      adresse: zielLabel,
      lat: Number(zielLat),
      lng: Number(zielLng),
    },
  }
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

  // Termin laden — sv_angekommen_am ist die Geo-Wahrheit fuer
  // Verschuldens-Zuordnung (siehe Counter-Logik unten).
  const { data: alt } = await admin
    .from('gutachter_termine')
    .select('id, sv_id, fall_id, kb_id, kanal, typ, status, start_zeit, end_zeit, sv_angekommen_am')
    .eq('id', input.terminId)
    .maybeSingle()
  if (!alt) return { ok: false, error: 'Termin nicht gefunden.' }
  if (alt.status !== 'bestaetigt') {
    return { ok: false, error: `Termin ist nicht bestaetigt (aktuell: ${alt.status}).` }
  }

  // Auth: User muss Kunde des Falls sein
  if (!alt.fall_id) return { ok: false, error: 'Termin nicht mit einem Fall verknüpft.' }
  const guardErr = await assertDarfVerlegungEntscheiden(user.id, alt.fall_id as string)
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
    alt.sv_id as string,
    wunschStart.toISOString(),
    wunschEnde.toISOString(),
    alt.id as string,
  )
  if (!frei) {
    const alternatives = await findAlternativenZuWunschslot(
      admin,
      alt.sv_id as string,
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

  // Reihenfolge: erst alten Termin schliessen, DANN neuen inserieren.
  // Grund: EXCLUSION CONSTRAINT greift auf bestaetigt|reserviert|verlegt|verlegung_pending.
  // Wenn wir erst inserieren (neuer = bestaetigt), ist der alte noch bestaetigt
  // → bei zweitem Verschieben vom gleichen Slot feuert der CONSTRAINT (AAR-864 Bug).

  // 1) Alter Termin schliessen.
  // Wenn der Termin bereits verstrichen ist, gilt er als 'verpasst' —
  // sonst 'verschoben'. Wer schuld ist (SV vs Kunde) ergibt sich aus
  // sv_angekommen_am: war der SV nicht vor Ort, ist er der No-Show;
  // war er vor Ort und nichts ist passiert, ist es Kunde-No-Show.
  // Geo-Auto-Detection mit Permission, manueller Fallback ohne.
  const altStartMs = new Date(alt.start_zeit as string).getTime()
  const verstrichen = altStartMs + 60 * 60 * 1000 < Date.now()
  const svWarVorOrt = !!(alt.sv_angekommen_am as string | null)
  const verschuldenSv = verstrichen && !svWarVorOrt
  const neuerAltStatus = verstrichen ? 'verpasst' : 'verschoben'

  const { error: updErr } = await admin
    .from('gutachter_termine')
    .update({
      status: neuerAltStatus,
      verlegung_grund: input.grund?.trim() || null,
      verlegung_initiator_kunde: true,
    })
    .eq('id', alt.id)
    .eq('status', 'bestaetigt')
  if (updErr) {
    return { ok: false, error: `Alter Termin lässt sich nicht abschließen: ${updErr.message}` }
  }

  // 2) Neuen Slot anlegen — sofort 'bestaetigt', Initiator=Kunde
  const { data: neu, error: insErr } = await admin
    .from('gutachter_termine')
    .insert({
      sv_id: alt.sv_id,
      fall_id: alt.fall_id,
      kb_id: alt.kb_id,
      kanal: alt.kanal,
      typ: alt.typ ?? 'sv_begutachtung',
      start_zeit: wunschStart.toISOString(),
      end_zeit: wunschEnde.toISOString(),
      status: 'bestaetigt',
      verlegung_quelle_id: alt.id,
      verlegung_grund: input.grund?.trim() || null,
      verlegung_initiator_kunde: true,
    })
    .select('id')
    .single()

  if (insErr || !neu) {
    // Rollback: alter Termin zurück auf bestaetigt
    await admin
      .from('gutachter_termine')
      .update({ status: 'bestaetigt', verlegung_grund: null, verlegung_initiator_kunde: null })
      .eq('id', alt.id)
    return {
      ok: false,
      error: `Neuer Slot anlegen fehlgeschlagen: ${insErr?.message ?? 'unbekannt'}`,
    }
  }

  // Timeline-Eintrag fuer Audit
  await admin.from('timeline').insert({
    fall_id: alt.fall_id,
    typ: verstrichen ? 'system' : 'termin',
    titel: verstrichen
      ? verschuldenSv
        ? 'Termin verpasst — SV nicht erschienen, Kunde bucht neu'
        : 'Termin verpasst — Kunde bucht neu'
      : 'Termin verschoben (Kunde)',
    beschreibung: input.grund?.trim() || null,
  })

  // Bei verpasstem Termin: passenden No-Show-Counter inkrementieren.
  // Auto-Klassifikation via sv_angekommen_am (Geo-getriggert) statt
  // pauschal Kunde-No-Show.
  if (verstrichen && alt.fall_id) {
    const { data: fallRow } = await admin
      .from('faelle')
      .select('claim_id')
      .eq('id', alt.fall_id as string)
      .maybeSingle()
    const claimId = (fallRow?.claim_id as string | null) ?? null
    if (claimId) {
      const { data: claim } = await admin
        .from('claims')
        .select('kunde_no_show_count, sv_no_show_count')
        .eq('id', claimId)
        .maybeSingle()
      const nowIso = new Date().toISOString()
      if (verschuldenSv) {
        const currentCount = (claim?.sv_no_show_count as number | null) ?? 0
        await admin
          .from('claims')
          .update({
            sv_no_show_count: currentCount + 1,
            letzter_sv_no_show_am: nowIso,
          })
          .eq('id', claimId)
      } else {
        const currentCount = (claim?.kunde_no_show_count as number | null) ?? 0
        await admin
          .from('claims')
          .update({
            kunde_no_show_count: currentCount + 1,
            letzter_no_show_am: nowIso,
          })
          .eq('id', claimId)
      }
    }
  }

  revalidateFallPaths(alt.fall_id as string | null)

  // Notifikation: SV informieren — kein Bestätigungs-Request, nur Hinweis
  const svVorname = await lookupSvVorname(alt.sv_id as string)
  emitEvent(
    'termin.verschoben_durch_kunde',
    {
      fallId: alt.fall_id as string,
      terminId: neu.id as string,
      alterTerminId: alt.id as string,
      alterDatum: fmtDatum(alt.start_zeit as string),
      alterUhrzeit: fmtUhrzeit(alt.start_zeit as string),
      neuesDatum: fmtDatum(wunschStart.toISOString()),
      neuesUhrzeit: fmtUhrzeit(wunschStart.toISOString()),
      svVorname,
      grund: input.grund?.trim() || undefined,
    },
    { fallId: alt.fall_id as string, triggeredBy: user.id },
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

  const { data: fall } = await admin
    .from('faelle')
    .select('kunde_id, kundenbetreuer_id, sv_id')
    .eq('id', fallId)
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
    .select('id, status, verlegung_quelle_id, fall_id, start_zeit')
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
  if (!neu.fall_id) {
    return { ok: false, error: 'Pending-Slot hat keine fall_id.' }
  }

  const guardErr = await assertDarfVerlegungEntscheiden(user.id, neu.fall_id as string)
  if (guardErr) return { ok: false, error: guardErr }

  // 1) Neuer Slot → bestaetigt (Admin-Client, weil Kunde nur SELECT hat)
  const { error: bestErr } = await admin
    .from('gutachter_termine')
    .update({ status: 'bestaetigt' })
    .eq('id', neu.id)
    .eq('status', 'verlegung_pending')
  if (bestErr) return { ok: false, error: `Bestätigen fehlgeschlagen: ${bestErr.message}` }

  // 2) Alter Termin → verschoben (terminal)
  const { error: altErr } = await admin
    .from('gutachter_termine')
    .update({
      status: 'verschoben',
      cancelled_at: new Date().toISOString(),
    })
    .eq('id', neu.verlegung_quelle_id)
    .eq('status', 'verlegt')
  if (altErr) {
    // Rollback: neuer Slot zurück auf pending
    await admin
      .from('gutachter_termine')
      .update({ status: 'verlegung_pending' })
      .eq('id', neu.id)
    return { ok: false, error: `Alten Termin schließen fehlgeschlagen: ${altErr.message}` }
  }

  revalidateFallPaths(neu.fall_id as string | null)

  // Notifikation an SV
  if (neu.fall_id) {
    const { data: fall } = await admin
      .from('faelle')
      .select('kunde_id')
      .eq('id', neu.fall_id as string)
      .maybeSingle()
    const kundenVorname = await lookupKundenVorname((fall?.kunde_id as string | null) ?? null)
    const von_wem = await lookupUserRolle(user.id)
    const von_wem_safe: 'kunde' | 'kundenbetreuer' | 'admin' =
      von_wem === 'unknown' ? 'kunde' : von_wem

    emitEvent(
      'termin.verlegung_bestaetigt',
      {
        fallId: neu.fall_id as string,
        terminId: neu.id as string,
        alterTerminId: neu.verlegung_quelle_id as string,
        neuesDatum: fmtDatum(neu.start_zeit as string),
        neuesUhrzeit: fmtUhrzeit(neu.start_zeit as string),
        kundenVorname,
        von_wem: von_wem_safe,
      },
      { fallId: neu.fall_id as string, triggeredBy: user.id },
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
  if (!neu.fall_id) {
    return { ok: false, error: 'Pending-Slot hat keine fall_id.' }
  }

  const guardErr = await assertDarfVerlegungEntscheiden(user.id, neu.fall_id as string)
  if (guardErr) return { ok: false, error: guardErr }

  // 1) Neuer Slot → storniert (Admin-Client)
  const { error: stoErr } = await admin
    .from('gutachter_termine')
    .update({
      status: 'storniert',
      cancelled_at: new Date().toISOString(),
      verlegung_grund: input.grund?.trim() || null,
    })
    .eq('id', neu.id)
    .eq('status', 'verlegung_pending')
  if (stoErr) return { ok: false, error: `Stornieren fehlgeschlagen: ${stoErr.message}` }

  // 2) Alter Termin → bestaetigt (Rollback)
  const { error: rbErr } = await admin
    .from('gutachter_termine')
    .update({ status: 'bestaetigt' })
    .eq('id', neu.verlegung_quelle_id)
    .eq('status', 'verlegt')
  if (rbErr) {
    // Rollback des Rollbacks: neuer Slot zurück auf pending
    await admin
      .from('gutachter_termine')
      .update({ status: 'verlegung_pending', cancelled_at: null })
      .eq('id', neu.id)
    return { ok: false, error: `Alter Termin Rollback fehlgeschlagen: ${rbErr.message}` }
  }

  revalidateFallPaths(neu.fall_id as string | null)

  // Notifikation an SV (mit Grund)
  if (neu.fall_id) {
    const { data: fall } = await admin
      .from('faelle')
      .select('kunde_id')
      .eq('id', neu.fall_id as string)
      .maybeSingle()
    const kundenVorname = await lookupKundenVorname((fall?.kunde_id as string | null) ?? null)
    const von_wem = await lookupUserRolle(user.id)
    const von_wem_safe: 'kunde' | 'kundenbetreuer' | 'admin' =
      von_wem === 'unknown' ? 'kunde' : von_wem

    emitEvent(
      'termin.verlegung_abgelehnt',
      {
        fallId: neu.fall_id as string,
        terminId: neu.id as string,
        alterTerminId: neu.verlegung_quelle_id as string,
        kundenVorname,
        grund: input.grund?.trim() || undefined,
        von_wem: von_wem_safe,
      },
      { fallId: neu.fall_id as string, triggeredBy: user.id },
    ).catch((e) => console.error('[AAR-864] emit verlegung_abgelehnt failed', e))
  }

  return { ok: true }
}
