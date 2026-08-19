-- Kurzer SERP-Titel fuer die Wissens-Artikel.
--
-- Hintergrund (SEO-Audit 19.08.2026): 58 der 65 veroeffentlichten Artikel
-- trugen Titel ueber 60 Zeichen (Median 67, Maximum 91) — Google zeigt rund 60.
-- `title` ist zugleich die sichtbare H1 des Artikels; ein Kuerzen haette die
-- Ueberschrift verstuemmelt. Daher ein eigenes Feld, exakt analog zu
-- `meta_description` in derselben Tabelle und zum `meta_title`-Frontmatter der
-- MDX-Assets (claimondo-marketing/lib/content/claimondo-mdx.ts).
--
-- NULL = Fallback auf `title` (rueckwaertskompatibel, kein Backfill noetig).

alter table public.wissen_artikel
  add column if not exists meta_title text;

comment on column public.wissen_artikel.meta_title is
  'Kurzer SERP-Titel. Das Layout haengt " | Claimondo" (12 Zeichen) an, Zielmarke also <=48. Fallback bei NULL: title. Noetig, weil title zugleich die sichtbare H1 des Artikels ist und lang/beschreibend bleiben soll. Analog zu meta_description hier und zum meta_title-Frontmatter der MDX-Assets (claimondo-mdx.ts).';
