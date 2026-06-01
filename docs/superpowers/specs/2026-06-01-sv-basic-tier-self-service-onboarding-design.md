# SV Basic-Tier Self-Service + Unified Dynamic Onboarding — Design

**Datum:** 2026-06-01
**Branch (Spec):** `kitta/sv-onboarding-audit`
**Status:** Design abgestimmt im Brainstorming (Aaron), bereit für Implementierungsplan (writing-plans)
**Master-Spec:** deckt P0–P5 ab; Implementierung phasenweise.

---

## 1. Ziel in einem Satz

Ein Kfz-Sachverständiger kann sich **selbst** als kostenloser **Basic-Partner** registrieren, indem er auf der Karte **seinen vorhandenen DAT-Eintrag beansprucht** (oder neu anlegt), ein **dynamisches Onboarding** durchläuft, das bereits bekannte Daten überspringt, und nach **manueller Team-Freigabe (48 h)** auf der Karte mit kurzem Profil erscheint und im Matching als **Fallback** berücksichtigt wird — bei **Abrechnung pro zugewiesenem Lead**.

---

## 2. Gelockte Entscheidungen (aus dem Brainstorming)

| # | Entscheidung | Konsequenz |
|---|---|---|
| E1 | **Offener Self-Service-Signup** — der SV startet selbst, ohne dass ein Mensch ihn vorher anlegt | Neue Public-Strecke statt Admin-only-Anlage |
| E2 | **Basic = neues `paket='basic'`** in `sachverstaendige` (kein eigenes Tier-Konstrukt, keine neue Tabelle) | Wiederverwendung der gesamten echten-SV-Infrastruktur (Account, Kalender, Profil, `verifiziert`, Onboarding, Billing) |
| E3 | **Basic = niedrigste Paket-Prio + kontingent-frei (kalender-basiert)** → faktischer Fallback. „Falls mal einer durchgeht, hast du trotzdem einen gültigen SV." | `PAKET_PRIO['basic']=0`; Kontingent-Check für Basic überspringen |
| E4 | **Keine Gebietsprio, 0 inkludierte Fälle** | `paket_faelle_gesamt`-Semantik = 0; Standard-Radius 25 km |
| E5 | **Volle Pro-Lead-Abrechnung jetzt** — Zahlungsmethode im Onboarding erfassen + Einzelpreis bei Lead-Zuweisung automatisch einziehen | Stripe-Setup im Onboarding + Charge-Mechanik (P5) |
| E6 | **Standort „claimen" = GMB-artig** — vorhandenen DAT-Pin (`sv_leads`) beanspruchen, sonst frisch anlegen | Veredelt den toten `sv_leads`-Kaltpool zu echten Accounts; löst Doppel-Pin |
| E7 | **Nachweis = DAT-Mitgliedsnummer.** Der `sv_leads`-Pool ist komplett DAT-importiert → Claim eines DAT-Pins ist der Identitätsbeweis. Nicht-DAT-SVs legt das Team weiterhin selbst an (bestehender Admin-Wizard, nicht Self-Service). | Self-Service-Trichter ist DAT-zentriert |
| E8 | **Verifizierung ist ein Ermessens-/Qualitätsgate (approve/reject), kein Auto-Stempel.** Aaron steuert, wer reinkommt. Freigabe in 48 h. | Claim+Onboarding erzeugen **pending** Account; live erst nach Team-Freigabe → deckt zugleich Claim-Sicherheit ab |
| E9 | **Onboarding wird vereinheitlicht + dynamisch** (Basic + bezahlt) auf der bestehenden config-getriebenen Wizard-Engine (`onboarding_phasen`/`onboarding_felder` + `WizardClient`). Prefill aus Claim, überspringt Bekanntes, sammelt nur Lücken. | Ersetzt den statischen 1190-Zeilen-`WillkommenClient` |
| E10 | **LexDrive-Partner-Eligibility = NICHT im Scope** (zu früh; deren SVs qualitativ meist schwächer) | Als „später denkbar" dokumentiert, nicht gebaut |

---

## 3. Ist-Zustand (Audit 2026-06-01, gekürzt — mit Datei:Zeile)

Heute existieren **drei getrennte „SV-Lead"-Welten ohne Brücke**:

