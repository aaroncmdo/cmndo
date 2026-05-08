# Vollständiger E2E-Smoke-Plan — Lead → Login → Claim → Abrechnung

**Stand:** 2026-05-08 · **Ziel:** Ein Lead geht vollständig durch das System,
über alle beteiligten Rollen, mit allen Klick-Pfaden, ohne Telefon, mit
Feldmodus + Anfahrt. Anschließend Plattform-by-Plattform-Run je Rolle.
Hard-Blocker werden sofort gefixt, der Lauf startet von vorne. Jeder Click
erzeugt ein Pre- und ein Post-Screenshot.

Dieser Plan beschreibt nicht den Ist-Stand — er beschreibt **wie das System
sich verhalten soll**. Ist-Abweichungen sind Bugs.

---

## 0) Begriffsklärung — Rollen, Counter, Mitteilungen, Timing

Bevor wir testen, was wir messen.

### 0.1 Rollen

| Rolle | Portal | Hauptpfad | Test-User |
|---|---|---|---|
| `kunde` | `/kunde/*` | Onboarding, FlowLink, Termin-Bestätigung, Status-View | `test-kunde@claimondo.de` |
| `sachverstaendiger` | `/gutachter/*` | Heute, Termin, Feldmodus, Bericht, Inbox | `test-sv@claimondo.de` |
| `dispatch` | `/dispatch/*` | Lead-Triage, SV-Zuweisung, Eskalation | `test-dispatch@claimondo.de` |
| `admin` | `/admin/*` | Fallakte, VS-Reg, Abrechnung, Reports | `test-admin@claimondo.de` |
| `kundenbetreuer` | `/admin/*` (Sub) | Kunde-Kommunikation, Doku-Pflege | `test-kb@claimondo.de` |
| `lexdrive` | (kein Portal) | Email + Webhook → automatischer Pfad | n/a |
| `partner` (Maik) | (kein Portal) | Lead-Quelle, Provisions-Empfänger | n/a |
| `vs` (Versicherung) | (kein Portal) | Email + Webhook | n/a |

**Aaron-Sync 2026-05-08 — Klarstellungen:**
- **`leadbearbeiter` = Synonym für `dispatch`** — keine eigene Rolle im Smoke.
- **`makler` ignorieren** — Code-Matrix-Eintrag ist Vorbereitung, Portal noch
  nicht live, Pilot abwarten. Smoke behandelt makler nicht.
- **`kanzlei` nicht smoken** — Portal dient nur als Übersicht falls Kanzlei
  reinschaut. Echter Workflow läuft über Email + Kanzleipaket-Webhook.
  Im Smoke nur als Empfänger-Endpunkt prüfen (Phase 9: Webhook-Outbound),
  nicht als Login-Rolle.
- **RLS-Verifikation IST Teil des Smokes** — §4 bleibt drin, mit per-Rolle
  Sichtbarkeits-Asserts gegen die Erwartungs-Matrix.

### 0.2 Counter — wo werden sie wann hochgezählt?

| Counter | Quelle (Tabelle/Feld) | Inkrement-Trigger | Sichtbar in |
|---|---|---|---|
| **Dispatch: offene Leads** | `leads.status='quali-offen'` count (Initial-Status nach Webform-Submit) | Lead-Insert | Dispatch-Hub Top-Card |
| **SV: offene Aufträge** | `auftraege.sv_id=X AND status IN ('zugewiesen','akzeptiert')` | `assignSv()` | SV-Heute-Hub, SV-Inbox-Badge |
| **SV: heute zu fahren** | `gutachter_termine.sv_id=X AND start_zeit::date = today AND status='bestaetigt'` | Kunde bestätigt Termin | SV-Heute-Card |
| **SV: erledigte (Monat)** | `auftraege.status='erfuellt' AND erfuellt_am ⊇ Monat` | Bericht-Freigabe Admin | SV-Profil, Abrechnungs-Trigger |
| **SV: Pflicht-Counter (im Termin)** | `pflicht_kategorien` per Auftrag | Upload-Status-Wechsel | Hub-Top + Termin-Card (müssen identisch sein!) |
| **SV: offene Honorare** | `abrechnungen.sv_id=X AND status='offen'` | Bericht-Freigabe + Abrechnungs-Lauf | SV-Settings-Tab "Abrechnung" |
| **Admin: Fälle nach Status** | `faelle.status` group-by | Jeder State-Transition | Admin-Dashboard, Filter-Tabs |
| **Admin: VS-Reaktion offen** | `faelle.status='anschlussschreiben'` | Kanzlei-Übergabe | Admin-Dashboard, VS-Tab |
| **Admin: Mitteilungen ungelesen** | `mitteilungen.gelesen=false AND empfaenger_rolle` | Event-Emit | Bell-Icon + Inbox-Badge |
| **Kunde: nächster Termin** | `gutachter_termine WHERE kunde_id=X AND start_zeit > now` | Termin-Bestätigung | Kunde-Dashboard Hero |

