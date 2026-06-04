// AAR-939 · Monika-Embed — public Tracking-Block fuer /api/embed/config.
// PURE: nimmt die drei public Tracking-Spalten einer embed_sites-Row und gibt
// exakt die public IDs zurueck. Liest NUR diese Felder → kein Secret-Leak
// (tracking_webhook_secret etc. koennen NICHT versehentlich mit rausgehen).

export interface PublicTrackingRow {
  tracking_ga4_measurement_id: string | null
  tracking_gads_conversion_id: string | null
  tracking_gads_conversion_label: string | null
}

export interface PublicTracking {
  ga4MeasurementId: string | null
  gadsConversionId: string | null
  gadsConversionLabel: string | null
}

export function pickPublicTracking(row: PublicTrackingRow): PublicTracking {
  return {
    ga4MeasurementId: row.tracking_ga4_measurement_id ?? null,
    gadsConversionId: row.tracking_gads_conversion_id ?? null,
    gadsConversionLabel: row.tracking_gads_conversion_label ?? null,
  }
}
