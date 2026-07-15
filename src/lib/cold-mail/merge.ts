// Reine Merge-Var-Ersetzung für Cold-Mails. Wiederverwendet von Single-Send (S0) + CRON (S2).
import { resolveActionVars } from './merge-vars'

// Daten-getriebene Var-Menge (Palette-definiert) + aufgeloeste Aktions-Tokens.
export type ColdMailMergeVars = Record<string, string>

export function buildMergeVars(lead: {
  ansprechpartner_vorname: string | null
  ansprechpartner_nachname: string | null
  ansprechpartner_position?: string | null
  firma: string | null
  ort: string | null
  rolle?: string | null
}): ColdMailMergeVars {
  const vorname = lead.ansprechpartner_vorname?.trim() ?? ''
  const nachname = lead.ansprechpartner_nachname?.trim() ?? ''
  return {
    Ansprechpartner: [vorname, nachname].filter(Boolean).join(' '),
    Vorname: vorname,
    Nachname: nachname,
    Position: lead.ansprechpartner_position?.trim() ?? '',
    Firma: lead.firma?.trim() || 'Ihr Unternehmen',
    Ort: lead.ort?.trim() ?? '',
    // Aktions-Tokens (Beratungs-/Registrierungs-Button) rollenbewusst aufloesen.
    ...resolveActionVars({ rolle: lead.rolle ?? null }),
  }
}

/**
 * Ersetzt {{Feld}} durch vars[Feld]; unbekannte Platzhalter bleiben stehen.
 *
 * Syntax bewusst {{…}} — identisch zu renderVorlage() der Vertrieb-Vorlagen
 * (src/app/admin/vertrieb/_lib/mail-vorlagen.ts), deren prod-Rows ausschliesslich
 * {{Ansprechpartner}} nutzen. Beide Composer sitzen im selben Lead-Drawer: eine
 * zweite Syntax waere ein Footgun (mit /\{(\w+)\}/ wurde "{{Firma}}" zu
 * "{Autohaus Meier}" — Klammern gingen sichtbar an den Empfaenger raus).
 * Eigene Fn statt Import, weil src/lib/ nicht auf src/app/ zeigen soll.
 */
export function renderMerge(template: string, vars: ColdMailMergeVars): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in vars ? String(vars[key as keyof ColdMailMergeVars]) : match,
  )
}
