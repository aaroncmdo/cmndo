import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { enqueue, buildDedupKey } from '@/lib/notifications/outbox'
import { getPflichtDokumenteFuerFall, type Phase, type Szenario } from '@/lib/dokumente/pflicht-dokumente'

// KFZ-172 Phase 4: Pflichtdokumente-Reminder Cron.
// Laeuft alle 4 Stunden (0 */4 * * *).
// Pro Fall mit sub_phase + szenario:
// - Berechnet fehlende Pflicht-Dokumente
// - Wenn fehlt > 0 UND > 24h ohne Bewegung: erstellt Task
// - Wenn fehlt = 0: setzt dokumente_vollstaendig + erstellt Folge-Task

// CMM-44 MP-6a: das Pflichtdok-Matrix-`Phase`-Vokabular (8 Werte) wird aus der
// abgeleiteten v_claim_phase-Subphase (9 Backbone-Substates) gemappt. (Mapping zur
// Review — Doc-Anforderung je Substate, Aaron.)
const SUBPHASE_TO_PFLICHT_PHASE: Record<string, Phase> = {
  sa_offen: 'aufnahme', vollmacht_offen: 'aufnahme', onboarding_offen: 'aufnahme',
  termin: 'termin', besichtigung: 'termin', gutachten: 'nach_termin',
  kanzlei_uebergabe: 'nach_termin', versicherungskontakt: 'abrechnung', auszahlung: 'abrechnung',
  erfolgreich_reguliert: 'abgeschlossen', storniert: 'abgeschlossen',
  klage_rechtsstreit: 'abgeschlossen', verjaehrt: 'abgeschlossen',
}

const FOLGE_TASKS: Record<string, { titel: string; task_code: string; empfaenger_rolle: string }> = {
  aufnahme: { titel: 'Termin koordinieren', task_code: 'termin-vereinbaren', empfaenger_rolle: 'kundenbetreuer' },
  termin: { titel: 'Gutachten erstellen', task_code: 'gutachten-erstellen', empfaenger_rolle: 'sachverstaendiger' },
  nach_termin: { titel: 'An Versicherer/Kanzlei schicken', task_code: 'kanzlei-anschlussschreiben', empfaenger_rolle: 'kundenbetreuer' },
  abrechnung: { titel: 'Fall abschließen', task_code: 'fall-abschliessen', empfaenger_rolle: 'kundenbetreuer' },
}

