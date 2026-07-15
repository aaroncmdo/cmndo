// Nutzer-sichtbare Labels je Outbox-Op-Kind (für das All-Kinds-Dead-Letter-UI, write-4).
// Pure (kein 'use client'/server-only) → in Node testbar + überall importierbar.
const LABELS: Record<string, string> = {
  fall_dokument_upload: 'Dokument-Upload',
  gps_position: 'GPS-Position',
  flow_stammdaten: 'Kontaktdaten',
  flow_feststellung: 'Schaden-Angaben',
  flow_zb1_upload: 'Fahrzeugschein-Foto',
  flow_polizeibericht_upload: 'Polizeibericht',
  flow_zeugenaussage_upload: 'Zeugenaussage',
  werkstatt_lead_edit: 'Werkstatt-Anfrage',
}

export function offlineKindLabel(kind: string): string {
  return LABELS[kind] ?? 'Offline-Eintrag'
}
