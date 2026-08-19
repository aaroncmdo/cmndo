// Termin-Auftrag-Auflösung: effektive Bezug-Ids mit Legacy-Vorrang + bezug-Fallback.
//
// `gutachter_termine` trägt den Auftrag ("WOFÜR") auf zwei Achsen:
//   - Legacy (transitional): fall_id / lead_id / claim_id
//   - Kanonisch: bezug_typ ('fall'|'lead'|'claim') + bezug_id
// Die Termin-Engine (`reserviere`) schreibt bezug-nativ OHNE Legacy-Spalte
// (der DB-validate-Trigger lehnt doppelten Legacy-Bezug ab). Consumer, die den
// Fall/Lead/Claim NUR über die Legacy-Spalten (oder Embeds wie claims:claim_id)
// auflösen, verfehlen deshalb bezug-native Termine → leerer/falscher Auftrag.
//
// Diese pure Util liefert die effektive Id je Achse: Legacy hat Vorrang (sie ist
// beim konvertierten Lead befüllt), sonst greift der bezug_id-Fallback. Vorbild:
// `finde-termin-fuer-lead.ts` (Dual-Lookup) + TerminListeClient (bezug-aware .or).
// Siehe `src/lib/termine/engine/CONTRACT.md` §Datenmodell.

export type TerminBezugRow = {
  fall_id?: string | null
  lead_id?: string | null
  claim_id?: string | null
  bezug_typ?: string | null
  bezug_id?: string | null
}

export type EffektiveBezugIds = {
  fallId: string | null
  leadId: string | null
  claimId: string | null
}

export function effektiveBezugIds(t: TerminBezugRow): EffektiveBezugIds {
  const ausBezug = (typ: 'fall' | 'lead' | 'claim'): string | null =>
    t.bezug_typ === typ ? (t.bezug_id ?? null) : null
  return {
    fallId: (t.fall_id ?? null) ?? ausBezug('fall'),
    leadId: (t.lead_id ?? null) ?? ausBezug('lead'),
    claimId: (t.claim_id ?? null) ?? ausBezug('claim'),
  }
}

/**
 * Die Fall-/Claim-UUID eines Termins UNTER BEACHTUNG DER Aequivalenzklasse.
 *
 * `fall` und `claim` sind dieselbe UUID (claim-first: `fall_id == claims.id`), deshalb
 * beantwortet diese Funktion beide Fragen — sie taugt als Map-Key fuer `claim_id`- wie
 * fuer `fall_id`-Zuordnungen.
 *
 * ⚠ Warum es das braucht: `effektiveBezugIds` loest strikt pro Typ auf — bei
 * `bezug_typ='fall'` bleibt `claimId` deshalb NULL (so getestet, so gewollt).
 * `bezugOrExpr`/`bezugInExpr` filtern dagegen ueber die AEQUIVALENZKLASSE
 * `bezug_typ.in.(fall,claim)`, weil `fall_id == claims.id` dieselbe UUID ist
 * (claim-first, siehe bezug-filter.ts).
 *
 * Wer also mit `.or(bezugInExpr('claim', ids))` filtert und die Treffer danach
 * ueber `claim_id` einer Map zuordnet, wirft die neu gewonnenen Zeilen sofort
 * wieder weg — der Filter-Fix allein bringt dann NICHTS, und der Ratchet-Eintrag
 * verschwindet trotzdem. Diese Funktion schliesst genau diese Luecke.
 *
 * Prod-verifiziert 19.08.: 0 Termine mit `fall_id <> claim_id` (20 mit beiden
 * gesetzt, alle gleich), alle `bezug_id` bei `bezug_typ='fall'` sind gueltige
 * `claims.id` — und `bezug_typ='claim'` kommt gar nicht vor (31x 'fall', 0x 'claim').
 */
export function effektiveFallClaimId(t: TerminBezugRow): string | null {
  const eff = effektiveBezugIds(t)
  return eff.claimId ?? eff.fallId
}
