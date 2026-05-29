-- AAR-939 · Monika-Embed · Stream 1 (3/3): embed_abrechnung_positionen
--
-- Child der BESTEHENDEN polymorphen abrechnungen-Tabelle (Aaron 29.05.2026):
-- Der Monats-Kopf (Stream 8) ist 1 Datensatz in abrechnungen mit empfaenger_typ='sv'
-- + empfaenger_id = sachverstaendige.id; die €70-Termin-Einzelpositionen liegen hier.
--
-- UNIQUE(anfrage_id) → strukturelle Sperre gegen Doppelabrechnung desselben
-- Termins (R15). anfrage_id zeigt auf gutachter_finder_anfragen (= die Anfrage-Tabelle).
--
-- ON DELETE-Strategie (explizit, statt implizitem RESTRICT):
--   • anfrage_id  ON DELETE SET NULL (nullable): überlebt DSGVO-Hard-Delete der Anfrage
--       (Cron dsgvo_hard_delete). Rechnungsdaten bleiben über leistung_text-Snapshot +
--       abrechnungen-Kopf erhalten. Partieller UNIQUE (WHERE anfrage_id IS NOT NULL)
--       verhindert Doppelabrechnung zum Erstellungszeitpunkt (da ist anfrage_id gesetzt).
--   • embed_site_id ON DELETE RESTRICT: Embed-Site mit Abrechnungshistorie nicht löschbar.
--   • abrechnung_id ON DELETE CASCADE: Position ohne Kopf ist bedeutungslos (Storno setzt
--       in abrechnungen storniert_am, löscht nicht).
--   • termin_id ON DELETE SET NULL.

CREATE TABLE IF NOT EXISTS public.embed_abrechnung_positionen (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  abrechnung_id   uuid NOT NULL REFERENCES public.abrechnungen(id) ON DELETE CASCADE,
  embed_site_id   uuid NOT NULL REFERENCES public.embed_sites(id) ON DELETE RESTRICT,
  anfrage_id      uuid REFERENCES public.gutachter_finder_anfragen(id) ON DELETE SET NULL,
  termin_id       uuid REFERENCES public.gutachter_termine(id) ON DELETE SET NULL,
  einzelpreis_eur numeric(10,2) NOT NULL DEFAULT 70.00,
  leistung_text   text NOT NULL,   -- 'Vermittelter Termin · {Kunde} · {Stadt} · {Datum}'
  erstellt_am     timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Partieller UNIQUE: 1 Position pro Anfrage (R15). NULL (nach DSGVO-Delete) ausgenommen.
CREATE UNIQUE INDEX IF NOT EXISTS idx_embed_abr_pos_anfrage
  ON public.embed_abrechnung_positionen(anfrage_id) WHERE anfrage_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_embed_abr_pos_abrechnung ON public.embed_abrechnung_positionen(abrechnung_id);
CREATE INDEX IF NOT EXISTS idx_embed_abr_pos_site       ON public.embed_abrechnung_positionen(embed_site_id);

-- updated_at via geteilte Trigger-Funktion (cmm32a-Standard: setzt NEW.updated_at = now()).
DROP TRIGGER IF EXISTS embed_abr_pos_updated_at ON public.embed_abrechnung_positionen;
CREATE TRIGGER embed_abr_pos_updated_at
  BEFORE UPDATE ON public.embed_abrechnung_positionen
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_auftraege_set_updated_at();

ALTER TABLE public.embed_abrechnung_positionen ENABLE ROW LEVEL SECURITY;

-- Admin: alles
DROP POLICY IF EXISTS embed_pos_admin_all ON public.embed_abrechnung_positionen;
CREATE POLICY embed_pos_admin_all ON public.embed_abrechnung_positionen
  FOR ALL TO authenticated USING (public.is_admin());

-- SV: eigene Positionen (über Inhaberschaft der embed_site)
DROP POLICY IF EXISTS embed_pos_sv_select ON public.embed_abrechnung_positionen;
CREATE POLICY embed_pos_sv_select ON public.embed_abrechnung_positionen
  FOR SELECT TO authenticated
  USING (
    embed_site_id IN (
      SELECT id FROM public.embed_sites WHERE inhaber_profile_id = auth.uid()
    )
  );

-- Kein authenticated-Write → default-deny; Cron schreibt via service_role.

COMMENT ON TABLE public.embed_abrechnung_positionen IS
  'AAR-939 Monika-Embed: Einzelpositionen (€70/Termin) zur Monats-Sammelrechnung. Kopf = abrechnungen(empfaenger_typ=''sv''). Partieller UNIQUE(anfrage_id) sperrt Doppelabrechnung.';