export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const now = new Date()
  const vor24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

  // CMM-47 A.2: faelle → v_claim_full (Sync-Trigger garantiert kundenbetreuer_id-Konsistenz).
  // fall_id statt id, fall_status statt status, fall_updated_at statt updated_at.
  // CMM-44 MP-6a: aktuelle_phase → sub_phase (abgeleitet aus v_claim_phase, in
  // v_claim_full durchgereicht). Cron nutzt den Admin-Client → keine RLS-Lücke.
  const { data: faelle } = await db
    .from('v_claim_full')
    // 28.08.: + die operativen Fakten. Bis dahin loeste NUR das `szenario` eine Pflicht aus —
    // „Polizei war vor Ort" blieb folgenlos. `finanzierung_leasing` liegt (noch) nicht in
    // v_claim_full; die Regel dafuer greift deshalb hier nicht (undefined loest nicht aus).
    .select('fall_id, claim_nummer, sub_phase, szenario, dokumente_vollstaendig_fuer_phase, kundenbetreuer_id, sv_id, fall_updated_at, dokumente_reminder_whatsapp_letzte_sendung, polizei_vor_ort, hat_mietwagen, hat_sachschaden')
    .not('sub_phase', 'is', null)
    .not('szenario', 'is', null)
    .neq('main_phase', 'abschluss')

  if (!faelle?.length) {
    return NextResponse.json({ checked: 0, reminders: 0, completed: 0 })
  }

  let reminders = 0
  let completed = 0

  for (const fall of faelle) {
    // CMM-44 MP-6a: Substate → Pflichtdok-`Phase` mappen; unbekannter Substate
    // (kein Eintrag in der Map) → diesen Fall überspringen. sub_phase ist eine
    // v_claim_phase-Spalte, die in v_claim_full durchgereicht wird, aber (noch)
    // nicht in database.types steht → Record-Zugriff wie bei den anderen
    // nachgereichten Spalten in diesem File (s. dokumente_reminder_…).
    const subPhase = (fall as Record<string, unknown>).sub_phase as string | null
    const phase = subPhase ? SUBPHASE_TO_PFLICHT_PHASE[subPhase] : undefined
    if (!phase) continue
    const szenario = fall.szenario as Szenario

    // Pflicht-Dokumente berechnen — Szenario-Matrix PLUS erhobene Fakten.
    const r = fall as Record<string, unknown>
    const pflicht = getPflichtDokumenteFuerFall(phase, szenario, {
      polizei_vor_ort: r.polizei_vor_ort as boolean | null,
      hat_mietwagen: r.hat_mietwagen as boolean | null,
      hat_sachschaden: r.hat_sachschaden as boolean | null,
    })
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
          const { error: reminderTaskFehler } = await db.from('tasks').insert({
            fall_id: fall.fall_id as string,
            typ: 'action',
            titel: `Fehlende Dokumente: ${fehlendListe}`,
            beschreibung: `Fall ${fall.claim_nummer ?? (fall.fall_id as string).slice(0, 8)} Phase '${phase}': ${fehlend.length} Pflichtdokument(e) fehlen noch — ${fehlendListe}`,
            status: 'offen',
            task_code: 'dokument-hochladen',
            phase,
            auto_erstellt: true,
            // tasks_prioritaet_check erlaubt nur normal|dringend|kritisch — 'mittel' liess den
            // Insert still scheitern (Reminder-Task wurde NIE erstellt; Prod-Log 16.07.).
            prioritaet: 'normal',
            faellig_am: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
            empfaenger_rolle: phase === 'termin' ? 'sachverstaendiger' : 'kundenbetreuer',
            empfaenger_user_id: phase === 'termin' ? fall.sv_id : fall.kundenbetreuer_id,
          })
          // Genau dieser Insert ist am 16.07. still gescheitert (prioritaet 'mittel',
          // siehe Kommentar oben) — der Reminder-Task wurde NIE erstellt und niemand
          // erfuhr davon. Deshalb wird der Fehler jetzt gelesen.
          if (reminderTaskFehler) {
            console.error(
              `[pflichtdokumente-reminder] Reminder-Task NICHT angelegt (fall ${fall.fall_id}):`,
              reminderTaskFehler.message,
            )
          }
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
            // Kunden-Telefon laden — CMM-49: lead_id (0-diff) claims-direkt via resolveClaimId.
            const pdClaimId = await resolveClaimId(db, fall.fall_id as string)
            const { data: fallFull } = pdClaimId
              ? await db.from('claims').select('lead_id').eq('id', pdClaimId).maybeSingle()
              : { data: null }
            if (fallFull?.lead_id) {
              const { data: lead } = await db.from('leads').select('vorname, telefon').eq('id', fallFull.lead_id).single()
              if (lead?.telefon) {
                const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'
                // C3a: durable via Notification-Outbox — siehe sa-reminder. Empfaenger-
                // kreis unveraendert (lead.telefon-Guard bleibt, sendFallCommunication
                // resolved denselben Kunden).
                // dedupKey mit Cron-Diskriminator + Tages-Fenster: 'dokumente_nachreichen'
                // wird von mehreren Crons gesendet; die 48h-Kadenz-Guard oben ist
                // strenger als das Fenster, das nur einen Doppel-Send am selben Tag
                // abfaengt, falls der Flag-Write mal fehlschlaegt.
                await enqueue({
                  dedupKey: buildDedupKey({
                    template: 'dokumente_nachreichen',
                    claimId: fall.fall_id as string,
                    fenster: `pflicht-${now.toISOString().slice(0, 10)}`,
                  }),
                  kanal: 'whatsapp',
                  template: 'dokumente_nachreichen',
                  claimId: fall.fall_id as string,
                  payload: {
                    '1': lead.vorname ?? 'Kunde',
                    '2': fehlendListe,
                    '3': `${appUrl}/kunde`,
                  },
                }).catch(() => {})
                // CMM-44 SP-B PR2c: dokumente_reminder_whatsapp_letzte_sendung auf claims (SSoT).
                const remClaimId = await resolveClaimId(db, fall.fall_id as string)
                if (remClaimId) {
                  // IDEMPOTENZ-ANKER: die WhatsApp-Mahnung ist gerade RAUS. Bleibt dieser
                  // Marker ungesetzt, mahnt der naechste Cron-Lauf denselben Kunden erneut.
                  const { error: sendeMarkerFehler } = await db
                    .from('claims')
                    .update({ dokumente_reminder_whatsapp_letzte_sendung: now.toISOString() })
                    .eq('id', remClaimId)
                  if (sendeMarkerFehler) {
                    console.error(
                      `[pflichtdokumente-reminder] Sendemarker nicht gesetzt (claim ${remClaimId}) — Doppel-Mahnung moeglich:`,
                      sendeMarkerFehler.message,
                    )
                  }
                }
              }
            }
          }
        }
      }
    } else {
      // Alle Pflicht-Dokumente vorhanden!
      if (fall.dokumente_vollstaendig_fuer_phase !== phase) {
        // CMM-44 SP-B PR2c: dokumente_vollstaendig_* auf claims (SSoT).
        const vollstClaimId = await resolveClaimId(db, fall.fall_id as string)
        if (vollstClaimId) {
          // Ohne diesen Marker haelt der Cron die Unterlagen weiter fuer unvollstaendig
          // und mahnt einen Kunden, der laengst alles geliefert hat.
          const { error: vollstFehler } = await db
            .from('claims')
            .update({
              dokumente_vollstaendig_fuer_phase: phase,
              dokumente_vollstaendig_am_phase: now.toISOString(),
            })
            .eq('id', vollstClaimId)
          if (vollstFehler) {
            console.error(
              `[pflichtdokumente-reminder] Vollstaendigkeits-Marker nicht gesetzt (claim ${vollstClaimId}) — Mahnung trotz vollstaendiger Unterlagen moeglich:`,
              vollstFehler.message,
            )
          }
        }

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
            const { error: folgeTaskFehler } = await db.from('tasks').insert({
              fall_id: fall.fall_id as string,
              typ: 'action',
              titel: `${folge.titel} (Dokumente vollständig)`,
              beschreibung: `Alle Pflichtdokumente für Phase '${phase}' sind da. Nächster Schritt: ${folge.titel}`,
              status: 'offen',
              task_code: folge.task_code,
              phase,
              auto_erstellt: true,
              // tasks_prioritaet_check: 'hoch' existiert nicht (normal|dringend|kritisch) -> dringend.
              prioritaet: 'dringend',
              faellig_am: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
              empfaenger_rolle: folge.empfaenger_rolle,
              empfaenger_user_id: folge.empfaenger_rolle === 'sachverstaendiger' ? fall.sv_id : fall.kundenbetreuer_id,
            })
            if (folgeTaskFehler) {
              console.error(
                `[pflichtdokumente-reminder] Folge-Task '${folge.task_code}' NICHT angelegt (fall ${fall.fall_id}):`,
                folgeTaskFehler.message,
              )
            }
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
