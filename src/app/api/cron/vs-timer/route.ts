import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendFallCommunication } from '@/lib/communications/send-fall'

type Stufe = {
  key: string
  tage: number
  titel: string
  taskTyp: string
  taskTitel: string
  whatsapp: boolean
}

// KFZ-207: Eskalation korrigiert auf 14-21-28 Tage (Tag 42 entfernt)
const STUFEN: Stufe[] = [
  { key: 'vs-01', tage: 0,  titel: 'AS gesendet',                           taskTyp: '',                        taskTitel: '',                                          whatsapp: false },
  { key: 'vs-02', tage: 7,  titel: 'Schriftliche Erinnerung',               taskTyp: 'versicherung-kontakt',    taskTitel: 'Schriftliche Erinnerung an Versicherung',   whatsapp: false },
  { key: 'vs-03', tage: 14, titel: 'Frist abgelaufen – Nachfrage senden',   taskTyp: 'versicherung-kontakt',    taskTitel: 'VS-Frist abgelaufen: Nachfrage senden',     whatsapp: true  },
  { key: 'vs-04', tage: 21, titel: 'Telefonische Direktanfrage',            taskTyp: 'versicherung-kontakt',    taskTitel: 'Versicherung anrufen (Pflicht!)',            whatsapp: true  },
  { key: 'vs-05', tage: 28, titel: 'Mahnung mit Verzugszinsen + Klageankuendigung', taskTyp: 'versicherung-kontakt', taskTitel: 'Mahnung + Klageankuendigung senden',  whatsapp: true  },
  { key: 'vs-06', tage: 60, titel: 'Klage eingereicht',                     taskTyp: 'versicherung-kontakt',    taskTitel: 'Klage eingereicht – Dokumentation',         whatsapp: false },
]

/**
 * Cron-Route: Prueft alle Faelle mit AS-Datum und aktualisiert die Eskalationsstufe.
 * Aufgerufen taeglich per Vercel Cron.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  let updated = 0

  // CMM-47 A.3: faelle → v_claim_full (Sync-Trigger garantiert kundenbetreuer_id-Konsistenz).
  // fall_id statt id, fall_status statt status; anschlussschreiben_am +
  // vs_eskalationsstufe sind seit Migration 20260515095400 in der View.
  const { data: faelle } = await supabase
    .from('v_claim_full')
    .select('fall_id, anschlussschreiben_am, vs_eskalationsstufe, kundenbetreuer_id, fall_nummer')
    .not('anschlussschreiben_am', 'is', null)
    .not('fall_status', 'in', '("abgeschlossen","storniert")')

  for (const fall of faelle ?? []) {
    if (!fall.anschlussschreiben_am) continue

    const asDate = new Date(fall.anschlussschreiben_am)
    const now = new Date()
    const tage = Math.floor((now.getTime() - asDate.getTime()) / (1000 * 60 * 60 * 24))

    // Determine the correct escalation level based on days
    let neueStufe = 'vs-01'
    for (const stufe of STUFEN) {
      if (tage >= stufe.tage) {
        neueStufe = stufe.key
      }
    }

    // Skip if no change
    if (neueStufe === (fall.vs_eskalationsstufe ?? 'vs-01')) continue

    // Update escalation level (Write bleibt auf faelle — Workflow-Spalte)
    await supabase
      .from('faelle')
      .update({ vs_eskalationsstufe: neueStufe })
      .eq('id', fall.fall_id as string)

    // Get the stufe definition
    const stufeDef = STUFEN.find(s => s.key === neueStufe)
    if (!stufeDef) continue

    // Create task for Kundenbetreuer
    if (stufeDef.taskTyp) {
      await supabase.from('tasks').insert({
        fall_id: fall.fall_id as string,
        typ: stufeDef.taskTyp,
        titel: stufeDef.taskTitel,
        beschreibung: `Eskalationsstufe ${neueStufe}: ${stufeDef.titel}. Fall ${fall.fall_nummer ?? (fall.fall_id as string).slice(0, 8)}, Tag ${tage} seit AS.`,
        status: 'offen',
        zugewiesen_an: fall.kundenbetreuer_id || null,
      })
    }

    // Timeline entry
    await supabase.from('timeline').insert({
      fall_id: fall.fall_id as string,
      typ: 'system',
      titel: `VS-Eskalation: ${neueStufe.toUpperCase()}`,
      beschreibung: `${stufeDef.titel} (Tag ${tage} seit AS).`,
    })

    // KFZ-207: WhatsApp bei vs-03 (Tag 14), vs-04 (Tag 21), vs-05 (Tag 28)
    if (stufeDef.whatsapp) {
      if (neueStufe === 'vs-03') {
        sendFallCommunication(fall.fall_id as string, 'eskalation_tag14').catch(() => {})
      }
      if (neueStufe === 'vs-04') {
        sendFallCommunication(fall.fall_id as string, 'eskalation_tag21').catch(() => {})
      }
      if (neueStufe === 'vs-05') {
        sendFallCommunication(fall.fall_id as string, 'eskalation_tag28').catch(() => {})
      }
    }

    updated++
  }

  return NextResponse.json({
    ok: true,
    updated,
    checked_at: new Date().toISOString(),
  })
}
