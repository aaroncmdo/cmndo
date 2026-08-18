// Write-Path-Audit (28.06.): KEINE 'use server'-Direktive. ablehnTermin ist eine
// INTERNE Lib-Funktion (createAdminClient → RLS-Bypass, deaktiviert SVs, Auto-Dispatch).
// Mit 'use server' war sie als eigenständiger Endpoint HTTP-exponiert → jeder konnte mit
// beliebiger terminId Termine ablehnen + SVs deaktivieren. Der einzige Aufrufer
// (gutachter/kalender/actions.ts → ablehnTerminAction) prüft Login + SV-Ownership und
// importiert diese Funktion regulär — daher ist sie hier bewusst ohne 'use server'.
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * KFZ-192: SV lehnt einen Termin ab. INTERNE Funktion — Autorisierung MUSS beim
 * Aufrufer erfolgen (siehe ablehnTerminAction: Login + assignee_id-Ownership).
 * Prüft 24h-Fenster (final_verbindlich_ab), setzt status='abgelehnt',
 * inkrementiert ablehnungen_30_tage, erstellt Admin-Task.
 */
export async function ablehnTermin(terminId: string, grund: string) {
  const db = createAdminClient()

  // Termin laden
  const { data: termin, error: terminErr } = await db
    .from('gutachter_termine')
    .select('id, fall_id, assignee_id, assignee_typ, final_verbindlich_ab, status')
    .eq('id', terminId)
    .single()

  if (terminErr || !termin) throw new Error('Termin nicht gefunden')

  // 24h-Fenster prüfen
  if (
    termin.final_verbindlich_ab &&
    new Date(termin.final_verbindlich_ab as string) < new Date()
  ) {
    throw new Error('Termin bereits final verbindlich — Ablehnung nicht mehr möglich')
  }

  // Termin als abgelehnt markieren
  const { error: updateErr } = await db
    .from('gutachter_termine')
    .update({
      status: 'abgelehnt',
      sv_ablehnung_grund: grund || null,
      sv_ablehnung_am: new Date().toISOString(),
    })
    .eq('id', terminId)

  if (updateErr) throw new Error(`Termin-Update fehlgeschlagen: ${updateErr.message}`)

  // ablehnungen_30_tage inkrementieren + Ablehnquote pruefen
  // CMM-49: assignee_id (typ-guarded) statt sv_id — Ablehnung ist immer SV-Aktion, value-identisch.
  const svId = termin.assignee_id as string
  const { data: sv, error: svErr } = await db
    .from('sachverstaendige')
    .select('ablehnungen_30_tage, ist_aktiv, profile_id')
    .eq('id', svId)
    .single()

  if (!svErr && sv) {
    const neueAnzahl = (sv.ablehnungen_30_tage ?? 0) + 1
    // Der Zaehler treibt die Quote unten. Bleibt er stehen, wird die Schwelle nie erreicht.
    const { error: zaehlerFehler } = await db
      .from('sachverstaendige')
      .update({ ablehnungen_30_tage: neueAnzahl })
      .eq('id', svId)
    if (zaehlerFehler) {
      console.error(`[ablehnTermin] Ablehnungs-Zaehler nicht erhoeht (SV ${svId}):`, zaehlerFehler.message)
    }

    // Ablehnquote-Check: Termine der letzten 30 Tage zaehlen
    const dreissigTageHer = new Date(Date.now() - 30 * 86400_000).toISOString()
    const { count: termineCount } = await db
      .from('gutachter_termine')
      .select('*', { count: 'exact', head: true })
      .eq('assignee_id', svId)
      .eq('assignee_typ', 'sachverstaendiger')
      .gte('created_at', dreissigTageHer)

    const quote = (termineCount && termineCount > 0) ? (neueAnzahl / termineCount) * 100 : 0

    // >20%: SV auto-deaktivieren + Admin-Task
    if (quote > 20 && sv.ist_aktiv !== false) {
      const { error: deaktivierFehler } = await db.from('sachverstaendige').update({ ist_aktiv: false }).eq('id', svId)
      if (deaktivierFehler) {
        console.error(`[ablehnTermin] SV-Deaktivierung fehlgeschlagen (${svId}):`, deaktivierFehler.message)
      }
      // Dieser Task ist der EINZIGE Hinweis auf die automatische Deaktivierung. Geht er
      // verloren, bekommt der SV keine Auftraege mehr und niemand weiss, warum.
      const { error: taskFehler } = await db.from('tasks').insert({
        titel: 'SV wegen hoher Ablehnquote automatisch deaktiviert',
        beschreibung: `Ablehnquote: ${quote.toFixed(1)}% (${neueAnzahl}/${termineCount}). SV wurde automatisch auf inaktiv gesetzt. Manuelle Klärung nötig.`,
        typ: 'sv_ablehnquote', status: 'offen', prioritaet: 'dringend', auto_erstellt: true,
      })
      if (taskFehler) {
        console.error(`[ablehnTermin] Deaktivierungs-Task NICHT erstellt (SV ${svId} ist inaktiv, ohne Hinweis):`, taskFehler.message)
      }
    }
    // >10%: Warning-Task
    else if (quote > 10) {
      const { error: warnTaskFehler } = await db.from('tasks').insert({
        titel: 'SV hat hohe Ablehnquote — Klärung empfohlen',
        beschreibung: `Ablehnquote: ${quote.toFixed(1)}% (${neueAnzahl}/${termineCount}).`,
        // tasks_prioritaet_check: 'mittel' existiert nicht (normal|dringend|kritisch) -> normal.
        typ: 'sv_ablehnquote', status: 'offen', prioritaet: 'normal', auto_erstellt: true,
      })
      if (warnTaskFehler) {
        console.error(`[ablehnTermin] Warn-Task nicht erstellt (SV ${svId}):`, warnTaskFehler.message)
      }
    }
  }

  // Admin-Task fuer SV-Replacement
  const { error: taskErr } = await db.from('tasks').insert({
    fall_id: termin.fall_id,
    titel: 'SV hat Termin abgelehnt — alternativen SV finden',
    beschreibung: grund ? `Ablehnungsgrund: ${grund}` : 'Kein Grund angegeben.',
    typ: 'sv_ablehnung',
    status: 'offen',
    prioritaet: 'dringend',
    auto_erstellt: true,
    faellig_am: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  })

  if (taskErr) console.error('[ablehnTermin] Task-Insert:', taskErr.message)

  // Timeline-Eintrag
  await db.from('timeline').insert({
    fall_id: termin.fall_id,
    typ: 'termin',
    titel: 'SV hat Termin abgelehnt',
    beschreibung: grund
      ? `Ablehnungsgrund: ${grund}`
      : 'SV hat Termin ohne Angabe von Gründen abgelehnt.',
  })

  // Auto-Dispatch: versuche neuen SV im gleichen Zeitslot zu finden
  try {
    // CMM-49: der Read war reiner Existenz-/id-Passthrough (fall.id == termin.fall_id,
    // wird nur als fall_id weitergereicht) -> termin.fall_id direkt, kein faelle-Read.
    const fallId = termin.fall_id as string | null
    if (fallId) {
      // Trigger SV-Zuweisung API intern (gleicher Zeitslot)
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.claimondo.de'
      const resp = await fetch(`${appUrl}/api/sv-zuweisung`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.CRON_SECRET}` },
        body: JSON.stringify({ fall_id: fallId }),
      })
      if (resp.ok) {
        const result = await resp.json()
        if (result.sv_id) {
          await db.from('timeline').insert({
            fall_id: fallId, typ: 'termin',
            titel: 'Neuer SV automatisch zugewiesen',
            beschreibung: `Nach Ablehnung wurde automatisch ein Ersatz-SV gefunden.`,
          })
        }
      }
    }
  } catch {
    // Auto-Dispatch fehlgeschlagen — Admin-Task existiert bereits
    console.error('[ablehnTermin] Auto-Dispatch fehlgeschlagen, Admin-Task wurde erstellt')
  }
}
