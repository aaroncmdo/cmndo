'use server'

// CMM-32e: KB-QC-Aktionen.
// - gibKanzleipaketFrei: Final-Freigabe → Auftrag abgeschlossen + Kanzlei-Fall.
// - weiseGutachtenZurueck: Reject mit Begründung, Auftrag bleibt offen.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { getStorageUrl } from '@/lib/storage/url'

async function getKbOrAdmin() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { error: 'unauthorized' as const }
  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle, vorname, nachname')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile || !['admin', 'kundenbetreuer'].includes(profile.rolle as string)) {
    return { error: 'Nur Admin/KB darf das' as const }
  }
  return {
    user,
    rolle: profile.rolle as string,
    name:
      [profile.vorname, profile.nachname].filter(Boolean).join(' ') || 'KB',
  }
}

export async function gibKanzleipaketFrei(
  auftragId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'unauthorized' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile || !['admin', 'kundenbetreuer'].includes(profile.rolle as string)) {
    return { ok: false, error: 'Nur Admin/KB darf freigeben' }
  }

  const db = createAdminClient()

  const { data: auftrag } = await db
    .from('auftraege')
    .select('id, fall_id, gutachten_url, gutachten_final_freigegeben, status')
    .eq('id', auftragId)
    .maybeSingle()
  if (!auftrag) return { ok: false, error: 'Auftrag nicht gefunden' }
  if (auftrag.gutachten_final_freigegeben) return { ok: true }
  if (!auftrag.gutachten_url) return { ok: false, error: 'Kein Gutachten hochgeladen' }

  const now = new Date().toISOString()

  // Auftrag schließen
  const { error: aErr } = await db
    .from('auftraege')
    .update({
      gutachten_final_freigegeben: true,
      status: 'abgeschlossen',
      abgeschlossen_am: now,
    })
    .eq('id', auftragId)
  if (aErr) return { ok: false, error: aErr.message }

  // Kanzlei-Fall anlegen falls noch keiner existiert
  const { data: existing } = await db
    .from('kanzlei_faelle')
    .select('id')
    .eq('fall_id', auftrag.fall_id)
    .maybeSingle()

  if (!existing) {
    const { error: kErr } = await db
      .from('kanzlei_faelle')
      .insert({
        fall_id: auftrag.fall_id,
        status: 'versicherungskontakt',
      })
    if (kErr) return { ok: false, error: kErr.message }
  }

  revalidatePath(`/faelle/${auftrag.fall_id}`)
  revalidatePath(`/kunde/faelle/${auftrag.fall_id}`)
  revalidatePath(`/gutachter/fall/${auftrag.fall_id}`)
  return { ok: true }
}

// ─── gutachtenAbgeben ─────────────────────────────────────────────────────────
//
// SV drückt nach Upload(s) explizit „Gutachten abgeben" — finalisiert den
// Submit zur QC-Pipeline. Picked das jüngste Haupt-Gutachten-Dokument für
// diesen Auftrag, setzt auftraege.gutachten_url + status + reset reject.

