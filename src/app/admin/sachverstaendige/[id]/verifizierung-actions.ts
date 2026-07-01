'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { calculateIsochrone } from '@/lib/isochrone/calculate-isochrone'
import { resolveTasksForEntity } from '@/lib/tasks/resolve-tasks'
import { createLinkedTask } from '@/lib/tasks/create-task'
import { getKatalogSlot } from '@/lib/dokumente/katalog'
import { revalidatePath } from 'next/cache'

const ADMIN_UPLOADBARE_SLOTS = [
  'sv_sicherungsabtretung',
  'sv_honorarvereinbarung',
  'sv_datenschutzerklaerung',
  'sv_widerrufsbelehrung',
] as const

// AAR-359 W6: Admin-Actions für Verifizierungs-Tab.
//
// Die Actions bilden den Admin-seitigen Gegenpart zum SV-Upload-Flow:
// - tier2Freigeben / tier2DokumentNachfordern — Tier 2 (14-Tage-Frist)
// - svSperren / svEntsperren — separate Sperre (nie automatisch)
// - pflichtdokumentFreigeben / -Zurueckweisen — Tier-1-Pflichtdokumente (AAR-714)
//
// AAR-360: Die Legacy-SA-Vorlage-Actions (saVorlageFreigeben/-Zurueckweisen)
// wurden entfernt — das Tier-1-Dispatch-Gate läuft über pflichtdokumente.
//
// Jede Status-Änderung auto-resolved die zugehörigen Tasks über
// resolveTasksForEntity('gutachter', svId, ...).

async function requireAdmin() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false as const, error: 'Nicht angemeldet' }
  const { data: me } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .maybeSingle()
  if (me?.rolle !== 'admin') {
    return { success: false as const, error: 'Nur Admins dürfen die Verifizierung bearbeiten.' }
  }
  return { success: true as const, userId: user.id }
}

function revalidateBoth(svId: string) {
  revalidatePath(`/admin/sachverstaendige/${svId}`)
  revalidatePath('/admin/sachverstaendige')
  revalidatePath('/admin/aufgaben/alle')
  revalidatePath('/gutachter/verifizierung')
  revalidatePath('/gutachter')
}

// ─── Tier 2: 14-Tage-Verifizierung ───────────────────────────────────

export async function tier2Freigeben(svId: string): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (!auth.success) return { success: false, error: auth.error }

  const db = createAdminClient()
  const { error } = await db
    .from('sachverstaendige')
    .update({
      verifizierung_status: 'geprueft',
      verifiziert_am: new Date().toISOString(),
      verifiziert_von: auth.userId,
      verifizierung_admin_notiz: null,
    })
    .eq('id', svId)
  if (error) return { success: false, error: `Freigabe fehlgeschlagen: ${error.message}` }

  await resolveTasksForEntity('gutachter', svId, 'Tier-2-Verifizierung durch Admin freigegeben')

  revalidateBoth(svId)
  return { success: true }
}

