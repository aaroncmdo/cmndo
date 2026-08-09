// Pure Tab-Resolver fuer die Netzwerk-Portal-Tabs (Feed/Verbindungen/Anfragen).
// Bewusst in einem eigenen dependency-freien Modul (nicht inline in
// NetzwerkPortalPage.tsx): NetzwerkPortalPage importiert transitiv
// supabase/server (next/headers) + DB-Queries — ein Unit-Test von parseTab
// soll diese Kette nicht mitziehen (analog verbindungen-core.ts / einladung-core.ts).
export type NetzwerkTab = 'feed' | 'verbindungen' | 'anfragen' | 'karte'

export function parseTab(raw: string | undefined): NetzwerkTab {
  return raw === 'verbindungen' || raw === 'anfragen' || raw === 'karte' ? raw : 'feed'
}
