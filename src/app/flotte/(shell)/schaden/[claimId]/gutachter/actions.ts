'use server'

// T5.2 (operativer-schaden-flow): Server-Actions fuer den FM-Gutachter-Picker.
// Beide re-gaten per requirePortalAccess + resolveSchadenFortsetzung (Claim-Ownership).
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { geocodeMitFallback } from '@/lib/termine/engine/geocode'
import {
  resolveSchadenFortsetzung,
  ladeGutachterKandidaten,
  waehleGutachterUndStarteFlow,
  type GutachterKandidat,
  type Haftungstyp,
} from '@/lib/flotte/schaden-fortsetzung'

/** Sucht Gutachter fuer einen (FM-eingegebenen) Besichtigungsort (Fahrzeug-Standort). */
export async function sucheGutachterFuerOrt(
  claimId: string,
  adresse: string,
): Promise<
  | { ok: true; adresse: string; kind: 'partner' | 'fallback'; kandidaten: GutachterKandidat[] }
  | { ok: false; error: string }
> {
  const { user } = await requirePortalAccess(['flottenmanager'])
  const ctx = await resolveSchadenFortsetzung(claimId, user.id)
  if (!ctx) return { ok: false, error: 'Kein Zugriff auf diesen Schaden.' }
  const cleaned = adresse.trim()
  if (!cleaned) return { ok: false, error: 'Bitte einen Standort eingeben.' }
  const geo = await geocodeMitFallback(cleaned)
  if (!geo) return { ok: false, error: 'Standort nicht gefunden. Bitte genauer eingeben.' }
  const res = await ladeGutachterKandidaten(geo.lat, geo.lng)
  return { ok: true, adresse: geo.adresse ?? cleaned, kind: res.kind, kandidaten: res.kandidaten }
}

/** Waehlt einen Gutachter (oder null = Dispatch koordiniert) und liefert den /flow-Token. */
export async function waehleGutachterAction(
  claimId: string,
  svId: string | null,
  adresse: string,
  haftungstyp: Haftungstyp,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const { user } = await requirePortalAccess(['flottenmanager'])
  return waehleGutachterUndStarteFlow({ claimId, userId: user.id, svId, adresse, haftungstyp })
}
