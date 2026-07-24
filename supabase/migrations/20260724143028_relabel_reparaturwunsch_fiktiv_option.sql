-- FlowLink-Review C (Aaron 24.07.): das reparaturwunsch-Option-Label
-- "Fiktiv (Auszahlung, keine Reparatur)" ist inhaltlich falsch — bei fiktiver
-- Abrechnung wird sehr wohl eine Reparatur/Werkstatt angeboten (der Kunde kann
-- z.B. guenstiger in seiner Wunschwerkstatt reparieren + die Differenz behalten,
-- SP4d / brauchtWerkstattVermittlung inkludiert 'fiktiv'). Nur der Kostenvoranschlag
-- wird nicht als Abrechnungsbasis erhoben. Neues Label: Reparatur ist "optional".
-- Reine Config-Daten-Aenderung (onboarding_felder.optionen), reversibel.
UPDATE onboarding_felder
SET optionen = (
  SELECT jsonb_agg(
           CASE
             WHEN elem->>'value' = 'fiktiv'
               THEN jsonb_build_object(
                      'label', 'Fiktive Abrechnung (Auszahlung, Reparatur optional)',
                      'value', 'fiktiv'
                    )
             ELSE elem
           END
           ORDER BY ord
         )
  FROM jsonb_array_elements(optionen) WITH ORDINALITY AS t(elem, ord)
)
WHERE feld_key = 'reparaturwunsch';
