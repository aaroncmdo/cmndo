// AAR-327 (Child 7 von AAR-320): Task-Typ-Mapping für Kunden-Tasks — analog
// zu KB_TASK_TYPEN (src/lib/kundenbetreuer/task-typen.ts) und SV_TASK_TYPEN
// (src/lib/gutachter/task-typen.ts).
//
// Wird von dokumentAnfordern() in src/lib/dokumente/anforderung.ts gesetzt,
// wenn Kanzlei/SV/KB/Admin ein Dokument beim Kunden anfordern. Der Kunde sieht
// den Task im Onboarding-Portal (/kunde/onboarding) und folgt dem CTA zum
// Nachreich-Step aus AAR-323.

export const KUNDE_TASK_TYPEN = {
  'dokument-nachreichen': {
    label: 'Dokument nachreichen',
    cta: 'Jetzt hochladen',
    // Kunden-Portal nutzt /kunde/onboarding als Einstieg; der Wizard springt
    // automatisch zum Pflichtdokumente-Step wenn offene Slots existieren.
    navigateTo: '/kunde/onboarding',
  },
} as const

export type KundeTaskTyp = keyof typeof KUNDE_TASK_TYPEN
export type KundeTaskTypDef = (typeof KUNDE_TASK_TYPEN)[KundeTaskTyp]
