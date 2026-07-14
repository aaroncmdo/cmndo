// Pure Join: Leads (per Promo-Code) x Claims (lead_id -> claim_id) x Consents (claim_id -> scope).
//
// Warum ein JS-Join statt eines PostgREST-Embeds?
//  1. Der Makler darf `claims` per RLS NICHT direkt lesen (live verifiziert: 0 Zeilen) — die
//     lead->claim-Zuordnung kommt daher ueber den Admin-Client, die Authz haengt weiterhin am
//     eigenen Promo-Code (nur Leads DIESES Maklers) + am Consent (nur eigene Consent-Zeilen).
//  2. Der frueher genutzte Embed `leads -> faelle_claim_bridge -> claims` konnte GAR NICHT
//     funktionieren: die Bridge hat keinerlei Lead-Bezug (nur fall_id/claim_id). Zusaetzlich war
//     der Ziel-Hinweis `claim_id` seit Migration 20260708071538 mehrdeutig (partner_provisionen
//     zeigt per FK ebenfalls auf faelle_claim_bridge(claim_id)) -> PostgREST PGRST201/HTTP 300 ->
//     die gesamte Query schlug fehl und der Fehler wurde verschluckt -> Lead-Liste IMMER leer.
//
// fall_id == claim_id (Bridge-Trigger sync_claims_to_bridge setzt VALUES (NEW.id, NEW.id)); die
// Consent-Zeile traegt beide, daher wird fall_id bevorzugt von dort genommen.

export type ConsentLabel = 'kein_account' | 'minimal' | 'vollzugriff' | 'widerrufen'

export type LeadBasis = {
  id: string
  vorname: string | null
  nachname: string | null
  fahrzeug_hersteller: string | null
  fahrzeug_modell: string | null
  unfalldatum: string | null
  status: string
  created_at: string
  disqualifiziert: boolean | null
}

export type ClaimRef = { id: string; lead_id: string | null; service_typ: string | null }

export type ConsentRef = {
  claim_id: string | null
  fall_id: string | null
  consent_scope: string | null
  widerrufen_am: string | null
}

export type LeadMitConsent = LeadBasis & {
  fall_id: string | null
  fall_service_typ: string | null
  consent_label: ConsentLabel
}

export function joinLeadsMitConsent(
  leads: LeadBasis[],
  claims: ClaimRef[],
  consents: ConsentRef[],
): LeadMitConsent[] {
  const claimByLead = new Map<string, ClaimRef>()
  for (const c of claims) if (c.lead_id) claimByLead.set(c.lead_id, c)

  const consentByClaim = new Map<string, ConsentRef>()
  for (const c of consents) if (c.claim_id) consentByClaim.set(c.claim_id, c)

  return leads.map((lead) => {
    const claim = claimByLead.get(lead.id) ?? null
    const consent = claim ? (consentByClaim.get(claim.id) ?? null) : null

    let consent_label: ConsentLabel = 'kein_account'
    if (consent?.widerrufen_am) consent_label = 'widerrufen'
    else if (consent?.consent_scope === 'minimal') consent_label = 'minimal'
    else if (consent?.consent_scope === 'vollzugriff') consent_label = 'vollzugriff'

    return {
      ...lead,
      fall_id: consent?.fall_id ?? claim?.id ?? null,
      fall_service_typ: claim?.service_typ ?? null,
      consent_label,
    }
  })
}
