-- CMM-32b: Backfill bestehender Fälle in auftraege + kanzlei_faelle.
--
-- Idempotent: Prüft auf bestehende Records bevor INSERT.
-- Status-Mapping leitet sich aus heutigen Feldern auf faelle ab — analog
-- der Logik in lib/auftrag/phase.ts:getAuftragsPhase.

DO $$
DECLARE
  v_fall RECORD;
  v_auftrag_id uuid;
  v_status text;
  v_abgeschlossen timestamptz;
BEGIN
  -- ── 1. Erstgutachten-Auftrag pro Fall mit sv_id ─────────────────────────
  FOR v_fall IN
    SELECT
      f.id AS fall_id,
      f.sv_id,
      f.gutachten_eingegangen_am,
      f.nachbesichtigung_status,
      f.status,
      f.anschlussschreiben_am,
      f.regulierung_am,
      f.abgeschlossen_am,
      -- Termin-Status für Status-Mapping
      (SELECT t.sv_angekommen_am FROM public.gutachter_termine t
       WHERE t.fall_id = f.id AND t.typ = 'sv_begutachtung'
       ORDER BY t.created_at ASC LIMIT 1) AS termin_angekommen,
      (SELECT t.durchgefuehrt_am FROM public.gutachter_termine t
       WHERE t.fall_id = f.id AND t.typ = 'sv_begutachtung'
       ORDER BY t.created_at ASC LIMIT 1) AS termin_durchgefuehrt
    FROM public.faelle f
    WHERE f.sv_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.auftraege a
        WHERE a.fall_id = f.id AND a.typ = 'erstgutachten'
      )
  LOOP
    -- Status aus heutigem Phase-Mapping ableiten
    IF v_fall.anschlussschreiben_am IS NOT NULL
       OR v_fall.regulierung_am IS NOT NULL
       OR v_fall.abgeschlossen_am IS NOT NULL
       OR v_fall.status::text IN ('reguliert', 'abgeschlossen', 'kanzlei-uebergeben', 'anschlussschreiben', 'regulierung-laeuft') THEN
      v_status := 'abgeschlossen';
      v_abgeschlossen := COALESCE(v_fall.gutachten_eingegangen_am, v_fall.anschlussschreiben_am, now());
    ELSIF v_fall.gutachten_eingegangen_am IS NOT NULL OR v_fall.termin_durchgefuehrt IS NOT NULL THEN
      v_status := 'gutachten';
      v_abgeschlossen := NULL;
    ELSIF v_fall.termin_angekommen IS NOT NULL THEN
      v_status := 'besichtigung';
      v_abgeschlossen := NULL;
    ELSE
      v_status := 'termin';
      v_abgeschlossen := NULL;
    END IF;

    INSERT INTO public.auftraege (
      fall_id, sv_id, typ, status, reihenfolge,
      gutachten_final_freigegeben, abgeschlossen_am
    ) VALUES (
      v_fall.fall_id, v_fall.sv_id, 'erstgutachten', v_status, 1,
      (v_status = 'abgeschlossen'),
      v_abgeschlossen
    )
    RETURNING id INTO v_auftrag_id;

    -- Bestehende SV-Begutachtungs-Termine diesem Auftrag zuordnen
    UPDATE public.gutachter_termine
    SET auftrag_id = v_auftrag_id
    WHERE fall_id = v_fall.fall_id
      AND typ = 'sv_begutachtung'
      AND auftrag_id IS NULL;

    -- Nachbesichtigung als zusätzlicher Auftrag (wenn aktiv)
    IF v_fall.nachbesichtigung_status IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.auftraege a
         WHERE a.fall_id = v_fall.fall_id AND a.typ = 'nachbesichtigung'
       ) THEN
      INSERT INTO public.auftraege (
        fall_id, sv_id, typ, status, reihenfolge, vorheriger_auftrag_id
      ) VALUES (
        v_fall.fall_id, v_fall.sv_id, 'nachbesichtigung',
        CASE
          WHEN v_fall.nachbesichtigung_status = 'angefordert' THEN 'termin'
          WHEN v_fall.nachbesichtigung_status = 'termin-eingereicht' THEN 'termin'
          WHEN v_fall.nachbesichtigung_status = 'durchgefuehrt' THEN 'gutachten'
          WHEN v_fall.nachbesichtigung_status = 'abgeschlossen' THEN 'abgeschlossen'
          ELSE 'termin'
        END,
        2,
        v_auftrag_id
      );
    END IF;
  END LOOP;

  -- ── 2. Kanzlei-Fall pro regulierungs-aktivem Fall ───────────────────────
  FOR v_fall IN
    SELECT
      f.id AS fall_id,
      f.anschlussschreiben_am,
      f.regulierung_am,
      f.abgeschlossen_am,
      f.zahlung_eingegangen_am,
      f.status
    FROM public.faelle f
    WHERE (
      f.anschlussschreiben_am IS NOT NULL
      OR f.regulierung_am IS NOT NULL
      OR f.zahlung_eingegangen_am IS NOT NULL
      OR f.status::text IN ('reguliert', 'abgeschlossen', 'kanzlei-uebergeben', 'anschlussschreiben', 'regulierung-laeuft')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.kanzlei_faelle k WHERE k.fall_id = f.id
    )
  LOOP
    INSERT INTO public.kanzlei_faelle (
      fall_id, status, vs_kontakt_am, ausgezahlt_am
    ) VALUES (
      v_fall.fall_id,
      CASE
        WHEN v_fall.zahlung_eingegangen_am IS NOT NULL OR v_fall.abgeschlossen_am IS NOT NULL THEN 'auszahlung'
        ELSE 'versicherungskontakt'
      END,
      COALESCE(v_fall.anschlussschreiben_am, v_fall.regulierung_am),
      v_fall.zahlung_eingegangen_am
    );
  END LOOP;
END $$;

-- Verify-Query (nicht ausgeführt, nur Doku)
COMMENT ON TABLE public.auftraege IS
  'CMM-32: SV-Auftrags-Sub-Entity. Backfill 32b: jeder bestehende fall mit sv_id hat einen erstgutachten-Auftrag; aktive Nachbesichtigungen sind als zweiter Auftrag (typ=nachbesichtigung, vorheriger_auftrag_id verlinkt). gutachter_termine.auftrag_id ist auf den erstgutachten-Auftrag gesetzt.';
