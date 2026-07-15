-- B4-slice-2a-i-b (Status-Achsen-Konsolidierung): termin_durchgefuehrt wird ein gueltiger
-- operative_status-Wert (nur_gutachter-Terminal-Konvergenz). Der operative_status::fall_status-Cast
-- in v_claim_base/v_claim_full/faelle_*_view wuerde sonst brechen, sobald closeNurGutachter
-- op='termin_durchgefuehrt' schreibt. Additiv (IF NOT EXISTS), kein Bestand betroffen.
ALTER TYPE public.fall_status ADD VALUE IF NOT EXISTS 'termin_durchgefuehrt';