export async function tier2DokumentNachfordern(
  svId: string,
  slotId: string,
  begruendung: string,
  fristIso: string,
): Promise<{ success: boolean; error?: string; pflichtdokId?: string }> {
  const auth = await requireAdmin()
  if (!auth.success) return { success: false, error: auth.error }

  const trimmed = (begruendung ?? '').trim()
  if (trimmed.length < 20) {
    return { success: false, error: 'Begründung muss mindestens 20 Zeichen lang sein.' }
  }
  if (!fristIso || Number.isNaN(new Date(fristIso).getTime())) {
    return { success: false, error: 'Ungültige Frist.' }
  }

  const supabase = await createClient()
  const slot = await getKatalogSlot(supabase, slotId)
  if (!slot) return { success: false, error: `Unbekannter Dokumententyp: ${slotId}` }
  if (slot.kategorie !== 'gutachter_verifizierung') {
    return { success: false, error: `Slot "${slotId}" ist kein Verifizierungs-Dokument.` }
  }
  if (!slot.anforderbar_von.includes('admin')) {
    return { success: false, error: `Slot "${slot.label}" ist nicht admin-anforderbar.` }
  }

  const db = createAdminClient()

  // Duplikat-Check — nur ein offener Anforderungs-Row pro (svId, slotId)
  const { data: existing } = await db
    .from('pflichtdokumente')
    .select('id')
    .eq('sv_id', svId)
    .eq('dokument_typ', slotId)
    .eq('status', 'ausstehend')
    .maybeSingle()
  if (existing) {
    return { success: false, error: `"${slot.label}" ist bereits angefordert.` }
  }

  const { data: maxRow } = await db
    .from('pflichtdokumente')
    .select('sort_order')
    .eq('sv_id', svId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextSort = ((maxRow?.sort_order as number | null) ?? 0) + 1

  const { data: inserted, error: insErr } = await db
    .from('pflichtdokumente')
    .insert({
      sv_id: svId,
      dokument_typ: slotId,
      status: 'ausstehend',
      pflicht: true,
      quelle: 'admin',
      angefordert_von_rolle: 'admin',
      angefordert_von_user_id: auth.userId,
      angefordert_am: new Date().toISOString(),
      begruendung: trimmed,
      frist: new Date(fristIso).toISOString(),
      sort_order: nextSort,
    })
    .select('id')
    .single()
  if (insErr || !inserted) {
    return { success: false, error: insErr?.message ?? 'Anforderung konnte nicht gespeichert werden.' }
  }

  // SV-Task: erscheint in /gutachter/tasks
  const { data: sv } = await db
    .from('sachverstaendige')
    .select('profile_id')
    .eq('id', svId)
    .maybeSingle()

  await createLinkedTask({
    titel: `Dokument nachreichen: ${slot.label}`,
    beschreibung: trimmed,
    prioritaet: 'normal',
    typ: 'dokument-nachreichen',
    entity_type: 'gutachter',
    entity_id: svId,
    empfaenger_rolle: 'sachverstaendiger',
    empfaenger_user_id: (sv?.profile_id as string | null) ?? null,
    faellig_am: new Date(fristIso),
    auto_erstellt: false,
    trigger_event: 'sv_verifizierung_nachforderung',
  })

  revalidateBoth(svId)
  return { success: true, pflichtdokId: inserted.id as string }
}

// ─── Sperre ──────────────────────────────────────────────────────────

export async function svSperren(
  svId: string,
  grund: string,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (!auth.success) return { success: false, error: auth.error }

  const trimmed = (grund ?? '').trim()
  if (trimmed.length < 10) {
    return { success: false, error: 'Sperr-Grund muss mindestens 10 Zeichen lang sein.' }
  }

  const db = createAdminClient()
  const { error } = await db
    .from('sachverstaendige')
    .update({
      gesperrt_seit: new Date().toISOString(),
      gesperrt_grund: trimmed,
      gesperrt_von_user_id: auth.userId,
      ist_aktiv: false,
    })
    .eq('id', svId)
  if (error) return { success: false, error: `Sperren fehlgeschlagen: ${error.message}` }

  revalidateBoth(svId)
  return { success: true }
}

export async function svEntsperren(svId: string): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (!auth.success) return { success: false, error: auth.error }

  const db = createAdminClient()
  const { error } = await db
    .from('sachverstaendige')
    .update({
      gesperrt_seit: null,
      gesperrt_grund: null,
      gesperrt_von_user_id: null,
      ist_aktiv: true,
    })
    .eq('id', svId)
  if (error) return { success: false, error: `Entsperren fehlgeschlagen: ${error.message}` }

  revalidateBoth(svId)
  return { success: true }
}

// ─── AAR-714: Pflichtdokumente (Multi-Doc-Onboarding) ─────────────────
//
// Drei Slots ersetzen die alte SA-Vorlage:
//   sv_sicherungsabtretung ODER sv_honorarvereinbarung (eines von beiden)
//   sv_datenschutzerklaerung
//   sv_widerrufsbelehrung
//
// Admin gibt jedes Dokument einzeln frei oder lehnt es ab. Sobald alle
// Pflicht-Anforderungen geprüft sind, setzt dokumenteAlleFreigeben()
// sachverstaendige.verifiziert=true und öffnet damit die „verifizierter
// Gutachter"-Sichtbarkeit auf der Kundenseite.

const PFLICHT_ABTRETUNG = ['sv_sicherungsabtretung', 'sv_honorarvereinbarung'] as const
const PFLICHT_SINGLE = ['sv_datenschutzerklaerung', 'sv_widerrufsbelehrung'] as const

