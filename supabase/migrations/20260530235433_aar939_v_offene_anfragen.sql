-- AAR-939: "Offene Anfragen"-Übersicht für Dispatch — quelle-agnostisch.
-- Die Anfrage (gutachter_finder_anfragen) ist der Capture-Container für ALLE
-- Herkünfte (native Funnel = source NULL, Monika sv_embed, Cluster-LP
-- kfz_gutachter_lp). Diese View kapselt "was liegt unaufgegriffen rum und ist
-- für den Dispatcher AUFGREIFBAR" — eine Quelle der Wahrheit statt der Filter-
-- Logik in jedem Consumer.
--
-- Aufgreifbar = noch nicht promotet (konvertiert_zu_lead_id IS NULL), nicht
-- terminal (status nicht konvertiert/embed_free/storniert) UND mit Kontakt
-- (Telefon ODER Email) — ohne Kontakt kann der Dispatcher nichts tun (live:
-- 2294 offene native-Entwürfe, davon nur 56 mit Kontakt = der echte Vorrat).
-- sa_vorhanden hebt die heißen (SA bereits unterschrieben) nach oben.
--
-- security_invoker (AGENTS.md §aar613): erbt die gfa-RLS des lesenden Users
-- (Admin/Dispatch/SV-own) — kein neuer Lesepfad, keine PII-Ausweitung.
CREATE OR REPLACE VIEW public.v_offene_anfragen
WITH (security_invoker = true) AS
SELECT
  gfa.id,
  gfa.vorname,
  gfa.nachname,
  gfa.email,
  gfa.telefon,
  gfa.kennzeichen,
  gfa.schadentyp,
  gfa.schadenort,
  gfa.wunschtermin,
  gfa.bevorzugter_kanal,
  gfa.sa_unterzeichnet_am,
  gfa.status,
  gfa.erstellt_am,
  gfa.source,
  gfa.variante,
  gfa.embed_site_id,
  gfa.konvertiert_zu_lead_id,
  COALESCE(gfa.source, 'native')              AS herkunft,
  (gfa.sa_unterzeichnet_am IS NOT NULL)       AS sa_vorhanden
FROM public.gutachter_finder_anfragen gfa
WHERE gfa.konvertiert_zu_lead_id IS NULL
  AND gfa.status NOT IN ('konvertiert', 'embed_free', 'storniert')
  AND (
    NULLIF(btrim(coalesce(gfa.telefon, '')), '') IS NOT NULL
    OR NULLIF(btrim(coalesce(gfa.email, '')), '') IS NOT NULL
  );

COMMENT ON VIEW public.v_offene_anfragen IS 'AAR-939: quelle-agnostische Aufgreif-Liste offener Anfragen (gutachter_finder_anfragen) fuer Dispatch — nicht promotet, nicht terminal, mit Kontakt. herkunft=native|sv_embed|kfz_gutachter_lp. security_invoker (erbt gfa-RLS).';