1. **`gutachter_waitlist`** — eingehende Bewerbungen über gutachter.claimondo.de. Admin-Triage unter `src/app/admin/partner/waitlist/page.tsx` + `WaitlistTable.tsx`; einzige Aktion `setzeWaitlistStatus()` (`src/lib/actions/gutachter-waitlist.ts:147`) = reines Status-Label (neu→…→aktiv), **kein** Account/SV wird erzeugt.
2. **`sv_leads`** — DAT-Expert-Excel-Importe (Kaltpool). **Keine Admin-UI.** Nur Read-only-Fallback im Dispatch (`src/app/dispatch/gutachter-finder/[id]/GutachterFinderDetailClient.tsx`) + anonyme Karten-Pins (`ladeSvLeads`, nur `id,lat,lng` — `src/lib/actions/gutachter-finder-actions.ts`). Feld `warteliste_status` existiert, **kein Code reagiert darauf**.
3. **`sachverstaendige`** (+ `profiles`) — echte SVs, heute **nur** vom Admin anlegbar (`src/app/admin/sachverstaendige/anlegen/actions.ts`: `anlegeSv`/`anlegeBuero`/`anlegeAkademie`). Self-Onboarding danach via statischem `src/app/gutachter/willkommen/WillkommenClient.tsx`.

**Kein Code verbindet 1/2 → 3.** Konvertierung = manuelles Abtippen.

Relevante bestehende Mechanik:
- **Matching:** `src/lib/dispatch/findBestSV.ts` queryt `sachverstaendige` über `applyDispatchableFilter` (`src/lib/sv/queries.ts:38` — `ist_aktiv` + `portal_zugang_freigeschaltet` + `gesperrt_seit IS NULL` + `geloescht_am IS NULL`). `PAKET_PRIO` (`findBestSV.ts:62`): `premium:3, pro:2, standard:1` (+ Aliase). Score (`:452`): `paketPrio*100 − kontingentGenutzt*2 − ablehnungen*2 − distanzPenalty + wunschterminBonus + sticky`. Kontingent-Gate (`:310-313`): `kontingentGesamt = paket_faelle_gesamt || 10`; `kontingentFrei <= 0 → continue`. Standort-Pflicht (`:316`).
- **Öffentliche Karte:** `ladeAktiverSVs` (Tier-1, `verifiziert=true`); `findSvsForLocation` (`src/lib/onboarding/findSvsForLocation.ts`) macht heute Tier-1 (`sachverstaendige`) → Tier-3 (`sv_leads`)-Fallback. **anon-Leak-Fix #2177**: `REVOKE ALL` für `anon` auf `sachverstaendige` + `GRANT` nur ~9 Map-Spalten (Mig `20260601180648`).
- **Öffentliche Profil-Projektion:** `toOeffentlichesSvProfil` (`src/lib/sv-matching-modul/projection.ts:25`) — Whitelist: `vorname, profilbild, profilbeschreibung, bewertung×3, distanzGerundet (5-km), istWunschterminFrei, slots`. Nachname/score/paket/etc. strukturell ausgeschlossen.
- **Onboarding-Status:** `isOnboardingComplete()` (`src/lib/gutachter/onboarding-status.ts:23`): `vertrag_unterschrieben && anzahlung_status='bezahlt' && portal_zugang_freigeschaltet && dokumente_komplett && gcal_connected && logo_url`.
- **Wizard-Engine (config-driven):** Tabellen `onboarding_phasen` (flow_key, reihenfolge, phase_key, conditional_on, i18n) + `onboarding_felder` (typ, pflicht, optionen, `db_target {tabelle,spalte}`, conditional_on, i18n). Renderer `src/components/onboarding/WizardClient.tsx`; Loader `src/lib/onboarding/lade-beauftragung-phasen.ts`, **`load-needed-phases.ts`** (dynamisches Skipping), `group-felder-by-target.ts`; Sentinels `_finalize`/`_termin`. Feld-Typen u.a. `segmented`, `signature`, Upload (`fields/Zb1UploadField.tsx`). Seed-Beispiel: `supabase/migrations/20260601161747_seed_beauftragung_flow.sql`.
- **Billing heute:** `sachverstaendige.stripe_customer_id`, `stripe_anzahlung_bezahlt_am` (Webhook setzt `ist_aktiv` + `portal_zugang_freigeschaltet`), `zahlungsempfaenger_iban NOT NULL`, `stripe_default_payment_method_id`. `startStripeCheckout` (`src/lib/actions/sv-onboarding-actions.ts`).

