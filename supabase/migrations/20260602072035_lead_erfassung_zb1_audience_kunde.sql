-- P2e (re-scoped, Dispatcher-ZB1): Das zb1-upload-Foto-Feld ist eine Kunden-
-- Self-Service-Aktion (Kamera/OCR). Im Dispatcher-Renderer (flow lead-erfassung,
-- audience='dispatcher') rendert es ohne zb1Token => "Upload-Token fehlt", und
-- der Dispatcher tippt Kennzeichen/Fahrzeugdaten ohnehin manuell (eigene Felder
-- in derselben Sektion 'fahrzeug', reihenfolge 20..170). Daher audience
-- 'beide' -> 'kunde': raus aus der Dispatcher-Sicht, bereit fuer den Kunden-
-- Renderer ab P4 (Flowlink auf lead-erfassung). Das kunde-onboarding-zb1-Feld
-- (andere Phase/Flow) bleibt unberuehrt (Natural-Key-WHERE auf flow_key).
update onboarding_felder f
set audience = 'kunde'
from onboarding_phasen p
where f.phase_id = p.id
  and p.flow_key = 'lead-erfassung'
  and f.feld_key = 'fahrzeugschein_foto'
  and f.typ = 'zb1-upload';
