-- AAR-839 Step 6/8: claim_payments Phase-Trigger entfernen
--
-- claim_payments wird in AAR-839 von der Phase-Logik entkoppelt — es ist
-- reine Buchhaltung. KB sieht die Zahlungs-Liste und entscheidet manuell
-- via markClaimAsReguliert (AAR-840) wann der Claim als reguliert gilt.
--
-- Pre-Flight: claim_payments hat 0 Rows, Drop ist risikofrei.

DROP TRIGGER IF EXISTS trg_cp_refresh_phase ON public.claim_payments;

-- Function trg_fn_refresh_claim_phase_from_payments() bleibt erhalten —
-- sie ist deklarativ, hat keinen Effekt ohne Trigger und kann später bei
-- Bedarf wiederverwendet werden. Cleanup der toten Function passiert in
-- einem separaten Cleanup-Ticket (out of scope für AAR-839).

COMMENT ON FUNCTION public.trg_fn_refresh_claim_phase_from_payments IS
  'AAR-839: Trigger ENTFERNT (nicht mehr gebunden). claim_payments hat keine '
  'Phase-Wirkung mehr. Function bleibt im Schema für mögliche zukünftige Verwendung.';
