-- P2.2 HOCHRISIKO: Doppelbuchungs-Garantie von sv_id auf (assignee_typ, assignee_id)
-- generalisieren. Atomar (DROP+ADD in EINER Transaktion): schlaegt ADD fehl, rollt alles
-- zurueck -> der alte sv_id-Constraint bleibt erhalten. Opclasses EXPLIZIT aus extensions
-- (btree_gist liegt dort) -> search_path-unabhaengig. tstzrange &&-Opclass ist core (pg_catalog).
-- WHERE an v_belegung angeglichen (status-aktiv UND cancelled_at IS NULL) -> Reader/Writer-Lockstep,
-- verhindert Phantom-Block. Strikt lockernder ggue. dem alten Constraint -> kann ADD nicht brechen.
ALTER TABLE public.gutachter_termine
  DROP CONSTRAINT gutachter_termine_no_sv_overlap;

ALTER TABLE public.gutachter_termine
  ADD CONSTRAINT gutachter_termine_no_assignee_overlap
  EXCLUDE USING gist (
    assignee_typ extensions.gist_text_ops WITH =,
    assignee_id  extensions.gist_uuid_ops WITH =,
    tstzrange(start_zeit, end_zeit) WITH &&
  )
  WHERE (status = ANY (ARRAY['bestaetigt','reserviert','verlegt','verlegung_pending'])
         AND cancelled_at IS NULL);

COMMENT ON CONSTRAINT gutachter_termine_no_assignee_overlap ON public.gutachter_termine IS
  'AAR-865 generalisiert (Termin-Engine P2.2): verhindert Doppelbuchung pro Assignee '
  '(assignee_typ+assignee_id), nicht mehr nur pro sv_id - schliesst KB/sv_lead-Luecke. '
  'WHERE an v_belegung angeglichen (status-aktiv AND cancelled_at IS NULL). '
  'Greift nur fuer blockierende Status; abgesagte/stornierte/abgelehnte Slots duerfen ueberlappen.';