export async function gutachtenAbgeben(
  auftragId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'unauthorized' }

  const db = createAdminClient()

  const { data: auftrag } = await db
    .from('auftraege')
    .select('id, fall_id, sv_id, gutachten_url, gutachten_final_freigegeben, zurueckweisung_grund')
    .eq('id', auftragId)
    .maybeSingle()
  if (!auftrag) return { ok: false, error: 'Auftrag nicht gefunden' }
  if (auftrag.gutachten_final_freigegeben) {
    return { ok: false, error: 'Auftrag ist bereits final freigegeben' }
  }

  // Auftrag-zu-Claim-Pfad ermitteln
  const { data: fall } = await db
    .from('faelle')
    .select('claim_id')
    .eq('id', auftrag.fall_id)
    .maybeSingle()
  const claimId = fall?.claim_id as string | null
  if (!claimId) return { ok: false, error: 'Claim nicht gefunden' }

  // CMM-32e: Pick die jüngste Datei für diesen Auftrag (egal ob als
  // 'gutachten' oder 'gutachten_anlage' markiert). Bei reinen Bilder-
  // Nachbesserungen ist das Hauptdokument oft kein PDF — der KB sieht
  // im QC-Card alle Files und entscheidet ob's reicht.
  const { data: docs } = await db
    .from('fall_dokumente')
    .select('id, storage_path, hochgeladen_am, dokument_typ')
    .eq('fall_id', auftrag.fall_id)
    .in('dokument_typ', ['gutachten', 'gutachten_anlage'])
    .like('storage_path', `claims/${claimId}/gutachten/${auftragId}/%`)
    .is('geloescht_am', null)
    .order('hochgeladen_am', { ascending: false })
    .limit(1)
  const haupt = docs?.[0]
  if (!haupt) return { ok: false, error: 'Keine Dokumente zur Abgabe gefunden — bitte zuerst hochladen' }

  const publicUrl = await getStorageUrl(db, 'fall-dokumente', haupt.storage_path as string)
  if (!publicUrl) return { ok: false, error: 'URL-Generierung fehlgeschlagen' }

  const warReject = !!auftrag.zurueckweisung_grund && !!(await db
    .from('auftraege').select('zurueckgewiesen_am').eq('id', auftragId).single()).data?.zurueckgewiesen_am

  const { error: aErr } = await db
    .from('auftraege')
    .update({
      gutachten_url: publicUrl,
      status: 'gutachten',
      zurueckgewiesen_am: null,
    })
    .eq('id', auftragId)
  if (aErr) return { ok: false, error: aErr.message }

  // Timeline-Eintrag + KB-Mitteilung wenn Re-Submit nach Reject
  if (warReject) {
    try {
      await db.from('timeline').insert({
        fall_id: auftrag.fall_id,
        typ: 'gutachten_korrigiert',
        titel: 'Korrigiertes Gutachten eingereicht',
        beschreibung: 'SV hat eine korrigierte Version abgegeben.',
        erstellt_von: user.id,
      })
    } catch { /* non-critical */ }
  } else {
    try {
      await db.from('timeline').insert({
        fall_id: auftrag.fall_id,
        typ: 'gutachten_eingereicht',
        titel: 'Gutachten eingereicht',
        beschreibung: 'SV hat das Gutachten zur Prüfung abgegeben.',
        erstellt_von: user.id,
      })
    } catch { /* non-critical */ }
  }

  revalidatePath(`/faelle/${auftrag.fall_id}`)
  revalidatePath(`/gutachter/fall/${auftrag.fall_id}`)
  revalidatePath(`/kunde/faelle/${auftrag.fall_id}`)
  return { ok: true }
}

// ─── loescheGutachtenDokument ─────────────────────────────────────────────────
//
// SV löscht ein soeben (falsch) hochgeladenes Dokument wieder aus dem
// Storage + der fall_dokumente-Tabelle (Soft-Delete via geloescht_am).
// Nur für noch nicht freigegebene Aufträge erlaubt.

export async function loescheGutachtenDokument(
  auftragId: string,
  storagePath: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'unauthorized' }

  const db = createAdminClient()

  const { data: auftrag } = await db
    .from('auftraege')
    .select('id, fall_id, gutachten_final_freigegeben')
    .eq('id', auftragId)
    .maybeSingle()
  if (!auftrag) return { ok: false, error: 'Auftrag nicht gefunden' }
  if (auftrag.gutachten_final_freigegeben) {
    return { ok: false, error: 'Auftrag ist bereits freigegeben' }
  }

  const { error: storageErr } = await db.storage
    .from('fall-dokumente')
    .remove([storagePath])
  if (storageErr) return { ok: false, error: storageErr.message }

  const now = new Date().toISOString()
  await db
    .from('fall_dokumente')
    .update({ geloescht_am: now })
    .eq('storage_path', storagePath)
    .is('geloescht_am', null)

  revalidatePath(`/gutachter/fall/${auftrag.fall_id}`)
  return { ok: true }
}

