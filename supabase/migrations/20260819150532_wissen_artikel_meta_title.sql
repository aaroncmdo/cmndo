alter table public.wissen_artikel
  add column if not exists meta_title text;

comment on column public.wissen_artikel.meta_title is
  'Kurzer SERP-Titel. Das Layout haengt " | Claimondo" (12 Zeichen) an, Zielmarke also <=48. Fallback bei NULL: title. Noetig, weil title zugleich die sichtbare H1 des Artikels ist und lang/beschreibend bleiben soll. Analog zu meta_description hier und zum meta_title-Frontmatter der MDX-Assets (claimondo-mdx.ts).';
