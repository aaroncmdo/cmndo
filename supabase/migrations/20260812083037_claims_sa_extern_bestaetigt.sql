-- Ops-Test 12.08. (RC-9 Folge, Aaron-Entscheid): Bei der Werkstatt-Vermittlung im
-- Haftpflichtfall verlangt die P4-Invariante (Spec 3 §4) eine Kunden-Bestaetigung,
-- weil die Sicherungsabtretung dort die Legitimationsgrundlage ist. Im
-- SV-Vermittlungsfall hat der Sachverstaendige die SA aber bereits OFFLINE eingeholt
-- — eine zweite digitale Unterschrift des Kunden ist dann sinnlos und blockierte die
-- Vermittlung komplett ("kein Auftrag angelegt", Ops-Test #23).
--
-- Bewusst NICHT sa_unterschrieben=true gesetzt: das wuerde eine digitale Signatur
-- behaupten, die es nicht gibt (sa_pdf_url/sa_unterschrift_url blieben leer) und
-- Kanzlei/Regulierung in die Irre fuehren. Stattdessen ein eigenes, nachweisbares
-- Signal MIT Urheber und Zeitpunkt.
alter table public.claims
  add column if not exists sa_extern_bestaetigt_am timestamptz,
  add column if not exists sa_extern_bestaetigt_von uuid;

comment on column public.claims.sa_extern_bestaetigt_am is
  'Ops-Test 12.08.: Zeitpunkt der Bestaetigung, dass die Sicherungsabtretung dem Sachverstaendigen bereits offline/analog vorliegt. Ersetzt im Haftpflicht-Vermittlungs-Gate die digitale Kunden-Unterschrift (kundeHatBestaetigt). NICHT mit sa_unterschrieben verwechseln — dort steht die echte digitale Signatur.';

comment on column public.claims.sa_extern_bestaetigt_von is
  'auth.users.id des Bestaetigenden (Dispatch/Admin/KB/SV). Nachweiskette fuer sa_extern_bestaetigt_am.';
