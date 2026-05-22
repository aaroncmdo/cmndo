-- CMM-44 SP-H PR3 — Catch-up-Backfill (additiv, kein DROP)
--
-- Idempotenter Re-Backfill der 18 SP-H Auftrag-Lifecycle-Spalten
-- auftraege <- faelle via UPDATE mit COALESCE-Pattern. Bestehende
-- auftraege-Werte gewinnen (COALESCE(a.col, f.col)) — faengt nur NULL-
-- Luecken aus faelle-Writes, die zwischen PR1-Apply (#1520) und
-- PR2-Writer-Deploy (#1537) noch auf faelle landeten. Pre-launch
-- realistisch ~0 betroffen (1 Auftrag, Writer bereits gesweept).
--
-- Für die 3 NOT-NULL-faehigen Spalten (filmcheck_ok, sv_briefing_version,
-- technische_stellungnahme_status) ist COALESCE ein No-op-Schutz: der
-- bestehende auftraege-Wert (ggf. Default) bleibt erhalten.
--
-- Nach Apply: npx supabase migration repair --status applied 20260522113102
-- Ticket: CMM-44 / Sub-Projekt SP-H / Plan Task 6

BEGIN;

UPDATE public.auftraege a SET
  filmcheck_ok                            = COALESCE(a.filmcheck_ok, f.filmcheck_ok),
  filmcheck_am                            = COALESCE(a.filmcheck_am, f.filmcheck_am),
  filmcheck_notizen                       = COALESCE(a.filmcheck_notizen, f.filmcheck_notizen),
  storniert_am                            = COALESCE(a.storniert_am, f.storniert_am),
  storno_grund                            = COALESCE(a.storno_grund, f.storno_grund),
  storno_durch_user_id                    = COALESCE(a.storno_durch_user_id, f.storno_durch_user_id),
  besichtigung_gestartet_am               = COALESCE(a.besichtigung_gestartet_am, f.besichtigung_gestartet_am),
  sv_briefing_text                        = COALESCE(a.sv_briefing_text, f.sv_briefing_text),
  sv_briefing_generated_at                = COALESCE(a.sv_briefing_generated_at, f.sv_briefing_generated_at),
  sv_briefing_model                       = COALESCE(a.sv_briefing_model, f.sv_briefing_model),
  sv_briefing_version                     = COALESCE(a.sv_briefing_version, f.sv_briefing_version),
  sv_briefing_struktur                    = COALESCE(a.sv_briefing_struktur, f.sv_briefing_struktur),
  sv_notizen_vor_ort                      = COALESCE(a.sv_notizen_vor_ort, f.sv_notizen_vor_ort),
  technische_stellungnahme_status         = COALESCE(a.technische_stellungnahme_status, f.technische_stellungnahme_status),
  technische_stellungnahme_notiz_sv       = COALESCE(a.technische_stellungnahme_notiz_sv, f.technische_stellungnahme_notiz_sv),
  technische_stellungnahme_beauftragt_am  = COALESCE(a.technische_stellungnahme_beauftragt_am, f.technische_stellungnahme_beauftragt_am),
  technische_stellungnahme_hochgeladen_am = COALESCE(a.technische_stellungnahme_hochgeladen_am, f.technische_stellungnahme_hochgeladen_am),
  technische_stellungnahme_freigabe_am    = COALESCE(a.technische_stellungnahme_freigabe_am, f.technische_stellungnahme_freigabe_am)
FROM public.faelle f
WHERE a.claim_id = f.claim_id;

COMMIT;
