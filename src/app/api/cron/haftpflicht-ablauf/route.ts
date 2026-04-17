import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createLinkedTask } from '@/lib/tasks/create-task'

export const dynamic = 'force-dynamic'

/**
 * AAR-389: Haftpflicht-Ablauf-Tracking Cron.
 *
 * Schedule (vercel.json): 0 9 * * * — täglich 09:00 UTC.
 * Auth: Authorization: Bearer ${CRON_SECRET}.
 *
 * Prüft alle pflichtdokumente mit gueltig_bis IS NOT NULL und
 * dokument_typ='sv_berufshaftpflicht' (+ verknüpftem gutachter_id).
 * Legt pro Stufe (-30 / -14 / -7 / 0 Tage) genau einen Auto-Task
 * für den SV an. Doppel-Schutz über task_code + entity_id (das
 * pflichtdokument selbst) + status != 'erledigt'.
 *
 * Die bestehende AAR-430 Reminder-Kaskade (createLinkedTask →
 * generateReminderForTask) aktiviert automatisch Email/WhatsApp
 * auf Basis von faellig_am.
 */

type Stufe = { code: string; tageVorAblauf: number; prioritaet: 'normal' | 'dringend' | 'kritisch' }

const STUFEN: Stufe[] = [
  { code: 'hpfl-ablauf-30', tageVorAblauf: 30, prioritaet: 'normal' },
  { code: 'hpfl-ablauf-14', tageVorAblauf: 14, prioritaet: 'normal' },
  { code: 'hpfl-ablauf-7', tageVorAblauf: 7, prioritaet: 'dringend' },
  { code: 'hpfl-ablauf-0', tageVorAblauf: 0, prioritaet: 'kritisch' },
]

// Betroffene Dokument-Typen: primär Berufshaftpflicht. Weitere Fristen-
// Dokumente können hier bei Bedarf ergänzt werden (z. B. Gewerbeanmeldung).
const BETROFFENE_TYPEN = ['sv_berufshaftpflicht']

function formatDE(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear()
  return `${dd}.${mm}.${yyyy}`
}

/** Stufe auswählen, deren Fenster [tage-1 .. tage] aktuell passt. */
function bestimmeStufe(tageBisAblauf: number): Stufe | null {
  // Tage bis Ablauf = floor((gueltig_bis - today) / 24h).
  // Tag 0 = Ablauf erreicht oder überschritten.
  if (tageBisAblauf <= 0) return STUFEN.find(s => s.tageVorAblauf === 0) ?? null
  if (tageBisAblauf <= 7) return STUFEN.find(s => s.tageVorAblauf === 7) ?? null
  if (tageBisAblauf <= 14) return STUFEN.find(s => s.tageVorAblauf === 14) ?? null
  if (tageBisAblauf <= 30) return STUFEN.find(s => s.tageVorAblauf === 30) ?? null
  return null
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const heute = new Date()
  heute.setUTCHours(0, 0, 0, 0)

  // Nur Dokumente mit gueltig_bis und relevantem Typ + SV-Zuordnung
  const { data: docs, error } = await db
    .from('pflichtdokumente')
    .select('id, dokument_typ, gueltig_bis, gutachter_id')
    .in('dokument_typ', BETROFFENE_TYPEN)
    .not('gueltig_bis', 'is', null)
    .not('gutachter_id', 'is', null)

  if (error) {
    console.error('[AAR-389] Query-Fehler:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!docs?.length) {
    return NextResponse.json({ ok: true, checked: 0, tasksErstellt: 0 })
  }

  let tasksErstellt = 0
  let uebersprungen = 0

  for (const doc of docs) {
    if (!doc.gueltig_bis || !doc.gutachter_id) continue

    const ablaufDatum = new Date(doc.gueltig_bis + 'T00:00:00Z')
    const tageBisAblauf = Math.floor(
      (ablaufDatum.getTime() - heute.getTime()) / (1000 * 60 * 60 * 24),
    )

    const stufe = bestimmeStufe(tageBisAblauf)
    if (!stufe) continue // zu weit in der Zukunft oder zu weit abgelaufen

    // Doppel-Task-Schutz: ein Task pro Dokument pro Stufe, solange offen
    const { data: bestehend } = await db
      .from('tasks')
      .select('id')
      .eq('task_code', stufe.code)
      .eq('entity_type', 'gutachter')
      .eq('entity_id', doc.id)
      .neq('status', 'erledigt')
      .limit(1)
      .maybeSingle()

    if (bestehend) {
      uebersprungen++
      continue
    }

    // SV → profile_id laden (Task zugewiesen_an = profile)
    const { data: sv } = await db
      .from('sachverstaendige')
      .select('id, profile_id')
      .eq('id', doc.gutachter_id)
      .maybeSingle()

    if (!sv?.profile_id) {
      uebersprungen++
      continue
    }

    const ablaufText = formatDE(ablaufDatum)
    const titel = tageBisAblauf <= 0
      ? `Berufshaftpflicht abgelaufen (${ablaufText})`
      : `Berufshaftpflicht läuft ab: noch ${tageBisAblauf} Tage`
    const beschreibung = tageBisAblauf <= 0
      ? `Ihre Berufshaftpflicht ist am ${ablaufText} abgelaufen. Bitte umgehend eine neue Police hochladen.`
      : `Ihre Berufshaftpflicht läuft am ${ablaufText} ab. Bitte neue Police hochladen.`

    // faellig_am = Ablaufdatum selbst (AAR-430 Reminder-Kaskade
    // versendet Email/WhatsApp automatisch basierend darauf).
    const faelligAm = ablaufDatum

    await createLinkedTask({
      titel,
      beschreibung,
      typ: 'haftpflicht-ablauf',
      task_code: stufe.code,
      prioritaet: stufe.prioritaet,
      faellig_am: faelligAm,
      zugewiesen_an: sv.profile_id,
      empfaenger_rolle: 'sachverstaendiger',
      empfaenger_user_id: sv.profile_id,
      entity_type: 'gutachter',
      entity_id: doc.id,
      trigger_event: 'haftpflicht_ablauf_reminder',
    })

    tasksErstellt++
  }

  console.log(
    `[AAR-389] haftpflicht-ablauf: ${docs.length} Dokumente geprüft, ${tasksErstellt} Tasks erstellt, ${uebersprungen} übersprungen.`,
  )

  return NextResponse.json({
    ok: true,
    checked: docs.length,
    tasksErstellt,
    uebersprungen,
  })
}
