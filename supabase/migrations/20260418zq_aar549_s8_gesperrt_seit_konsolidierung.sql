-- AAR-549 S8: Gesperrt-Seit Konsolidierung auf sachverstaendige.
--
-- Vorher: zwei Spalten für denselben Zeitpunkt:
--   - gesperrt_seit (TIMESTAMPTZ, aus KFZ-149 20260408, dominant im Code —
--     admin/dispatch/gutachter-team/findBestSV/debugSvMatching lesen alle)
--   - gesperrt_am (TIMESTAMPTZ, aus AAR-359 W1 20260417j, nur in
--     verifizierung-actions.ts svSperren/svEntsperren geschrieben)
--
-- Nachher: nur noch gesperrt_seit (dominant, kein Code-Sweep der 20+
-- Lesestellen nötig). Latenter Bug behoben: svSperren schrieb gesperrt_am,
-- Portal-Sperre-Banner las gesperrt_seit → Admin-Sperre hätte in UI NICHT
-- angezeigt. Jetzt konsistent.
--
-- Regel #14 Verification (Stand 2026-04-18):
--   - 4/4 SVs haben gesperrt_seit IS NULL
--   - 4/4 SVs haben gesperrt_am IS NULL
--   - 0 divergente Rows
--
-- Code-Sweep:
--   - verifizierung-actions.ts svSperren/svEntsperren: gesperrt_am → gesperrt_seit
--   - admin/sachverstaendige/[id]/page.tsx: SELECT + prop gesperrtAm → gesperrtSeit
--   - VerifizierungsTab.tsx SperreCard: Prop gesperrtAm → gesperrtSeit
--   - gutachter/layout.tsx: SELECT + 5 Banner-Bedingungen gesperrt_am → gesperrt_seit
--   - database.types.ts: Row/Insert/Update-Einträge entfernt (makler.gesperrt_am
--     bleibt — andere Tabelle)
-- gesperrt_grund + gesperrt_von_user_id bleiben (semantische Companions).

ALTER TABLE sachverstaendige DROP COLUMN IF EXISTS gesperrt_am;

COMMENT ON COLUMN sachverstaendige.gesperrt_seit IS
  'Zeitpunkt der Account-Sperre (manuell durch Admin). Kanonische Quelle seit AAR-549 S8 (ersetzt gesperrt_am).';