**Wichtige Konsistenz-Regel:** Counter dürfen **nicht zwischen zwei Quellen
divergieren**. Beispiel: Pflicht-Counter Hub-Top vs Termin-Card müssen
denselben `pflicht_done_states`-Filter benutzen
(`{hochgeladen, in_pruefung, erfuellt, geprueft}` per `PFLICHT_DONE_STATES`-
Konstante). Smoke prüft das explizit.

### 0.3 Mitteilungen — Event → Empfänger-Map

Quelle: `src/lib/notifications/emit.ts` + `event-to-task-map.ts`. Jede
Status-Transition emittet ein Event, das in 1-N Mitteilungen + ggf. Tasks
+ Reminder auflöst. Smoke prüft je Phase, ob die richtige Mitteilung beim
richtigen Empfänger ankommt — und **nicht** beim falschen.

| Event | Empfänger | Kanal | Erwartetes Timing |
|---|---|---|---|
| `lead.created` | dispatch | App-Bell + Email-Digest | < 5s |
| `lead.assigned_sv` | sv | App-Bell + Email + (WA optional) | < 10s |
| `auftrag.akzeptiert` | dispatch + admin | App-Bell | < 5s |
| `termin.vorgeschlagen` | kunde | Email Magic-Link | < 30s (Email-Queue) |
| `termin.bestaetigt` | sv + dispatch | App-Bell | < 5s |
| `sv.unterwegs` | kunde | WA + App | < 5s |
| `sv.angekommen` | kunde + admin | App | < 5s |
| `besichtigung.abgeschlossen` | admin (KB) | App | < 5s |
| `bericht.erstellt` | admin | App + Email | < 5s |
| `bericht.freigegeben` | kunde + vs | Email + WA | < 30s |
| `vs.regulierung_eingegangen` | admin + kunde + sv | App + Email | < 5s |
| `abrechnung.erstellt` | sv | App + Email | < 5s |
| `abrechnung.bezahlt` | sv (+ partner falls Maik-Lead) | App + Email | < 5s |

### 0.4 Standorte — Datenfluss

| Wo | Wann gesetzt | Konsumiert in |
|---|---|---|
| `leads.kunde_lat/lng` + Adresse | Lead-Form (Webform) | Dispatch-Best-SV-Suche, FlowLink |
| `faelle.*` / `claims.*` (kunde_lat/lng, etc.) | Konvertierung Lead→Fall, danach gespiegelt via Sync-Trigger (CMM Phase 1.5) | Termin-Vorschlag, Karte, Fallakte |
| `gutachter_termine.adresse_*` | Termin-Erstellung | Feldmodus-Routing-Ziel |
| `sachverstaendige.standort_lat/lng` | SV-Settings | Heute-Karte-Origin, Best-SV-Suche, Isochrone |
| `sachverstaendige.isochrone_polygon` | Backfill-Script | Heute-Hub Mein-Gebiet, Best-SV Polygon-Match |
| `faelle.unfallort_*` | Mandantenfragebogen | Admin-Karte, ggf. != Besichtigungsort |

**Hinweis:** Es gibt **keine separate `kunden`-Tabelle**. Kunden sind
`profiles WHERE rolle='kunde'`. Adress-/Standort-Daten leben im Lead-State
auf `leads.kunde_*`, ab Konvertierung in Fall auf `faelle.*`/`claims.*`
(letztere sind über CMM Phase 1.5 Sync-Trigger 40-spaltig gespiegelt —
siehe Memory `project_cmm_phase_15_done.md`).

**Wichtig:** Besichtigungsort (Termin) ≠ Unfallort (Fall) ≠ Kunde-Wohnort. Smoke
muss alle drei separat prüfen — nicht raten.

### 0.5 Timing-Erwartungen

- **Realtime-Channels** (Mitteilungen, Inbox): UI-Update < 1s nach DB-Write.
- **Email-Send (Transactional)**: Resend-Queue < 30s.
- **WA-Send (Twilio)**: Async, ok wenn nach 60s im Twilio-Dashboard sichtbar.
- **Cron-Jobs** (Tagesroute-Optimierung, Reminder): laufen jede Nacht 03:00
  Berlin, im Smoke per `node scripts/run-cron-<name>.mjs` manuell triggern.
- **Status-Transition**: synchron, < 500ms.

---

## 1) Vorbereitung — saubere Test-Umgebung

Vor jedem Full-Run:

```bash
node scripts/e2e-reset.mjs           # NEU: setzt alle test-* User + Daten zurück
node scripts/e2e-seed-fixtures.mjs   # NEU: erzeugt Termin/Fall/Lead-Vorlagen
npm run dev                          # Local Server auf :3000
```

`e2e-reset.mjs` muss leisten:
- Alle Fälle/Aufträge/Termine/Leads von `test-*`-Usern löschen.
- `auth.users` lassen; nur Daten resetten.
- 2FA-Flags auf `false` setzen (`twofa_aktiviert`, `twofa_email_aktiviert`,
  `force_password_change` — siehe Memory `project_e2e_test_users.md`).
- Standort-Defaults setzen: SV Mediapark Köln, Kunde Düsseldorf-Bilk,
  Unfallort Köln-Innenstadt — drei klar getrennte Punkte.