---

## 4. Architektur-Überblick

```
                 ┌─────────────── Public Self-Service ───────────────┐
  Karte/Suche →  Claim DAT-Pin (sv_leads)  ──►  pending sachverstaendige
   (P1)          │  oder „neu anlegen" (DAT-Nr.)        (paket='basic')│
                 └───────────────────────────┬───────────────────────┘
                                              │ prefill
                            ┌─────────────────▼─────────────────┐
                            │  Unified Dynamic Onboarding (P2)   │
                            │  flow_key='sv-onboarding'          │
                            │  WizardClient + load-needed-phases │
                            │  skip Bekanntes · Pflicht-Lücken:  │
                            │  Account · Kalender · Zahlungs-     │
                            │  methode · Profil · Vertrag/DSGVO  │
                            └─────────────────┬─────────────────┘
                                              │ status='wartet_auf_freigabe'
                            ┌─────────────────▼─────────────────┐
                            │  Discretionary Verification (P3)   │
                            │  Admin-Queue approve/reject, 48h   │
                            │  setzt verifiziert + ist_aktiv +   │
                            │  portal_zugang_freigeschaltet      │
                            └─────────────────┬─────────────────┘
                                live          │
                ┌─────────────────────────────▼───────────────────────────┐
                │  Fallback-Matching (P4)        Per-Lead-Billing (P5)      │
                │  findBestSV: paket='basic'      Charge Einzelpreis bei     │
                │  prio 0, kontingent-bypass      Lead-Zuweisung (Stripe)    │
                │  → faktischer Fallback                                     │
                │  Karte: kurzes Profil + Badge                             │
                └───────────────────────────────────────────────────────────┘
```

**Datenmodell-Heimat (P0):** Basic lebt vollständig in `sachverstaendige` + `profiles` — identisch zu bezahlten SVs, unterschieden nur durch `paket='basic'`, das Billing-/Matching-/Onboarding-Verhalten ableitet.

---

## 5. Datenmodell (P0)

> **Regel-2-Pflicht:** Alle DDL ausschließlich via `mcp__plugin_supabase_supabase__apply_migration`, danach `list_migrations` → recorded Version ablesen → File exakt so benennen (Twin-Drift!). Alles additiv (keine Drops).

### 5.1 `sachverstaendige`
- **`paket`**: neuer erlaubter Wert `'basic'` (falls per CHECK-Constraint eingeschränkt → Constraint erweitern; sonst nur Konvention). Live verifizieren ob ein CHECK existiert.
- **`onboarding_quelle`** (text, nullable): `'self_service_claim' | 'self_service_neu' | 'admin'` — Herkunfts-Marker.
- **Admission-Status:** Wiederverwendung von `verifiziert` (bool) + `ist_aktiv` + `portal_zugang_freigeschaltet`. Zusätzlich **`freigabe_status`** (text: `'wartet_auf_freigabe' | 'freigegeben' | 'abgelehnt'`) + **`freigabe_entschieden_am`** + **`freigabe_entschieden_von`** (FK profiles) + **`ablehnungs_grund`** (text). (Begründung: `verifiziert` allein trägt keine Reject-/Queue-Semantik.)
- **Billing:** `stripe_customer_id` + `stripe_default_payment_method_id` existieren bereits. Neu: **`basic_einzelpreis_cents`** (int, nullable — Default aus Konstante, override pro SV möglich) + Wiederverwendung der bestehenden Abrechnungs-Tabellen (siehe P5).
- **`zahlungsempfaenger_iban`** ist heute `NOT NULL` → für Basic prüfen ob im Onboarding Pflicht (Auszahlungen entfallen bei Basic, da SV *zahlt*; ggf. NOT-NULL-Annahme im Self-Service-Pfad bedienen oder Spalte nullable machen — **offene DB-Entscheidung, siehe §10**).

### 5.2 `sv_leads` (Claim-Verlinkung)
- **`konvertiert_zu_sv_id`** (uuid, FK → `sachverstaendige.id`, nullable) — gesetzt beim Claim.
- **`konvertiert_am`** (timestamptz, nullable).
- **`claim_status`** (text: `'offen' | 'beansprucht_pending' | 'konvertiert'`) — verhindert Doppel-Claim.
- Beim erfolgreichen Claim: `ist_aktiv=false` setzen (Kalt-Pin verschwindet, Account-Pin übernimmt) — Reihenfolge so, dass nie 0 Pins für den Standort sichtbar sind.

