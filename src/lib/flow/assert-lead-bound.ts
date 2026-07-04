// IDOR-Guard fuer Flow-Actions (/flow/[token]): verifiziert dass die caller-gelieferte
// leadId tatsaechlich zum Flow-Token gehoert. Ohne diese Bindung koennte ein
// unauthentifizierter Caller (Server-Action-POST mit fremder leadId) fremde Leads
// lesen/ueberschreiben/konvertieren (Broken Access Control / IDOR, OWASP A01).
//
// Die Aufloesung spiegelt EXAKT den Page-Loader (src/app/flow/[token]/page.tsx):
//   1) canonical: flow_links.token -> lead_id  (muss == leadId sein)
//   2) backward-compat (kein flow_links-Row):  der Token IST die lead_id (token == leadId)
// Dadurch wird der kanonische Pfad vollstaendig abgedichtet, waehrend die
// Backward-Compat-Semantik unveraendert bleibt (nicht schlechter als der Loader selbst).
// Gleiche Idee wie die urspruengliche F1-Bindung, nur token-basiert -> robust auch wenn
// flowLinkId=null ist (genau der frueher ungebundene Bypass-Pfad).
export async function assertLeadBoundToToken(
  // Admin-Client (RLS-Bypass); as-any wie in lib/embed/billing-actions.ts, da der
  // generische Supabase-Client-Typ hier keinen Mehrwert bringt und nur Friction erzeugt.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  token: string | null,
  leadId: string,
): Promise<boolean> {
  if (!token || !leadId) return false
  const { data: fl } = await admin
    .from('flow_links')
    .select('lead_id')
    .eq('token', token)
    .maybeSingle()
  if (fl) return (fl.lead_id as string | null) === leadId
  // Backward-compat: der Token IST die lead_id (page.tsx else-Zweig).
  return token === leadId
}