- `sv_tages_session` auf idle.
- `mitteilungen` der Test-User clearen.

`e2e-seed-fixtures.mjs`:
- 1× `lead` "neu" für Phase 1 — vom Maik-Partner-Quellcode (für Provisions-Pfad).
- 1× `lead` "neu" — direkter Webform-Lead (kein Partner) für Vergleichspfad.
- 1× LexDrive-Webhook-Payload als JSON-File für Phase 12.

### 1.1 Hard-Blocker-Fix-Loop

Tritt während des Runs ein **Hard-Blocker** auf (Phase nicht weiterführbar
ohne Code-Fix), so:

1. Stop des Runs.
2. Bug fixen + commiten.
3. `node scripts/e2e-reset.mjs` + `e2e-seed-fixtures.mjs`.
4. Run **von vorne** starten — nicht von der Fail-Phase.

Begründung: Cross-Phase-Effekte (Mitteilungs-Counter, Cron-Reminder) können
durch den Fix neu eingespielt werden müssen. Mitten-Wieder-Aufnehmen führt
zu Geister-Daten.

Bei **Soft-Blockern** (UI hässlich, Spell-Fehler, kosmetisch): notieren,
weiterlaufen, am Ende gesammelt fixen.

---

## 2) Phasenplan — der vollständige Lead-Lebenszyklus

Jede Phase beschreibt: **Was passieren soll** (Business-Logik), **wer es
macht**, **welche Klicks**, **was geprüft wird** (UI + DB), **welche
Mitteilung/Counter**. Screenshots vor + nach jedem Click — automatisiert
über `scripts/e2e-full-smoke.mjs` mit `clickAndShoot(selector, label)`-
Helper.

### Phase 1 — Lead-Capture (anonym, Webform)

**Was passieren soll:** Ein Besucher füllt das Lead-Formular aus. Der Lead
landet sofort sichtbar im Dispatch-Hub, Counter "offene Leads" springt
+1, Dispatch bekommt Bell-Mitteilung. Ist der Lead über `?utm_source=maik`
gekommen, wird `partner_id` auf Maiks ID gesetzt — relevant für Phase 11.

**Klick-Strecke** (User: anonymous):
1. `GET /` → Hero (Pre-Shot 01-landing-pre)
2. CTA "Schaden melden" → `/lead`
3. Form ausfüllen — alle Pflichtfelder + Adresse + Schadens-Typ
4. "Termin buchen" → bzw. "Schaden melden" Submit
5. Bestätigungs-View

**DB-Checks nach Phase:**
- `leads` Insert mit `status='quali-offen'`, `source_channel='webform_direkt'`
  oder `'maik_partner'` (Maik-Marker für Provision).
- `mitteilungen` Insert für Empfänger-Rolle `dispatch`.
- Lead-ID auch in `timeline`-Tabelle.

**Konstellationen:**
- 1a) Direkter Webform-Lead (kein Partner)
- 1b) Maik-Lead via `?utm_source=maik` (Provisions-Marker)
- 1c) LexDrive-Email-Lead (Phase 12 Vorgriff)

### Phase 2 — Dispatch übernimmt Lead

**Was passieren soll:** Dispatch sieht den Lead binnen 1s (Realtime-Channel),
öffnet das Lead-Detail, lässt Best-SV-Suche laufen (Geo + Isochrone +
Verfügbarkeit), wählt einen SV, weist zu. State: `lead.status` →
`zugewiesen`, `auftrag` mit `status='zugewiesen'` wird erzeugt, `fall` ggf.
schon angelegt mit `status='sv-zugewiesen'`. SV bekommt Mitteilung.

**Klick-Strecke** (test-dispatch):
1. Login → `/dispatch` (Pre/Post je Click)
2. Lead-Card aus Phase 1 in Liste
3. Lead öffnen → Detail-View
4. Karte mit umliegenden SVs (Isochrone-Polygone)
5. "Best-SV vorschlagen"-Button → Vorschlagsliste
6. SV `Thomas Schmidt` → "Zuweisen"
7. Bestätigungs-Dialog "An SV senden"
8. → Lead jetzt gelblich (zugewiesen) in der Liste

**DB-Checks:**
- `leads.status` wechselt aus `quali-offen` (genauer Wert TBD beim Smoke-
  Run — vermutlich `zugewiesen` oder `flow-gesendet`, aus dem Enum gucken).
- `auftraege` Row für SV mit `status='zugewiesen'`, `claim_id` gesetzt
  (CMM Phase 1.5 hat claim_id als FK in auftraege gemerged).
- `mitteilungen` mit empfaenger=sv, typ=`auftrag.zugewiesen`.
- SV-Counter "offene Aufträge" inkrementiert.

**Konstellationen:**
- 2a) Genau ein passender SV → automatischer Pre-Select
- 2b) Mehrere passende SVs → Dispatch wählt manuell
- 2c) Kein SV in Reichweite → "Manuelle Suche erweitern" oder Fall in
  `unbesetzbar`-Bucket (Counter "Hartfälle")

### Phase 3 — SV nimmt Auftrag an

