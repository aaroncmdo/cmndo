import type { SvMatchInput, SvMatchCandidate } from './findBestSV'
import { findeBestePerson } from '@/lib/termine/engine'

/**
 * Sub-A (universelle Termin-Engine): Adapter — `findeBestePerson` (Engine, nurVorschlag)
 * in der `findBestSV`-Form (`SvMatchCandidate[]`, identische Signatur). Reine Abbildung
 * PersonKandidat → SvMatchCandidate. Wird im Shadow-Diff gegen den Live-`findBestSV`
 * verglichen; in Sub-A.3 wird `findBestSV`s Body durch eine Delegation hierauf ersetzt.
 */
export async function findBestSVviaEngine(input: SvMatchInput, limit = 3): Promise<SvMatchCandidate[]> {
  const res = await findeBestePerson({
    schadenort: { lat: input.fallLat, lng: input.fallLng },
    bezug: { typ: 'lead', id: 'shadow' }, // nur für reserviere relevant; nurVorschlag skippt das
    quelle: 'dispatch',
    wunschterminIso: input.wunschterminIso ?? null,
    excludeAssigneeIds: input.excludeSvId ? [input.excludeSvId] : [],
    stickyAssigneeId: input.stickySvId ?? null,
    topN: limit,
    nurVorschlag: true,
    assigneeTyp: 'sachverstaendiger',
  })
  if (!res.ok) return []
  if (res.gebucht) return [] // nurVorschlag → nie gebucht; defensiv
  return res.kandidaten.map((k) => ({
    svId: k.assignee.id,
    profileId: k.profileId ?? null,
    name: k.name,
    paket: k.paket ?? 'standard',
    distanzKm: k.distanzKm,
    etaFromBueroMin: k.etaVomBueroMin,
    offeneFaelle: k.offeneFaelle ?? 0,
    kontingentFrei: k.kontingentFrei ?? 0,
    ablehnungen30d: k.ablehnungen30d ?? 0,
    score: k.score,
    reasons: k.reasons,
    verfuegbarAmWunschtermin: k.verfuegbarAmWunschtermin,
    naechsterFreierSlot: k.naechsterFreierSlot ?? null,
  }))
}