export async function pflichtdokumentFreigeben(
  svId: string,
  slotId: string,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (!auth.success) return { success: false, error: auth.error }

  const db = createAdminClient()
  const { data: row, error: loadErr } = await db
    .from('pflichtdokumente')
    .select('id, status')
    .eq('sv_id', svId)
    .eq('dokument_typ', slotId)
    .maybeSingle()
  if (loadErr) return { success: false, error: `Lookup fehlgeschlagen: ${loadErr.message}` }
  if (!row) return { success: false, error: 'Dokument nicht gefunden.' }

  const { error } = await db
    .from('pflichtdokumente')
    .update({ status: 'geprueft' })
    .eq('id', row.id)
  if (error) return { success: false, error: `Freigabe fehlgeschlagen: ${error.message}` }

  await resolveTasksForEntity('gutachter', svId, `Pflichtdokument ${slotId} freigegeben`)

  revalidateBoth(svId)
  return { success: true }
}

export async function pflichtdokumentZurueckweisen(
  svId: string,
  slotId: string,
  begruendung: string,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (!auth.success) return { success: false, error: auth.error }

  const trimmed = (begruendung ?? '').trim()
  if (trimmed.length < 10) {
    return { success: false, error: 'Ablehnungsgrund muss mindestens 10 Zeichen lang sein.' }
  }

  const db = createAdminClient()
  const { data: row } = await db
    .from('pflichtdokumente')
    .select('id')
    .eq('sv_id', svId)
    .eq('dokument_typ', slotId)
    .maybeSingle()
  if (!row) return { success: false, error: 'Dokument nicht gefunden.' }

  const { error } = await db
    .from('pflichtdokumente')
    .update({ status: 'abgelehnt', begruendung: trimmed })
    .eq('id', row.id)
  if (error) return { success: false, error: `Ablehnung fehlgeschlagen: ${error.message}` }

  // Verifiziert zurücksetzen — eine Ablehnung kippt den gesamten Verifiziert-
  // Status, bis der SV neu hochlädt und der Admin erneut freigibt.
  await db
    .from('sachverstaendige')
    .update({ verifiziert: false, verifiziert_am: null, verifiziert_von: null })
    .eq('id', svId)

  // SV-Task: Re-Upload nachreichen (analog tier2DokumentNachfordern, aber
  // ohne harte Frist — der SV braucht's für Freischaltung, das ist Druck genug).
  const { data: sv } = await db
    .from('sachverstaendige')
    .select('profile_id')
    .eq('id', svId)
    .maybeSingle()
  const slot = await getKatalogSlot(await createClient(), slotId)

  await createLinkedTask({
    titel: `Dokument erneut hochladen: ${slot?.label ?? slotId}`,
    beschreibung: trimmed,
    prioritaet: 'dringend',
    typ: 'dokument-nachreichen',
    entity_type: 'gutachter',
    entity_id: svId,
    empfaenger_rolle: 'sachverstaendiger',
    empfaenger_user_id: (sv?.profile_id as string | null) ?? null,
    auto_erstellt: false,
    trigger_event: 'sv_pflichtdokument_abgelehnt',
  })

  revalidateBoth(svId)
  return { success: true }
}

export async function dokumenteAlleFreigeben(
  svId: string,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (!auth.success) return { success: false, error: auth.error }

  const db = createAdminClient()
  const { data: rows, error: loadErr } = await db
    .from('pflichtdokumente')
    .select('dokument_typ, status')
    .eq('sv_id', svId)
    .in('dokument_typ', [...PFLICHT_ABTRETUNG, ...PFLICHT_SINGLE] as unknown as string[])
  if (loadErr) return { success: false, error: `Lookup fehlgeschlagen: ${loadErr.message}` }

  const byType = new Map<string, string>()
  for (const r of rows ?? []) byType.set(r.dokument_typ as string, (r.status as string) ?? '')

  const hatAbtretungOk = PFLICHT_ABTRETUNG.some((s) => {
    const st = byType.get(s)
    return st === 'hochgeladen' || st === 'geprueft'
  })
  if (!hatAbtretungOk) {
    return { success: false, error: 'Sicherungsabtretung oder Honorarvereinbarung fehlt.' }
  }
  for (const s of PFLICHT_SINGLE) {
    const st = byType.get(s)
    if (st !== 'hochgeladen' && st !== 'geprueft') {
      return { success: false, error: `Pflichtdokument fehlt: ${s}.` }
    }
  }

  // Alle vorhandenen hochgeladen/geprueft-Rows auf 'geprueft' setzen.
  const { error: updErr } = await db
    .from('pflichtdokumente')
    .update({ status: 'geprueft' })
    .eq('sv_id', svId)
    .in('dokument_typ', [...PFLICHT_ABTRETUNG, ...PFLICHT_SINGLE] as unknown as string[])
    .in('status', ['hochgeladen', 'geprueft'])
  if (updErr) return { success: false, error: `Dokumenten-Freigabe fehlgeschlagen: ${updErr.message}` }

  const { error: svErr } = await db
    .from('sachverstaendige')
    .update({
      verifiziert: true,
      verifiziert_am: new Date().toISOString(),
      verifiziert_von: auth.userId,
    })
    .eq('id', svId)
  if (svErr) return { success: false, error: `Verifizierungs-Flag konnte nicht gesetzt werden: ${svErr.message}` }

  await resolveTasksForEntity('gutachter', svId, 'Pflichtdokumente vollständig freigegeben')

  revalidateBoth(svId)
  return { success: true }
}

