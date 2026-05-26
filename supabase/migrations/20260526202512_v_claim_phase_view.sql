-- CMM-44 Claim-Phasen-SSoT (P0): SQL-Spiegel von getClaimLifecycle
-- (src/lib/claims/lifecycle.ts, CMM-32).
--
-- Liefert pro Claim main_phase + sub_phase aus DENSELBEN Sub-Entity-Lifecycles
-- (Lead / Auftrag / Kanzleifall) wie der TS-Loader getClaimLifecycleForClaim —
-- fuer Listen/Kanban/RLS, die keine TS-Funktion aufrufen koennen. MUSS bitgleich
-- zur TS-Aggregation sein (P6 Parity-Gate erzwingt das).
--
-- Prioritaet EXAKT wie getClaimLifecycle: abschluss > regulierung > begutachtung
-- > erfassung. SubPhase = Status des treibenden Lifecycles.
--
-- Basis = faelle (1:1 zu claims; auftraege/kanzlei_faelle per fall_id; lead via
-- faelle.lead_id) — spiegelt exakt den P0-Loader, damit Parity haelt. Phase 6
-- (faelle-Drop) migriert Loader UND View gemeinsam auf claims.lead_id.
--
-- claim_id == faelle.id == claims.id (1:1). security_invoker=on -> respektiert die
-- RLS des lesenden Users (wie v_faelle_mit_aktuellem_termin).

CREATE OR REPLACE VIEW public.v_claim_phase
WITH (security_invoker = on) AS
SELECT
  f.id AS claim_id,
  CASE
    -- abschluss: Kanzleifall ausgezahlt + alle Auftraege abgeschlossen
    -- (auftraege.every(abgeschlossen) == NOT EXISTS non-abgeschlossen; greift auch
    --  bei 0 Auftraegen = vacuously true, wie .every()).
    WHEN kf.status = 'auszahlung' AND kf.ausgezahlt_am IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM public.auftraege a
           WHERE a.fall_id = f.id AND a.status <> 'abgeschlossen'
         )
      THEN 'abschluss'
    -- regulierung: Kanzleifall existiert
    WHEN kf.fall_id IS NOT NULL
      THEN 'regulierung'
    -- begutachtung: aktiver Erstgutachten-Auftrag (status != abgeschlossen)
    WHEN eg.status IS NOT NULL AND eg.status <> 'abgeschlossen'
      THEN 'begutachtung'
    -- erfassung: nur Lead (oder Fallback)
    ELSE 'erfassung'
  END AS main_phase,
  CASE
    WHEN kf.status = 'auszahlung' AND kf.ausgezahlt_am IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM public.auftraege a
           WHERE a.fall_id = f.id AND a.status <> 'abgeschlossen'
         )
      THEN 'abgeschlossen'
    WHEN kf.fall_id IS NOT NULL
      THEN CASE WHEN kf.status = 'auszahlung' THEN 'auszahlung' ELSE 'versicherungskontakt' END
    WHEN eg.status IS NOT NULL AND eg.status <> 'abgeschlossen'
      THEN eg.status   -- termin|besichtigung|gutachten == ClaimSubPhase 1:1
    WHEN l.id IS NOT NULL
      THEN CASE
             WHEN l.vollmacht_signiert_am IS NOT NULL THEN 'onboarding_offen'
             WHEN l.sa_unterschrieben THEN 'vollmacht_offen'
             ELSE 'sa_offen'
           END
    ELSE 'sa_offen'
  END AS sub_phase
FROM public.faelle f
LEFT JOIN public.kanzlei_faelle kf ON kf.fall_id = f.id
LEFT JOIN public.leads l ON l.id = f.lead_id
LEFT JOIN LATERAL (
  SELECT a.status
  FROM public.auftraege a
  WHERE a.fall_id = f.id AND a.typ = 'erstgutachten'
  ORDER BY a.reihenfolge ASC
  LIMIT 1
) eg ON true;
