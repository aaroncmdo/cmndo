-- Wissensbasis "Werkstattbindung in Kasko-Tarifen" (Spec 2026-09-04, Aaron E1: eigene MARKEN-Ebene).
-- CHECK24 nennt Vertriebsmarken (HUK24, CosmosDirekt), public.versicherungen haelt BaFin-Rechtstraeger;
-- 1 Marke -> 2 Rechtstraeger (HUK) und 1 Rechtstraeger -> n Marken (RheinLand/rhion.digital) kommen beide vor.
-- versicherung_id ist deshalb ein optionaler Link (Hotline/Schaden-Mail), keine Identitaet.
-- Referenzdaten wie flow_szenarien/anspruch_config: anon+authenticated lesen (der /flow laeuft ohne Login),
-- schreiben nur service_role (Seed-Migrationen, kein Admin-Editor in Phase 1).

CREATE TABLE public.kasko_versicherer_marken (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             text NOT NULL UNIQUE,
  marke            text NOT NULL UNIQUE,
  versicherung_id  uuid REFERENCES public.versicherungen(id) ON DELETE SET NULL,
  wb_status        text NOT NULL,
  wb_marker        text[] NOT NULL DEFAULT '{}',
  nicht_wb_marker  text[] NOT NULL DEFAULT '{}',
  hinweis          text,
  varianten_hinweis text,
  check24_vertrieb text,
  quelle           text NOT NULL,
  stand            date NOT NULL,
  sortierung       integer NOT NULL DEFAULT 100,
  aktiv            boolean NOT NULL DEFAULT true,
  erstellt_am      timestamptz NOT NULL DEFAULT now(),
  aktualisiert_am  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kasko_versicherer_marken_wb_status_check CHECK (wb_status IN ('optional','standard','keine')),
  CONSTRAINT kasko_versicherer_marken_vertrieb_check CHECK (check24_vertrieb IS NULL OR check24_vertrieb IN ('P','L'))
);
COMMENT ON TABLE public.kasko_versicherer_marken IS
  'Kasko-Versicherer-MARKEN (CHECK24-Vertriebsnamen) mit Werkstattbindungs-Status. optional = WB ist waehlbare Variante (Marker im Tarifnamen), standard = alle Tarife gebunden, keine = kein WB-Tarif. versicherung_id = optionaler Link auf den Rechtstraeger (Hotline/Schaden-Mail).';
COMMENT ON COLUMN public.kasko_versicherer_marken.wb_marker IS 'Exakte Namenszusaetze, die die WB-Variante kennzeichnen (z.B. SELECT, mit Werkstattbonus). Fuer die Rueckfrage am Versicherungsschein.';
COMMENT ON COLUMN public.kasko_versicherer_marken.nicht_wb_marker IS 'Verwechsler ohne Bindungswirkung (Kasko Spezial, Kasko PLUS, Nix-Passiert, Vorkasse ...).';
CREATE INDEX kasko_versicherer_marken_aktiv_sort_idx ON public.kasko_versicherer_marken (aktiv, sortierung);

CREATE TABLE public.kasko_tarife (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marke_id             uuid NOT NULL REFERENCES public.kasko_versicherer_marken(id) ON DELETE CASCADE,
  linie                text NOT NULL,
  wb_zusatz            text,
  anzeigename          text NOT NULL,
  hat_werkstattbindung boolean NOT NULL,
  bindungsumfang       text NOT NULL DEFAULT 'keine',
  verlaesslichkeit     text NOT NULL DEFAULT 'belegt',
  reihenfolge          integer NOT NULL DEFAULT 100,
  aktiv                boolean NOT NULL DEFAULT true,
  CONSTRAINT kasko_tarife_marke_anzeige_unique UNIQUE (marke_id, anzeigename),
  CONSTRAINT kasko_tarife_umfang_check CHECK (bindungsumfang IN ('keine','voll','nur_glas','unklar')),
  CONSTRAINT kasko_tarife_verlaesslichkeit_check CHECK (verlaesslichkeit IN ('belegt','abgeleitet','nicht_belegt')),
  CONSTRAINT kasko_tarife_umfang_konsistent CHECK ((hat_werkstattbindung AND bindungsumfang <> 'keine') OR (NOT hat_werkstattbindung AND bindungsumfang = 'keine'))
);
COMMENT ON TABLE public.kasko_tarife IS 'Tariflinien je Marke, expandiert: eine Zeile ohne WB-Zusatz (frei) und je WB-Zusatz eine Zeile (gebunden). anzeigename = was auf dem Versicherungsschein steht. bindungsumfang nur_glas = Bindung nur fuer Glasschaeden (Signal Iduna Sorglos Kasko Glas).';
CREATE INDEX kasko_tarife_marke_idx ON public.kasko_tarife (marke_id, aktiv, reihenfolge);

CREATE TABLE public.kasko_wb_konditionen (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key             text NOT NULL UNIQUE,
  marke_id        uuid UNIQUE REFERENCES public.kasko_versicherer_marken(id) ON DELETE CASCADE,
  nachlass_text   text,
  sanktion_modell text NOT NULL DEFAULT 'unbekannt',
  sanktion_text   text,
  gilt_fuer       text,
  ausnahmen_text  text,
  partnernetz     text,
  akb_fundstelle  text,
  quelle          text,
  CONSTRAINT kasko_wb_konditionen_sanktion_check CHECK (sanktion_modell IN
    ('kuerzung_80','kuerzung_85','sonder_sb','deckelung','vollverweigerung','kuerzung_unbestimmt','keine','unbekannt'))
);
COMMENT ON TABLE public.kasko_wb_konditionen IS 'Belegte Konditionen je Marke (Nachlass, Sanktion bei Reparatur ausserhalb des Netzes, Partnernetz, AKB-Fundstelle). key=__default__ mit marke_id NULL = GDV-Muster fuer alle uebrigen.';

ALTER TABLE public.kasko_versicherer_marken ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kasko_tarife ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kasko_wb_konditionen ENABLE ROW LEVEL SECURITY;
CREATE POLICY kasko_versicherer_marken_read ON public.kasko_versicherer_marken FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY kasko_tarife_read ON public.kasko_tarife FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY kasko_wb_konditionen_read ON public.kasko_wb_konditionen FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.kasko_versicherer_marken, public.kasko_tarife, public.kasko_wb_konditionen TO anon, authenticated;