// ─── Basic-SV-Freigabe (P3) ───────────────────────────────────────────
//
// Self-onboarded Basic-SVs (paket='basic', verifizierung_status='ausstehend',
// onboarding_quelle IN ('self_service_claim','self_service_neu')) erzeugen bei
// der Registrierung einen tasks-Eintrag (typ='sv_basic_claim_review').
// Sobald der Admin Identitaet + DAT-Nummer geprueft hat, ruft er eine der
// zwei Actions auf:
//
//   gibBasicSvFrei  — freigeschaltet: alle 5 Flags setzen + Task schliessen
//   lehneBasicSvAb  — abgelehnt: Status + Notiz setzen + Task schliessen
//
// Atomizitaet: Supabase RPC ist hier nicht noetig — DB-Fehler in Schritt 1
// (sachverstaendige-Update) oder Schritt 2 (tasks-Update) werden als Fehler
// zurueckgegeben; ein Partial-Commit (SV-Flag gesetzt, Task offen) ist
// tolerierbar weil der Admin-Task dann noch sichtbar ist und erneut geklickt
// werden kann (idempotentes Update — alle Felder ueberschreibbar).

export async function gibBasicSvFrei(svId: string): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (!auth.success) return { success: false, error: auth.error }

  const db = createAdminClient()

  // Gutachter-Onboarding-Audit #3: Go-Live-Geo-Guard. Die Freigabe macht den SV
  // map-sichtbar (Karten-RLS: isochrone_polygon + lat/lng NOT NULL) UND dispatchbar
  // (Matching: Isochrone deckt Schadenort). Fehlt Geo, waere der SV zwar "frei",
  // wuerde aber 0 Leads treffen (self-reg geocodet lat/lng nur best-effort und
  // berechnet NIE eine Isochrone). Darum: ohne Koordinaten blocken, fehlende
  // Isochrone aus den Koordinaten nachberechnen.
  const { data: sv, error: readErr } = await db
    .from('sachverstaendige')
    .select('standort_lat, standort_lng, paket_umkreis_km, isochrone_polygon')
    .eq('id', svId)
    .maybeSingle()
  if (readErr) return { success: false, error: `SV konnte nicht geladen werden: ${readErr.message}` }
  if (!sv) return { success: false, error: 'Sachverständiger nicht gefunden.' }

  if (sv.standort_lat == null || sv.standort_lng == null) {
    return {
      success: false,
      error:
        'Freigabe nicht möglich: Dem Gutachter fehlen Standort-Koordinaten. Bitte zuerst die Adresse (via Google Places) nachtragen — sonst ist er auf der Karte unsichtbar und nicht buchbar.',
    }
  }

  // Fehlende Isochrone nachberechnen, damit der SV nach der Freigabe wirklich
  // sichtbar + dispatchbar ist. Schlägt die Berechnung fehl -> blocken (nicht
  // stillschweigend "frei ohne Einsatzgebiet"), Admin kann später erneut freigeben.
  const geoPatch: Record<string, unknown> = {}
  if (sv.isochrone_polygon == null) {
    const radiusKm = sv.paket_umkreis_km ?? 25
    try {
      const polygon = await calculateIsochrone(Number(sv.standort_lat), Number(sv.standort_lng), radiusKm)
      if (!polygon.length) throw new Error('leeres Polygon')
      geoPatch.isochrone_polygon = polygon
    } catch (err) {
      console.error('[gibBasicSvFrei] Isochrone-Nachberechnung fehlgeschlagen:', err)
      return {
        success: false,
        error:
          'Freigabe nicht möglich: Das Einsatzgebiet (Isochrone) konnte nicht berechnet werden. Bitte später erneut versuchen.',
      }
    }
  }

  // Schritt 1: alle 5 Freigabe-Flags atomar setzen (+ ggf. nachberechnete Isochrone).
  const { error: svErr } = await db
    .from('sachverstaendige')
    .update({
      verifizierung_status: 'geprueft',
      verifiziert: true,
      verifiziert_am: new Date().toISOString(),
      ist_aktiv: true,
      portal_zugang_freigeschaltet: true,
      ...geoPatch,
    })
    .eq('id', svId)
  if (svErr) return { success: false, error: `Freigabe fehlgeschlagen: ${svErr.message}` }

  // Schritt 2: offenen sv_basic_claim_review-Task schliessen.
  // Direktes Update statt resolveTasksForEntity, weil resolveTasksForEntity
  // zugewiesen_an-Tasks nicht schliesst (Reviewer koennte es beansprucht haben).
  // erledigt_am setzen wie updateTaskStatusCore (Konvention im Codebase).
  const nowIso = new Date().toISOString()
  const { error: taskErr } = await db
    .from('tasks')
    .update({
      status: 'erledigt',
      erledigt_am: nowIso,
      auto_resolved_am: nowIso,
      auto_resolved_grund: 'Basic-SV durch Admin freigegeben',
    })
    .eq('typ', 'sv_basic_claim_review')
    .eq('entity_id', svId)
    .eq('status', 'offen')
  if (taskErr) {
    // Non-fatal: SV ist bereits freigeschaltet; Admin-Task-Schliessen ist
    // best-effort (Task bleibt sichtbar, schadet nicht).
    console.error('[gibBasicSvFrei] Task-Schliessen fehlgeschlagen:', taskErr.message)
  }

  revalidateBoth(svId)
  revalidatePath('/admin/aufgaben/alle')
  return { success: true }
}

