// AAR-325 (Child 5 von AAR-320): Task-Typ-Mapping für KB-Portal — analog
// zu SV_TASK_TYPEN (src/lib/gutachter/task-typen.ts). Label + CTA +
// Scroll-/Navigations-Ziel pro task_typ.
//
// Die Tasks werden vom DB-Trigger `fall_dokumente_autotask` erzeugt
// (siehe Migration 20260417_aar325_fall_dokumente_autotask.sql) oder später
// manuell über Child 6 (KB-Zuordnungs-UI) / Child 7 (Anforderungs-Flow).

export const KB_TASK_TYPEN = {
  'dokument-pruefen': {
    label: 'Dokument prüfen (QC)',
    cta: 'Zum Dokument',
    // Child 6 baut die Zuordnungs-/QC-UI in der Fallakte; dahin navigieren.
    scrollTo: 'dokumente-card',
    navigateTo: '/faelle/{fallId}?tab=dokumente',
  },
  'dokument-zuordnen': {
    label: 'Dokument einem Slot zuordnen',
    cta: 'Zuordnen',
    scrollTo: 'dokumente-card',
    navigateTo: '/faelle/{fallId}?tab=dokumente',
  },
} as const

export type KbTaskTyp = keyof typeof KB_TASK_TYPEN
export type KbTaskTypDef = (typeof KB_TASK_TYPEN)[KbTaskTyp]
