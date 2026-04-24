// AAR-82 B-06: Top-20 KFZ-Marken Dropdown + Kennzeichen-Format

export const TOP_KFZ_MARKEN = [
  'Audi', 'BMW', 'Citroen', 'Dacia', 'Fiat',
  'Ford', 'Hyundai', 'Kia', 'Mazda', 'Mercedes-Benz',
  'Mini', 'Nissan', 'Opel', 'Peugeot', 'Renault',
  'Seat', 'Skoda', 'Toyota', 'Volkswagen', 'Volvo',
] as const

// AAR-411: Kennzeichen-Format lebt jetzt in @/lib/format/kennzeichen. Hier
// nur noch Re-Export zur Rückwärtskompatibilität bestehender Imports.
export { formatKennzeichen } from '@/lib/format/kennzeichen'

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
  nicht_gesendet: { label: 'Nicht gesendet', cls: 'bg-[#f8f9fb] text-claimondo-ondo' },
  gesendet: { label: 'Gesendet', cls: 'bg-[#f8f9fb] text-claimondo-ondo' },
  geoeffnet: { label: 'Geöffnet', cls: 'bg-amber-100 text-amber-700' },
  in_bearbeitung: { label: 'In Bearbeitung', cls: 'bg-violet-100 text-violet-700' },
  abgeschlossen: { label: 'Abgeschlossen', cls: 'bg-green-100 text-green-700' },
  abgelaufen: { label: 'Abgelaufen', cls: 'bg-red-100 text-red-700' },
}