**Was passieren soll:** SV loggt sich ein, sieht den neuen Auftrag in
Inbox + Counter, öffnet ihn, akzeptiert. State: `auftrag.status='akzeptiert'`,
Mitteilung an Dispatch + Admin. Termin noch nicht gesetzt — das ist
Phase 4-Vorbereitung.

**Klick-Strecke** (test-sv):
1. Login → `/gutachter/heute`
2. Inbox-Badge zeigt 1 ungelesen → Inbox öffnen
3. Auftrag aus Liste → Detail
4. "Auftrag annehmen" → Bestätigung
5. Optional: "Termin-Vorschlag erstellen"-Pfad starten (Phase 4)

**DB-Checks:**
- `auftraege.status='akzeptiert'`.
- `mitteilungen` für dispatch + admin.
- Aufgaben-Counter SV unverändert (nichts überfällig).
- Reject-Pfad nicht hier — separate Konstellation.

**Konstellationen:**
- 3a) SV akzeptiert
- 3b) SV lehnt ab → zurück zu Phase 2 mit Hint
- 3c) SV antwortet 24h nicht → Reminder-Cron triggert Eskalation an Dispatch

### Phase 4 — SV schlägt Termin vor, Kunde bestätigt

**Was passieren soll:** SV wählt 2-3 Slots aus Kalender (Google-Calendar-
Integration zeigt Konflikte), sendet Vorschlag an Kunde per Magic-Link-
Email (kein Telefon). Kunde klickt Link, sieht Slots, wählt einen, bestätigt.
Status: `gutachter_termine.status='bestaetigt'`, `fall.status='sv-termin'`,
Kunde-Counter "nächster Termin" sichtbar.

**Klick-Strecke SV:**
1. SV im Auftrag → "Termin vorschlagen"
2. Kalender-Drawer mit GCal-Events ausgegraut
3. 3 Slots wählen → "An Kunde senden"
4. Toast: "Email versendet"

**Klick-Strecke Kunde** (test-kunde, neuer Browser-Context — Email-Magic-
Link):
5. `e2e-helper.mjs::fetchMagicLink(empfaenger='test-kunde')` — extrahiert
   den Link aus der Resend-API (sandbox-mode) oder direkt aus
   `email_log`-Tabelle (das ist sauberer).
6. Magic-Link öffnen → `/kunde/termin-bestaetigen?token=…`
7. Slots auswählen → "Termin bestätigen"
8. Bestätigungs-View "Wir kommen am …"

**DB-Checks:**
- `gutachter_termine.status='bestaetigt'`, korrekter Slot.
- `faelle.status='sv-termin'`.
- `mitteilungen` für sv + dispatch.
- GCal-Event in SV-Kalender erzeugt (wenn `profiles.google_calendar_id`
  gesetzt) — siehe Memory `project_google_oauth_konsolidiert.md`.

**Konstellationen:**
- 4a) Kunde bestätigt erste Slot
- 4b) Kunde lehnt alle ab → Re-Vorschlag-Loop
- 4c) Kunde reagiert 48h nicht → Reminder-Cron + Eskalation Dispatch
- 4d) GCal nicht verbunden → Smoke ohne Kalender-Sync; Termin trotzdem
  in `gutachter_termine`

### Phase 5 — SV-Heute-Hub am Termin-Tag

**Was passieren soll:** Termin auf "heute" verlegt (im Test direkt in der
DB — siehe Smoke #43-Pattern). SV öffnet Heute, sieht den Termin als Card,
Pflicht-Counter zeigt 0/N (alle offen), Tagesroute auf Karte, Mein-Gebiet
ggf. eingeblendet (Toggle in Settings — siehe Phase 13).

**Klick-Strecke:**
1. Login SV (Session-Reset) → `/gutachter/heute`
2. Hero-Karte zeigt Tagesroute + Termin-Pin
3. Termin-Card sichtbar — Pflicht-Counter "0/5" rendered
4. "Tagesmodus starten"-CTA

**Konsistenz-Checks:**
- Hub-Top-Counter (Pflicht offen) == Termin-Card-Counter — mit
  `PFLICHT_DONE_STATES`-Filter.
- Wenn Settings-Toggle "Mein Gebiet auf Karte" aktiv → Isochrone-Polygon
  rendered (4-Layer-Glow).
- Pre-Render-Warmup hat Tiles geladen (next-fetch im Network-Tab fast
  sofort cache-hit).

### Phase 6 — Feldmodus + Anfahrt (ohne echtes Telefon)

**Was passieren soll:** SV klickt Tagesmodus-Start, Übergang nach
`/gutachter/feldmodus`. GPS wird gemockt (Playwright-Coords). NaviHud
zeigt erste Manöver, Stau-Routing greift, Blitzer-Layer aktiv. Auf
Annäherung an Termin (< 100m) zeigt Phase-Header SV1→D1-Übergang.
"Angekommen"-Click → Status: `gutachter_termine.sv_angekommen_am=now`,
Mitteilung an Kunde+Admin.

**Klick-Strecke:**
1. "Tagesmodus starten" auf Heute-Hub → `/gutachter/feldmodus`
2. Wake-Lock-Toast (Display bleibt an)
3. NaviHud rendered, Auto-3D auf Map (Three.js OBJ + HDR falls ENV)
4. GPS-Mock fährt 5 Wegpunkte ab — bei jedem Wegpunkt Pre/Post-Shot
5. Bei < 100m vom Ziel: Phase-Header animiert auf D1
6. SV-Bottom-Sheet "Angekommen?" → Bestätigen
7. Übergang in Feldmodus-Besichtigungs-Layout

**DB-Checks:**
- `gutachter_termine.losgefahren_am`, `sv_unterwegs_seit` initial.
- `sv_angekommen_am` nach Click.
- `faelle.status='besichtigung'`.
- Mitteilung Kunde "SV angekommen".

**Konstellationen:**
- 6a) Direkter Weg (5 GPS-Punkte) — Standard
- 6b) Stau auf Strecke → Stau-Reroute live (HERE-API)
- 6c) Blitzer in 200m → Voice-Trigger + Overlay (ElevenLabs blocked → JSON-
  Block-Response, Caller fällt auf Web-Speech)
