-- AAR-749: Communities — Einkaufsgemeinschaft von Sachverständigen.
--
-- Business-Logik (Aaron 2026-04-24): Mehrere SVs schließen sich zusammen und
-- bedienen gemeinsam ein größeres Gebiet / mehrere Standorte.
-- Kern-Regel: jeder SV sieht nur seine eigenen Fälle (KEIN Cross-Access).
-- Fall-Budget/Kontingent wird innerhalb der Community verteilt (Pool).
--
-- Abgrenzung zu `organisationen`:
--   organisationen = Büro-Hierarchie (1 Inhaber + Sub-SVs, 1 Vertrag, Inhaber
--                    sieht Sub-Fälle).
--   communities    = Peer-Network (N SVs auf Augenhöhe, N Solo-Verträge,
--                    kein Cross-Access, Pool-Budget).
--
-- Scope dieser Migration:
--   1. `communities` Tabelle
--   2. `community_memberships` Join-Tabelle (Verwalter/Mitglied-Rolle)
--   3. RLS-Policies (Mitglieder sehen eigene Community, Verwalter darf
--      updaten, Admin hat Full-Access)
--   4. Updated-At-Trigger
--
-- Nicht im Scope (bewusst):
--   - `profiles.community_id` FK-Spalte → kommt in AAR-748 (SV-Orthogonale
--     Profile), weil dort auch `sv_paket` ergänzt wird.
--   - `findBestSV`-Integration → eigener PR nach Admin-UI.
--   - Admin-UI zum Anlegen einer Community → eigener PR.

-- ─── 1. communities Tabelle ────────────────────────────────────────────
CREATE TABLE public.communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  beschreibung text,

  -- Gebiet: entweder Zentrum+Radius ODER explizites Polygon
  zentrum_lat numeric(10, 7),
  zentrum_lng numeric(10, 7),
  zentrum_adresse text,
  zentrum_plz text,
  radius_km integer CHECK (radius_km IS NULL OR radius_km > 0),
  -- GeoJSON Polygon (optional, overridet Zentrum+Radius für findBestSV).
  polygon jsonb,

  -- Budget (Pool, nicht pro-SV)
  faelle_pro_monat integer NOT NULL DEFAULT 0 CHECK (faelle_pro_monat >= 0),
  faelle_genutzt_aktueller_monat integer NOT NULL DEFAULT 0 CHECK (faelle_genutzt_aktueller_monat >= 0),

  -- Verteilungsstrategie (findBestSV)
  budget_verteilung text NOT NULL DEFAULT 'first_come'
    CHECK (budget_verteilung IN ('first_come', 'round_robin', 'nach_naehe', 'fair_share')),

  -- Exklusivitäts-Geometrie (kollidiert nicht mit anderen Communities)
  exklusiv boolean NOT NULL DEFAULT false,

  -- Lebenszyklus
  ist_aktiv boolean NOT NULL DEFAULT true,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  erstellt_von uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.communities IS
  'AAR-749: Einkaufsgemeinschaft von Sachverständigen — Peer-Network mit Pool-Budget und gemeinsamem Einsatzgebiet. Mitgliedschaft über community_memberships.';

COMMENT ON COLUMN public.communities.polygon IS
  'GeoJSON Polygon {type:"Polygon",coordinates:[[[lng,lat], ...]]} — overridet zentrum_lat/lng+radius_km falls gesetzt.';

COMMENT ON COLUMN public.communities.budget_verteilung IS
  'first_come=wer zuerst kommt; round_robin=rotiert; nach_naehe=geografisch nächster SV; fair_share=gleichmäßig über Monat.';

-- ─── 2. community_memberships Join-Tabelle ─────────────────────────────
CREATE TABLE public.community_memberships (
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rolle_in_community text NOT NULL DEFAULT 'mitglied'
    CHECK (rolle_in_community IN ('verwalter', 'mitglied')),
  beigetreten_am timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, profile_id)
);

COMMENT ON TABLE public.community_memberships IS
  'AAR-749: Mitgliedschaft eines SV in einer Community. rolle_in_community=verwalter darf die Community bearbeiten, mitglied nur lesen.';

CREATE INDEX idx_community_memberships_profile_id
  ON public.community_memberships(profile_id);
CREATE INDEX idx_community_memberships_community_id
  ON public.community_memberships(community_id);

-- ─── 3. RLS aktivieren + Policies ──────────────────────────────────────
ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_memberships ENABLE ROW LEVEL SECURITY;

-- communities: Admin sieht alle, Mitglieder sehen eigene, Verwalter darf updaten
CREATE POLICY "communities_admin_all" ON public.communities
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles
      WHERE id = auth.uid() AND rolle = 'admin'::user_role)
  );

CREATE POLICY "communities_member_select" ON public.communities
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM community_memberships cm
      WHERE cm.community_id = communities.id AND cm.profile_id = auth.uid())
  );

CREATE POLICY "communities_verwalter_update" ON public.communities
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM community_memberships cm
      WHERE cm.community_id = communities.id
        AND cm.profile_id = auth.uid()
        AND cm.rolle_in_community = 'verwalter')
  );

-- community_memberships: Admin sieht alles, Mitglieder sehen Peers derselben
-- Community (für Team-Übersicht), Verwalter darf insert/delete
CREATE POLICY "community_memberships_admin_all" ON public.community_memberships
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles
      WHERE id = auth.uid() AND rolle = 'admin'::user_role)
  );

CREATE POLICY "community_memberships_peer_select" ON public.community_memberships
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM community_memberships self
      WHERE self.community_id = community_memberships.community_id
        AND self.profile_id = auth.uid())
  );

CREATE POLICY "community_memberships_verwalter_write" ON public.community_memberships
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM community_memberships cm
      WHERE cm.community_id = community_memberships.community_id
        AND cm.profile_id = auth.uid()
        AND cm.rolle_in_community = 'verwalter')
  );

CREATE POLICY "community_memberships_verwalter_delete" ON public.community_memberships
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM community_memberships cm
      WHERE cm.community_id = community_memberships.community_id
        AND cm.profile_id = auth.uid()
        AND cm.rolle_in_community = 'verwalter')
  );

-- ─── 4. Updated-At Trigger für communities ─────────────────────────────
-- Nutzt generischen moddatetime-Handler falls vorhanden; sonst inline.
CREATE OR REPLACE FUNCTION public.set_updated_at_now()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_communities_updated_at
  BEFORE UPDATE ON public.communities
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_now();
