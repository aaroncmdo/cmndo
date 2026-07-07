-- /wissen-Artikel-Kommentare: denormalisierter Anzeigename analog zu
-- community_comments.author_display. Wird von submitComment aus der aufgeloesten
-- Community-Identitaet (community_my_identity -> Partner-Firma bzw. Community-Username)
-- gesetzt, damit registrierte Partner unter ihrer Firma kommentieren koennen, OHNE einen
-- separaten Community-Username setzen zu muessen. Additiv/nullable: Bestandszeilen bleiben
-- unveraendert (Anzeige faellt dann auf den community_profiles-Join zurueck). Kommentare
-- sind pre-moderiert (status), daher ist ein potenziell client-gesetzter Wert unkritisch.
alter table public.article_comments add column if not exists author_display text;
