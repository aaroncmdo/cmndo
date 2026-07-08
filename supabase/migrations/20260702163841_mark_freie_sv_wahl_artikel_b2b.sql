-- Content-Klassifikation: den bestehenden SV-Fachwissen-Artikel als B2B markieren,
-- damit er im B2B-Community-Feed (audience='b2b') als Redaktions-Beitrag erscheint.
-- Additiv: die Consumer-/wissen-Liste filtert NICHT nach audience -> kein SEO-Verlust,
-- der Artikel bleibt fuer Unfallgeschaedigte sichtbar und erscheint zusaetzlich im B2B-Feed.
-- Slug-basiert (reproduzierbar, keine generierten IDs); auf anderen Umgebungen 0 Zeilen = harmlos.
update public.wissen_artikel
set audience = 'b2b',
    tags = case when coalesce(array_length(tags, 1), 0) = 0
                then array['Recht & Urteile','Gutachten']
                else tags end
where slug = 'freie-wahl-kfz-sachverstaendiger-unverschuldeter-unfall';