- 6d) Wake-Lock-Test: Display-Off-Verzögerung minimal
- 6e) Two-Finger-Rotation manuell + Reset-Button (siehe AAR `final-polish`)
- 6f) Manueller Pfad ohne GPS-Mock — User klickt direkt "Angekommen"

### Phase 7 — Besichtigung durchführen (D1)

**Was passieren soll:** SV ist auf D1, sieht Pflicht-Kategorien-Liste
(Foto-Übersicht, Schaden-Detail, Zustand etc.). Pro Kategorie: Foto/PDF
hochladen via Mobile-Drawer. Pflicht-Counter inkrementiert je Upload.
Bei vollständigem Counter: D2-CTA aktiviert.

**Klick-Strecke:**
1. Pflicht-Kategorie 1 → Drawer → 3 Fotos upload → Save
2. Counter Hub-Top + Termin-Card beide auf 1/5
3. Wiederholt für Kategorien 2-5
4. Zwischendurch: User schreibt eine Notiz im Termin-Notes-Feld
5. Counter 5/5 → "Besichtigung abschließen"-CTA aktiv
6. Click → Phase-Header D1 → D2

**DB-Checks:**
- `pflicht_kategorien` rows mit `status='hochgeladen'`/`erfuellt`.
- `dokumente` Inserts korrekt zugeordnet (`auftrag_id`).
- Live-Realtime-Update der Counter ohne Page-Reload.

**Konstellationen:**
- 7a) Alle Pflicht erfüllt → smooth zu D2
- 7b) Eine Pflicht übersprungen → "Trotzdem abschließen?"-Confirm-Dialog
- 7c) Upload-Fail (Storage-503) → Retry-UI

### Phase 8 — D2: Bericht-Erstellung

**Was passieren soll:** SV erfasst Schadens-Beschreibung, Schätzung
(Reparatur-Kosten, Wiederbeschaffungswert, Restwert), unterschreibt
digital, generiert PDF-Bericht. Status: `auftrag.status='erfuellt'`,
`fall.status='gutachten-eingegangen'`. Mitteilung an Admin/KB.

**Klick-Strecke:**
1. D2-View: Felder Schaden, Reparatur, Wiederbeschaffung, Restwert
2. Signatur-Pad (Touch oder Maus)
3. "Bericht generieren" → PDF-Preview
4. "Final freigeben" → Server-Action
5. Toast "Erfolgreich" + Redirect zu Heute (Termin als erledigt markiert)

**DB-Checks:**
- `auftraege.status='erfuellt'`, `erfuellt_am=now`.
- `dokumente` enthält Bericht-PDF.
- `faelle.status='gutachten-eingegangen'`.
- `mitteilungen` für admin + kundenbetreuer.

### Phase 9 — Admin/KB-Review (Filmcheck + Freigabe)

**Was passieren soll:** Admin sieht eingegangenes Gutachten in Inbox,
prüft (Filmcheck-Tab), entweder Freigabe oder Rückfrage. Bei Freigabe:
Übergabe an Kanzlei (LexDrive-Webhook). Status: `kanzlei-uebergeben`.

**Klick-Strecke** (test-admin):
1. Login → `/admin`
2. Bell oder Inbox → Mitteilung "Bericht von Thomas Schmidt"
3. Fallakte-Detail → Filmcheck-Tab
4. Foto-Slider, Bericht-PDF-Viewer
5. "Freigeben + Kanzlei übergeben" → Server-Action
6. Toast + Status-Badge wechselt

**DB-Checks:**
- `faelle.status='kanzlei-uebergeben'`.
- `lexdrive_events` Insert (Webhook-Outbound).
- Mitteilung an SV "Bericht freigegeben".
- Mitteilung an Kunde "Ihr Gutachten ist fertig" (Email + WA).

**Konstellationen:**
- 9a) Direkte Freigabe
- 9b) Rückfrage an SV → Status zurück auf `gutachten-eingegangen`,
  Counter SV "Rückfragen offen"
