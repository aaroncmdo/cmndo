import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPflichtDokumenteFuerFall, type Phase, type Szenario } from '@/lib/dokumente/pflicht-dokumente'

// KFZ-172 Phase 4: Pflichtdokumente-Reminder Cron.
// Laeuft alle 4 Stunden (0 */4 * * *).
// Pro Fall mit aktuelle_phase + szenario:
// - Berechnet fehlende Pflicht-Dokumente
// - Wenn fehlt > 0 UND > 24h ohne Bewegung: erstellt Task
// - Wenn fehlt = 0: setzt dokumente_vollstaendig + erstellt Folge-Task

const FOLGE_TASKS: Record<string, { titel: string; task_code: string; empfaenger_rolle: string }> = {
  aufnahme: { titel: 'Termin koordinieren', task_code: 'termin-vereinbaren', empfaenger_rolle: 'kundenbetreuer' },
  termin: { titel: 'Gutachten erstellen', task_code: 'gutachten-erstellen', empfaenger_rolle: 'sachverstaendiger' },
  nach_termin: { titel: 'An Versicherer/Kanzlei schicken', task_code: 'kanzlei-anschlussschreiben', empfaenger_rolle: 'kundenbetreuer' },
  abrechnung: { titel: 'Fall abschließen', task_code: 'fall-abschliessen', empfaenger_rolle: 'kundenbetreuer' },
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const now = new Date()
  const vor24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

  // CMM-47 A.2: faelle → v_claim_full (Sync-Trigger garantiert kundenbetreuer_id-Konsistenz).
  // fall_id statt id, fall_status statt status, fall_updated_at statt updated_at.
  const { data: faelle } = await db
    .from('v_claim_full')
    .select('fall_id, fall_nummer, aktuelle_phase, szenario, dokumente_vollstaendig_fuer_phase, kundenbetreuer_id, sv_id, fall_updated_at, dokumente_reminder_whatsapp_letzte_sendung')
    .not('aktuelle_phase', 'is', null)
    .not('szenario', 'is', null)
    .not('fall_status', 'in', '("abgeschlossen","storniert")')

  if (!faelle?.length) {
    return NextResponse.json({ checked: 0, reminders: 0, completed: 0 })
  }

  let reminders = 0
  let completed = 0

  for (const fall of faelle) {
    const phase = fall.aktuelle_phase as Phase
    const szenario = fall.szenario as Szenario

    // Pflicht-Dokumente berechnen
    const pflicht = getPflichtDokumenteFuerFall(phase, szenario)
    if (pflicht.length === 0) continue

    // Vorhandene fall_dokumente laden
    const { data: vorhandene } = await db
      .from('fall_dokumente')
      .select('dokument_typ')
      .eq('fall_id', fall.fall_id as string)
      .is('geloescht_am', null)

    const vorhandeneTypen = new Set((vorhandene ?? []).map(d => d.dokument_typ))
    const fehlend = pflicht.filter(p => !vorhandeneTypen.has(p.typ))

    if (fehlend.length > 0) {
      // Bereits vollstaendig fuer aktuelle Phase? Nein, denn fehlend > 0.
      // > 24h ohne Bewegung?
      if (fall.fall_updated_at && fall.fall_updated_at < vor24h) {
        // Duplikat-Check: existiert bereits ein offener Task fuer diese Kombination?
        const { count: existing } = await db
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('fall_id', fall.fall_id as string)
          .eq('task_code', 'dokument-hochladen')
          .eq('phase', phase)
          .neq('status', 'erledigt')

        if (!existing || existing === 0) {
          const fehlendListe = fehlend.map(f => f.label).join(', ')
          await db.from('tasks').insert({
            fall_id: fall.fall_id as string,
            typ: 'action',
            titel: `Fehlende Dokumente: ${fehlendListe}`,
            beschreibung: `Fall ${fall.fall_nummer ?? (fall.fall_id as string).slice(0, 8)} Phase '${phase}': ${fehlend.length} Pflichtdokument(e) fehlen noch — ${fehlendListe}`,
            status: 'offen',
            task_code: 'dokument-hochladen',
            phase,
            auto_erstellt: true,
            prioritaet: 'mittel',
            faellig_am: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
            empfaenger_rolle: phase === 'termin' ? 'sachverstaendiger' : 'kundenbetreuer',
            empfaenger_user_id: phase === 'termin' ? fall.sv_id : fall.kundenbetreuer_id,
          })
          reminders++

          // KFZ-181 Trigger 26: WhatsApp an Kunden (max alle 48h)
          const vor48h = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString()
          const letzteSendung = (fall as Record<string, unknown>).dokumente_reminder_whatsapp_letzte_sendung as string | null
          // AAR-390: Gnadenfrist — wenn der Kunde innerhalb der letzten 48h
          // aktiv einen Pflicht-Slot auf „später nachreichen" gesetzt hat,
          // überspringen wir die Kunden-WA (Task für KB/SV läuft weiter).
          const { data: snoozed } = await db
            .from('pflichtdokumente')
            .select('id')
            .eq('fall_id', fall.fall_id as string)
            .eq('pflicht', true)
            .not('spaeter_nachreichen_markiert_am', 'is', null)
            .gt('spaeter_nachreichen_markiert_am', vor48h)
            .limit(1)
          const hatKuerzlichGesnoozed = !!snoozed && snoozed.length > 0
          if (!hatKuerzlichGesnoozed && (!letzteSendung || letzteSendung < vor48h)) {
            // Kunden-Telefon laden (Read auf faelle bleibt — single-row Re-Lookup für lead_id)
            const { data: fallFull } = await db.from('faelle').select('lead_id').eq('id', fall.fall_id as string).single()
            if (fallFull?.lead_id) {
              const { data: lead } = await db.from('leads').select('vorname, telefon').eq('id', fallFull.lead_id).single()
              if (lead?.telefon) {
                const { sendCommunication } = await import('@/lib/communications/send')
                const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://cmndo.vercel.app'
                await sendCommunication('dokumente_nachreichen', {
                  telefon: lead.telefon,
                  vorname: lead.vorname ?? 'Kunde',
                  '1': lead.vorname ?? 'Kunde',
                  '2': fehlendListe,
                  '3': `${appUrl}/kunde`,
                }).catch(() => {})
                await db.from('faelle').update({ dokumente_reminder_whatsapp_letzte_sendung: now.toISOString() }).eq('id', fall.fall_id as string)
              }
            }
          }
        }
      }
    } else {
      // Alle Pflicht-Dokumente vorhanden!
      if (fall.dokumente_vollstaendig_fuer_phase !== phase) {
        await db
          .from('faelle')
          .update({
            dokumente_vollstaendig_fuer_phase: phase,
            dokumente_vollstaendig_am_phase: now.toISOString(),
          })
          .eq('id', fall.fall_id as string)

        // Folge-Task erstellen (falls fuer diese Phase definiert)
        const folge = FOLGE_TASKS[phase]
        if (folge) {
          const { count: existingFolge } = await db
            .from('tasks')
            .select('id', { count: 'exact', head: true })
            .eq('fall_id', fall.fall_id as string)
            .eq('task_code', folge.task_code)
            .neq('status', 'erledigt')

          if (!existingFolge || existingFolge === 0) {
            await db.from('tasks').insert({
              fall_id: fall.fall_id as string,
              typ: 'action',
              titel: `${folge.titel} (Dokumente vollständig)`,
              beschreibung: `Alle Pflichtdokumente für Phase '${phase}' sind da. Nächster Schritt: ${folge.titel}`,
              status: 'offen',
              task_code: folge.task_code,
              phase,
              auto_erstellt: true,
              prioritaet: 'hoch',
              faellig_am: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
              empfaenger_rolle: folge.empfaenger_rolle,
              empfaenger_user_id: folge.empfaenger_rolle === 'sachverstaendiger' ? fall.sv_id : fall.kundenbetreuer_id,
            })
          }
        }
        completed++
      }
    }
  }

  console.log(`[KFZ-172] pflichtdokumente-reminder: ${faelle.length} Faelle geprueft, ${reminders} Reminder, ${completed} vollstaendig`)

  return NextResponse.json({
    checked: faelle.length,
    reminders,
    completed,
  })
}
