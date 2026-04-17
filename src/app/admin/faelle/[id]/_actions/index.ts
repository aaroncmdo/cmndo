// AAR-428 / W1: Fallakte-Actions-Barrel.
//
// 10 thematische Module:
//   - core         (Fall-Level: update/delete/deactivate/reactivate)
//   - filmcheck    (QC + Filmcheck)
//   - kanzlei      (VS-Regulierung, Kanzlei-Handoff, Prozess-Transitions)
//   - dokumente    (Upload, Pflichtdokumente, FIN-Call, Cardentity)
//   - termine      (Termin-CRUD)
//   - tasks        (Task-CRUD)
//   - chat         (Chat/Nachrichten/Timeline)
//   - ai           (Fall-Summary + LexDrive-Trigger)
//   - stammdaten   (Inline-Edit + Legacy-Setters)
//   - abrechnung   (SV-Abrechnung, Klassifizierung)
//
// Consumer importieren entweder ein Sub-Modul direkt (empfohlen, kleinere
// Client-Bundles) oder aus diesem Barrel. Der historische 44 KB Monolith
// `../actions.ts` bleibt vorläufig als Source, dieser Barrel ist die neue
// Import-Oberfläche.

export * from './core'
export * from './filmcheck'
export * from './kanzlei'
export * from './dokumente'
export * from './termine'
export * from './tasks'
export * from './chat'
export * from './ai'
export * from './stammdaten'
export * from './abrechnung'
