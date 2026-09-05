-- OpenAI-Ads-Attribution (OAIQ) am Lead festhalten.
--
-- Warum am Lead und nicht nur im Cookie: Das `__oppref`-Cookie lebt auf
-- claimondo.de. Die Terminbuchung laeuft aber cross-origin im iframe von
-- app.claimondo.de, und die Sicherungsabtretung wird oft Tage spaeter
-- unterschrieben -- in beiden Faellen ist das Cookie nicht mehr erreichbar.
-- Der Wert wird deshalb EINMAL beim Lead-Anlegen aus dem Cookie gelesen und
-- hier persistiert; alle spaeteren Conversion-Events holen ihn ueber die
-- Lead-/Fall-ID aus der DB.
--
-- Analog zu `ga_client_id`, das dieselbe Aufgabe fuer GA4 erfuellt.
--
-- Bewusst NICHT auf `gutachter_finder_anfragen`, obwohl dort ebenfalls
-- `ga_client_id` liegt: diese Tabelle wird vom Embed-Finder auf
-- app.claimondo.de befuellt, und dort ist das First-Party-Cookie von
-- claimondo.de nicht lesbar. Eine Spalte, die ein Pfad nie fuellen kann, ist
-- als Messgroesse schlimmer als keine -- sie sieht aus wie eine Antwort.
--
-- Bewusst KEINE zusaetzliche `entry`-Spalte: `leads.source_channel` ist bereits
-- Pflichtfeld (create-lead.ts erzwingt es zur Compile-Zeit) und beantwortet
-- "welche Landingpage brachte den Lead" vollstaendig.
alter table public.leads
  add column if not exists oppref text;

comment on column public.leads.oppref is
  'OpenAI-Ads-Attribution aus dem __oppref-Cookie, einmalig beim Lead-Anlegen gesetzt. NULL = kein Anzeigenklick (organischer Lead) oder kein Marketing-Consent. Ohne diesen Wert wird kein OAIQ-Conversion-Event gesendet.';
