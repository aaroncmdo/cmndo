// AAR-82 B-06: Top-20 KFZ-Marken Dropdown + Kennzeichen-Format

export const TOP_KFZ_MARKEN = [
  'Audi', 'BMW', 'Citroen', 'Dacia', 'Fiat',
  'Ford', 'Hyundai', 'Kia', 'Mazda', 'Mercedes-Benz',
  'Mini', 'Nissan', 'Opel', 'Peugeot', 'Renault',
  'Seat', 'Skoda', 'Toyota', 'Volkswagen', 'Volvo',
] as const

// Kennzeichen-Auto-Format: K-AB 1234, K AB 1234, KAB1234 -> alle zu "K-AB 1234"
export function formatKennzeichen(input: string): string {
  if (!input) return ''
  // Uppercase + nur Buchstaben/Zahlen/Bindestrich/Leerzeichen
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9\s-]/g, '').trim()
  // Pattern: 1-3 Buchstaben (Stadt) - 1-2 Buchstaben - 1-4 Zahlen
  const m = cleaned.replace(/[\s-]+/g, '').match(/^([A-Z]{1,3})([A-Z]{1,2})(\d{1,4})$/)
  if (m) return `${m[1]}-${m[2]} ${m[3]}`
  return cleaned
}

// FlowLink-Status (B-09): 6-stufig
export type FlowLinkStufe = 'nicht_gesendet' | 'gesendet' | 'geoeffnet' | 'in_bearbeitung' | 'abgeschlossen' | 'abgelaufen'

export function computeFlowLinkStufe(lead: {
  flow_link_geoeffnet?: boolean | null
  flow_link_abgeschlossen?: boolean | null
  qualifizierungs_phase?: string | null
}, latestFlow?: { expires_at?: string | null; status?: string | null } | null): FlowLinkStufe {
  if (!latestFlow) return 'nicht_gesendet'
  if (lead.flow_link_abgeschlossen) return 'abgeschlossen'
  if (latestFlow.expires_at && new Date(latestFlow.expires_at) < new Date()) return 'abgelaufen'
  if (lead.flow_link_geoeffnet && lead.qualifizierungs_phase === 'in-qualifizierung') return 'in_bearbeitung'
  if (lead.flow_link_geoeffnet) return 'geoeffnet'
  return 'gesendet'
}

export const FLOWLINK_STUFE_LABEL: Record<FlowLinkStufe, { label: string; cls: string }> = {
  nicht_gesendet: { label: 'Nicht gesendet', cls: 'bg-gray-100 text-gray-500' },
  gesendet: { label: 'Gesendet', cls: 'bg-blue-100 text-blue-700' },
  geoeffnet: { label: 'Geöffnet', cls: 'bg-amber-100 text-amber-700' },
  in_bearbeitung: { label: 'In Bearbeitung', cls: 'bg-violet-100 text-violet-700' },
  abgeschlossen: { label: 'Abgeschlossen', cls: 'bg-green-100 text-green-700' },
  abgelaufen: { label: 'Abgelaufen', cls: 'bg-red-100 text-red-700' },
}
