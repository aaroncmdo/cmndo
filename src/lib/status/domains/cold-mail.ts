// src/lib/status/domains/cold-mail.ts
// Cold-Mailer S3 (2026-07-14): Registry-Domain fuer cold_mail_sends.status.
// Werte = das DB-CHECK-Vokabular (gesendet|zugestellt|geoeffnet|geklickt|bounced|
// beschwerde) — 1:1, damit Badge und DB nie auseinanderlaufen.
// Rendering ueber <StatusBadge domain="cold-mail"> (kein Inline-Farb-Ternary).
import type { StatusDef } from '../types'

export const COLD_MAIL_DEFS = {
  gesendet: { label: 'Gesendet', short: 'Gesendet', slot: 'neutral' },
  zugestellt: { label: 'Zugestellt', short: 'Zugestellt', slot: 'active' },
  geoeffnet: { label: 'Geöffnet', short: 'Geöffnet', slot: 'pending' },
  // Klick = staerkstes positives Signal -> success.
  geklickt: { label: 'Geklickt', short: 'Geklickt', slot: 'success' },
  bounced: { label: 'Unzustellbar', short: 'Bounce', slot: 'danger' },
  beschwerde: { label: 'Spam-Beschwerde', short: 'Beschwerde', slot: 'danger' },
} satisfies Record<string, StatusDef>