// ─── weiseGutachtenZurueck ────────────────────────────────────────────────────
//
// KB lehnt das eingereichte Gutachten ab und fordert Nachbesserung.
// - status bleibt 'gutachten'
// - gutachten_final_freigegeben bleibt false
// - gutachten_url bleibt erhalten (SV soll sehen was er hochgeladen hatte)
// - zurueckgewiesen_am + grund gesetzt
// - Mitteilung + Timeline-Eintrag + Task für SV

export async function weiseGutachtenZurueck(
  auftragId: string,
  grund: string,
  abgelehnteDoks?: { id: string; kommentar?: string }[],
): Promise<{ ok: boolean; error?: string }> {
  if (!grund?.trim()) return { ok: false, error: 'Begründung ist Pflicht' }

  const auth = await getKbOrAdmin()
  if ('error' in auth) return { ok: false, error: auth.error }

  const db = createAdminClient()

  const { data: auftrag } = await db
    .from('auftraege')
    .select('id, fall_id, sv_id, gutachten_url, gutachten_final_freigegeben')
    .eq('id', auftragId)
    .maybeSingle()
  if (!auftrag) return { ok: false, error: 'Auftrag nicht gefunden' }
  if (auftrag.gutachten_final_freigegeben) {
    return { ok: false, error: 'Auftrag ist bereits final freigegeben' }
  }
  if (!auftrag.gutachten_url) {
    return { ok: false, error: 'Kein Gutachten zum Zurückweisen' }
  }

  const now = new Date().toISOString()

  const { error: aErr } = await db
    .from('auftraege')
    .update({
      zurueckweisung_grund: grund.trim(),
      zurueckgewiesen_am: now,
    })
    .eq('id', auftragId)
  if (aErr) return { ok: false, error: aErr.message }

  // CMM-32e: Nur die explizit markierten Dokumente als abgelehnt kennzeichnen.
  // Ohne Auswahl (abgelehnteDoks leer/undefined) bleibt kein Dokument versteckt —
  // der allgemeine Grund reicht dann als Hinweis an den SV.
  if (abgelehnteDoks && abgelehnteDoks.length > 0) {
    for (const dok of abgelehnteDoks) {
      await db
        .from('fall_dokumente')
        .update({
          abgelehnt_am: now,
          zurueckweisung_kommentar: dok.kommentar?.trim() || null,
        })
        .eq('id', dok.id)
        .is('geloescht_am', null)
    }
  }

  // Mitteilung an den SV
  try {
    const { createGutachterMitteilung } = await import('@/lib/mitteilungen')
    await createGutachterMitteilung(auftrag.sv_id as string, 'qc_nachbesserung', null, {
      grund: grund.trim(),
      kommentar: auth.name,
    })
  } catch (err) {
    console.warn('[weiseGutachtenZurueck] Mitteilung fehlgeschlagen:', err)
  }

  // Timeline-Eintrag (KB+SV+Admin sehen, Kunde nicht)
  try {
    await db.from('timeline').insert({
      fall_id: auftrag.fall_id,
      typ: 'qc_zurueckgewiesen',
      titel: 'Gutachten zurückgewiesen',
      beschreibung: `${auth.name}: ${grund.trim()}`,
      erstellt_von: auth.user.id,
    })
  } catch (err) {
    console.warn('[weiseGutachtenZurueck] Timeline fehlgeschlagen:', err)
  }

  // Task für SV
  try {
    const fristIso = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    await db.from('tasks').insert({
      fall_id: auftrag.fall_id,
      task_typ: 'gutachten-korrigieren',
      typ: 'gutachten-korrigieren',
      titel: 'Gutachten korrigieren',
      beschreibung: grund.trim(),
      status: 'offen',
      prioritaet: 'dringend',
      empfaenger_rolle: 'gutachter',
      faellig_am: fristIso,
      auto_erstellt: true,
    })
  } catch (err) {
    console.warn('[weiseGutachtenZurueck] Task fehlgeschlagen:', err)
  }

  revalidatePath(`/faelle/${auftrag.fall_id}`)
  revalidatePath(`/gutachter/fall/${auftrag.fall_id}`)
  revalidatePath(`/kunde/faelle/${auftrag.fall_id}`)
  return { ok: true }
}
