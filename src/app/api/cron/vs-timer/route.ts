import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { enqueue, buildDedupKey } from '@/lib/notifications/outbox'
import { upsertKanzleiFall } from '@/lib/kanzlei-fall/upsert-kanzlei-fall'

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

// KFZ-207: WA-Template je Eskalationsstufe — deckungsgleich mit den drei Stufen,
// die oben whatsapp:true tragen (vs-03/04/05). Ersetzt die frueheren drei
// if-Zweige im Send-Block (identische Logik, eine Quelle).
const ESKALATION_TEMPLATES: Record<string, string> = {
  'vs-03': 'eskalation_tag14',
  'vs-04': 'eskalation_tag21',
  'vs-05': 'eskalation_tag28',
}

/**
 * Cron-Route: Prueft alle Faelle mit AS-Datum und aktualisiert die Eskalationsstufe.
 * Aufgerufen taeglich per Vercel Cron.
 */
export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  let updated = 0

  // CMM-47 A.3: faelle → v_claim_full (Sync-Trigger garantiert kundenbetreuer_id-Konsistenz).
  // fall_id statt id, fall_status statt status; anschlussschreiben_am +
  // vs_eskalationsstufe sind seit Migration 20260515095400 in der View.
  const { data: faelle } = await supabase
    .from('v_claim_full')
    // CMM-44 SP-I3: id (= claim_id) fuer den kanzlei_faelle-Write der Eskalationsstufe.
    .select('id, fall_id, anschlussschreiben_am, vs_eskalationsstufe, kundenbetreuer_id, claim_nummer')
    .not('anschlussschreiben_am', 'is', null)
    .neq('main_phase', 'abschluss')

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

    // CMM-44 SP-I3: vs_eskalationsstufe lebt auf kanzlei_faelle (1:1 per Claim). Die
    // persistierte Stufe GATED die Seiteneffekte: schlaegt der Write fehl, wird NICHT
    // eskaliert — sonst geht die WhatsApp (inkl. Klageankuendigung tag28) raus, aber
    // vs_eskalationsstufe bleibt alt (Skip-Guard oben haengt daran) -> naechster Lauf
    // feuert dieselbe Eskalation erneut = Doppel-Drohung an den Kunden. Retry naechster Lauf.
    const kfRes = await upsertKanzleiFall(supabase, (fall.id as string | null) ?? null, { vs_eskalationsstufe: neueStufe })
    if (!kfRes.ok) {
      console.error('[vs-timer] kanzlei_faelle vs_eskalationsstufe-Write fehlgeschlagen, Fall übersprungen:', kfRes.error)
      continue
    }

    // Get the stufe definition
    const stufeDef = STUFEN.find(s => s.key === neueStufe)
    if (!stufeDef) continue

    // Create task for Kundenbetreuer
    if (stufeDef.taskTyp) {
      const { error: eskalationsTaskFehler } = await supabase.from('tasks').insert({
        fall_id: fall.fall_id as string,
        typ: stufeDef.taskTyp,
        titel: stufeDef.taskTitel,
        beschreibung: `Eskalationsstufe ${neueStufe}: ${stufeDef.titel}. Fall ${fall.claim_nummer ?? (fall.fall_id as string).slice(0, 8)}, Tag ${tage} seit AS.`,
        status: 'offen',
        zugewiesen_an: fall.kundenbetreuer_id || null,
      })
      // Die Eskalationsstufe ist damit erreicht — ohne Task merkt es niemand,
      // und der Fall laeuft weiter, ohne dass jemand nachfasst.
      if (eskalationsTaskFehler) {
        console.error(
          `[vs-timer] Eskalations-Task ${neueStufe} NICHT angelegt (fall ${fall.fall_id}):`,
          eskalationsTaskFehler.message,
        )
      }
    }

    // Timeline entry
    await supabase.from('timeline').insert({
      fall_id: fall.fall_id as string,
      typ: 'system',
      titel: `VS-Eskalation: ${neueStufe.toUpperCase()}`,
      beschreibung: `${stufeDef.titel} (Tag ${tage} seit AS).`,
    })

    // KFZ-207: WhatsApp bei vs-03 (Tag 14), vs-04 (Tag 21), vs-05 (Tag 28).
    // C3a: durable via Notification-Outbox statt fire-and-forget .catch(() => {}).
    // Bisher verschluckte ein Twilio-Aussetzer die Eskalations-WA SPURLOS — und weil
    // vs_eskalationsstufe oben bereits geschrieben ist, greift der Skip-Guard (Z.64)
    // beim naechsten Lauf, es gab also nie einen zweiten Versuch. Jetzt: Retry-Backoff
    // + Dead-Letter-Task. dedupKey = template:claimId -> pro Fall und Stufe genau EIN
    // Versand; haertet zusaetzlich die oben beschriebene Doppel-Drohungs-Sorge ab.
    const eskalationsTemplate = ESKALATION_TEMPLATES[neueStufe]
    if (stufeDef.whatsapp && eskalationsTemplate) {
      const eskalationsClaimId = fall.fall_id as string
      await enqueue({
        dedupKey: buildDedupKey({ template: eskalationsTemplate, claimId: eskalationsClaimId }),
        kanal: 'whatsapp',
        template: eskalationsTemplate,
        claimId: eskalationsClaimId,
      }).catch(() => {})
    }

    updated++
  }

  return NextResponse.json({
    ok: true,
    updated,
    checked_at: new Date().toISOString(),
  })
}
