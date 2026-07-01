-- Gutachter-Onboarding-Audit (Befund #1): Die oeffentliche Karte (anon-RLS)
-- gated bisher auf verifiziert, ist_aktiv, geo, isochrone, aber NICHT auf
-- portal_zugang_freigeschaltet. Dispatch/MCP-Buchung gated umgekehrt auf
-- portal_zugang, aber nicht verifiziert. Ergebnis: ein verifizierter-aber-
-- unbezahlter SV war als Karten-Pin sichtbar, aber nicht buchbar (Kunde sieht
-- Pin, Engine kann ihn nicht buchen). Wir gleichen die Karte an den Dispatch-
-- Pool an: ein Pin wird nur gezeigt, wenn der SV auch buchbar ist
-- (portal_zugang_freigeschaltet=true). Zusammen mit applyDispatchableFilter
-- (das jetzt verifiziert=true verlangt) gilt: "gelistet" == "buchbar".
--
-- Verifiziert gegen Prod-Daten: 0 aktuell gelistete SVs verlieren durch diese
-- Verschaerfung ihre Sichtbarkeit (alle map-ready SVs sind bereits
-- portal_zugang_freigeschaltet=true).
ALTER POLICY "sachverstaendige_anon_select_map_ready"
  ON public.sachverstaendige
  USING (
    verifiziert = true
    AND ist_aktiv = true
    AND portal_zugang_freigeschaltet = true
    AND geloescht_am IS NULL
    AND gesperrt_seit IS NULL
    AND standort_lat IS NOT NULL
    AND standort_lng IS NOT NULL
    AND isochrone_polygon IS NOT NULL
  );
