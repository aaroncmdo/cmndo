-- Schuldform der Ersteinschaetzung (unverschuldet | teilschuld | selbst) persistieren,
-- damit die SV-Fallakte-Vorschau dasselbe verzweigte Framing zeigt wie das Kunden-Tool.
-- Additiv + nullable: alte Sessions (schuld = null) fallen im Renderer auf 'unverschuldet' zurueck.
alter table public.anspruch_schaetzungen add column if not exists schuld text;
