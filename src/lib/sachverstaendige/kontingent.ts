// AAR-209: Shared Resolver für SV-Kontingent + Radius. Vorher gab es in
// jeder Konsumenten-Datei einen anderen Fallback (10 vs 25, mit/ohne
// PAKET_KONFIG, mit/ohne kontingent_soll), wodurch derselbe SV in
// /gutachter/willkommen "25 Fälle" sehen konnte und in /gutachter/leadpreise
// "10 Fälle". Diese Util zentralisiert die Logik:
//
//   1. wenn DB-Spalte > 0 → nimm DB-Wert
//   2. sonst Fallback aus PAKET_KONFIG (Pro=25/40, Premium=50/60, Standard=10/25)
//   3. sonst 0 (für 'individuell' ohne Setup)
//
// Reihenfolge der Spalten-Quellen orientiert sich am jeweiligen Kontext:
// - max_faelle_monat: vom Onboarding-Wizard gesetzt (autoritativ für SV-View)
// - paket_faelle_gesamt: legacy alias, wird parallel gepflegt
// - kontingent_soll: monatlich vom Admin überschrieben (manuelle Anpassung)

import { PAKET_KONFIG, type AnlegePaket } from '@/app/admin/sachverstaendige/anlegen/constants'

type SvKontingentInput = {
  paket?: string | null
  max_faelle_monat?: number | null
  paket_faelle_gesamt?: number | null
  kontingent_soll?: number | null
  paket_umkreis_km?: number | null
  radius_km?: number | null
}

function paketFromKonfig(paket: string | null | undefined): { kontingent: number; radius_km: number } | null {
  if (!paket || paket === 'individuell') return null
  if (paket in PAKET_KONFIG) {
    return PAKET_KONFIG[paket as Exclude<AnlegePaket, 'individuell'>]
  }
  return null
}

export function resolveMaxFaelleMonat(sv: SvKontingentInput): number {
  // Reihenfolge: kontingent_soll (manuelle Override) > max_faelle_monat
  // (Onboarding) > paket_faelle_gesamt (legacy) > PAKET_KONFIG > 0
  const candidates = [sv.kontingent_soll, sv.max_faelle_monat, sv.paket_faelle_gesamt]
  for (const c of candidates) {
    if (typeof c === 'number' && c > 0) return c
  }
  const cfg = paketFromKonfig(sv.paket)
  return cfg?.kontingent ?? 0
}

export function resolveUmkreisKm(sv: SvKontingentInput): number {
  const candidates = [sv.paket_umkreis_km, sv.radius_km]
  for (const c of candidates) {
    if (typeof c === 'number' && c > 0) return c
  }
  const cfg = paketFromKonfig(sv.paket)
  return cfg?.radius_km ?? 0
}

// Pretty Label inkl. Kontingent in Klammern (z.B. "Pro (25)") für UI-Anzeige.
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