### 5.3 Matching-Konstanten
- `PAKET_PRIO['basic'] = 0` (explizit; `?? 1`-Default würde Basic sonst wie `standard` ranken — `findBestSV.ts:348`).
- Kontingent-Bypass für `paket='basic'`: vor `findBestSV.ts:310-313` → wenn `paket==='basic'` den Kontingent-Check überspringen (Basic ist kalender-/verfügbarkeitsbasiert, nicht quota-begrenzt). **Nicht** `paket_faelle_gesamt=0` setzen (der `|| 10`-Fallback macht daraus 10 — kein verlässliches Signal).

---

## 6. Phase P1 — GMB-Claim-Flow

**Zweck:** Anonymer SV findet seinen DAT-Eintrag und beansprucht ihn → pending Account mit Prefill.

**Komponenten:**
- Public-Route `src/app/sv/registrieren/` (oder `/partner-werden`) — Karte/Suche über die öffentlich sichtbaren `sv_leads`-Pins (PLZ/Name/DAT-Nr.-Suche). **Privacy:** Anon-Suche darf nur Minimal-Felder zeigen; identifizierende `sv_leads`-Felder erst nach Identitätsbestätigung. RLS/Service-Role-Pfad wie bei den bestehenden Token-Flows.
- Aktion `beanspracheSvLead(svLeadId, kontaktnachweis)` (service-role, da anon): legt `auth.users` + `profiles` (rolle gutachter) + `sachverstaendige` (paket='basic', `freigabe_status='wartet_auf_freigabe'`, `ist_aktiv=false`, `portal_zugang_freigeschaltet=false`) an; prefillt aus `sv_leads` (name, firma, vorname/nachname, adresse, plz, ort, lat/lng, telefon, email, dat_id/dat_expert_nr, bvsk_nr, ihk_zertifikat, oebuv_nr, qualifikationen, fachschwerpunkte, jahre_erfahrung, paket_umkreis_km→25, isochrone_polygon falls vorhanden); setzt `sv_leads.konvertiert_zu_sv_id` + `claim_status='beansprucht_pending'`.
- Fresh-Variante `registriereSvBasicNeu(stammdaten + dat_nr)`: gleicher Account-Aufbau ohne sv_leads-Quelle.
- **Account-Erstellung:** Email + Passwort (Reuse bestehender Signup-Bausteine) oder Magic-Link; `force_password_change` analog Admin-Anlage. 2FA-Default wie bei SVs.

**Sicherheit (E8):** Da live erst nach manueller Team-Freigabe → der Claim selbst muss nicht kryptografisch „Besitz" beweisen; das Team prüft in P3, dass Claimer = DAT-Identität. Trotzdem **Doppel-Claim-Sperre** über `claim_status` + Email-Uniqueness.

**Datenfluss:** anon → Suche → Claim → pending `sachverstaendige` → Redirect ins Onboarding (P2) mit eingeloggtem (pending) Account.

**Tests:** Claim prefillt korrekt; Doppel-Claim wird abgelehnt; Fresh-Variante; RLS verhindert anon-Lesen identifizierender sv_leads-Felder; pending Account ist NICHT dispatchable (P4-Filter greift).

---

## 7. Phase P2 — Unified Dynamic Onboarding

**Zweck:** Den statischen `WillkommenClient` durch einen config-getriebenen, dynamischen Flow ersetzen, der Bekanntes überspringt. Gilt für **alle** SV-Rollen (Basic, Solo-Pro, Büro, Akademie, Sub).

**Ansatz:** SV-Onboarding als `flow_key='sv-onboarding'` in `onboarding_phasen`/`onboarding_felder` modellieren, gerendert von `WizardClient`, Phasen-Auswahl via `load-needed-phases.ts` (Skip-Logik) + `conditional_on`. `db_target` der Felder → `sachverstaendige`/`profiles` (statt leads/gfa wie bei den Kunden-Flows). Schreib-Auth: eingeloggter SV schreibt seine eigene Zeile (RLS self-update).

