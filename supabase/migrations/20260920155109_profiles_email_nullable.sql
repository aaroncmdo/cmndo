-- Stufe 2 "Konto nur mit Telefon" (Soll-Blatt 2026-09-20-kunde-konto-nur-telefon-stufe-2.md, 6b):
-- profiles.email war die einzige NOT-NULL-Spalte neben id. UNIQUE (profiles_email_key) bleibt —
-- NULLs kollidieren nicht. Abhaengige Views/Funktionen gelesen (v_claim_parties_safe,
-- v_vertrieb_kontakt, dsgvo_anonymize_user_data, create_auto_beratungstermin,
-- set_reparatur_werkstatt_from_qr): keine setzt NOT NULL voraus.
alter table public.profiles alter column email drop not null;
