-- AAR-826.3: Schema-Ergänzungen für Cron-Jobs
--
-- Die Cron-Jobs aus AAR-826 brauchen Spalten, die in den Sub-Asset-Migrations
-- (AAR-821/823/824) noch nicht vollständig waren. Diese Migration fügt sie hinzu.

-- ─── vs_korrespondenz: Status-Lifecycle + Fristen ────────────────────────────

ALTER TABLE public.vs_korrespondenz
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'gesendet'
    CHECK (status IN ('gesendet','wartet_auf_antwort','ohne_antwort_abgelaufen','beantwortet','archiviert')),
  ADD COLUMN IF NOT EXISTS wartet_auf_antwort_bis TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS typ TEXT;  -- z.B. 'forderung','mahnung_1','mahnung_2','rüge','klage','antwort'

CREATE INDEX IF NOT EXISTS idx_vsk_status ON public.vs_korrespondenz(status)
  WHERE status NOT IN ('beantwortet','archiviert');
CREATE INDEX IF NOT EXISTS idx_vsk_frist ON public.vs_korrespondenz(wartet_auf_antwort_bis)
  WHERE wartet_auf_antwort_bis IS NOT NULL AND status = 'wartet_auf_antwort';

-- ─── gutachten_fotos: EXIF + Kategorie ───────────────────────────────────────

ALTER TABLE public.gutachten_fotos
  ADD COLUMN IF NOT EXISTS exif_processed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS kategorie TEXT CHECK (kategorie IN (
    'uebersicht','vin','kennzeichen','tacho','schadenstelle','innen','sonstiges'
  ));

CREATE INDEX IF NOT EXISTS idx_gf_exif_pending ON public.gutachten_fotos(id)
  WHERE exif_processed = FALSE;

-- ─── claim_mietwagen: Anmietungs-Tracking + Rechnung ─────────────────────────

ALTER TABLE public.claim_mietwagen
  ADD COLUMN IF NOT EXISTS erstattbar_max_tage INTEGER,
  ADD COLUMN IF NOT EXISTS rechnung_url        TEXT;

-- Hinweis: anmietung_von = beginn_datum, anmietung_bis = ende_datum (bereits vorhanden)

-- ─── claims: Verjährungs-Datum ────────────────────────────────────────────────

ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS verjaehrt_am DATE;

COMMENT ON COLUMN public.claims.verjaehrt_am IS
  'AAR-826: Verjährungs-Datum des Anspruchs. '
  'Typisch: schadentag + 3 Jahre. cron_verjaehrungs_warner alarmiert 90d vorher.';

-- ─── airdrop_invitations: abgelaufen_am ──────────────────────────────────────
-- Für präzisen Cleanup-Cron: wann wurde die Einladung auf abgelaufen gesetzt

ALTER TABLE public.airdrop_invitations
  ADD COLUMN IF NOT EXISTS abgelaufen_am TIMESTAMPTZ;

COMMENT ON COLUMN public.airdrop_invitations.abgelaufen_am IS
  'AAR-826: Zeitpunkt zu dem status=abgelaufen gesetzt wurde. '
  'Cleanup-Cron löscht nach > 30 Tagen.';

DO $$
BEGIN
  RAISE NOTICE '
    AAR-826.3 Schema-Ergänzungen abgeschlossen:
    - vs_korrespondenz.status + wartet_auf_antwort_bis + typ
    - gutachten_fotos.exif_processed + kategorie
    - claim_mietwagen.erstattbar_max_tage + rechnung_url
    - claims.verjaehrt_am
    - airdrop_invitations.abgelaufen_am';
END $$;
