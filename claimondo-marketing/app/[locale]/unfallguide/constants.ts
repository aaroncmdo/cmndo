// Konstanten und Typen der Unfallguide-Landeseite.
//
// Warum ein eigenes File und nicht actions.ts: aus einem 'use server'-Modul
// duerfen NUR async-Funktionen exportiert werden. Ein `export const` dort
// bricht den Build ("Only async functions are allowed to be exported in a
// 'use server' file") und reisst jeden Importeur mit — der Client-Import der
// Server-Action schlaegt dann mit "Export doesn't exist" fehl, obwohl sie da ist.
//
// Steht so in AGENTS.md (AAR-664). tsc sieht es NICHT: der Typecheck lief
// gruen, erst der volle Build hat es gefangen. Genau deshalb verlangt der
// 7-Punkte-Audit bei Routen und Server-Actions den vollen Build.

export const GUIDE_PFAD = '/downloads/claimondo-unfallguide.pdf'

export type GuideLeadFeld = 'name' | 'telefon' | 'email' | 'einwilligung'

export type GuideLeadErgebnis =
  | { ok: true; guidePfad: string }
  | { ok: false; error: string; feld?: GuideLeadFeld; guidePfad?: string }