- 9c) Filmcheck fail → SV muss nachbessern

### Phase 10 — VS-Regulierung (manueller Pfad bis Salesforce-API)

**Was passieren soll:** Nach Kanzlei-Übergabe schreibt LexDrive intern an
VS, VS reagiert (Webhook oder Email). Im Test simulieren wir die
VS-Reaktion manuell über Admin-VS-Tab. Status →
`anschlussschreiben` → `regulierung-laeuft` → `regulierung` →
`zahlung-eingegangen` → `abgeschlossen`.

**Klick-Strecke:**
1. Admin → Fallakte → VS-Tab
2. "VS-Reaktion erfassen" → Drawer
3. Reaktions-Typ: `voll-reguliert` | `gekuerzt` | `abgelehnt`
4. Beträge eingeben
5. Speichern → State-Transition
6. Folgeaktion (z.B. bei "gekürzt": Klage-Pfad-CTA)

**DB-Checks:**
- Jeder Übergang in `aktivitaet`-Timeline.
- `mitteilungen` an Kunde + SV.
- Bei `zahlung-eingegangen`: Trigger Abrechnungs-Schritt.

**Konstellationen:**
- 10a) Voll-Regulierung (Happy-Path)
- 10b) Gekürzt → Klage-Aufstockungs-Pfad
- 10c) Abgelehnt → Klage direkt

### Phase 11 — Abrechnung (SV-Honorar + Partner-Provision)

**Was passieren soll:** Mit Status `abgeschlossen` (oder per Cron einmal
monatlich) wird die Abrechnung erzeugt: SV-Honorar berechnet
(Pauschalen + Stundensatz + Anfahrt km), bei Maik-Lead zusätzlich
Provision auf Partner. Admin markiert als bezahlt → Mitteilung SV +
Partner. Counter "offene Honorare" geht runter.

**Klick-Strecke:**
1. Admin → `/admin/abrechnung`
2. Liste offener Abrechnungen — neu für test-sv enthalten
3. Detail öffnen → Posten prüfen
4. "Markiere als bezahlt" → Beleg-Upload
5. Toast + Counter -1

**DB-Checks:**
- `abrechnungen.status='bezahlt'`, `bezahlt_am=now`.
- `partner_provisionen` row falls Lead von Maik (150€-CPL — Memory
  `project_sla_und_partner_provisionen.md`).
- `mitteilungen.empfaenger='sv'` und ggf. `partner` (Maik).

**Konstellationen:**
- 11a) Reguläre Abrechnung
- 11b) Maik-Lead → Provision-Row prüfbar
- 11c) Storno-Pfad: vorher stornierter Fall → Storno-Pauschale-Logik
  (`src/lib/actions/storno-actions.ts`)

### Phase 12 — Multi-Channel Inbox + LexDrive

**Was passieren soll:** Während des gesamten Flows kommen externe
Mitteilungen rein — Email (Resend-Webhook), WA (Twilio-Webhook),
LexDrive (Salesforce-Webhook). Sie landen in `nachrichten` mit
korrektem `kanal`-Feld und werden in der Multi-Channel-Inbox auf der
richtigen Tab gerendert. Realtime-Update.

**Klick-Strecke** + Webhook-Trigger:
1. Im Smoke: `node scripts/e2e-trigger-webhook.mjs --kanal=email --to=fallId`
2. UI Admin: Inbox-Tab "Email" — neue Nachricht erscheint < 1s
3. Wiederholen mit `--kanal=whatsapp`, `--kanal=lexdrive`
4. Reply auf Email aus UI → Resend-Send

**Konstellationen:**
- 12a) Eingehender LexDrive-Webhook erzeugt automatisch Aktivität +
  Mitteilung
- 12b) Eingehende WA: Twilio-Sandbox-Pfad ohne echtes Telefon
- 12c) Tab-Switch behält Scroll-Position + Read-Status

### Phase 13 — Settings, Profile, Avatare, Integrationen

**Was passieren soll:** Pro Rolle: Settings-Tabs durchklicken, Avatare
hochladen, Google-OAuth-Verbinden testen (kein echter OAuth — Mock-Token-
Insert), Karten-Anzeige-Toggle, 2FA-Setup ohne Smoke (würde Telefon
brauchen — Memory: `twofa_email_aktiviert` als Workaround später).

**Pro Rolle:**
- 13a) SV-Settings: Stammdaten, Standort, Isochrone, Karten-Anzeige,
  Honorar-Sätze, Abrechnungs-Tab, Avatar.
- 13b) Admin-Settings: Org-Settings, Email-Templates, VS-Stammdaten,
  Partner.
- 13c) Dispatch-Settings: Filter-Defaults, Eskalations-Schwellen.
- 13d) Kunde-Settings: Kontaktdaten, Avatar, FlowLink-Verlauf.

---

## 3) Plattform-Run je Rolle (separate Phase nach 1-13)

Nach dem Lead-Lebenszyklus durchläuft das Smoke jede Rolle als reinen
"Klick-jeden-Button"-Run, um Routen zu finden, die der Lebenszyklus nicht
abdeckt.