export async function lehneBasicSvAb(
  svId: string,
  grund: string,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (!auth.success) return { success: false, error: auth.error }

  const trimmed = (grund ?? '').trim()
  if (trimmed.length < 10) {
    return { success: false, error: 'Ablehnungsgrund muss mindestens 10 Zeichen lang sein.' }
  }

  const db = createAdminClient()

  // Schritt 1: Status + Grund setzen.
  // verifizierung_admin_notiz ist die established Spalte fuer Admin-Notizen auf
  // sachverstaendige (s. tier2Freigeben + pflichtdokumentZurueckweisen).
  const { error: svErr } = await db
    .from('sachverstaendige')
    .update({
      verifizierung_status: 'abgelehnt',
      verifizierung_admin_notiz: trimmed,
    })
    .eq('id', svId)
  if (svErr) return { success: false, error: `Ablehnung fehlgeschlagen: ${svErr.message}` }

  // Schritt 2: offenen sv_basic_claim_review-Task schliessen.
  const nowIso = new Date().toISOString()
  const { error: taskErr } = await db
    .from('tasks')
    .update({
      status: 'erledigt',
      erledigt_am: nowIso,
      auto_resolved_am: nowIso,
      auto_resolved_grund: `Basic-SV durch Admin abgelehnt: ${trimmed.slice(0, 120)}`,
    })
    .eq('typ', 'sv_basic_claim_review')
    .eq('entity_id', svId)
    .eq('status', 'offen')
  if (taskErr) {
    console.error('[lehneBasicSvAb] Task-Schliessen fehlgeschlagen:', taskErr.message)
  }

  revalidateBoth(svId)
  revalidatePath('/admin/aufgaben/alle')
  return { success: true }
}

