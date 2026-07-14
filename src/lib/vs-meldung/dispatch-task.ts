// Slice 2c — der eine Fallback-Kanal. Jeder Pfad, auf dem die VS-Meldung nicht automatisch
// rausgehen kann, landet hier als Dispatch-Task. Kein Claim versandet still.
//
// Zwei Fallen, die hier bewusst umgangen werden:
//  - tasks.entity_type CHECK kennt KEIN 'versicherung' (nur fall|lead|abrechnung|...) —
//    ein falscher Wert wird still verworfen. Deshalb 'fall'.
//  - createLinkedTask dedupliziert NICHT -> task_code selbst pruefen (Muster:
//    src/lib/termine/embed-b-klaerung-task.ts).
import { createAdminClient } from '@/lib/supabase/admin'
import { createLinkedTask } from '@/lib/tasks/create-task'

export type VsDispatchTaskGrund =
  | 'kein_telefon'
  | 'keine_versicherung'
  | 'keine_schaden_email'
  | 'nicht_bestaetigt'
  | 'send_fehler'

export type VsDispatchTaskInput = {
  claimId: string
  grund: VsDispatchTaskGrund
  detail?: string
}

const TEXTE: Record<
  VsDispatchTaskGrund,
  { titel: string; beschreibung: string; prioritaet: 'normal' | 'dringend' }
> = {
  kein_telefon: {
    titel: 'VS-Meldung manuell: Gegner ohne Telefonnummer',
    beschreibung:
      'Der Unfallgegner hat keine Handynummer hinterlassen — die Nummer kann nicht per SMS bestätigt werden, die Unfallmeldung geht deshalb nicht automatisch an seine Haftpflicht. Bitte den Schaden manuell an die gegnerische Versicherung melden.',
    prioritaet: 'normal',
  },
  keine_versicherung: {
    titel: 'VS-Meldung manuell: Haftpflicht des Gegners unbekannt',
    beschreibung:
      'Der Unfallgegner hat seine Haftpflichtversicherung nicht aus der Liste ausgewählt. Bitte die Versicherung ermitteln (Kennzeichen → Zentralruf der Autoversicherer) und den Schaden manuell melden.',
    prioritaet: 'dringend',
  },
  keine_schaden_email: {
    titel: 'VS-Meldung manuell: Versicherer ohne Schaden-E-Mail',
    beschreibung:
      'Für die Haftpflicht des Gegners ist keine Schaden-E-Mail-Adresse hinterlegt (betrifft rund 11 % der Versicherer). Bitte den Schaden per Post/Fax/Portal melden — und die Adresse anschließend unter /admin/versicherungen nachtragen.',
    prioritaet: 'dringend',
  },
  nicht_bestaetigt: {
    titel: 'VS-Meldung manuell: Gegner hat die SMS nicht bestätigt',
    beschreibung:
      'Der Unfallgegner hat den Bestätigungs-Link aus der SMS nicht angetippt. Die Handynummer gilt damit als unbestätigt, die automatische Meldung wurde NICHT ausgelöst. Bitte prüfen und manuell entscheiden.',
    prioritaet: 'normal',
  },
  send_fehler: {
    titel: 'VS-Meldung fehlgeschlagen: E-Mail an die Versicherung ging nicht raus',
    beschreibung:
      'Die automatische Unfallmeldung an die Haftpflicht des Gegners konnte nicht zugestellt werden. Bitte manuell nachfassen.',
    prioritaet: 'dringend',
  },
}

export async function erstelleVsDispatchTask(input: VsDispatchTaskInput): Promise<{ ok: boolean }> {
  const taskCode = `vs_meldung_${input.grund}:${input.claimId}`
  const admin = createAdminClient()

  const { data: vorhanden } = await admin
    .from('tasks')
    .select('id')
    .eq('task_code', taskCode)
    .in('status', ['offen', 'in-bearbeitung'])
    .maybeSingle()

  if (vorhanden) return { ok: true } // schon offen -> nicht doppelt anlegen

  const t = TEXTE[input.grund]
  const { task_id } = await createLinkedTask({
    titel: t.titel,
    beschreibung: input.detail ? `${t.beschreibung}\n\nDetail: ${input.detail}` : t.beschreibung,
    prioritaet: t.prioritaet,
    empfaenger_rolle: 'dispatch',
    claim_id: input.claimId,
    fall_id: input.claimId, // fallId === claimId (convert-lead-to-claim.ts:899)
    entity_type: 'fall',
    entity_id: input.claimId,
    typ: 'vs_meldung',
    task_code: taskCode,
    trigger_event: `vs_meldung_${input.grund}`,
    auto_erstellt: true,
  })

  return { ok: task_id !== null }
}