### 3.1 Admin-Sweep
- `/admin/dashboard` → alle Karten-Klicks
- `/admin/faelle` → Filter, Sortierung, Bulk-Actions, Detail
- `/admin/abrechnung`, `/admin/kunden`, `/admin/sv`, `/admin/leads`
- `/admin/nachrichten`, `/admin/integrationen`, `/admin/reports`
- `/admin/system` (RLS-Check, Migration-Status, Cron-Status)

### 3.2 Dispatch-Sweep
- `/dispatch` Hub
- `/dispatch/leads/<id>` Detail
- `/dispatch/karte` (alle SVs + Auslastung)
- `/dispatch/eskalationen`

### 3.3 SV-Sweep
- `/gutachter/heute`, `/gutachter/inbox`, `/gutachter/aufträge`
- `/gutachter/kalender`, `/gutachter/abrechnung`
- `/gutachter/einstellungen` Tabs
- `/gutachter/feldmodus` mit verschiedenen Coords

### 3.4 Kunde-Sweep
- `/kunde/dashboard`, FlowLink-Pfade
- `/kunde/onboarding` (für leeren Account)
- `/kunde/termine`, `/kunde/dokumente`, `/kunde/settings`

### 3.5 Kundenbetreuer-Sweep
- Subset von Admin — KB-Caps laut Matrix (`KB_CAPS`): dokumente.request,
  tasks.create_for_other, tasks.view_team, stammdaten.edit_kanzlei_felder,
  vs_regulierung.edit. KB sieht **kein** Abrechnungs-Tab.
- Klick-Sweep durch Admin-Routen mit KB-Login → erwartet: Abrechnung +
  destruktive Actions ausgeblendet/403, Rest verfügbar.

---

## 4) DB-Accessibility-Check (parallel zu Run)

**Ziel:** Verifizieren, dass jede Rolle genau die Daten sieht, die sie
sehen soll — nicht mehr, nicht weniger.

### 4.1 Methode

Server-side mit `createAdminClient()` einen Vergleichs-Snapshot ziehen, dann
mit Service-Role auf RLS umstellen (`auth.uid()` per JWT pro Test-User
gemockt) und prüfen, was die Rolle bekommt:

```ts
const tables = ['faelle','auftraege','leads','gutachter_termine',
                'mitteilungen','nachrichten','abrechnungen','dokumente',
                'profiles','sachverstaendige','kunden','partner_provisionen']
for (const role of ['kunde','sv','dispatch','admin','kundenbetreuer']) {
  for (const t of tables) {
    const visible = await selectAsRole(role, t)
    report.push({ role, table: t, count: visible.length, columns: ... })
  }
}
```

Output als Matrix in `docs/portals-review/RLS-MATRIX.md`.

### 4.2 Prüfpunkte

| Tabelle | Kunde sieht | SV sieht | Dispatch | Admin | KB |
|---|---|---|---|---|---|
| `faelle` | nur eigene | nur zugewiesene | alle (read) | alle | alle (read) |
| `auftraege` | nur eigene | nur eigene | alle | alle | alle |
| `leads` | – | – | alle | alle | nur zugewiesene |
| `mitteilungen` | nur eigene | nur eigene | nur eigene | nur eigene | nur eigene |
| `abrechnungen` | – | nur eigene | – | alle | – |
| `partner_provisionen` | – | – | – | alle | – |
| `sachverstaendige` (PII) | – | nur eigene + grobe Liste | grobe Liste | alle | – |
| `kunden` (PII) | nur eigene | nur zugewiesene | nur zugewiesene | alle | alle |

### 4.3 Erwartete Findings

Vermutlich:
- `pflicht_kategorien` RLS für Kunde fehlt → Kunde sieht ggf. nichts
  obwohl er sehen sollte, was offen ist.
- `nachrichten` für KB unklar.
- `partner_provisionen` braucht `partner.user_id`-Match wenn Partner-
  Login-Phase kommt — aktuell vermutlich nur Admin.

---

## 5) Brainstorm: fehlende Info pro Rolle

Während des Runs notieren, was im UI **fehlt**, obwohl es helfen würde.
Nicht "wäre nice", sondern "der User trifft hier eine Entscheidung blind".

