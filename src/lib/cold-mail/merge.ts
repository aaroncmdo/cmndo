// Reine Merge-Var-Ersetzung für Cold-Mails. Wiederverwendet von Single-Send (S0) + CRON (S2).
export type ColdMailMergeVars = {
  Ansprechpartner: string
  Firma: string
  Ort: string
  Vorname: string
}

export function buildMergeVars(lead: {
  ansprechpartner_vorname: string | null
  ansprechpartner_nachname: string | null
  firma: string | null
  ort: string | null
}): ColdMailMergeVars {
  const vorname = lead.ansprechpartner_vorname?.trim() ?? ''
  const nachname = lead.ansprechpartner_nachname?.trim() ?? ''
  return {
    Ansprechpartner: [vorname, nachname].filter(Boolean).join(' '),
    Firma: lead.firma?.trim() || 'Ihr Unternehmen',
    Ort: lead.ort?.trim() ?? '',
    Vorname: vorname,
  }
}

export function renderMerge(template: string, vars: ColdMailMergeVars): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key as keyof ColdMailMergeVars]) : match,
  )
}
