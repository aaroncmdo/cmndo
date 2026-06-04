-- CMM-49 P0: die wenigen claims mit faelle.status aber operative_status=null nachziehen, damit
-- fall_status -> operative_status ein lueckenloser 1:1-Repoint wird (CMM-74-Mirror vervollstaendigen).
-- operative_status ist text; faelle.status (fall_status enum) -> ::text.
UPDATE public.claims c
  SET operative_status = f.status::text
  FROM public.faelle f
  WHERE f.claim_id = c.id
    AND c.operative_status IS NULL
    AND f.status IS NOT NULL;
