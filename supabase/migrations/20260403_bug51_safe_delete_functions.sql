-- BUG-51: Sichere Delete-Funktionen mit NULL-Check + COUNT-Check
-- REGEL 11: NIEMALS DELETE ohne WHERE! NIEMALS mit NULL-Parameter!

DROP FUNCTION IF EXISTS delete_fall_komplett(UUID);
DROP FUNCTION IF EXISTS delete_lead_komplett(UUID);

CREATE OR REPLACE FUNCTION delete_fall_komplett(p_fall_id UUID)
RETURNS void AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- SICHERHEITS-CHECK 1: NULL-Parameter abfangen
  IF p_fall_id IS NULL THEN
    RAISE EXCEPTION 'ABBRUCH: fall_id ist NULL — keine Massenlöschung erlaubt';
  END IF;

  -- SICHERHEITS-CHECK 2: Genau 1 Fall muss existieren
  SELECT COUNT(*) INTO v_count FROM faelle WHERE id = p_fall_id;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'ABBRUCH: Fall % nicht gefunden', p_fall_id;
  END IF;
  IF v_count > 1 THEN
    RAISE EXCEPTION 'ABBRUCH: Mehrere Fälle gefunden für % — das darf nicht passieren', p_fall_id;
  END IF;

  -- Jede Tabelle einzeln mit EXCEPTION WHEN OTHERS
  BEGIN DELETE FROM lead_historie WHERE fall_id = p_fall_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM pflichtdokumente WHERE fall_id = p_fall_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM qc_checkliste WHERE fall_id = p_fall_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM forderungspositionen WHERE fall_id = p_fall_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM zahlungseingaenge WHERE fall_id = p_fall_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM technische_probleme WHERE fall_id = p_fall_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM gutachter_abrechnungspositionen WHERE fall_id = p_fall_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM gutachter_abrechnungen WHERE fall_id = p_fall_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM gutachter_termine WHERE fall_id = p_fall_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM gutachter_mitteilungen WHERE fall_id = p_fall_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM benachrichtigungen WHERE fall_id = p_fall_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM timeline WHERE fall_id = p_fall_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM tasks WHERE fall_id = p_fall_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM nachrichten WHERE fall_id = p_fall_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM dokumente WHERE fall_id = p_fall_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM termine WHERE fall_id = p_fall_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM flow_links WHERE fall_id = p_fall_id; EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Fall selbst löschen (GENAU 1 Zeile)
  DELETE FROM faelle WHERE id = p_fall_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION delete_lead_komplett(p_lead_id UUID)
RETURNS void AS $$
DECLARE
  v_count INTEGER;
  v_fall RECORD;
BEGIN
  -- SICHERHEITS-CHECK 1: NULL-Parameter abfangen
  IF p_lead_id IS NULL THEN
    RAISE EXCEPTION 'ABBRUCH: lead_id ist NULL — keine Massenlöschung erlaubt';
  END IF;

  -- SICHERHEITS-CHECK 2: Lead muss existieren
  SELECT COUNT(*) INTO v_count FROM leads WHERE id = p_lead_id;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'ABBRUCH: Lead % nicht gefunden', p_lead_id;
  END IF;

  -- Zuerst alle Fälle des Leads löschen (mit Sicherheits-Check pro Fall)
  FOR v_fall IN SELECT id FROM faelle WHERE lead_id = p_lead_id LOOP
    PERFORM delete_fall_komplett(v_fall.id);
  END LOOP;

  -- Lead-spezifische Tabellen
  BEGIN DELETE FROM flow_links WHERE lead_id = p_lead_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM lead_historie WHERE lead_id = p_lead_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM timeline WHERE lead_id = p_lead_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM gutachter_termine WHERE lead_id = p_lead_id; EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Lead selbst löschen (GENAU 1 Zeile)
  DELETE FROM leads WHERE id = p_lead_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
