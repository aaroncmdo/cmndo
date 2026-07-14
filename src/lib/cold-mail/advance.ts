// Cold-Mailer S2 — die Sequenz-Engine als REINE Logik (kein DB-Zugriff, kein Datum-Global).
// Der CRON-Advancer und die Enrollment-Action rufen das hier; dadurch ist das Verhalten
// (Bedingungen, Skips, Faelligkeiten) ohne DB testbar.
//
// Verzweigungs-Modell (Spec §4): Steps sind geordnet; jeder Step traegt eine Bedingung, die
// beim Faelligwerden gegen den LETZTEN Send der Enrollment ausgewertet wird. Greift sie nicht,
// wird der Step uebersprungen (Kaskade) statt die Sequenz zu stoppen.

export type Bedingung = 'immer' | 'wenn_nicht_geoeffnet' | 'wenn_geoeffnet' | 'wenn_keine_antwort'
export type SendStatus = 'gesendet' | 'zugestellt' | 'geoeffnet' | 'geklickt' | 'bounced' | 'beschwerde'

export type ColdMailStep = {
  id: string
  position: number
  vorlage_id: string
  delay_tage: number
  bedingung: Bedingung
}

export type AdvancePlan = { typ: 'senden'; step: ColdMailStep } | { typ: 'fertig' }

const TAG_MS = 86_400_000

/** Oeffnung zaehlt auch als "geklickt" — wer klickt, hat geoeffnet. */
function wurdeGeoeffnet(letzterSend: { status: SendStatus } | null): boolean {
  return letzterSend !== null && (letzterSend.status === 'geoeffnet' || letzterSend.status === 'geklickt')
}

export function bedingungErfuellt(
  bedingung: Bedingung,
  letzterSend: { status: SendStatus } | null,
  geantwortet: boolean,
): boolean {
  switch (bedingung) {
    case 'immer':
      return true
    case 'wenn_geoeffnet':
      // Ohne vorigen Send kann nichts geoeffnet sein -> Step greift nicht.
      return wurdeGeoeffnet(letzterSend)
    case 'wenn_nicht_geoeffnet':
      return !wurdeGeoeffnet(letzterSend)
    case 'wenn_keine_antwort':
      return !geantwortet
  }
}

/**
 * Naechster zu sendender Step — ueberspringt kaskadierend alle, deren Bedingung nicht greift.
 * `aktuellerStep` = position des zuletzt GESENDETEN Steps (0 = noch nichts gesendet).
 */
export function planeNaechstenSchritt(input: {
  aktuellerStep: number
  steps: ColdMailStep[]
  letzterSend: { status: SendStatus } | null
  geantwortet: boolean
}): AdvancePlan {
  const sortiert = [...input.steps].sort((a, b) => a.position - b.position)
  let pos = input.aktuellerStep
  // Kaskade: solange der naechste Step nicht greift, weiterruecken statt abzubrechen.
  for (;;) {
    const step = sortiert.find((s) => s.position > pos)
    if (!step) return { typ: 'fertig' }
    if (bedingungErfuellt(step.bedingung, input.letzterSend, input.geantwortet)) {
      return { typ: 'senden', step }
    }
    pos = step.position
  }
}

/**
 * Enrollment-Zustand NACH einem erfolgreichen Send.
 * `next_send_at` kommt aus dem Delay des NAECHSTEN Steps (nicht des gerade gesendeten).
 */
export function zustandNachSend(
  steps: ColdMailStep[],
  gesendetePosition: number,
  jetzt: Date,
): { aktueller_step: number; next_send_at: Date | null; status: 'aktiv' | 'fertig' } {
  const sortiert = [...steps].sort((a, b) => a.position - b.position)
  const naechster = sortiert.find((s) => s.position > gesendetePosition)
  if (!naechster) {
    return { aktueller_step: gesendetePosition, next_send_at: null, status: 'fertig' }
  }
  return {
    aktueller_step: gesendetePosition,
    next_send_at: new Date(jetzt.getTime() + naechster.delay_tage * TAG_MS),
    status: 'aktiv',
  }
}

/** Faelligkeit einer frischen Enrollment = Delay des ersten Steps. */
export function ersteFaelligkeit(steps: ColdMailStep[], jetzt: Date): Date | null {
  const erster = [...steps].sort((a, b) => a.position - b.position)[0]
  if (!erster) return null
  return new Date(jetzt.getTime() + erster.delay_tage * TAG_MS)
}
