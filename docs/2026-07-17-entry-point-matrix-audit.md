# Entry-Point-Matrix — alle Lead-Tueren × Felder (Audit 17.07.2026)

**Auftrag:** Handoff-Task #23 („Entry-Point-Matrix: alle Tueren × Felder auditieren") der
werkstatt-embed-Lane. Ziel-Fehlerklasse: **stiller Feld-Verlust** — eine Tuer erhebt Daten,
persistiert sie aber nicht (P3-Fund des Werkstatt-Embeds: hersteller/klasse/gewerbe/modell/
beschreibung wurden gesammelt und weggeworfen, seit #4412 gefixt) — plus Attributions-
und Paritaets-Luecken zwischen Zwillings-Tueren.

**Methode:** Der leads-Audit vom 15.05.2026 hat einen erzwungenen Trichter etabliert
(„jeder Lead-Eintrittspunkt geht durch `createLead()`"). Die Aufrufer-Liste IST also die
Tueren-Liste; zusaetzlich wurde auf Trichter-Bypaesse geprueft (`from('leads').insert`
ausserhalb des Writers). Ergebnis: **kein Bypass** — einzige Direkt-Insert-Stelle ist
`src/lib/smoke/lifecycle-seed.ts:141` (Test-Seed, bewusste dokumentierte Ausnahme).
`src/lib/actions/dispatch-fall-actions.ts:295` exportiert ein gleichnamiges `createLead`,
ist aber nur ein Wrapper um den zentralen Writer (`insertLeadRow`-Alias) — kein Bypass.

---

## 1 · Tueren-Katalog (14 Tueren)

| # | Tuer | Call-Site | source_channel | Guard |
|---|---|---|---|---|
| T1 | Admin-Direktanlage | `src/app/admin/faelle/anlegen/actions.ts:58` | `admin-direkt` | rolle=admin |
| T2 | Aircall-Inbound-Webhook | `src/app/api/webhooks/aircall/inbound/route.ts:72` | `aircall-inbound` | Webhook-Secret; nur `call.created` ohne Match |
| T3 | matelso-Inbound-Webhook | `src/app/api/webhooks/matelso/inbound/route.ts:118` | `matelso-call` | Webhook; nur ohne Lead/Fall-Match |
| T4 | Dispatch-Spontan-Termin | `src/app/dispatch/kalender/_actions/spontan.ts:57` | `dispatch_spontan` | eingeloggt (Zod-validiert) |
| T5 | Dispatch-Quick-Create | `src/app/dispatch/leads/actions.ts:95` | frei (Feld) | rolle ∈ admin/kb/dispatch |
| T6 | **Werkstatt-Embed** | `src/app/embed/werkstatt-finder/actions.ts:196` | `werkstatt_finder` | public + Consent; Doppel-Lead-Guard via `?token=` (UPDATE statt INSERT, #4462) |
| T7 | Kunde-Portal Schadenmeldung | `src/app/kunde/schaden-melden/actions.ts:40` → `src/lib/kunde/schaden-melden.ts:89` | `kunde_portal` | eingeloggter Kunde |
| T8 | NFC-Schadenkarte (Gegner-Flow) | `src/app/schaden/[token]/actions.ts:113` | `schaden-karte` | Karten-Token; Dedup `findRecentGegnerLead` |
| T9 | App-Rueckruf (werkstatt-LP, Makler-Rueckruf-Zweig) | `src/lib/actions/public-rueckruf.ts:74` | `input.quelle` \|\| `rueckruf` | public + Consent |
| T10 | Makler-Anfrage (FlowLink-Zweig) | `src/lib/makler/erstelle-anfrage.ts:206` | `makler-anfrage-flowlink` | Makler-Session + Promo |
| T11 | Canonical-FlowLink-Issuer (gfa→Lead: Gutachter-Embed, Anspruch-pruefen, MCP) | `src/lib/start-link/issue-canonical-flowlink.ts:172` (extra ab :141) | `gfa.source` \|\| `self_service` | Token/API-seitig; idempotent (gfa markiert `konvertiert_zu_lead_id`) |
| T12 | Marketing Mini-Wizard | `claimondo-marketing/lib/actions/create-lead-from-mini-wizard.ts:81` | `kampagne-<src>` \|\| `mini_wizard` | public + Consent |
| T13 | Marketing-Rueckruf (StickyCallBar, BeratungModal) | `claimondo-marketing/lib/actions/public-rueckruf.ts:53` | `input.quelle` \|\| `rueckruf` | public + Consent |
| T14 | Public API `POST /api/v1/melde-schaden` (+ MCP-Tool `claimondo_melde_schaden`) | `src/app/api/v1/melde-schaden/route.ts` → `insertAnfrage` (gfa, source='mcp') → **T11** | via T11 | Rate-Limit + Consent; Dedup `findRecentMcpLead` |

T14 ist keine eigene Feld-Tuer — sie schreibt eine `gutachter_finder_anfragen`-Zeile und
laeuft durch die T11-Projektion. Felder = Schnittmenge (API-Schema ∩ gfa-Spalten ∩ T11-Projektion).

## 2 · Feld-Matrix (Tuer × Feldgruppe)

Legende: ✓ = gesetzt · (P) = Pflicht/validiert · — = nicht erhoben (by design) · **✗** = erhoben aber NICHT persistiert (Befund).

| Feldgruppe | T1 | T2/T3 | T4 | T5 | T6 Embed | T7 Kunde | T8 Karte | T9 Rueckruf | T10 Makler | T11 gfa | T12 MiniWiz | T13 Mkt-Rueckruf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| vorname/nachname | ✓(P) | „Unbekannt Anrufer" ⚠E5 | ✓(P) | ○ (Stub) | ✓(P) | Profil | — (gegner_name) | Name-Split | ✓ | ✓ | ✓ | Name-Split |
| telefon | ✓(P) | ✓ | ✓(P) | ○ | ○ | Profil | — (gegner_telefon) | ✓(P) | ✓ | ✓ | ✓ | ✓(P) |
| email | ○ | — | ○ | ○ | ✓(P) | Auth | — (gegner_email) | ○ | ✓ | ✓ | ✓ | ○ |
| status / quali-Phase | neu / konvertiert | neu / neu | quali-offen | neu / neu | neu | neu / konvertiert | neu | rueckruf / rueckruf | neu / erstkontakt | neu / erstkontakt | neu\|disq. | rueckruf |
| Schaden (art/typ/datum/hergang) | spezifikation, schadens_art | — | — | — (Phase 2) | beschreibung, gewerke-Bedarf | schadens_art, unfalldatum+uhrzeit, unfallhergang, unfallort | unfallhergang | — | zusatzFelder (Quali) | schadentyp, schadens_hergang | schuldfrage, unfalldatum, unfallort | — |
| Standort | plz(P)+adresse | — | besichtigungsort adr/lat/lng | kunde_adresse/strasse/plz/stadt/lat/lng | plz/lat/lng | plz(P)+adresse | — | plz/ort/lat/lng/place_id | plz/ort/lat/lng/place_id + besichtigungsort | lat/lng/adresse | — ⚠E6 | **—** ⚠E2 |
| Fahrzeug | kennzeichen | — | — | hersteller/modell/kennzeichen/lackfarbe/farbe | hersteller/klasse/modell (seit #4412) | kennzeichen/hersteller/modell | vehicle_id (Flotte) + gegner_kennzeichen/-typ | — | — | fin/kennzeichen/hsn/tsn/hersteller/modell/baujahr | — | — |
| service_typ / abrechnungsweg-Vorstufe | — ⚠E4 | — | nur_gutachter | — (Flow setzt) | quelle='schadenbeschreibung' (+Flow) | — (convert klassisch) | — | service_typ ○ | komplett | — | — | — |
| **Attribution: promotion_code_id** | — | — | — | — | **✗ E1** | — | — | ✓ ○ | ✓(P) | — | ✓ ○ | **—** E2 |
| **Attribution: ga_client_id** | — | — | — | — | ✓ (Consent, seit #4412) | — | — | — E2 | — | ✓ | ✓ (Consent) | — E2 |
| sprache | — | — | — | — | — (de-only) | ✓ | — | Cookie | Cookie | — ⚠E6 | locale | Cookie |
| Routing (zugewiesen_an) | admin selbst | — (Notif. an alle) | Dispatcher | Dispatcher | — (KB-Trigger) | — | — | Dispatch/param | Dispatcher | Dispatcher (round-robin) | round-robin | Dispatch[0] |
| Sonstiges | notiz; sofort-convert | Auto-notiz | + SV-Termin-Reservierung | anrede, kk-01, notiz | werkstatt_id, fotos, gewerbe_flag | kunde_id, gegner_bekannt, ist_fahrzeughalter; sofort-convert | firma_name, gewerbe_flag=true, gegner_versicherung(snr)/schadennr | notiz | notiz, Promo-Pflicht | wunschtermin, werkstatt_id, kva netto/brutto, Anspruch-Carry-over (Fotos+Schaetzung) | disqualifiziert-Trio | nachricht → nur admin_termine.beschreibung |

## 3 · Befunde (priorisiert)

### E1 — Werkstatt-Embed: Partner-/Click-Attribution unvollstaendig (P2, Ads-relevant)
*(Korrigiert am 17.07. — die Erstfassung behauptete faelschlich auch fehlende `ga_client_id`;
der Zweig existiert seit #4412: `getConsentedGaClientId()` + ConsentBridge, actions.ts:179.
gfa-Vergleich prod: 2/5 Gutachter-Anfragen tragen ga_client_id — Mechanik liefert.)*

Was WIRKLICH fehlt:
1. **`promotion_code_id`** — T6 kennt kein `?promo=`. Der Cold-Mailer-`{{Partnerlink}}` und
   kuenftige Partner-Links auf `werkstatt.claimondo.de` / `/werkstatt-finden` verlieren ihre
   Provision-Spur am Lead. Fix: `?promo=` → iframe-Param (EmbedFinderSection) → Payload →
   `resolvePromoCodeToId` (`src/lib/makler/resolve-promo-code.ts`) → `extra.promotion_code_id`.
2. **gclid/Ads-Offline-Sync**: Die #4450-Allowlist traegt gclid/gbraid/wbraid/gclsrc bis ins
   iframe, aber der Werkstatt-Embed konsumiert sie nicht — strukturell: der Google-Ads-
   Conversion-Sync (`src/lib/embed/tracking-webhook*.ts`) haengt an `gutachter_finder_anfragen`
   (gclid/utm-Spalten), der Werkstatt-Funnel schreibt keine gfa-Zeile und hat auf `leads` keine
   gclid-Heimat. Werkstatt-Conversions koennen darum NIE in den Ads-Sync. Follow-up mit
   Produktentscheidung (leads-Spalten vs. Funnel-Tabelle), Ads-/Tracking-Lane.
3. **Wirksamkeits-Check ga_client_id im iframe** offen: erst 1 werkstatt_finder-Lead auf prod
   (Smoke, ohne _ga erwartbar 0) — nach echtem Traffic Quote pruefen (Cookie-Domain
   `.claimondo.de` sollte same-site im iframe mitgehen).

### E2 — Rueckruf-Zwillinge divergiert: Marketing-Variante magerer (P2)
T9 (App) und T13 (Marketing) sind kopierte Zwillinge; T9 wurde weiterentwickelt
(Standort plz/ort/lat/lng/place_id, `promotion_code_id`, `service_typ`, `notiz` am Lead),
T13 nicht — ihr `RueckrufInput` kennt nur name/telefon/email/zeitfenster/startZeit/nachricht/quelle;
`nachricht` landet nur in `admin_termine.beschreibung`, nicht am Lead. **Heute kein Datenverlust**
(StickyCallBar/BeratungModal erheben Standort/Promo gar nicht erst — der Typ wuerde es blocken),
aber: (a) Rueckruf-Leads von claimondo.de starten ohne Standort → Dispatcher muss telefonisch
nachqualifizieren, SV-/Werkstatt-Matching hat keinen Anker; (b) die naechste LP, die PLZ sammelt
(naheliegend fuer werkstatt.claimondo.de), muss erst Typ+Action erweitern — Drift-Falle.
**Empfehlung:** T13 auf T9-Feldsignatur angleichen (optionale Felder, non-breaking); langfristig
ein geteilter Kern ist wegen der zwei Builds unpraktisch — Paritaet per Konvention + dieser Matrix.

### E3 — „schuldfrage ohne eigene_versicherung = stiller Lead-Tod": ENTSCHAERFT (verifiziert)
Die Handoff-Warnung stammt aus der Aera der hartkodierten Szenario-Zuordnung. Seit der
DB-driven Matrix (`flow_szenarien.bedingung`-Predicates + `{"feld": null}` = „Step sichtbar,
solange Feld leer") faellt ein T12-Lead (schuldfrage gesetzt, VS-Frage offen) nicht mehr durch:
das Quali-Szenario zeigt die restlichen offenen Steps, bis die Felder gefuellt sind — erst dann
matcht ein Ziel-Szenario. Kein stiller Tod mehr; Fallback `unqualifiziert` faengt Raender.
(Belegt durch die Feststellung-Skip-Arbeit #4430 inkl. Regression-Test im Fixture-Spiegel.)

### E4 — Admin-Direktanlage convertiert mit Minimal-Kontext (P3, bewusst)
T1 setzt `schadens_fall_typ: null`, keinen `service_typ`, und ruft direkt `convertLeadToClaim`
(quali='konvertiert'). Der Claim entsteht ohne Weg-Vorentscheidung — Admin pflegt im Fall-UI nach.
Akzeptiert; dokumentiert, damit niemand das fuer eine Luecke haelt. Einzige echte Pflicht dort:
vorname/nachname/telefon/PLZ.

### E5 — Anrufer-Platzhalter „Unbekannt Anrufer" ist ein ECHTER Name (P3)
T2/T3 setzen `vorname='Unbekannt', nachname='Anrufer'` (nicht NULL). Der frische
aar-956-Fix (#4469 `heading_ohne_name`) greift nur bei `vorname=NULL` — bekommt ein
Aircall-/matelso-Lead je einen FlowLink, grueßt der Intake „Hallo Unbekannt!".
**Empfehlung (aar-956-Lane, mini):** Platzhalter-Erkennung in den Heading-Fallback aufnehmen
ODER Webhook-Tueren auf `vorname=NULL` umstellen (dann greift #4469 automatisch; Anzeige-
Flaechen im Dispatch nutzen bereits telefon-Fallbacks).

### E6 — sprache-Luecken (P3, pruefen)
T11 projiziert keine `sprache` (gfa→Lead) und T12 haengt auf 6 Locales — der Gutachter-Embed-
Lead eines EN/PL/…-Users startet ohne Sprach-Marker → Folge-Kommunikation defaultet de.
Zu pruefen: hat `gutachter_finder_anfragen` eine sprache/locale-Spalte (dann nur Projektion
ergaenzen), sonst Spalte + Durchreichung. T6 ist bewusst de-only (kein Befund).

## 4 · Wer macht was

| Befund | Lane | Aufwand |
|---|---|---|
| E1.1 promo im Werkstatt-Embed | werkstatt-embed (diese) | S — ?promo= → Payload → resolvePromoCodeToId |
| E1.2 Werkstatt-Funnel an Ads-Offline-Sync | Ads-/Tracking-Lane (Produktentscheidung) | M |
| E2 T13-Paritaet | marketing/subdomain-Lane | S–M |
| E5 „Hallo Unbekannt" | aar-956 (Marker folgt) | XS |
| E6 sprache gfa→Lead | self-service/flow-Lane | XS–S nach Spalten-Check |
| E3/E4 | keine Aktion (dokumentiert) | — |

Rueckfragen: werkstatt-embed-Lane (Session 8750c452), [[coordination-werkstatt-embed-rebuild]].
