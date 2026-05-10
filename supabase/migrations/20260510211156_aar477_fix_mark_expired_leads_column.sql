-- AAR-477 Fix: mark_expired_leads() referenzierte die gedroppte Spalte
-- disqualifikations_grund_key (AAR-582 hat sie zu disqualifiziert_grund_key
-- umbenannt). Funktion mit korrektem Spaltenname neu erstellen.

CREATE OR REPLACE FUNCTION public.mark_expired_leads()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE leads
  SET
    status                    = 'disqualifiziert',
    disqualifiziert           = true,
    disqualifiziert_grund     = 'Timeout nach 7 Tagen ohne Konvertierung',
    disqualifiziert_grund_key = 'timeout',
    updated_at                = now()
  WHERE
    status          = 'neu'
    AND disqualifiziert = false
    AND created_at  < now() - INTERVAL '7 days';
END;
$$;
