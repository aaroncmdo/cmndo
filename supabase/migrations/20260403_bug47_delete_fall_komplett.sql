-- BUG-47: Bombensichere Lösch-Funktion für Fälle
CREATE OR REPLACE FUNCTION delete_fall_komplett(p_fall_id UUID)
RETURNS void AS $$
BEGIN
  -- Alle FK-referenzierenden Tabellen einzeln (EXCEPTION pro Block)
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
  -- Fall selbst
  DELETE FROM faelle WHERE id = p_fall_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bombensichere Lösch-Funktion für Leads
CREATE OR REPLACE FUNCTION delete_lead_komplett(p_lead_id UUID)
RETURNS void AS $$
BEGIN
  -- Zuerst Fälle die auf diesen Lead referenzieren
  BEGIN
    PERFORM delete_fall_komplett(id) FROM faelle WHERE lead_id = p_lead_id;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  -- Flow-Links
  BEGIN DELETE FROM flow_links WHERE lead_id = p_lead_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  -- Lead-Historie
  BEGIN DELETE FROM lead_historie WHERE lead_id = p_lead_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  -- Timeline mit lead_id
  BEGIN DELETE FROM timeline WHERE lead_id = p_lead_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  -- Gutachter-Termine mit lead_id
  BEGIN DELETE FROM gutachter_termine WHERE lead_id = p_lead_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  -- Lead selbst
  DELETE FROM leads WHERE id = p_lead_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