**Phasen (config), Pflicht/Skip dynamisch:**
| reihenfolge | phase_key | Inhalt | Skip-Bedingung (prefill) | gilt für |
|---|---|---|---|---|
| 10 | identitaet | Anrede/Vorname/Nachname/Telefon | skip wenn aus Claim vorhanden | alle |
| 20 | standort | Adresse (Google Places)→Geo, Radius (Default 25) | skip/prefill aus Claim | alle |
| 30 | qualifikation | DAT-Nr. (+BVSK/IHK/öbuv optional) | skip wenn aus DAT-Pin vorhanden | alle |
| 40 | profil | Avatar-Upload + kurze Profilbeschreibung | — (Pin hat kein Foto/Text) | alle |
| 50 | kalender | Google OAuth **oder** CalDAV verbinden | — (Pflicht) | alle außer sub |
| 60 | vertrag | Vertrag/DSGVO + Signatur (`signature`-Feld) | Basic: vereinfachter Vertrag | alle |
| 70 | zahlung | Zahlungsmethode (Stripe SetupIntent) | **Basic: Karte hinterlegen (kein Anzahlungs-Checkout)**; Pro: bestehender Anzahlungs-Checkout | alle (Variante je paket) |

**Neue Feld-Typen (Wizard-Field-Registry erweitern):** `calendar-connect` (Google/CalDAV), `stripe-payment-method` (SetupIntent / Embedded), `avatar-upload`. Vorhanden nutzbar: `signature` (Vertrag), Upload-Felder (Dokumente). Das ist der Kern der P2-Arbeit neben der Config.

**Skip-Mechanik:** `load-needed-phases` + `conditional_on` werten den aktuellen `sachverstaendige`-/`profiles`-Stand aus und blenden Phasen/Felder aus, deren `db_target`-Spalten bereits befüllt sind. → „wenn wir schon alle Infos haben, fragen wir nicht nochmal."

**De-Risk (P2a/P2b):** P2a baut den dynamischen Flow + Basic-Pfad neu und lässt das bezahlte `/gutachter/willkommen` zunächst unangetastet; P2b migriert Solo/Büro/Akademie/Sub auf denselben `flow_key`/Engine und entfernt `WillkommenClient`. **Pflicht-Gate:** voller `next build` + Smoke aller bezahlten Onboarding-Rollen vor P2b-Merge (Regressionsrisiko bezahlte Strecke).

**Abschluss:** Letzter Schritt setzt `freigabe_status='wartet_auf_freigabe'` (Basic) bzw. bestehende Anzahlungs-Logik (Pro). Wizard-Completion ≠ live.

**Tests:** Prefill-Skip (Claim-SV sieht nur Lücken-Phasen); jede bezahlte Rolle läuft unverändert durch; neue Feld-Typen schreiben korrekt in `db_target`; `next build` grün.

---

## 8. Phase P3 — Discretionary Verification (Admin)

**Zweck:** Aaron/Team entscheidet pro SV (approve/reject), wer live geht. 48-h-SLA.

**Komponenten:**
- Admin-Queue `src/app/admin/sachverstaendige/freigaben/` (oder Tab in bestehender SV-Übersicht): Liste `freigabe_status='wartet_auf_freigabe'`, sortiert nach Eingang, mit DAT-Nr./Qualifikationen/Standort/Prefill-Quelle + Detail.
- Aktionen (Result-Object-Pattern): `gibBasicSvFrei(svId)` → `freigabe_status='freigegeben'`, `verifiziert=true`, `ist_aktiv=true`, `portal_zugang_freigeschaltet=true`, Timestamps/Audit; `lehneBasicSvAb(svId, grund)` → `freigabe_status='abgelehnt'`, `ablehnungs_grund`, Account bleibt (kein Hard-Delete), SV-Benachrichtigung.
- **48-h-SLA:** Benachrichtigung an Admin bei Eingang (Reuse `benachrichtigungen` wie `stelleWaitlistAnfrage`); optional Reminder-Cron (VPS-crontab, nicht vercel.json) wenn > 48 h offen.
- Wiederverwendung des bestehenden Doku-/Verifizierungs-Patterns (`verifizierung-actions.ts`, `dokumenteAlleFreigeben`) wo sinnvoll.

**Entscheidung:** `verifiziert=true` macht Basic auf der **öffentlichen Karte** sichtbar (heutiges Gate `ladeAktiverSVs`/RLS); `ist_aktiv+portal_zugang` macht ihn **dispatchable** (findBestSV). Beide werden bei Freigabe gemeinsam gesetzt.