// ─── Admin-Upload für SV-Pflichtdokumente ────────────────────────────
//
// Aaron-Spec 2026-04-30: Admin soll im SV-Detail-Tab die 4 Pflicht-
// Dokumente (Sicherungsabtretung / Honorarvereinbarung / Datenschutz-
// erklärung / Widerrufsbelehrung) selbst hochladen können — z.B. wenn
// der SV sie per Email schickt statt durchs Onboarding zu laden.
//
// Storage-Pfad ist IDENTISCH zum SV-Onboarding-Upload
// (`fall-dokumente/sv-pflicht/${svId}/${slotId}/${ts}.${ext}`) und
// die `pflichtdokumente`-Row wird beim Upsert wiederverwendet.
// Damit referenziert ein bereits hochgeladenes Dokument exakt die
// gleiche Storage-URL — keine Duplikate, kein doppeltes Pflegen.
//
// Unterschied zum SV-Upload:
//   - quelle = 'admin'
//   - status direkt = 'geprueft' (Admin-Upload = bereits geprüft,
//     wer den Dokumentenstand selbst eingetragen hat hat ihn auch
//     visuell verifiziert)
//   - kein Admin-Review-Task (es ist ja schon der Admin)

export async function uploadAdminPflichtdokument(
  svId: string,
  formData: FormData,
): Promise<{ success: boolean; storage_path?: string; error?: string }> {
  const auth = await requireAdmin()
  if (!auth.success) return { success: false, error: auth.error }

  const slotId = (formData.get('slot_id') as string | null)?.trim() ?? ''
  const file = formData.get('datei') as File | null
  if (!slotId) return { success: false, error: 'Kein Slot angegeben' }
  if (!ADMIN_UPLOADBARE_SLOTS.includes(slotId as typeof ADMIN_UPLOADBARE_SLOTS[number])) {
    return { success: false, error: `Slot "${slotId}" ist nicht admin-uploadbar` }
  }
  if (!file || file.size === 0) return { success: false, error: 'Keine Datei ausgewählt' }

  const supabase = await createClient()
  const slot = await getKatalogSlot(supabase, slotId)
  if (!slot || !slot.aktiv) return { success: false, error: `Unbekannter oder deaktivierter Slot: ${slotId}` }

  const maxBytes = slot.max_mb * 1024 * 1024
  if (file.size > maxBytes) return { success: false, error: `Datei zu groß (max ${slot.max_mb} MB)` }
  if (
    slot.akzeptierte_mime_types.length > 0 &&
    file.type &&
    !slot.akzeptierte_mime_types.includes(file.type) &&
    file.type !== 'application/octet-stream'
  ) {
    return {
      success: false,
      error: `MIME-Type nicht erlaubt (erwartet: ${slot.akzeptierte_mime_types.join(', ')})`,
    }
  }

  const db = createAdminClient()
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin'

  // Identischer Pfad wie uploadSvPflichtdokument — der SA-Tool-Generator
  // und alle Loader prüfen exakt diesen Pfad-Pattern.
  const path = `sv-pflicht/${svId}/${slotId}/${Date.now()}.${ext}`
  const { error: uploadErr } = await db.storage
    .from('fall-dokumente')
    .upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: true,
    })
  if (uploadErr) return { success: false, error: `Upload fehlgeschlagen: ${uploadErr.message}` }

  // Row upsert — wenn der SV bereits hochgeladen hatte, überschreiben
  // wir die Storage-Referenz damit „eine Wahrheit pro Slot".
  const { data: existing } = await db
    .from('pflichtdokumente')
    .select('id')
    .eq('sv_id', svId)
    .eq('dokument_typ', slotId)
    .maybeSingle()

  if (existing) {
    const { error: updErr } = await db
      .from('pflichtdokumente')
      .update({
        status: 'geprueft',
        dokument_url: path,
        hochgeladen_am: new Date().toISOString(),
        quelle: 'admin',
        begruendung: null,
      })
      .eq('id', existing.id)
    if (updErr) return { success: false, error: `DB-Update fehlgeschlagen: ${updErr.message}` }
  } else {
    const { error: insErr } = await db.from('pflichtdokumente').insert({
      sv_id: svId,
      dokument_typ: slotId,
      status: 'geprueft',
      pflicht: true,
      quelle: 'admin',
      dokument_url: path,
      hochgeladen_am: new Date().toISOString(),
      angefordert_von_user_id: auth.userId,
      angefordert_am: new Date().toISOString(),
    })
    if (insErr) return { success: false, error: `DB-Insert fehlgeschlagen: ${insErr.message}` }
  }

  // Offene Review-Tasks für genau diesen SV+Slot schließen — wenn der SV
  // vorher hochgeladen hatte und ein Review-Task offen war.
  await resolveTasksForEntity(
    'gutachter',
    svId,
    `${slot.label} durch Admin hochgeladen + freigegeben`,
  )

  revalidateBoth(svId)
  return { success: true, storage_path: path }
}
