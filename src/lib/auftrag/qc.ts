'use server'

// CMM-32e: KB-QC-Aktionen.
// - gibKanzleipaketFrei: Final-Freigabe → Auftrag abgeschlossen + Kanzlei-Fall.
// - weiseGutachtenZurueck: Reject mit Begründung, Auftrag bleibt offen.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGutachterForUser } from '@/lib/gutachter'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { revalidatePath } from 'next/cache'
import { getStorageUrl } from '@/lib/storage/url'
import { kannGutachtenAbgeben } from './abgabe-berechtigung'
import { checkFallAutoPhase } from '@/lib/autoPhase'
import { brauchtKanzleiHandoff } from '@/lib/kanzlei/handoff-guard'

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
    .select('id, fall_id, sv_id, gutachten_url, gutachten_final_freigegeben, status')
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

  // Filmcheck-Audit 29.06.2026: operativen Kanzlei-Handoff ausloesen — die eigentliche
  // Lifecycle-Startung. gibKanzleipaketFrei schrieb bisher nur kanzlei_faelle + auftrag,
  // advancte aber operative_status NICHT -> die operative_status-gegateten Kanzlei-Portale
  // (mandate/kanban) sahen den Fall NIE + die Strecke (anschlussschreiben/regulierung)
  // startete nie. Jetzt identisch zu qcBestanden via saveFilmcheck. Idempotent via
  // brauchtKanzleiHandoff (kein Doppel-Handoff falls der KB auch QC-bestanden klickt).
  try {
    const handoffClaimId = await resolveClaimId(db, auftrag.fall_id as string)
    if (handoffClaimId) {
      const { data: handoffClaim } = await db
        .from('claims')
        .select('operative_status, service_typ')
        .eq('id', handoffClaimId)
        .maybeSingle()
      if (
        brauchtKanzleiHandoff(
          handoffClaim?.operative_status as string | null,
          handoffClaim?.service_typ as string | null,
        )
      ) {
        // gutachten-Signal sicherstellen (falls der Upload-Pfad es nicht setzte), bis
        // filmcheck cascaden, dann der Handoff filmcheck -> kanzlei-uebergeben (+ Mails/AS).
        if (auftrag.sv_id) {
          await db.from('gutachten').upsert(
            { claim_id: handoffClaimId, sv_id: auftrag.sv_id as string, fertiggestellt_am: new Date().toISOString() },
            { onConflict: 'claim_id' },
          )
        }
        await checkFallAutoPhase(auftrag.fall_id as string)
        const { saveFilmcheck } = await import('@/app/faelle/[id]/_actions/filmcheck')
        const handoffResult = await saveFilmcheck(auftrag.fall_id as string, '')
        // #3402-Follow-up: saveFilmcheck wirft nicht mehr (liefert { success:false } wenn der
        // Fall nach dem autoPhase-Lauf noch nicht im Filmcheck steht) -> der catch unten griffe
        // nicht mehr, ein abgelehnter Handoff waere sonst 100% stumm. Result nicht verschlucken.
        // Bewusst KEIN { ok:false }: die primaere Freigabe (auftrag abgeschlossen + kanzlei_faelle)
        // gilt, und die gutachten_final_freigegeben-Idempotenz oben wuerde einen Retry abkuerzen.
        // Der Handoff wird via QC-bestanden / autoPhase nachgeholt, sobald der Filmcheck steht.
        if (!handoffResult.success) {
          console.warn(
            `[gibKanzleipaketFrei] Kanzlei-Handoff nicht ausgeloest fuer fall ${auftrag.fall_id}: ${handoffResult.error ?? 'unbekannt'} (Freigabe/Auftrag dennoch gespeichert)`,
          )
        }
      }
    }
  } catch (err) {
    console.warn('[gibKanzleipaketFrei] operativer Kanzlei-Handoff fehlgeschlagen:', err)
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

  // Filmcheck-Audit 29.06.2026: Ownership-Gate — die Action advanced jetzt die Phase
  // (s.u.), darf also nicht mehr von jedem auth. User aufrufbar sein. Erlaubt: der SV
  // DIESES Auftrags + admin/KB.
  const { data: abgProfile } = await db.from('profiles').select('rolle').eq('id', user.id).maybeSingle()
  const abgRolle = (abgProfile?.rolle as string | null) ?? null
  let eigeneSvId: string | null = null
  if (abgRolle === 'sachverstaendiger') {
    // multi-standort-safe: getGutachterForUser (Ordering+limit(1)) statt .maybeSingle().
    const svRow = await getGutachterForUser<{ id: string }>(db, user.id, 'id')
    eigeneSvId = svRow?.id ?? null
  }
  if (!kannGutachtenAbgeben({ rolle: abgRolle, eigeneSvId, auftragSvId: auftrag.sv_id as string | null })) {
    return { ok: false, error: 'Keine Berechtigung' }
  }

  // Auftrag-zu-Claim-Pfad ermitteln
  const claimId = await resolveClaimId(db, auftrag.fall_id as string)
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

  // Filmcheck-Audit 29.06.2026: gutachten-Signal (fertiggestellt_am) setzen. Der CMM-32-
  // Abgabe-Pfad schrieb bisher NUR auftraege.gutachten_url/status -> checkFallAutoPhase
  // (keyed auf gutachten.fertiggestellt_am, autoPhase.ts) sah das Gutachten nie -> der
  // Claim advancte nicht -> filmcheck/Kanzlei-Strecke unerreichbar (Legacy uploadGutachten
  // setzt das Signal korrekt). Non-fatal: Reconcile-Cron (#3310) ist der Backstop.
  if (auftrag.sv_id) {
    const { error: gErr } = await db.from('gutachten').upsert(
      { claim_id: claimId, sv_id: auftrag.sv_id as string, fertiggestellt_am: new Date().toISOString() },
      { onConflict: 'claim_id' },
    )
    if (gErr) console.warn('[gutachtenAbgeben] gutachten-Signal (fertiggestellt_am) fehlgeschlagen:', gErr.message)
  }

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

    // Filmcheck-Audit 29.06.2026: Loop schliessen — beim korrigierten Re-Upload den
    // KB automatisch re-benachrichtigen (vorher nur Timeline -> KB musste pollen).
    // Frischer QC-Task (dedup via task_code, + Reminder-Kaskade) + Phase-Re-Derive.
    // Deckt BEIDE Reject-Pfade ab (weiseGutachtenZurueck + qcNachbesserung, die jetzt
    // beide auftraege.zurueckgewiesen_am setzen -> warReject feuert).
    try {
      const { data: claimRow } = await db
        .from('claims')
        .select('kundenbetreuer_id')
        .eq('id', claimId)
        .maybeSingle()
      const kbId = (claimRow?.kundenbetreuer_id as string | null) ?? null
      const { triggerQcTask } = await import('@/lib/tasking')
      await triggerQcTask(auftrag.fall_id as string, kbId)
    } catch (err) {
      console.warn('[gutachtenAbgeben] KB-Re-Arm nach Nachbesserung fehlgeschlagen:', err)
    }
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

  // OCR-Konsolidierung (Filmcheck #7 Phase 2c): OCR der WORKING-Pipeline (lib/ai/
  // gutachten-ocr) hier vorziehen. Bisher lief sie NUR via manuellem KB-Re-Run -> faktisch
  // nie automatisch; der AAR-838-Edge-Function-Pfad ist ein toter Skeleton (0 Caller,
  // engine_not_implemented). Idempotent (skip wenn schon verarbeitet); force=warReject bei
  // Nachbesserung (Gutachten geaendert). Fire-and-forget -> blockt die SV-Abgabe nicht.
  // Macht die OCR-Werte VOR der QC verfuegbar (Voraussetzung fuer die QC-Evidenz, Phase 3).
  import('@/lib/ai/gutachten-ocr')
    .then(({ extractGutachtenAndSaveToClaim }) => extractGutachtenAndSaveToClaim(auftragId, { force: warReject }))
    .catch((err) => console.warn('[gutachtenAbgeben] OCR-Vorzieh-Trigger fehlgeschlagen:', err))

  // Filmcheck-Audit 29.06.2026: Auto-Advance fuer ALLE Abgaben (fresh + Re-Submit) —
  // Cascade sv-termin -> begutachtung-laeuft -> gutachten-eingegangen -> (komplett)
  // filmcheck. Nutzt das oben gesetzte fertiggestellt_am-Signal. Awaited, damit der
  // revalidatePath den advancten Status sieht.
  await checkFallAutoPhase(auftrag.fall_id as string).catch(() => {})

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
    .select('id, fall_id, sv_id, gutachten_final_freigegeben')
    .eq('id', auftragId)
    .maybeSingle()
  if (!auftrag) return { ok: false, error: 'Auftrag nicht gefunden' }
  if (auftrag.gutachten_final_freigegeben) {
    return { ok: false, error: 'Auftrag ist bereits freigegeben' }
  }

  // Security (Write-Path-Audit 2026-07-01, F5): vorher genuegte ein beliebiger
  // eingeloggter User + irgendein nicht-finalisierter auftragId, um via frei
  // waehlbarem storagePath JEDE Datei im fall-dokumente-Bucket zu loeschen (+ Row
  // soft-deleten). Jetzt: (1) Rollen-/Ownership-Gate wie gutachtenAbgeben (SV DIESES
  // Auftrags ODER admin/KB), (2) storagePath muss an ein fall_dokumente-Row am fall des
  // Auftrags gebunden sein. Siehe docs/2026-07-01-claim-write-path-authorization-audit.md.
  const { data: berProfile } = await db.from('profiles').select('rolle').eq('id', user.id).maybeSingle()
  const berRolle = (berProfile?.rolle as string | null) ?? null
  let eigeneSvId: string | null = null
  if (berRolle === 'sachverstaendiger') {
    // multi-standort-safe: getGutachterForUser (Ordering+limit(1)) statt .maybeSingle().
    const svRow = await getGutachterForUser<{ id: string }>(db, user.id, 'id')
    eigeneSvId = svRow?.id ?? null
  }
  if (!kannGutachtenAbgeben({ rolle: berRolle, eigeneSvId, auftragSvId: auftrag.sv_id as string | null })) {
    return { ok: false, error: 'Keine Berechtigung' }
  }

  // storagePath an den fall des Auftrags binden — sonst koennte ein berechtigter SV
  // ueber einen fremden storagePath Objekte anderer Faelle loeschen.
  const { data: dok } = await db
    .from('fall_dokumente')
    .select('id')
    .eq('storage_path', storagePath)
    .eq('fall_id', auftrag.fall_id)
    .is('geloescht_am', null)
    .maybeSingle()
  if (!dok) return { ok: false, error: 'Dokument gehoert nicht zu diesem Auftrag' }

  const { error: storageErr } = await db.storage
    .from('fall-dokumente')
    .remove([storagePath])
  if (storageErr) return { ok: false, error: storageErr.message }

  const now = new Date().toISOString()
  // Die Datei ist im Storage bereits geloescht. Schlaegt diese Markierung still fehl,
  // bleibt der DB-Eintrag stehen und zeigt auf eine Datei, die es nicht mehr gibt.
  const { error: loeschMarkFehler } = await db
    .from('fall_dokumente')
    .update({ geloescht_am: now })
    .eq('id', dok.id)
  if (loeschMarkFehler) {
    console.error(`[qc] Loesch-Markierung fehlgeschlagen (dok ${dok.id}) — Eintrag zeigt ins Leere:`, loeschMarkFehler.message)
  }

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
      const { error: ablehnFehler } = await db
        .from('fall_dokumente')
        .update({
          abgelehnt_am: now,
          zurueckweisung_kommentar: dok.kommentar?.trim() || null,
        })
        .eq('id', dok.id)
        .is('geloescht_am', null)
      // Ohne die Markierung sieht der SV nicht, WELCHES Dokument beanstandet wurde —
      // er bekommt nur den allgemeinen Zurueckweisungsgrund.
      if (ablehnFehler) {
        console.error(`[qc] Dokument-Ablehnung nicht vermerkt (dok ${dok.id}):`, ablehnFehler.message)
      }
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
    const { error: korrekturTaskFehler } = await db.from('tasks').insert({
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
    // Das umgebende try faengt hier NICHTS: supabase-js wirft nicht. Ohne diesen
    // Task erfaehrt der SV nie, dass er sein Gutachten korrigieren soll — die
    // Zurueckweisung verpufft.
    if (korrekturTaskFehler) {
      console.error(`[qc] Korrektur-Task NICHT angelegt (fall ${auftrag.fall_id}):`, korrekturTaskFehler.message)
    }
  } catch (err) {
    console.warn('[weiseGutachtenZurueck] Task fehlgeschlagen:', err)
  }

  revalidatePath(`/faelle/${auftrag.fall_id}`)
  revalidatePath(`/gutachter/fall/${auftrag.fall_id}`)
  revalidatePath(`/kunde/faelle/${auftrag.fall_id}`)
  return { ok: true }
}
