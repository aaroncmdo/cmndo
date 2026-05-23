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
  slaTyp: KanzleiSlaTyp,
): Promise<BlockerInfo> {
  const db = createAdminClient()

  // CMM-44 SP-B PR2b: sa_unterschrieben + vollmacht_signiert_am leben auf
  // claims (SSoT) — via claims-Embed lesen.
  // CMM-44 SP-G PR2: gutachten_eingegangen_am → gutachten.fertiggestellt_am (SSoT)
  // — aus faelle-Select entfernt, wird unten separat aus gutachten-Tabelle gelesen.
  // CMM-44 SP-H PR2: technische_stellungnahme_status lebt auf auftraege (aktueller
  // Auftrag) — via Nested-Embed unter claims. Pre-launch <=1 Auftrag pro Claim.
  // CMM-44 SP-I2 PR2: anschlussschreiben_am lebt auf kanzlei_faelle (1:1 per Claim).
  // Embed via claims:claim_id(kanzlei_faelle(anschlussschreiben_am), ...).
  const { data: fall } = await db
    .from('faelle')
    .select(
      'id, claim_id, ruege_gesendet_am, kuerzungs_betrag, claims:claim_id(sa_unterschrieben, vollmacht_signiert_am, auftraege(technische_stellungnahme_status), kanzlei_faelle(anschlussschreiben_am))',
    )
    .eq('id', fallId)
    .single()

  if (!fall) {
    return { rolle: 'kanzlei', grund: 'Fall nicht gefunden' }
  }

  const fallClaim = Array.isArray(fall.claims) ? fall.claims[0] : fall.claims
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
    // CMM-44 SP-G PR2: gutachten_eingegangen_am → gutachten.fertiggestellt_am
    const claimIdForGutachten = (fall as { claim_id?: string | null }).claim_id ?? null
    let gutachtenFertiggestellt = false
    if (claimIdForGutachten) {
      const { data: gutachtenRow } = await db.from('gutachten')
        .select('fertiggestellt_am')
        .eq('claim_id', claimIdForGutachten)
        .maybeSingle()
      gutachtenFertiggestellt = !!(gutachtenRow as { fertiggestellt_am?: string | null } | null)?.fertiggestellt_am
    }
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
