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

  // Alle Faelle mit Phase + Szenario laden wo Dokumente nicht vollstaendig
  const { data: faelle } = await db
    .from('faelle')
    .select('id, fall_nummer, aktuelle_phase, szenario, dokumente_vollstaendig_fuer_phase, kundenbetreuer_id, sv_id, updated_at, dokumente_reminder_whatsapp_letzte_sendung')
    .not('aktuelle_phase', 'is', null)
    .not('szenario', 'is', null)
    .not('status', 'in', '("abgeschlossen","storniert")')

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
      .eq('fall_id', fall.id)
      .is('geloescht_am', null)

    const vorhandeneTypen = new Set((vorhandene ?? []).map(d => d.dokument_typ))
    const fehlend = pflicht.filter(p => !vorhandeneTypen.has(p.typ))

    if (fehlend.length > 0) {
      // Bereits vollstaendig fuer aktuelle Phase? Nein, denn fehlend > 0.
      // > 24h ohne Bewegung?
      if (fall.updated_at && fall.updated_at < vor24h) {
        // Duplikat-Check: existiert bereits ein offener Task fuer diese Kombination?
        const { count: existing } = await db
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('fall_id', fall.id)
          .eq('task_code', 'dokument-hochladen')
          .eq('phase', phase)
          .neq('status', 'erledigt')

        if (!existing || existing === 0) {
          const fehlendListe = fehlend.map(f => f.label).join(', ')
          await db.from('tasks').insert({
            fall_id: fall.id,
            typ: 'action',
            titel: `Fehlende Dokumente: ${fehlendListe}`,
            beschreibung: `Fall ${fall.fall_nummer ?? fall.id.slice(0, 8)} Phase '${phase}': ${fehlend.length} Pflichtdokument(e) fehlen noch — ${fehlendListe}`,
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
          if (!letzteSendung || letzteSendung < vor48h) {
            // Kunden-Telefon laden
            const { data: fallFull } = await db.from('faelle').select('lead_id').eq('id', fall.id).single()
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
                await db.from('faelle').update({ dokumente_reminder_whatsapp_letzte_sendung: now.toISOString() }).eq('id', fall.id)
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
          .eq('id', fall.id)

        // Folge-Task erstellen (falls fuer diese Phase definiert)
        const folge = FOLGE_TASKS[phase]
        if (folge) {
          const { count: existingFolge } = await db
            .from('tasks')
            .select('id', { count: 'exact', head: true })
            .eq('fall_id', fall.id)
            .eq('task_code', folge.task_code)
            .neq('status', 'erledigt')

          if (!existingFolge || existingFolge === 0) {
            await db.from('tasks').insert({
              fall_id: fall.id,
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