**Tests:** Approve schaltet live (taucht in findBestSV + Karte auf); Reject hält ihn raus + benachrichtigt; pending erscheint nirgends kundenseitig; SLA-Benachrichtigung feuert.

---

## 9. Phase P4 — Fallback-Matching + Karten-Darstellung

**Zweck:** Basic erscheint im Matching als Fallback und auf der Karte mit kurzem Profil „wie die normalen".

**Matching (`findBestSV.ts`):**
- `PAKET_PRIO['basic']=0` (P0) → Score `paketPrio*100` = 0, immer ~100+ unter bezahlten → faktischer Fallback. „Falls einer durchgeht, ok" (E3) — kein hartes Ausschluss-Gate.
- Kontingent-Bypass für Basic (P0) → Basic wird kalender-/verfügbarkeitsbasiert geführt, nicht quota-ausgesiebt.
- `findSvsForLocation` (3-Tier-Reader): Basic-`sachverstaendige` sind jetzt Tier-1-Tabelle, aber per Paket-Prio unten — sicherstellen, dass bezahlte SVs zuerst gezogen werden und Basic nur greift, wenn keine bezahlten verfügbar sind. Ggf. Tier-Logik so anpassen, dass `paket='basic'` als eigene Stufe zwischen bezahlt und `sv_leads`-Kaltpool rangiert.

