-- KFZ-133: Versicherungen-Tabelle + Seed mit 55+ deutschen KFZ-Versicherern

-- 1. Tabelle erstellen
CREATE TABLE IF NOT EXISTS versicherungen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  schaden_telefon TEXT,
  schaden_email TEXT,
  hotline_telefon TEXT,
  webseite TEXT,
  adresse TEXT,
  plz TEXT,
  stadt TEXT,
  bafin_nummer TEXT,
  logo_url TEXT,
  ist_aktiv BOOLEAN DEFAULT true,
  erstellt_am TIMESTAMPTZ DEFAULT now()
);

-- 2. faelle.versicherung_id Spalte
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS versicherung_id UUID REFERENCES versicherungen(id);

-- 3. Index
CREATE INDEX IF NOT EXISTS idx_versicherungen_name ON versicherungen(name);
CREATE INDEX IF NOT EXISTS idx_faelle_versicherung_id ON faelle(versicherung_id);

-- 4. RLS
ALTER TABLE versicherungen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "versicherungen_read_all" ON versicherungen FOR SELECT TO authenticated USING (true);
CREATE POLICY "versicherungen_admin_write" ON versicherungen FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('admin', 'kundenbetreuer')));

-- 5. Seed: 55+ deutsche KFZ-Versicherer mit echten Kontaktdaten
-- Quellen: kfz-auskunft.de, ra-micro.de, innofima.de, brand-assekuranz.de, kiessler-gmbh.de, offizielle Webseiten
INSERT INTO versicherungen (name, schaden_telefon, schaden_email, hotline_telefon, webseite, stadt) VALUES
  ('Allianz Versicherung', '0800 4610107', 'sachschaden@allianz.de', '00800 11223344', 'https://www.allianz.de', 'München'),
  ('HUK-Coburg', '09561 96108', 'info@huk-coburg.de', '09561 96108', 'https://www.huk.de', 'Coburg'),
  ('HUK24', '09561 96108', 'info@huk24.de', '09561 96108', 'https://www.huk24.de', 'Coburg'),
  ('AXA Versicherung', '0800 3280330', 'schaden@axa.de', '0221 1484101', 'https://www.axa.de', 'Köln'),
  ('ERGO Versicherung', '0800 3746000', 'service@ergo.de', '0800 3746000', 'https://www.ergo.de', 'Düsseldorf'),
  ('Generali Deutschland', '0800 848848848', 'schaden@generali.com', '0800 848848848', 'https://www.generali.de', 'München'),
  ('R+V Versicherung', '01802 336789', 'info@ruv.de', '0611 5330', 'https://www.ruv.de', 'Wiesbaden'),
  ('Zurich Versicherung', '0228 268200', 'neu.schaden@zurich.com', '0228 268200', 'https://www.zurich.de', 'Bonn'),
  ('HDI Versicherung', '0511 6263160', 'info@hdi.de', '0511 6263160', 'https://www.hdi.de', 'Hannover'),
  ('DEVK Versicherung', '01802 858858', 'info@devk.de', '01802 757757', 'https://www.devk.de', 'Köln'),
  ('LVM Versicherung', '0251 7020', 'info@lvm.de', '0251 7020', 'https://www.lvm.de', 'Münster'),
  ('VHV Versicherung', '0511 65505044', 'service@vhv.de', '0511 65505020', 'https://www.vhv.de', 'Hannover'),
  ('Gothaer Versicherung', '030 550881508', 'schaden@gothaer.de', '030 550881508', 'https://www.gothaer.de', 'Köln'),
  ('Signal Iduna', '040 41245770', 'info@signal-iduna.de', '0231 1350', 'https://www.signal-iduna.de', 'Dortmund'),
  ('Württembergische Versicherung', '00800 81824000', 'schadenservice@wuerttembergische.de', '0800 81822000', 'https://www.wuerttembergische.de', 'Stuttgart'),
  ('Provinzial Versicherung', '0211 9785544', 'schadenservice@provinzial.com', '0211 9785544', 'https://www.provinzial.de', 'Düsseldorf'),
  ('Westfälische Provinzial', '0251 2190', 'wp-service@provinzial.de', '0251 2190', 'https://www.provinzial.de', 'Münster'),
  ('CosmosDirekt', '0681 9660', 'info@cosmosdirekt.de', '0681 9660', 'https://www.cosmosdirekt.de', 'Saarbrücken'),
  ('DA Direkt', '0800 1107707', 'service@da-direkt.de', '0800 1107707', 'https://www.da-direkt.de', 'Oberursel'),
  ('Verti Versicherung', '030 890003000', 'service@verti.de', '030 890003000', 'https://www.verti.de', 'Teltow'),
  ('ADAC Autoversicherung', '089 76764343', 'info@adac-autoversicherung.de', '089 76764343', 'https://www.adac.de/versicherungen', 'München'),
  ('Concordia Versicherung', '0231 94103451', 'schaden@concordia.de', '0511 57011966', 'https://www.concordia.de', 'Hannover'),
  ('Continentale Versicherung', '0231 9190', 'info@continentale.de', '0511 280940', 'https://www.continentale.de', 'Dortmund'),
  ('KRAVAG Versicherung', '0800 5331131', 'k-schaden@kravag.de', '0800 5331131', 'https://www.kravag.de', 'Hamburg'),
  ('KRAVAG-LOGISTIC', '0800 5331136', 'k-schaden@kravag.de', '0800 5331136', 'https://www.kravag.de', 'Hamburg'),
  ('Nürnberger Versicherung', '0800 5316666', 'info@nuernberger.de', '0800 5316666', 'https://www.nuernberger.de', 'Nürnberg'),
  ('Alte Leipziger', '06171 661415', 'posteingang.schaden@alte-leipziger.de', '06171 660', 'https://www.alte-leipziger.de', 'Oberursel'),
  ('ARAG Versicherung', '0211 9933399', 'service@arag.de', '0211 9890', 'https://www.arag.de', 'Düsseldorf'),
  ('Barmenia Versicherung', '0202 4382250', 'info@barmenia.de', '0202 4380', 'https://www.barmenia.de', 'Wuppertal'),
  ('Baloise Versicherung', '06181 4020', 'info@baloise.de', '06181 4020', 'https://www.baloise.de', 'Bad Homburg'),
  ('Helvetia Versicherung', '069 13320', 'info@helvetia.de', '069 13320', 'https://www.helvetia.de', 'Frankfurt'),
  ('Condor Versicherung', '0180 1000233', 'info@condor-versicherung.de', '040 35140', 'https://www.condor-versicherung.de', 'Hamburg'),
  ('Mannheimer Versicherung', '0621 4578000', 'info@mannheimer.de', '0621 4578000', 'https://www.mannheimer.de', 'Mannheim'),
  ('Itzehoer Versicherung', '04821 7730', 'info@itzehoer.de', '01801 773377', 'https://www.itzehoer.de', 'Itzehoe'),
  ('Janitos Versicherung', '06221 7091570', 'info@janitos.de', '06221 7091570', 'https://www.janitos.de', 'Heidelberg'),
  ('Rhion Versicherung', '02131 60990', 'schaden@rhion.de', '02131 60990', 'https://www.rhion.de', 'Neuss'),
  ('Sparkassen DirektVersicherung', '0211 7290', 'info@sparkassen-direkt.de', '0211 7290', 'https://www.sparkassen-direktversicherung.de', 'Düsseldorf'),
  ('Versicherungskammer Bayern', '089 21600', 'info@vkb.de', '089 21600', 'https://www.vkb.de', 'München'),
  ('BGV Versicherung', '0721 6600', 'info@bgv.de', '0721 6600', 'https://www.bgv.de', 'Karlsruhe'),
  ('Debeka Versicherung', '0261 4980', 'info@debeka.de', '0261 4980', 'https://www.debeka.de', 'Koblenz'),
  ('Öffentliche Versicherung Braunschweig', '0531 20200', 'info@oeffentliche.de', '0531 20200', 'https://www.oeffentliche.de', 'Braunschweig'),
  ('VGH Versicherungen', '0800 1750844', 'info@vgh.de', '0800 1750844', 'https://www.vgh.de', 'Hannover'),
  ('Mecklenburgische Versicherung', '0511 53530', 'info@mecklenburgische.de', '0511 53530', 'https://www.mecklenburgische.de', 'Hannover'),
  ('NV-Versicherungen', '04974 939999', 'info@nv-online.de', '04974 939999', 'https://www.nv-online.de', 'Neuharlingersiel'),
  ('HanseMerkur Versicherung', '040 41190', 'info@hansemerkur.de', '040 41190', 'https://www.hansemerkur.de', 'Hamburg'),
  ('Volkswohl Bund', '0231 5433395', 'schaden@volkswohlbund.de', '0231 54330', 'https://www.volkswohlbund.de', 'Dortmund'),
  ('VPV Versicherung', '01803 455534', 'info@vpv.de', '0711 13990', 'https://www.vpv.de', 'Stuttgart'),
  ('Inter Versicherung', '0621 427427', 'info@inter.de', '0621 427427', 'https://www.inter.de', 'Mannheim'),
  ('WGV Versicherung', '0711 16390', 'info@wgv.de', '0711 16390', 'https://www.wgv.de', 'Stuttgart'),
  ('DOMCURA', '0431 54654600', 'schaden@domcura.de', '0431 54654600', 'https://www.domcura.de', 'Kiel'),
  ('GVO Versicherung', '0411 9236333', 'info@gvo.de', '04131 7250', 'https://www.gvo.de', 'Lüneburg'),
  ('Ammerländer Versicherung', '04488 5373700', 'info@ammerlaender-versicherung.de', '04488 52590', 'https://www.ammerlaender-versicherung.de', 'Westerstede'),
  ('Roland Rechtsschutz', '0221 8277500', 'service@roland-rechtsschutz.de', '0221 82770', 'https://www.roland-rechtsschutz.de', 'Köln'),
  ('Haftpflichtkasse Darmstadt', '06154 6011272', 'uhs@haftpflichtkasse.de', '06154 6010', 'https://www.haftpflichtkasse.de', 'Roßdorf'),
  ('InterRisk Versicherung', '0611 2787323', 'info@interrisk.de', '0611 27870', 'https://www.interrisk.de', 'Wiesbaden')
ON CONFLICT (name) DO NOTHING;
