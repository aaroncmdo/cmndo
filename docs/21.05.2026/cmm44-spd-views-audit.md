# CMM-44 SP-D — Views Audit (2026-05-21)

Live-Audit welche Views eine der 25 SP-D-Spalten exponieren.
Query: `information_schema.columns JOIN information_schema.views` auf alle 25 Spalten-Namen.

## Treffer

| view_name | column_name |
|---|---|
| faelle_kunde_view | besichtigungsort_adresse |
| faelle_kunde_view | nachbesichtigung_kunde_termin_eingereicht_am |
| faelle_kunde_view | nachbesichtigung_kunde_termin_vorschlaege |
| faelle_kunde_view | nachbesichtigung_status |
| faelle_kunde_view | nachbesichtigung_sv_konfrontation_gewuenscht |
| faelle_kunde_view | nachbesichtigung_termin_datum |
| faelle_sv_view | besichtigungsort_adresse |
| faelle_sv_view | nachbesichtigung_status |
| faelle_sv_view | nachbesichtigung_sv_konfrontation_gewuenscht |
| faelle_sv_view | nachbesichtigung_sv_termin_vereinbart_am |
| faelle_sv_view | nachbesichtigung_termin_datum |
| v_claim_full | besichtigungsort_adresse |
| v_claim_full | besichtigungsort_lat |
| v_claim_full | besichtigungsort_lng |
| v_claim_full | besichtigungsort_notiz |
| v_claim_full | besichtigungsort_place_id |
| v_claim_full | no_show_gemeldet_am |
| v_claim_full | re_termin_eskalation_an_kb_am |
| v_claim_full | re_termin_token |
| v_claim_full | re_termin_token_eingelaufen_am |
| v_faelle_mit_aktuellem_termin | besichtigungsort_adresse |
| v_faelle_mit_aktuellem_termin | besichtigungsort_lat |
| v_faelle_mit_aktuellem_termin | besichtigungsort_lng |
| v_faelle_mit_aktuellem_termin | besichtigungsort_place_id |
| v_faelle_mit_aktuellem_termin | gcal_event_id (DUP — kein ADD) |
| v_faelle_mit_aktuellem_termin | geschaetzte_fahrdistanz_km |
| v_faelle_mit_aktuellem_termin | geschaetzte_fahrzeit_min (DUP — kein ADD) |
| v_faelle_mit_aktuellem_termin | losfahren_erinnerung_gesendet |
| v_faelle_mit_aktuellem_termin | nachbesichtigung_angefordert_am |
| v_faelle_mit_aktuellem_termin | nachbesichtigung_ergebnis |
| v_faelle_mit_aktuellem_termin | nachbesichtigung_konfrontation |
| v_faelle_mit_aktuellem_termin | nachbesichtigung_kunde_termin_eingereicht_am |
| v_faelle_mit_aktuellem_termin | nachbesichtigung_kunde_termin_vorschlaege |
| v_faelle_mit_aktuellem_termin | nachbesichtigung_status |
| v_faelle_mit_aktuellem_termin | nachbesichtigung_sv_konfrontation_gewuenscht |
| v_faelle_mit_aktuellem_termin | nachbesichtigung_sv_termin_vereinbart_am |
| v_faelle_mit_aktuellem_termin | nachbesichtigung_termin_datum |
| v_faelle_mit_aktuellem_termin | no_show_gemeldet_am |
| v_faelle_mit_aktuellem_termin | sv_termin_dokument_reminder_gesendet_am |
| v_faelle_mit_aktuellem_termin | termin_erinnerung_5min_gesendet |
| v_faelle_mit_aktuellem_termin | wunschtermin |

## Betroffene Views (4)

1. **faelle_kunde_view** — 6 Treffer (besichtigungsort_adresse + 5 nachbesichtigung-*)
2. **faelle_sv_view** — 5 Treffer (besichtigungsort_adresse + 4 nachbesichtigung-*)
3. **v_claim_full** — 10 Treffer (besichtigungsort_* + re_termin_* + no_show)
4. **v_faelle_mit_aktuellem_termin** — alle 23 ADD-Spalten + 2 DUP-Spalten (gcal_event_id, geschaetzte_fahrzeit_min)

Hinweis: Die 2 DUP-Spalten (`gcal_event_id`, `geschaetzte_fahrzeit_min`) erscheinen nur in `v_faelle_mit_aktuellem_termin`. Sie werden in PR2 via Reader-Switch auf die bestehenden GT-Spalten (`google_event_id`, `geschaetzte_fahrtzeit_min`) umgestellt.

## Deferred View-Repoint (post-PR2)

**KEIN View-Repoint in PR1.** Die faelle-Spalten bleiben stehen (sterben erst in Phase 6), daher lesen alle 4 Views weiterhin korrekt von faelle. Der View-Repoint ist gated auf:

- SP-G2 PR2 (#1525) muss auf staging gemergt sein, bevor `v_faelle_mit_aktuellem_termin` und `v_claim_full` angepasst werden (die View-Defs muessen auf der post-PR2-Definition aufsetzen — sonst git-Def-Drift)
- Danach: SP-D View-Migration als separater Commit (PR2-Phase)

Prioritaet nach PR2-staging-Merge:
- `v_faelle_mit_aktuellem_termin` — hoechste Prioritaet (23 von 23 ADD-Spalten betroffen; bereits auf gt.claim_id re-keyed durch SP-G2)
- `v_claim_full` — 10 Spalten betroffen
- `faelle_kunde_view` — 6 Spalten
- `faelle_sv_view` — 5 Spalten

## Status

- PR1 (diese Migration): ADD+Backfill only — kein View-Block. Views bleiben unberuehrt (faelle-Spalten existieren noch).
- PR2: Reader/Writer-Sweep + View-Repoints (nach PR2-staging-Merge).
- PR3: COALESCE-Catchup-Backfill.