**Karte (öffentlich):**
- Basic erscheint mit kurzem Profil über `toOeffentlichesSvProfil` (Vorname, Avatar, Beschreibung, Distanz gerundet, ggf. Google-Bewertung) — „wie die normalen, aber nur Fallback".
- **Leak-Constraint (#2177, kritisch):** Die öffentliche Karte exponiert für `anon` nur die ge-GRANTeten ~9 Map-Spalten. Basic darf das nicht aufreißen → bei Implementierung die **exakte** GRANT-Spaltenliste (Mig `20260601180648`) prüfen und Basic-Map-Felder strikt darin halten; sonst über eine `security_invoker`-View/Server-Action gehen statt direktem anon-Select.
- Optional Tier-Badge (dezent), damit intern unterscheidbar — ohne Kunden zu verwirren.

**Tests:** Bezahlter SV im Gebiet → Basic erscheint NICHT primär; kein bezahlter → Basic wird Fallback-Kandidat; anon-Karte leakt keine Nicht-Map-Spalten (HTTP-Probe wie #2177); Basic mit belegtem Kalender fällt korrekt raus.

---

## 10. Phase P5 — Per-Lead-Billing

**Zweck:** Basic zahlt den Einzelpreis je zugewiesenem Lead.

**Komponenten:**
- Zahlungsmethode wird in P2 (Phase „zahlung") via Stripe **SetupIntent** hinterlegt → `stripe_customer_id` + `stripe_default_payment_method_id`.
- **Charge-Auslöser:** bei **Lead-Zuweisung** an einen `paket='basic'`-SV (Definition „zugewiesen" präzisieren: Termin gebucht/bestätigt? — **offene Entscheidung §10**). Empfehlung analog embed-B: zeitbasierter/eventbasierter Charge mit Karenz + Guard, kein blinder Sofort-Einzug.
- Reuse bestehender Abrechnungs-Infrastruktur (`abrechnungen`/`embed_abrechnung_positionen`-Muster) statt neuer Tabelle, wo möglich.
- Admin-Sicht: offene/abgerechnete Basic-Positionen; Fehlschlag-Handling (`stripe_einzug_fehlgeschlagen_am`-Muster, AAR-644).

**Tests:** Zuweisung erzeugt genau eine Position; Charge-Fehlschlag wird sauber behandelt (kein Doppel-Charge); Storno-Pfad.

---

## 11. Querschnitt

- **Auth/RLS:** pending Basic-SV darf sich einloggen + eigenes Onboarding schreiben, aber **nicht** dispatchable/sichtbar sein (Filter `ist_aktiv+portal_zugang`). RLS: SV updatet nur eigene `sachverstaendige`/`profiles`-Zeile (kein Mass-Assignment auf `paket`/`verifiziert`/`freigabe_status` — diese nur via service-role/Admin-Action setzbar). **Selbst-Eskalation verhindern** (vgl. Live-RLS-Audit: keine Self-Writes auf privilegierte Spalten).
- **Branding:** Basic ist kostenlos → `use_custom_branding` bleibt an `verifiziert && use_custom_branding` gegated; Basic standardmäßig Claimondo-Branding (kein Whitelabel im Free-Tier, sofern nicht anders gewünscht).
- **Error-Handling:** alle neuen Server-Actions Result-Object (`{ ok, error? }`), non-critical Sends (Email/WA/Benachrichtigung) in try/catch; `revalidatePath` auf betroffene Routen.
- **Umlaute:** alle nutzersichtbaren Strings (Wizard, Karte, Admin-Queue, Emails) mit echten ä/ö/ü/ß.
- **Komponenten-Set:** neue UI nur `primitives.*` / `shared/*` (Button/Card/DataTable) — kein handgerolltes Tailwind (CI-Ratchet).
- **Crons:** SLA-Reminder/Charge nur VPS-crontab, keine vercel.json.

---

## 12. Offene Entscheidungen / getroffene Annahmen

Diese habe ich pragmatisch entschieden — bitte beim Spec-Review bestätigen/korrigieren:

1. **`zahlungsempfaenger_iban`** ist heute `NOT NULL`. Basic *zahlt* (kein Auszahlungs-IBAN nötig). Annahme: Spalte für Basic nullable machen ODER im Onboarding optional. → DB-Entscheidung.
2. **„Lead zugewiesen" für Billing (P5):** Annahme = Charge bei **gebuchtem/bestätigtem Termin** (mit Karenz), nicht bei reiner Anzeige. Präzisieren.
3. **Einzelpreis-Höhe** (`basic_einzelpreis_cents`): zentrale Konstante + per-SV-Override. Wert offen.
4. **Account-Login:** Email+Passwort (mit `force_password_change`) als Default angenommen; Magic-Link-Alternative möglich.
5. **Route-Naming:** `/sv/registrieren` bzw. `/partner-werden` — Naming offen.
6. **`freigabe_status`** als neue Spalte vs. Wiederverwendung `verifiziert`+`onboarding_status`. Annahme: neue, explizite Spalte (saubere Queue-/Reject-Semantik).
7. **Karten-Sichtbarkeit Basic:** „wie die normalen" — angenommen volle `toOeffentlichesSvProfil`-Projektion (inkl. Google-Bewertung falls vorhanden), nur Matching-Prio unterscheidet. Falls Basic visuell abgesetzt werden soll → Badge.

---

## 13. Nicht im Scope

- LexDrive-Partner-Eligibility (E10) — später denkbar.
- Migration/Aufräumen des bestehenden `gutachter_waitlist`-Triage (separate Welt; bleibt wie ist, sofern nicht später verknüpft).
- Nicht-DAT-SVs im Self-Service (bleiben Admin-Anlage).
- WhatsApp-only-No-Login-Basic (die alte `docs/plans/sv-basic-tier.md`-Skizze ist durch E9/E2 überholt).

---

## 14. Test-/Abnahme-Strategie

- **Pro Phase** Unit/Integration + Live-Smoke gegen `app.staging.claimondo.de` (Screenshots Pflicht).
- **E2E-Happy-Path:** Karte → DAT-Pin claimen → dynamisches Onboarding (nur Lücken) → pending → Admin-Freigabe → erscheint auf Karte + als Fallback in findBestSV → Lead-Zuweisung → Einzelpreis-Charge.
- **Negativ:** Doppel-Claim; Reject; pending nirgends kundenseitig sichtbar; anon-Karte leakt keine privilegierten Spalten (#2177-Probe); bezahlte SV-Onboarding-Rollen unverändert (P2b-Regression).
- **Build-Gate:** voller `next build` (Routen/Server-Actions), `tsc --noEmit`, `check:token-audit`, `check:component-set`, `check:knip`.

---

## 15. Regel-Compliance

- DDL nur via Supabase-Plugin `apply_migration` → recorded Version → File benennen → READ-verifizieren (Regel 2, Twin-Drift).
- Branch `kitta/aar-<nr>-<slug>`, PR **gegen staging**, nie main, nicht selbst mergen.
- 7-Punkte-Audit je Commit.
- Phasen einzeln mergebar + additiv (kein Big-Bang).
