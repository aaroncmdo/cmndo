// AAR-209 / AAR-549 S2: Shared Resolver für SV-Kontingent + Radius. Nach der
// Konsolidierung in AAR-549 gibt es nur noch `paket_faelle_gesamt` + `paket_umkreis_km`
// als autoritative Quellen auf `sachverstaendige`. Fallback auf PAKET_KONFIG.

import { PAKET_KONFIG, type AnlegePaket } from '@/app/admin/sachverstaendige/anlegen/constants'

type SvKontingentInput = {
  paket?: string | null
  paket_faelle_gesamt?: number | null
  paket_umkreis_km?: number | null
}

function paketFromKonfig(paket: string | null | undefined): { kontingent: number; radius_km: number } | null {
  if (!paket || paket === 'individuell') return null
  if (paket in PAKET_KONFIG) {
    return PAKET_KONFIG[paket as Exclude<AnlegePaket, 'individuell'>]
  }
  return null
}

export function resolveMaxFaelleMonat(sv: SvKontingentInput): number {
  if (typeof sv.paket_faelle_gesamt === 'number' && sv.paket_faelle_gesamt > 0) return sv.paket_faelle_gesamt
  const cfg = paketFromKonfig(sv.paket)
  return cfg?.kontingent ?? 0
}

export function resolveUmkreisKm(sv: SvKontingentInput): number {
  if (typeof sv.paket_umkreis_km === 'number' && sv.paket_umkreis_km > 0) return sv.paket_umkreis_km
  const cfg = paketFromKonfig(sv.paket)
  return cfg?.radius_km ?? 0
}

const PAKET_LABELS: Record<string, string> = {
  standard: 'Standard',
  'standard-25': 'Pro',
  pro: 'Pro',
  premium: 'Premium',
  'premium-50': 'Premium',
  individuell: 'Individuell',
}

export function paketLabelMitKontingent(sv: SvKontingentInput): string {
  const base = sv.paket ? (PAKET_LABELS[sv.paket] ?? sv.paket) : 'Standard'
  const k = resolveMaxFaelleMonat(sv)
  return k > 0 ? `${base} (${k})` : base
}

export function paketLabelKurz(sv: SvKontingentInput): string {
  return sv.paket ? (PAKET_LABELS[sv.paket] ?? sv.paket) : 'Standard'
}