### Kunde
- Status-Bar mit klarer Phase ("Wir prüfen gerade Ihren Bericht — Schritt
  4 von 6")
- "Wann höre ich wieder von Ihnen?"-Erwartungs-Indikator (SLA-Restzeit)
- Direkter Reply-Pfad zu jeder Mitteilung
- Down-load aller Dokumente + Bericht in einem ZIP
- Schaden-Bilder-Galerie (jetzt: nur in Termin-Card?)

### SV
- "Heute zu fahren" + km + voraussichtliche Rückkehr (für Familienplanung)
- Honorar-Forecast Monat ("aktuell 4.200 €, Ziel 5.000 €")
- Wenn Kunde nicht reagiert: Hint im Termin-Card statt versteckt im Inbox
- Settings: Wie sieht meine Auslastung im Vergleich zu anderen SVs aus?
- Feldmodus: Tank-Reichweite + Aufträge-Konsekutiv-Indikator

### Dispatch
- Auslastungs-Heatmap je SV (Wochen-Cap nicht überfahren)
- "Hängengebliebene" Leads — wo hat sich seit > 24h nichts getan
- Best-SV nicht nur Geo, auch Spezialisierung (Oldtimer, LKW, …)

### Admin
- Cohort-Reports: Fälle nach Quelle (Maik vs Webform vs LexDrive)
- VS-Erfolgsquote (reguliert vs gekürzt vs abgelehnt) je VS
- Sprint-Cycle-Time-Average pro Phase (Engpass-Erkennung)
- "Verlorene" Mitteilungen (kanal=email aber `bounced=true`)

### Kundenbetreuer
- Eigene Mitteilungs-Inbox (statt mit Admin geteilt?)
- Tasks-View mit SLA-Counter
- Kunde-Profil-View ohne Admin-Funktionen

---

## 6) Smoke-Skript-Design

### 6.1 Ein Master-Skript

`scripts/e2e-full-smoke.mjs` orchestriert alle Phasen. Jede Phase ist eine
async Function, die:
1. Pre-Conditions checkt (sonst Skip + WARN).
2. Klicks ausführt mit `clickAndShoot(page, selector, label)`.
3. DB-Asserts macht via Service-Role.
4. Assertion-Failures als HARD oder SOFT klassifiziert.
5. Phase-Result in `report[]` pusht.

### 6.2 `clickAndShoot`-Helper

```ts
async function clickAndShoot(page, selector, label) {
  await page.screenshot({ path: `${outDir}/${pad(step++)}-${label}-pre.png` })
  await page.click(selector)
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: `${outDir}/${pad(step++)}-${label}-post.png` })
}
```

Pad-Schritt-Index 4-stellig, damit Sortierung stabil bleibt.

### 6.3 Multi-Context

Mehrere Browser-Contexte parallel (1 pro Rolle), damit der Test echt
mehrrollig läuft (nicht sequenzielle Logins). Mitteilung erscheint dann
real beim anderen Context — Realtime-Test.

### 6.4 Reporting

Output `docs/portals-review/SMOKE-REPORT-<timestamp>.md`:
- Phase-by-Phase: ✅ / ⚠️ / ❌ + Kommentar
- Screenshot-Index pro Schritt
- DB-Diff (Expected vs Got) bei Fail
- Re-Smoke-Range automatisch generiert (siehe 6.5)

### 6.5 Auto-generated Re-Smoke-Range bei Fix

Bei Fail: Phase X Hard-Blocker → Bericht enthält:

> **Re-Smoke nach Fix:** `npm run smoke:e2e -- --from=phase-1 --to=phase-X`
> (Hard-Blocker reset alles; bei Soft-Blocker: `--from=phase-X-1
> --to=phase-X`)

Begründung: Hard-Blocker können DB-State zerschossen haben → von vorne.
Soft-Blocker: lokal weiterprüfbar.

---

## 7) Was kommt **nicht** in diesen Smoke

- **Echtes Telefon** (2FA-SMS, echtes WA-Inbound). Memory:
  `e2e_test_users` setzt 2FA aus.
- **Echte Stripe-Zahlungen** — Mock-Pfad.
- **Echte Salesforce-API** — bis SF-API live ist, manueller Pfad
  (Memory: `project_vs_regulierung.md`).
- **Echte LexDrive-Webhooks aus Prod** — wir feuern Sandbox-Payloads.
- **Performance-Last-Tests** — separate K6-Suite.

---

## 8) Reihenfolge der Umsetzung

1. **Heute:** `scripts/e2e-reset.mjs` + `e2e-seed-fixtures.mjs` schreiben.
2. **Heute:** `clickAndShoot`-Helper + erste Phase 1+2 implementieren.
3. **Tag 2:** Phasen 3-6 (Lead → Termin → Feldmodus).
4. **Tag 3:** Phasen 7-11 (Besichtigung → Abrechnung).
5. **Tag 3-4:** Phasen 12-13 (Inbox + Plattform-Sweeps).
6. **Tag 4:** RLS-Matrix-Skript + Brainstorm-Compile.
7. **Tag 5:** First-Full-Run, Hard-Blocker-Loop bis grün.
8. **Tag 5-6:** Bericht + Backlog.

Aufwand realistisch: **5-6 Tage**, davon 1-2 Tage für Bug-Fixes die der
Smoke aufdeckt.

---

## 9) Erfolgs-Kriterium

- Ein Lead durchläuft alle 11 Phasen ohne Hard-Blocker.
- Counter-Konsistenz: keine Divergenz zwischen Hub-Top und Detail-Cards.
- Mitteilungen kommen bei richtiger Rolle in <Timing> an.
- RLS-Matrix matcht erwartete Sichtbarkeit.
- Plattform-Sweep zeigt keine 500er, keine Tote-Routen, keine fehlenden
  CTAs.
- Bericht enthält für jeden Soft-Finding einen Re-Smoke-Range-Vorschlag.

Wenn alle vier grün: App ist E2E-runfähig für eine erste echte
Pilot-Schadenmeldung.
