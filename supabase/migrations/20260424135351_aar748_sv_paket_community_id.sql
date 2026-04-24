-- AAR-748 Phase 1: Orthogonale SV-Profile — sv_paket + community_id
--
-- Aaron-Klarstellung (Session 2026-04-24): Die SV-Sub-Rollen (Büro-Inhaber,
-- Solo, Sub-Büro, Akademie-Verwalter, Akademie-Sub, Community-Member) sind
-- heute im Code als Laufzeit-berechneter String verteilt (sichtbar z.B. in
-- `src/app/admin/statistiken/page.tsx` via organisation_id + Inhaber-Check).
-- Die Sub-Rolle soll eine ORTHOGONALE Dimension zu `profiles.rolle` werden:
-- ein SV ist IMMER rolle='sachverstaendiger', aber zusätzlich z.B. ein
-- Solo-Partner ODER Büro-Inhaber ODER Community-Mitglied.
--
-- Scope dieser Migration:
--   1. Enum `sv_paket_typ` erstellen
--   2. `profiles.sv_paket` column (nullable, check-constraint nur bei SVs)
--   3. `profiles.community_id` FK auf communities(id) (nullable)
--   4. Backfill: alle aktuellen SV-Profile auf sv_paket='solo'
--      (Prod-Stand am 2026-04-24: alle 6 SVs haben organisation_id=null
--      und sachverstaendige.rolle_in_organisation=null → alle Solo)
--
-- Nicht im Scope (Follow-up):
--   - Code-Sweep in ~54 Stellen die heute dynamisch aus organisation_id
--     berechnen (statistiken/page.tsx, gutachter/willkommen, ...). Das
--     wandert in ein eigenes Ticket (AAR-748 Phase 2).
--   - `sachverstaendige.rolle_in_organisation` droppen (erst wenn Phase 2
--     durch ist und keine Call-Site mehr liest).

-- ─── 1. Enum sv_paket_typ ──────────────────────────────────────────────
CREATE TYPE public.sv_paket_typ AS ENUM (
  'solo',
  'buero_inhaber',
  'sub_buero',
  'akademie_verwalter',
  'akademie_sub'
);

COMMENT ON TYPE public.sv_paket_typ IS
  'AAR-748: Orthogonales SV-Paket zur profiles.rolle=sachverstaendiger. Bestimmt Permissions innerhalb der Büro-/Akademie-Struktur. Community-Zugehörigkeit ist über profiles.community_id separat.';

-- ─── 2. profiles.sv_paket Column ───────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN sv_paket public.sv_paket_typ;

-- Check: sv_paket darf nur gesetzt sein wenn rolle='sachverstaendiger'
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_sv_paket_only_for_sv
  CHECK (sv_paket IS NULL OR rolle = 'sachverstaendiger'::user_role);

COMMENT ON COLUMN public.profiles.sv_paket IS
  'AAR-748: SV-Paket-Typ (solo/buero_inhaber/sub_buero/akademie_*). NULL außer wenn rolle=sachverstaendiger. Bestimmt Permissions innerhalb Büro/Akademie.';

-- ─── 3. profiles.community_id FK ───────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN community_id uuid REFERENCES public.communities(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.profiles.community_id IS
  'AAR-748/AAR-749: Community-Mitgliedschaft (Peer-Network Einkaufsgemeinschaft). NULL = kein Mitglied. Orthogonal zu sv_paket — ein Solo-SV kann Community-Mitglied sein.';

-- Index auf community_id für findBestSV-Queries
CREATE INDEX idx_profiles_community_id
  ON public.profiles(community_id)
  WHERE community_id IS NOT NULL;

-- ─── 4. Backfill: aktuelle SVs → 'solo' ────────────────────────────────
-- Aktueller Prod-Stand: 6 SV-Profile, alle mit sachverstaendige.
-- organisation_id=null und rolle_in_organisation=null → alle Solo.
UPDATE public.profiles
  SET sv_paket = 'solo'::public.sv_paket_typ
  WHERE rolle = 'sachverstaendiger'::user_role
    AND id IN (
      SELECT profile_id FROM public.sachverstaendige
      WHERE organisation_id IS NULL
    );

-- Sanity-Check (nur SELECT, kein Throw): Anzahl der gesetzten Profile loggen
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.profiles
    WHERE rolle = 'sachverstaendiger' AND sv_paket IS NOT NULL;
  RAISE NOTICE 'AAR-748 Backfill: % SV-Profile auf sv_paket gesetzt', v_count;
END;
$$;
