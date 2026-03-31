-- KFZ-91: Vertrag + Anzahlung + Freischaltung
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS vertrag_unterschrieben BOOLEAN DEFAULT false;
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS vertrag_unterschrieben_am TIMESTAMPTZ;
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS vertrag_pdf_url TEXT;
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS unterschrift_url TEXT;
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS anzahlung_betrag DECIMAL(10,2);
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS anzahlung_bezahlt_am DATE;
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS freigeschaltet BOOLEAN DEFAULT false;
-- Bestehende Gutachter als bereits unterschrieben markieren
UPDATE sachverstaendige SET vertrag_unterschrieben = true WHERE ist_aktiv = true AND vertrag_unterschrieben IS NULL;
