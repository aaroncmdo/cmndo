// Vertrieb-CRM P3: Typen + reine Merge-Render-Fn fuer die DB-Vorlagen (KEIN 'use server').
export type VorlageTyp = 'vorstellung' | 'terminbestaetigung'
export type MailVorlage = { typ: VorlageTyp; betreff: string; body: string }

/** Ersetzt {{Feld}} durch merge[Feld]; unbekannte Platzhalter bleiben stehen. */
export function renderVorlage(text: string, merge: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (voll, key: string) => merge[key] ?? voll)
}
