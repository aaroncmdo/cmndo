-- SOFORT-RUECKROLLUNG von 20260828111338 (gleiche Session, ~16 Minuten spaeter).
--
-- Fehler: die Migration wurde appliziert, BEVOR der zugehoerige Code live ist.
-- `werkstatt_waehlbar` entsteht in src/lib/self-service/flow-kontext.ts — das liegt erst
-- im PR. Der laufende prod-Code liefert das Feld nicht, und `erfuelltBedingung` vergleicht
-- `undefined === 'ja'` -> false. Folge: der Werkstatt-Step war fuer ALLE Kunden
-- ausgeblendet, auch fuer die mit Reparaturwunsch. Also genau die Drift-Konstellation
-- "DB voraus, Code zurueck", vor der AGENTS.md Regel 3 warnt.
--
-- Die Bedingung geht auf den Stand vor 20260828111338 zurueck. Die eigentliche Aenderung
-- wird NACH dem Deploy des PR erneut angewendet (dann liefert der Kontext das Feld).
--
-- ⚠ LEHRE fuer config-getriebene Flows: Eine Zeile in `flow_szenario_steps` ist zwar
-- "nur Konfiguration", wirkt aber SOFORT auf prod — waehrend der Code, der die neuen
-- Kontext-Felder liefert, erst mit dem Deploy kommt. Bei einer Bedingung, die ein NEUES
-- Feld referenziert, gehoert die Migration deshalb HINTER den Deploy, nicht davor.

update public.flow_szenario_steps
   set bedingung = '{"gutachten_vermittelt": null, "reparatur_werkstatt_id": null}'::jsonb
 where step_id = 'werkstatt'
   and bedingung = '{"gutachten_vermittelt": null, "werkstatt_waehlbar": "ja"}'::jsonb;
