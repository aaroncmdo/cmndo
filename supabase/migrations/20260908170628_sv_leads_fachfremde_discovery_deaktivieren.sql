-- Fachfremde Discovery-Leads von der Kfz-Karte nehmen (Aaron 08.09.2026, "dringend").
--
-- Die Places-Discovery hat neben Kfz-Sachverstaendigen auch Bau-, Immobilien-,
-- Schimmel-, Elektro-, Photovoltaik- und Handwerks-Sachverstaendige eingesammelt.
-- Seit der Freischaltung (20260901224453) stehen sie als Kfz-Gutachter auf
-- /gutachter-partner und als Pins im oeffentlichen Finder-Embed.
--
-- Es gibt kein zweites Signal (dat_id/bvsk_nr/oebuv_nr/qualifikationen sind bei
-- allen 9.957 Discovery-Leads NULL) -- der Name ist die einzige Achse. Zwei
-- Mustergruppen, beide vollstaendig gelesen (204 + 103 = 307 Namen), kein
-- Kfz-Betrieb darunter. Mischbetriebe ("KFZ & Immobilien") bleiben ueber den
-- Kfz-Ausschluss aktiv (4 Stueck).
--
-- Notiz-Spur: ohne sie weiss in drei Monaten niemand, warum diese Zeilen entgegen
-- dem Spalten-Default auf false stehen -- genau die Luecke, die am 02.09. eine
-- Session zum Raetseln brachte.
--
-- Idempotent: trifft nur aktive, offene, nicht konvertierte Discovery-Leads.
-- Im Preview-Replay (leere Tabelle) trifft es 0 Zeilen.

update public.sv_leads
   set ist_aktiv = false,
       notizen = concat_ws(E'\n', notizen,
         '2026-09-08: deaktiviert -- fachfremd (Bau/Immobilien/Schimmel/Elektro/Handwerk), per Namensmuster; Auftrag Aaron')
 where ist_aktiv
   and quelle = 'places_discovery'
   and claim_status = 'offen'
   and konvertiert_zu_sv_id is null
   and coalesce(firma, name) !~* '(kfz|auto|fahrzeug|unfall|pkw|lkw|motorrad|karosserie|oldtimer)'
   and (
        coalesce(firma, name) ~* '(bausachverst|baugutacht|schimmel|immobilienbewert|gebäudeschad|gebaeudeschad)'
     or coalesce(firma, name) ~* '(immobiliengutacht|immobiliensachverst|immobilienwert|hauskauf|energieberat|holzschutz|bautenschutz|radon|bauschad|baumängel|baumaengel|bauwesen|baubegleit|hochbau|wertermittl|verkehrswert|gebäude|gebaeude|schadstoff|feuchte|abdichtung|architekt|bauleit|tiefbau|statik|brandschutz|holzbau|dachdeck|maler|elektro|sanitär|sanitaer|heizung|wärmepumpe|photovoltaik|solar)'
   );
