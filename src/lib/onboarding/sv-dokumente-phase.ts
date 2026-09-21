// Code-injizierte Wizard-Phase „Ihre Dokumente" für den Basic-SV-Flow (sv-onboarding).
//
// Aaron 19.09.2026: „er muss die Dokumente hochladen können im Onboarding, weil das ist ja
// wichtig für die Sicherungsabtretungsunterzeichnung, Datenschutzerklärung etc." — und im
// selben Satz: „wenn Dokumente fehlen, soll der Sachverständige trotzdem angezeigt werden und
// sogar auch buchbar sein." Deshalb: ein Schritt, der zeigt und annimmt, aber NIE blockiert
// (pflicht=false, kein Pflichtfeld → der Wizard lässt „Weiter" immer zu).
//
// Warum CODE statt DB-Seed: dieselbe Begründung wie bei der Widget-Phase (AAR-939 Part B) —
// Renderer (`sv-dokumente`-Feld) und Phase müssen atomar deployen. Eine DB-Phase ohne
// Renderer würde jeden laufenden Wizard blockieren (default-Renderer = null).
//
// Die Uploads laufen NICHT über den generischen Feld-Writer (db_target `_self` wird von
// saveOnboardingFields übersprungen), sondern über `uploadSvPflichtdokument` — derselbe
// Pfad wie /gutachter/verifizierung und der bezahlte Wizard: Storage `fall-dokumente/
// sv-pflicht/<svId>/<slot>/`, Zeile in `pflichtdokumente` (status 'hochgeladen'), sofort
// wirksam im Kundenflow (SA-Tool merged die Slots, FlowLink zeigt Datenschutz/Widerruf).

import type { OnboardingPhase } from '@/components/onboarding/types'

export const SV_DOKUMENTE_PHASE_ID = '_dokumente'
export const SV_DOKUMENTE_FELD_KEY = 'sv_dokumente'

export type SvDokumentSlotDef = {
  slotId: string
  label: string
  beschreibung: string
  /** Gruppe für die Darstellung: Nachweise (Haftung) vs. Kunden-Unterlagen (FlowLink/SA-Tool). */
  gruppe: 'nachweis' | 'kunde'
}

/** Reihenfolge = Reihenfolge im Wizard. Slot-IDs = `dokument_katalog.slot_id` (Kategorie gutachter_verifizierung). */
export const SV_DOKUMENTE_SLOTS: readonly SvDokumentSlotDef[] = [
  {
    slotId: 'sv_berufshaftpflicht',
    label: 'Berufshaftpflicht',
    beschreibung: 'Aktueller Versicherungsschein oder Bestätigung Ihrer Versicherung.',
    gruppe: 'nachweis',
  },
  {
    slotId: 'sv_gewerbeanmeldung',
    label: 'Gewerbeanmeldung',
    beschreibung: 'Ihre Gewerbeanmeldung (bei Freiberuflern: Nachweis der Tätigkeit).',
    gruppe: 'nachweis',
  },
  {
    slotId: 'sv_sicherungsabtretung',
    label: 'Sicherungsabtretung',
    beschreibung: 'Ihr Formular für die Abtretung des Schadenersatzanspruchs — Ihre Kunden unterschreiben es im Claimondo-Flow mit.',
    gruppe: 'kunde',
  },
  {
    slotId: 'sv_honorarvereinbarung',
    label: 'Honorarvereinbarung',
    beschreibung: 'Alternativ oder zusätzlich zur Sicherungsabtretung.',
    gruppe: 'kunde',
  },
  {
    slotId: 'sv_datenschutzerklaerung',
    label: 'Datenschutzerklärung',
    beschreibung: 'Ihre Datenschutzerklärung für Endkunden — wird im Flow verlinkt und mit unterschrieben.',
    gruppe: 'kunde',
  },
  {
    slotId: 'sv_widerrufsbelehrung',
    label: 'Widerrufsbelehrung',
    beschreibung: 'Widerrufsbelehrung nach §§ 312g, 355 BGB.',
    gruppe: 'kunde',
  },
] as const

// 20.09.2026: Der Transport traegt den ZUSTAND aus dokumentZustand() — inkl. 'feld_fehlt'
// (Datei da, Kunden-Unterschriftsfeld nicht gesetzt → nicht im Kundenflow).
export type { DokumentZustand as SvDokumentStatus } from '@/lib/sv/unterschriftsfeld'

/**
 * Baut die Phase. `status` = Zustand je Slot aus `dokumentZustand()` (fehlend = 'leer');
 * er wandert als `optionen` (value = slotId, label = status) in das Feld — derselbe Transport
 * wie bei calendar-connect (svId/gcal/caldav), damit der Renderer ohne eigenen Read auskommt.
 */
export function baueSvDokumentePhase(status: Record<string, string | null | undefined>): OnboardingPhase {
  return {
    id: SV_DOKUMENTE_PHASE_ID,
    flow_key: 'sv-onboarding',
    reihenfolge: 48,
    phase_key: 'dokumente',
    titel: 'Ihre Dokumente',
    eyebrow: 'Optional — jederzeit nachreichbar',
    beschreibung:
      'Berufshaftpflicht und Gewerbeanmeldung als Nachweis, dazu Ihre Sicherungsabtretung oder Honorarvereinbarung, Datenschutzerklärung und Widerrufsbelehrung — die legen wir Ihren Kunden bei der Unterschrift vor. Sie können jeden Punkt auch später im Portal unter „Nachweise" erledigen.',
    conditional_on: null,
    felder: [
      {
        id: `${SV_DOKUMENTE_PHASE_ID}_${SV_DOKUMENTE_FELD_KEY}`,
        phase_id: SV_DOKUMENTE_PHASE_ID,
        reihenfolge: 10,
        feld_key: SV_DOKUMENTE_FELD_KEY,
        typ: 'sv-dokumente',
        label: 'Dokumente hochladen',
        hint: null,
        placeholder: null,
        pflicht: false,
        optionen: SV_DOKUMENTE_SLOTS.map((s) => ({
          value: s.slotId,
          label: (status[s.slotId] ?? 'leer') || 'leer',
        })),
        validation: null,
        db_target: { tabelle: '_self', spalte: SV_DOKUMENTE_FELD_KEY },
        conditional_on: null,
        audience: null,
        sektion: null,
      },
    ],
  }
}
