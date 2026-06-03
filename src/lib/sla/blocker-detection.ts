// AAR-431: Blocker-Detection für Kanzlei-SLAs.
// Beim Breach eines Kanzlei-SLAs wird hier ermittelt, wer tatsächlich blockt
// — die Kanzlei selbst, der Kunde (z. B. Vollmacht fehlt), oder der SV (z. B.
// Gutachten/Stellungnahme fehlt). Die Mahnung wird entsprechend adressiert.

import { createAdminClient } from '@/lib/supabase/admin'

export type KanzleiSlaTyp =
  | 'kanzlei_as_versand'
  | 'kanzlei_ruege_versand'
  | 'kanzlei_kuerzung_antwort'
  | 'kanzlei_vs_nachfass'

export type BlockerRolle = 'kanzlei' | 'kunde' | 'sv'

export interface BlockerInfo {
  rolle: BlockerRolle
  grund: string
}

/**
 * Ermittelt anhand des DB-State wer einen Kanzlei-SLA aktuell blockt.
 * Fallback: Kanzlei.
 */
export async function detectBlocker(
  fallId: string,
  claimId: string | null,
  slaTyp: KanzleiSlaTyp,
): Promise<BlockerInfo> {
  const db = createAdminClient()

  // CMM-49 (Drop-Runway, Phase D Reader-Sweep): direkt aus claims (SSoT) statt
  // .from('faelle') -> claims:claim_id-Embed. claimId kommt vom SLA-Record
  // (sla_tracking.claim_id, FK-Re-Key; 26/26 konsistent mit faelle.claim_id).
  // - sa_unterschrieben + vollmacht_signiert_am = claims-Spalten (SSoT).
  // - technische_stellungnahme_status: auftraege (aktueller Auftrag) via
  //   claim_id-FK-Embed (auftraege_claim_id_fkey). Pre-launch <=1 Auftrag/Claim.
  // - anschlussschreiben_am/kuerzungs_betrag/ruege_gesendet_am: kanzlei_faelle (1:1)
  //   via claim_id-FK-Embed (kanzlei_faelle_claim_id_fkey).
  // gutachten_eingegangen_am → gutachten.fertiggestellt_am: unten separat (claim_id).
  if (!claimId) {
    return { rolle: 'kanzlei', grund: 'Fall nicht gefunden' }
  }
  const { data: fallClaim } = await db
    .from('claims')
    .select(
      'sa_unterschrieben, vollmacht_signiert_am, auftraege(technische_stellungnahme_status), kanzlei_faelle(anschlussschreiben_am, kuerzungs_betrag, ruege_gesendet_am)',
    )
    .eq('id', claimId)
    .single()

  if (!fallClaim) {
    return { rolle: 'kanzlei', grund: 'Fall nicht gefunden' }
  }
  // anschlussschreiben_am lives on kanzlei_faelle (embedded above); currently
  // blocker-detection does not branch on it — selected for future SLA checks.
  const fallAuftraege = Array.isArray(
    (fallClaim as { auftraege?: unknown } | null)?.auftraege,
  )
    ? ((fallClaim as { auftraege: unknown[] }).auftraege)
    : ((fallClaim as { auftraege?: unknown } | null)?.auftraege
        ? [(fallClaim as { auftraege: unknown }).auftraege]
        : [])
  const aktAuftrag =
    (fallAuftraege[0] as { technische_stellungnahme_status?: string | null } | undefined) ?? null

  // ─── kanzlei_as_versand ────────────────────────────────────────────────
  // Kanzlei muss AS versenden. Voraussetzung: Vollmacht + Gutachten.
  if (slaTyp === 'kanzlei_as_versand') {
    const vollmachtOk = Boolean(fallClaim?.sa_unterschrieben) || Boolean(fallClaim?.vollmacht_signiert_am)
    if (!vollmachtOk) {
      return { rolle: 'kunde', grund: 'Vollmacht nicht unterschrieben' }
    }
    // CMM-44 SP-G PR2: gutachten_eingegangen_am → gutachten.fertiggestellt_am (claim_id).
    const { data: gutachtenRow } = await db.from('gutachten')
      .select('fertiggestellt_am')
      .eq('claim_id', claimId)
      .maybeSingle()
    const gutachtenFertiggestellt = !!(gutachtenRow as { fertiggestellt_am?: string | null } | null)?.fertiggestellt_am
    if (!gutachtenFertiggestellt) {
      return { rolle: 'sv', grund: 'Gutachten fehlt' }
    }
    return { rolle: 'kanzlei', grund: 'Anschlussschreiben nicht verschickt' }
  }

  // ─── kanzlei_ruege_versand ─────────────────────────────────────────────
  // Kanzlei muss Rüge versenden. Voraussetzung: technische Stellungnahme.
  if (slaTyp === 'kanzlei_ruege_versand') {
    const { count } = await db
      .from('pflichtdokumente')
      .select('id', { count: 'exact', head: true })
      .eq('fall_id', fallId)
      .eq('dokument_typ', 'technische_stellungnahme')
      .not('dokument_url', 'is', null)

    const stellungnahmeHochgeladen =
      (count ?? 0) > 0 || aktAuftrag?.technische_stellungnahme_status === 'hochgeladen' || aktAuftrag?.technische_stellungnahme_status === 'freigegeben'

    if (!stellungnahmeHochgeladen) {
      return { rolle: 'sv', grund: 'Technische Stellungnahme fehlt' }
    }
    return { rolle: 'kanzlei', grund: 'Rüge nicht verschickt' }
  }

  // ─── kanzlei_kuerzung_antwort ──────────────────────────────────────────
  // Kanzlei muss zu einer VS-Kürzung Stellung beziehen. Immer Kanzlei-Blocker.
  if (slaTyp === 'kanzlei_kuerzung_antwort') {
    return { rolle: 'kanzlei', grund: 'Einschätzung zur Kürzung fehlt' }
  }

  // ─── kanzlei_vs_nachfass ───────────────────────────────────────────────
  // Kanzlei muss VS nachfassen (vs-timer-getriggert). Immer Kanzlei-Blocker.
  if (slaTyp === 'kanzlei_vs_nachfass') {
    return { rolle: 'kanzlei', grund: 'VS-Nachfassung steht aus' }
  }

  return { rolle: 'kanzlei', grund: 'Unbekannter SLA-Typ' }
}
