// src/lib/partner-rang/compute.ts
import { DEFAULT_RANG_CONFIG, type RangConfig } from './config'
import type { PartnerSignals, PartnerStrength, Tier } from './types'

const TIER_ORDER: Tier[] = ['bronze', 'silber', 'gold']
export function tierOrdinal(t: Tier): number { return TIER_ORDER.indexOf(t) }
function minTier(a: Tier, b: Tier): Tier { return tierOrdinal(a) <= tierOrdinal(b) ? a : b }

export function deriveTier(score: number, config: RangConfig = DEFAULT_RANG_CONFIG): Tier {
  if (score >= config.schwelleGold) return 'gold'
  if (score >= config.schwelleSilber) return 'silber'
  return 'bronze'
}

function credentialScore(s: PartnerSignals, config: RangConfig): number {
  const bestellt = s.oeffentlichBestellt ? config.credOeffentlichBestellt : 0
  const zert = Math.min(s.zertifikate * config.credProZertifikat, config.credZertifikatCap)
  const tenure = Math.min(s.partnerSeitJahre * config.credProJahr, config.credTenureCap)
  return bestellt + zert + tenure
}

function ratingScore(s: PartnerSignals, config: RangConfig): number {
  if (s.ratingDurchschnitt == null || s.ratingAnzahl < config.ratingMinBewertungen) return 0
  const norm = Math.max(0, Math.min(1, (s.ratingDurchschnitt - 3) / 2))
  return Math.round(norm * config.ratingCap * 10) / 10
}

/** Hoechster gate-konformer Tier (Qualitaets-Tuersteher). */
function gateCap(s: PartnerSignals, config: RangConfig): Tier {
  let cap: Tier = 'gold'
  if (s.noShowQuote > config.maxNoShowQuoteGold) cap = minTier(cap, 'silber')
  if (s.noShowQuote > config.maxNoShowQuoteSilber) cap = minTier(cap, 'bronze')
  if (s.ablehnungen30d > config.maxAblehnungen30d) cap = minTier(cap, 'bronze')
  if (s.offeneReklamationen > 0) cap = minTier(cap, 'bronze')
  return cap
}

function buildSinnsatz(s: PartnerSignals, tier: Tier, config: RangConfig): string {
  const teile: string[] = []
  if (s.volumen >= config.volumenVielfach) teile.push('vielfach begutachtet')
  else if (s.volumen >= config.volumenErfahren) teile.push('erfahrener Partner')
  if (s.oeffentlichBestellt) teile.push('öffentlich bestellt & vereidigt')
  if (s.ratingDurchschnitt != null && s.ratingAnzahl >= config.ratingMinBewertungen && s.ratingDurchschnitt >= 4.3) {
    teile.push('top bewertet')
  }
  teile.push('verifiziert')
  const label = tier === 'gold' ? 'Gold-Partner' : tier === 'silber' ? 'Silber-Partner' : 'Bronze-Partner'
  return [label, ...teile.slice(0, 3)].join(' · ')
}

export function computePartnerStrength(s: PartnerSignals, config: RangConfig = DEFAULT_RANG_CONFIG): PartnerStrength {
  const volumenScore = Math.sqrt(Math.max(0, s.volumen)) * config.volumenFaktor
  const cScore = credentialScore(s, config)
  const rScore = ratingScore(s, config)
  const score = Math.round((volumenScore + cScore + rScore) * 10) / 10

  const gateOk = s.aktiv
  if (!gateOk) {
    return { score, volumenScore, credentialScore: cScore, ratingScore: rScore, gateOk: false, gateCap: 'bronze', tier: null, sinnsatz: '' }
  }
  const cap = gateCap(s, config)
  const tier = minTier(deriveTier(score, config), cap)
  return { score, volumenScore, credentialScore: cScore, ratingScore: rScore, gateOk: true, gateCap: cap, tier, sinnsatz: buildSinnsatz(s, tier, config) }
}
