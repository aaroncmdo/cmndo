// Die EINE Quelle fuer die Schadenkarte-URL. Verbraucher: QR-PDF, Seiten-QR, NFC-Chip.
//
// ⚠ Diese URL landet auf PHYSISCHEM PLASTIK (QR-Aufkleber + NFC-Chip) und ist danach nicht
// mehr aenderbar. Sie MUSS auf die App zeigen:
//   claimondo.de      -> Marketing-Seite (nginx :3006) -> /schaden/<t> = 404
//   app.claimondo.de  -> die App          (nginx :3000) -> /schaden/<t> = 200
// Beides curl-verifiziert 14.07. NEXT_PUBLIC_APP_URL ist in /etc/claimondo/.env.local NICHT
// gesetzt -> der Fallback unten entscheidet. Muster identisch zu lib/airdrop/gegner-invite.ts.
//
// Vor diesem Helper bauten drei Stellen die URL von Hand -- zwei davon falsch. Genau dieser
// Strukturdefekt ist der Grund fuer den Helper: eine Quelle => Chip == Aufkleber == PDF.
function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de').replace(/\/$/, '')
}

/** Die oeffentliche Gegner-Flow-URL einer Schadenkarte (QR-Inhalt == NDEF-Inhalt). */
export function buildSchadenkarteUrl(token: string): string {
  return `${baseUrl()}/schaden/${token}`
}
