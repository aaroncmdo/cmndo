-- Umlaut-Pflicht (AGENTS.md §Sprache) fuer nutzersichtbare Flow-Texte.
-- Gefunden 31.08.2026 im Kundenfluss-Smoke: der Unterschrifts-Screen zeigte woertlich
-- "Anwalt + Vollmacht inkl. — 0 EUR, wir regeln alles fuer Sie" — an der prominentesten
-- Stelle des Flusses (direkt ueber der Sicherungsabtretung).
--
-- Bewusst NUR die nutzersichtbaren Felder (description / hint). Die 'value'-Schluessel
-- bleiben unangetastet: 'ueber_monat' in unfall_zeitfenster ist ein DB-Wert, kein Text —
-- ihn zu "korrigieren" wuerde den gespeicherten Wert von der Anzeige entkoppeln.

update onboarding_felder
set optionen = (
  select jsonb_agg(
           case when elem ? 'description'
             then jsonb_set(elem, '{description}', to_jsonb(
                    replace(replace(replace(replace(replace(
                      elem->>'description',
                      'fuer Sie',           'für Sie'),
                      'Kfz-Schaeden',       'Kfz-Schäden'),
                      'kuemmern',           'kümmern'),
                      'uebergeben',         'übergeben'),
                      'Sachverstaendigen',  'Sachverständigen')))
             else elem end
           order by ord)
  from jsonb_array_elements(optionen) with ordinality as t(elem, ord)
)
where optionen::text ~ '(fuer Sie|Kfz-Schaeden|kuemmern|uebergeben|Sachverstaendigen)';

update onboarding_felder
set hint = replace(hint, 'fuer Sie', 'für Sie')
where hint like '%fuer Sie%';
