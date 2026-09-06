-- Anrede-Umstellung Du -> Sie in den VORLAGEN-Tabellen.
--
-- Warum ueberhaupt eine Migration: Diese Texte stehen nicht im Code, sondern in der Datenbank,
-- und die UI liest sie zur Laufzeit. Eine reine Code-Umstellung erreicht sie nicht — die
-- Onboarding-Seite haette weiter "Gehoert das Fahrzeug dir?" gefragt, waehrend alles darum
-- herum siezt.
--
-- Adressiert wird ueber den FACHLICHEN Schluessel (feld_key / phase_key / position), nicht ueber
-- die UUID: eine harte UUID bricht den Preview-Replay, sobald die Zeile dort fehlt.
--
-- BEWUSST NICHT umgestellt: `mitteilungen` (328 Zeilen) und `tasks` (25). Das ist erzeugte
-- HISTORIE — Nachrichten, die Nutzern bereits zugestellt wurden. Sie nachtraeglich umzuschreiben
-- waere Geschichtsfaelschung, und sie erscheinen nirgends neu. Ihre Erzeuger im Code sind mit
-- demselben PR umgestellt, kuenftige Nachrichten siezen also.

-- 1) Onboarding-Felder: Beschriftungen und Platzhalter, die der Kunde bzw. der SV direkt liest.
update public.onboarding_felder set label = 'Gehört Ihnen das Fahrzeug?'          where feld_key = 'ist_fahrzeughalter';
update public.onboarding_felder set label = 'Haben Sie schon eine Werkstatt?'      where feld_key = 'reparatur_vermittlung_status';
update public.onboarding_felder set label = 'Name Ihrer Werkstatt'                 where feld_key = 'reparatur_werkstatt_extern';
update public.onboarding_felder set label = 'Wie möchten Sie den Schaden abrechnen?' where feld_key = 'reparaturwunsch';
update public.onboarding_felder set label = 'Was ist an Ihrem Fahrzeug beschädigt?'  where feld_key = 'schadenskategorie';
update public.onboarding_felder set placeholder = 'Worauf sind Sie spezialisiert?' where feld_key = 'profilbeschreibung';

-- 2) Onboarding-Phasen: Titel und Beschreibung der SV-Einrichtung.
update public.onboarding_phasen
   set beschreibung = 'Wir verifizieren Ihre Nummer für die Koordination der Termine.'
 where phase_key = 'identitaet';
update public.onboarding_phasen
   set titel = 'Ihr Profil', beschreibung = 'Ein Foto und eine kurze Beschreibung für Ihre Kunden.'
 where phase_key = 'profil';
update public.onboarding_phasen
   set titel = 'Ihr Standort', beschreibung = 'Ihre Adresse und Ihr Einsatzgebiet.'
 where phase_key = 'standort';

-- 3) Werkstatt-Onboarding: Betreffzeilen der Mailstrecke an neue Partnerbetriebe.
update public.werkstatt_onboarding_steps set betreff = 'Willkommen bei Claimondo – so startet Ihr erster Fall' where position = 1;
update public.werkstatt_onboarding_steps set betreff = 'Ihre Rechnung – voll, nicht gekürzt'                    where position = 2;
update public.werkstatt_onboarding_steps set betreff = 'Ihr Gutachter in [Region]: [Gutachter-Name]'            where position = 3;
update public.werkstatt_onboarding_steps set betreff = 'So erleben Ihre Kunden Claimondo'                       where position = 4;
update public.werkstatt_onboarding_steps set betreff = '200 € für Ihren ersten Fall ab 4.000 €'                 where position = 5;
