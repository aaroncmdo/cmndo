UPDATE faelle
SET anschlussschreiben_sendedatum = vs_anschreiben_datum::date
WHERE anschlussschreiben_sendedatum IS NULL
  AND vs_anschreiben_datum IS NOT NULL;;
