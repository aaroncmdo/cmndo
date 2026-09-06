-- Nachtrag zu 20260906005321 (Anrede Du -> Sie in den Vorlagen-Tabellen).
--
-- Die dortige Ersetzung hat Anrede-Pronomen getauscht, aber Verb und Possessivpronomen
-- stehen gelassen. Ergebnis: gemischtes Register in DREI live ausgelieferten Texten,
-- zwei davon in E-Mail-Vorlagen an Werkstaetten. Gefunden beim Drain-Gate-2, nachdem
-- dieselbe Fehlerklasse zuvor im Code auftrat (dort 15 Saetze, PR #5912).
--
--   onboarding_felder / reparatur_werkstatt_extern .hint
--     "Name Ihrer Werkstatt" + "Optional - falls DU schon eine Werkstatt HAST."
--   werkstatt_onboarding_steps / willkommen .preheader
--     "... so startet IHR erster Fall" + "Kein Aufwand fuer DICH - DEIN Kunde scannt ..."
--   werkstatt_onboarding_steps / kundenstory .preheader
--     "So erleben IHRE Kunden ..." + "... was sie ueber DEINE Werkstatt sagt."
--
-- Reine Grammatik, keine inhaltliche Aenderung. Idempotent: die WHERE-Klausel greift
-- nur auf den kaputten Wortlaut, ein zweiter Lauf aendert nichts.

update public.onboarding_felder
   set hint = 'Optional — falls Sie schon eine Werkstatt haben.'
 where feld_key = 'reparatur_werkstatt_extern'
   and hint = 'Optional — falls du schon eine Werkstatt hast.';

update public.werkstatt_onboarding_steps
   set preheader = 'Kein Aufwand für Sie – Ihr Kunde scannt, wir übernehmen den Rest.'
 where template_key = 'willkommen'
   and preheader = 'Kein Aufwand für dich – dein Kunde scannt, wir übernehmen den Rest.';

update public.werkstatt_onboarding_steps
   set preheader = 'Eine kurze Kundenstory – und was sie über Ihre Werkstatt sagt.'
 where template_key = 'kundenstory'
   and preheader = 'Eine kurze Kundenstory – und was sie über deine Werkstatt sagt.';
