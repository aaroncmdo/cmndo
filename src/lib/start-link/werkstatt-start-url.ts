// AAR-956 — Werkstatt-QR-Einstieg: kanonische URL fuer den statischen QR-Code
// der Werkstatt. Kein HMAC (werkstattId ist ein opaker, nicht-geheimer Identifier;
// Validierung findet server-seitig in /start/werkstatt/[werkstattId]/page.tsx statt).

export function werkstattStartUrl(
  werkstattId: string,
  appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de',
): string {
  return `${appUrl}/start/werkstatt/${werkstattId}`
}
