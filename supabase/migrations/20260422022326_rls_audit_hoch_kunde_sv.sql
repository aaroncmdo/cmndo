-- RLS-Audit (siehe Session-Notiz): zwei aktiv blockierte Pfade auflösen.
--
-- 1) fall_dokumente — Kunde fehlt komplett
--    Bestehende Policies decken admin/dispatch/kb (staff_fall_scoped),
--    SV (SV eigene Fall-Dokumente) und Kanzlei. Kunde ist NICHT abgedeckt.
--    Folge: uploadPflichtdokumentKunde (kunde/faelle/[id]/actions.ts)
--    schlägt mit RLS-Violation fehl, sobald ein Kunde direkt einen
--    Pflichtdok-Upload triggert. Kunde kann hochgeladene Dokumente nicht
--    via auth-Client lesen.
--
--    Lösung:
--    - SELECT erlaubt wenn der Kunde dem Fall via faelle.kunde_id zugeordnet
--      ist UND sichtbar_fuer 'kunde' enthält.
--    - INSERT erlaubt wenn Kunde dem Fall zugeordnet ist und uploaded_by_kunde
--      explizit true gesetzt wird (kein Fremd-Schreiben für andere Rollen).
--
-- 2) pflichtdokumente — SV-Schreibrechte fehlen
--    Bestehende Policies: Admins_full_access, Kunden_eigene_Dokumente,
--    kunde_select_own_pflichtdokumente, kunde_update_own_pflichtdokumente,
--    staff_fall_scoped (deckt admin/dispatch/kb, NICHT SV).
--    Folge: SV kann eigene Tier-2-Dokumente (Berufshaftpflicht etc.) nicht
--    direkt via auth-Client uploaden — geht nur über admin-Client. Latente Falle.
--
--    Lösung: SELECT + UPDATE für SVs deren sachverstaendige.profile_id
--    auf den eingeloggten User zeigt UND der entsprechende Fall sv_id
--    zu ihrem Profil gehört.

-- ─── 1) fall_dokumente Kunde ───────────────────────────────────────────────

CREATE POLICY "fall_dokumente_kunde_read"
ON public.fall_dokumente
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.faelle f
    WHERE f.id = fall_dokumente.fall_id
      AND f.kunde_id = auth.uid()
  )
  AND (sichtbar_fuer @> ARRAY['kunde']::text[])
);

CREATE POLICY "fall_dokumente_kunde_insert"
ON public.fall_dokumente
FOR INSERT
TO authenticated
WITH CHECK (
  uploaded_by_kunde = true
  AND EXISTS (
    SELECT 1 FROM public.faelle f
    WHERE f.id = fall_dokumente.fall_id
      AND f.kunde_id = auth.uid()
  )
);

-- ─── 2) pflichtdokumente SV ────────────────────────────────────────────────

CREATE POLICY "pflichtdokumente_sv_read"
ON public.pflichtdokumente
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.faelle f
    JOIN public.sachverstaendige sv ON sv.id = f.sv_id
    WHERE f.id = pflichtdokumente.fall_id
      AND sv.profile_id = auth.uid()
  )
);

CREATE POLICY "pflichtdokumente_sv_update"
ON public.pflichtdokumente
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.faelle f
    JOIN public.sachverstaendige sv ON sv.id = f.sv_id
    WHERE f.id = pflichtdokumente.fall_id
      AND sv.profile_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.faelle f
    JOIN public.sachverstaendige sv ON sv.id = f.sv_id
    WHERE f.id = pflichtdokumente.fall_id
      AND sv.profile_id = auth.uid()
  )
);
