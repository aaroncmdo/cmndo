// Netzwerk-Verbindungs-Typen (KEIN 'use server' — frei exportierbar).
export type VerbindungStatus = 'offen' | 'angenommen' | 'abgelehnt' | 'blockiert'
export type NetzwerkRolle = 'sachverstaendiger' | 'werkstatt' | 'flottenmanager' | 'makler'
export type VerbindungRow = { anfrager_id: string; empfaenger_id: string; status: VerbindungStatus }
