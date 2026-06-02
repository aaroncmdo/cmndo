-- Vereinheitlichung (Aaron 02.06.): die bezahlte kooperationsvertrag_muster-Vorlage auf
-- denselben aktuellen SV-Kooperationsvertrag (Stand April 2026) heben wie Basic.
-- Saubere Versionierung: alte v1.0 deaktivieren (bleibt fuer Audit + bereits unterzeichnete
-- vertraege_unterzeichnet.vorlage_id-Referenzen erhalten), neue aktive Zeile einfuegen.
-- inhalt_html wird aus der bereits gesetzten sv_basic_partnervertrag-Vorlage kopiert
-- (identischer Vertrag) — kein erneutes Einbetten noetig. signAndStoreContract resolved
-- .eq('typ').eq('aktiv',true).single() -> nach Migration genau eine aktive Zeile.
-- Voraussetzung: Migration 20260602094201 (setzt sv_basic_partnervertrag-Content) lief davor.
UPDATE public.vertragsvorlagen SET aktiv = false, updated_at = now()
  WHERE typ = 'kooperationsvertrag_muster' AND aktiv = true;

INSERT INTO public.vertragsvorlagen (typ, version, titel, inhalt_html, pflicht_unterschrift, aktiv)
SELECT 'kooperationsvertrag_muster', '2026-04',
       'Kooperationsvertrag für Sachverständige (Stand April 2026)',
       inhalt_html, pflicht_unterschrift, true
FROM public.vertragsvorlagen
WHERE typ = 'sv_basic_partnervertrag' AND aktiv = true
LIMIT 1;
