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
| E5 | **Volle Pro-Lead-Abrechnung jetzt — INBOUND (wir charchen den SV, kein Payout).** Basic behält sein Honorar; Claimondo zieht den **Einzelpreis (30% via `leadpreis.ts`)** ein. Zahlungsmethode (Stripe) ist ein **hartes Gate** (keine Methode → keine Fälle). Preis hängt vom **Gutachten-/Schadenwert** ab → Kundenbetreuer hält ihn nach → Charge **nach Erfassung der Schadenhöhe**, nicht bei Zuweisung | Stripe-SetupIntent im Onboarding (Gate) + Charge-Mechanik (P5), Reuse `leadpreis.ts` + `gutachter_abrechnungen` |
| E6 | **Standort „claimen" = GMB-artig** — vorhandenen DAT-Pin (`sv_leads`) beanspruchen, sonst frisch anlegen | Veredelt den toten `sv_leads`-Kaltpool zu echten Accounts; löst Doppel-Pin |
| E7 | **Nachweis = DAT-Mitgliedsnummer.** Der `sv_leads`-Pool ist komplett DAT-importiert → Claim eines DAT-Pins ist der Identitätsbeweis. Nicht-DAT-SVs legt das Team weiterhin selbst an (bestehender Admin-Wizard, nicht Self-Service). | Self-Service-Trichter ist DAT-zentriert |
| E8 | **Verifizierung ist ein Ermessens-/Qualitätsgate (approve/reject), kein Auto-Stempel.** Aaron steuert, wer reinkommt. Freigabe in 48 h. | Claim+Onboarding erzeugen **pending** Account; live erst nach Team-Freigabe → deckt zugleich Claim-Sicherheit ab. **Reuse `verifizierung_status` (`ausstehend`→`geprueft`, +neu `abgelehnt`) + `verifizierung_frist_bis` (= 48 h) + `verifizierung_admin_notiz`** — KEINE neue Spalte |
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
- **Billing heute:** `sachverstaendige.stripe_customer_id`, `stripe_anzahlung_bezahlt_am` (Webhook setzt `ist_aktiv` + `portal_zugang_freigeschaltet`), `zahlungsempfaenger_iban NOT NULL` (Payout), `stripe_default_payment_method_id`. `startStripeCheckout` (`src/lib/actions/sv-onboarding-actions.ts`). **Leadpreis:** `src/lib/leadpreis.ts` `berechneLeadpreis(schadenhöhe, hatPaket)` (Paket 25% / **Einzel 30%**, min 200 €). SV-Abrechnung `src/lib/gutachter/abrechnung.ts` (`gutachter_abrechnungen.leadpreis/preistyp/abgerechnet_am`, `faelle.gutachten_betrag`, `berechneSvNetto = honorar − leadpreis` = **Payout-Richtung**).
- **Verifizierung heute:** `verifizierung_status` (`null|ausstehend|geprueft|frist_ueberschritten`) + `verifizierung_frist_bis` + `verifizierung_admin_notiz` + `verifiziert_am`; Stripe-Webhook setzt `ausstehend`, Admin `geprueft` (`src/app/admin/sachverstaendige/[id]/verifizierung-actions.ts:116`); Banner-Gate in `gutachter/layout.tsx`. **Phone/WA-Verify:** `src/lib/twilio/verify-client.ts` (Twilio Verify, von 2FA genutzt) + `src/lib/whatsapp/availability.ts` (`isOnWhatsApp`-Cache, entity `lead|profile|gfa`).

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
                                              │ verifizierung_status='ausstehend'
                            ┌─────────────────▼─────────────────┐
                            │  Discretionary Verification (P3)   │
                            │  Admin-Queue approve/reject, 48h   │
                            │  (verifizierung_status/_frist_bis) │
                            │  setzt verifiziert + ist_aktiv +   │
                            │  portal_zugang_freigeschaltet      │
                            └─────────────────┬─────────────────┘
                                live          │
                ┌─────────────────────────────▼───────────────────────────┐
                │  Fallback-Matching (P4)        Per-Lead-Billing (P5)      │
                │  findBestSV: paket='basic'      Charge Einzelpreis (30%)   │
                │  prio 0, kontingent-bypass      nach Schadenhöhe (Stripe)  │
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
- **Admission-Status (REUSE, keine neue Spalte):** die bestehenden `verifizierung_status` (heute `null|ausstehend|geprueft|frist_ueberschritten`; gesetzt von Stripe-Webhook=`ausstehend`, Admin=`geprueft` in `verifizierung-actions.ts:116`) + `verifizierung_frist_bis` (= 48-h-SLA) + `verifizierung_admin_notiz` + `verifiziert_am` + `verifiziert` (bool) + `ist_aktiv` + `portal_zugang_freigeschaltet`. **Einziger DDL-Bedarf:** Wert **`'abgelehnt'`** zum `verifizierung_status` ergänzen (Reject) + `ablehnungs_grund` (kann `verifizierung_admin_notiz` sein). Live prüfen ob `verifizierung_status` per CHECK/Enum eingeschränkt ist.
- **Billing (Einzelpreis ist NICHT pro SV gespeichert):** wird **pro Fall abgeleitet** via `berechneLeadpreis(schadenhöhe, hatPaket=false)` (`src/lib/leadpreis.ts`, = 30%, min 200 €). Reuse `gutachter_abrechnungen` (`leadpreis`, `preistyp` — neuer Wert z.B. `'basic_einzel'`). `stripe_customer_id` + `stripe_default_payment_method_id` existieren bereits (Charge-Methode). **Kein** `basic_einzelpreis_cents` nötig.
- **`zahlungsempfaenger_iban` (Auszahlungs-IBAN) ist für Basic IRRELEVANT** — Basic bekommt **keinen Payout** (er behält sein Honorar, wir *charchen* ihn). Heutiges `NOT NULL` darf den Basic-Self-Service-Pfad nicht blockieren → Spalte **nullable** machen ODER im Basic-Insert leer lassen (DB-Entscheidung §12). **Hartes Gate für Basic = hinterlegte Stripe-Zahlungsmethode**, nicht der IBAN.

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
- **Einstieg = gutachter.claimondo.de** (schlanke Marketing-Landing im **separaten** `claimondo-marketing`-App → `/gutachter-partner`, `claimondo-marketing/middleware.ts`, eigenes Deployment): Pitch + CTA „Kostenlos Basic-Partner werden". Landing bleibt schlank; der **eigentliche Flow läuft im Haupt-App** (app.claimondo.de — braucht Auth/Supabase/WizardClient/Stripe). **Subdomain-Trennung beachten** (`feedback_subdomains_in_ruhe_lassen`): an `claimondo-marketing` nur CTA/Verlinkung, koordinieren — kein Flow-Bau dort.
- Public-Route **im Haupt-App** `src/app/sv/registrieren/` (Name offen, §12) — Karte/Suche über die öffentlich sichtbaren `sv_leads`-Pins (PLZ/Name/DAT-Nr.-Suche). **Privacy:** Anon-Suche darf nur Minimal-Felder zeigen; identifizierende `sv_leads`-Felder erst nach Identitätsbestätigung. RLS/Service-Role-Pfad wie bei den bestehenden Token-Flows.
- Aktion `beanspracheSvLead(svLeadId, kontaktnachweis)` (service-role, da anon): legt `auth.users` + `profiles` (rolle gutachter) + `sachverstaendige` (paket='basic', `verifizierung_status='ausstehend'`, `ist_aktiv=false`, `portal_zugang_freigeschaltet=false`) an; prefillt aus `sv_leads` (name, firma, vorname/nachname, adresse, plz, ort, lat/lng, telefon, email, dat_id/dat_expert_nr, bvsk_nr, ihk_zertifikat, oebuv_nr, qualifikationen, fachschwerpunkte, jahre_erfahrung, paket_umkreis_km→25, isochrone_polygon falls vorhanden); setzt `sv_leads.konvertiert_zu_sv_id` + `claim_status='beansprucht_pending'`.
- Fresh-Variante `registriereSvBasicNeu(stammdaten + dat_nr)`: gleicher Account-Aufbau ohne sv_leads-Quelle.
- **Account-Erstellung:** **Magic-Link primär** + Registrierungs-Email-Fallback (SV setzt danach eigenes Passwort); `force_password_change` analog Admin-Anlage. 2FA-Default wie bei SVs.

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
| 10 | identitaet | Anrede/Vorname/Nachname + **Telefon (Pflicht: Phone-Verify + WA-Reachability-Test)** | Name skip aus Claim; **Telefon-/WA-Verify immer** | alle |
| 20 | standort | Adresse (Google Places)→Geo, Radius (Default 25) | skip/prefill aus Claim | alle |
| 30 | qualifikation | DAT-Nr. (+BVSK/IHK/öbuv optional) | skip wenn aus DAT-Pin vorhanden | alle |
| 40 | profil | Avatar-Upload + kurze Profilbeschreibung | — (Pin hat kein Foto/Text) | alle |
| 50 | kalender | Google OAuth **oder** CalDAV verbinden | — (Pflicht) | alle außer sub |
| 60 | vertrag | Vertrag/DSGVO + Signatur (`signature`-Feld) | Basic: vereinfachter Vertrag | alle |
| 70 | zahlung | Zahlungsmethode (Stripe SetupIntent) | **Basic: Karte hinterlegen (kein Anzahlungs-Checkout)**; Pro: bestehender Anzahlungs-Checkout | alle (Variante je paket) |

**Neue Feld-Typen (Wizard-Field-Registry erweitern):** `calendar-connect` (Google/CalDAV), `stripe-payment-method` (SetupIntent / Embedded), `avatar-upload`, `phone-verify` (Twilio Verify + WA-Reachability). Vorhanden nutzbar: `signature` (Vertrag), Upload-Felder (Dokumente). Das ist der Kern der P2-Arbeit neben der Config.

**Account/Login & Kontakt:** Login = **Magic-Link primär** (SV setzt sich danach ein eigenes Passwort) + **Registrierungs-Email als Fallback**. **Telefonnummer ist Pflicht** — Koordination läuft darüber. Im Onboarding wird sie (a) per **Twilio Verify** (`src/lib/twilio/verify-client.ts`) auf Besitz und (b) per **WA-Reachability** (`src/lib/whatsapp/availability.ts`, entity `'profile'`, Baileys `isOnWhatsApp`) auf WhatsApp-Fähigkeit getestet. Ergebnis ist Teil der Freigabe-Grundlage (P3).

**Skip-Mechanik:** `load-needed-phases` + `conditional_on` werten den aktuellen `sachverstaendige`-/`profiles`-Stand aus und blenden Phasen/Felder aus, deren `db_target`-Spalten bereits befüllt sind. → „wenn wir schon alle Infos haben, fragen wir nicht nochmal."

**De-Risk (P2a/P2b):** P2a baut den dynamischen Flow + Basic-Pfad neu und lässt das bezahlte `/gutachter/willkommen` zunächst unangetastet; P2b migriert Solo/Büro/Akademie/Sub auf denselben `flow_key`/Engine und entfernt `WillkommenClient`. **Pflicht-Gate:** voller `next build` + Smoke aller bezahlten Onboarding-Rollen vor P2b-Merge (Regressionsrisiko bezahlte Strecke).

**Abschluss:** Letzter Schritt setzt `verifizierung_status='ausstehend'` + `verifizierung_frist_bis=now()+48h` (Basic) bzw. bestehende Anzahlungs-Logik (Pro). Wizard-Completion ≠ live.

**Tests:** Prefill-Skip (Claim-SV sieht nur Lücken-Phasen); jede bezahlte Rolle läuft unverändert durch; neue Feld-Typen schreiben korrekt in `db_target`; `next build` grün.

---

## 8. Phase P3 — Discretionary Verification (Admin)

**Zweck:** Aaron/Team entscheidet pro SV (approve/reject), wer live geht. 48-h-SLA.

**Komponenten (REUSE der bestehenden Verifizierungs-Mechanik):**
- Admin-Queue (Filter/Tab in der bestehenden SV-Übersicht oder `src/app/admin/sachverstaendige/freigaben/`): Liste `paket='basic' AND verifizierung_status='ausstehend'`, sortiert nach `verifizierung_frist_bis`, mit DAT-Nr./Qualifikationen/Standort/Prefill-Quelle + **Phone-/WA-Status** + Detail. Baut auf `src/app/admin/sachverstaendige/[id]` + `verifizierung-actions.ts`.
- Aktionen (Result-Object-Pattern, `verifizierung-actions.ts` erweitern): `gibBasicSvFrei(svId)` → `verifizierung_status='geprueft'`, `verifiziert=true`, `verifiziert_am`, `ist_aktiv=true`, `portal_zugang_freigeschaltet=true`; `lehneBasicSvAb(svId, grund)` → `verifizierung_status='abgelehnt'` (neuer Wert), `verifizierung_admin_notiz=grund`, Account bleibt (kein Hard-Delete) + SV-Benachrichtigung.
- **48-h-SLA:** `verifizierung_frist_bis = now()+48h` bei Onboarding-Abschluss; Admin-Benachrichtigung bei Eingang (Reuse `benachrichtigungen` wie `stelleWaitlistAnfrage`); bestehender `frist_ueberschritten`-Status + Cron (VPS-crontab) markiert Überschreitung.

**Wichtig — Unterschied zu bezahlt:** Bei bezahlten SVs setzt der **Stripe-Anzahlungs-Webhook** `ist_aktiv`+`portal_zugang` (`api/stripe/webhook`). Basic hat **keine Anzahlung** → die Freigabe-Aktion MUSS diese Flags selbst setzen.

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

## 10. Phase P5 — Per-Lead-Billing (INBOUND: wir charchen den SV)

**Zweck:** Der Basic-SV behält sein Honorar; Claimondo zieht je vermitteltem Lead den **Einzelpreis (30%)** von ihm ein. **Claimondo fasst das Honorar des Basic-SV NIE an** — kein Geldfluss zu ihm, keine Weiterleitung; der einzige Geldfluss ist der eingezogene Einzelpreis (inbound). **Inverses Modell** zum bezahlten SV, wo Claimondo `gutachten_betrag − leadpreis` an den SV *auszahlt* (`src/lib/gutachter/abrechnung.ts:berechneSvNetto`).

**Preisbildung (Reuse):** Einzelpreis = `berechneLeadpreis(schadenhöhe, hatPaket=false)` (`src/lib/leadpreis.ts`) = **30%, min 200 €**, interpoliert. Basic ist immer `hatPaket=false` — exakt der Tarif, den bezahlte SVs für nicht-inkludierte Über-Kontingent-Fälle zahlen.

**Workflow (E5):**
1. Lead wird einem `paket='basic'`-SV zugewiesen (P4) → Abrechnungs-Position offen, **noch ohne Betrag** (Schadenhöhe unbekannt).
2. SV macht das Gutachten; **Kundenbetreuer/Team hält die Schadenhöhe / den Gutachten-Wert nach** (`faelle.gutachten_betrag` bzw. Schadenhöhe-Feld — exakte Spalte bei Impl. verifizieren).
3. Bei Erfassung: `berechneLeadpreis(...)` → Position finalisieren.
4. **Charge via Stripe** (`stripe_default_payment_method_id`) — mit Karenz/Guard (analog embed-B, kein blinder Sofort-Einzug) + Idempotenz (kein Doppel-Charge).

**Komponenten:**
- Zahlungsmethode in P2 via Stripe **SetupIntent** → `stripe_customer_id` + `stripe_default_payment_method_id` (= Gate).
- Reuse `gutachter_abrechnungen` (`leadpreis`, `preistyp='basic_einzel'`) — **Settlement-Richtung = Charge (inbound), nicht Payout**. Markierung (preistyp/Flag) nötig, damit der Payout-Reader `berechneSvNetto` Basic nicht fälschlich als Auszahlung interpretiert.
- Admin-Sicht: offene/erfasste/abgerechnete Basic-Positionen; Fehlschlag-Handling (`stripe_einzug_fehlgeschlagen_am`-Muster, AAR-644).
- Charge-Cron VPS-crontab (kein vercel.json).

**Tests:** Zuweisung erzeugt genau eine Position; Schadenhöhe-Erfassung berechnet 30% korrekt; Stripe-Charge im Test-Mode; Fehlschlag sauber (kein Doppel-Charge); bestehender Payout-Reader liest Basic NICHT als Auszahlung; Storno-Pfad.

---

## 11. Querschnitt

- **Auth/RLS:** pending Basic-SV darf sich einloggen + eigenes Onboarding schreiben, aber **nicht** dispatchable/sichtbar sein (Filter `ist_aktiv+portal_zugang`). RLS: SV updatet nur eigene `sachverstaendige`/`profiles`-Zeile (kein Mass-Assignment auf `paket`/`verifiziert`/`verifizierung_status` — diese nur via service-role/Admin-Action setzbar). **Selbst-Eskalation verhindern** (vgl. Live-RLS-Audit: keine Self-Writes auf privilegierte Spalten).
- **Branding:** Basic ist kostenlos → `use_custom_branding` bleibt an `verifiziert && use_custom_branding` gegated; Basic standardmäßig Claimondo-Branding (kein Whitelabel im Free-Tier, sofern nicht anders gewünscht).
- **Error-Handling:** alle neuen Server-Actions Result-Object (`{ ok, error? }`), non-critical Sends (Email/WA/Benachrichtigung) in try/catch; `revalidatePath` auf betroffene Routen.
- **Umlaute:** alle nutzersichtbaren Strings (Wizard, Karte, Admin-Queue, Emails) mit echten ä/ö/ü/ß.
- **Komponenten-Set:** neue UI nur `primitives.*` / `shared/*` (Button/Card/DataTable) — kein handgerolltes Tailwind (CI-Ratchet).
- **Crons:** SLA-Reminder/Charge nur VPS-crontab, keine vercel.json.

---

## 12. Entscheidungen — im Review geklärt + noch offen

**Im Review mit Aaron geklärt (2026-06-01):**
- ✅ **IBAN:** `zahlungsempfaenger_iban` ist Payout → irrelevant für Basic. Nicht erzwingen; **Stripe-Zahlungsmethode = hartes Gate**.
- ✅ **Billing-Auslöser:** Charge **nach Erfassung der Schadenhöhe** (Kundenbetreuer hält nach), nicht bei Zuweisung.
- ✅ **Einzelpreis:** abgeleitet via `leadpreis.ts` (30%, min 200 €), kein pro-SV-gespeicherter Preis.
- ✅ **Login:** Magic-Link primär + Registrierungs-Email-Fallback; **Telefon Pflicht + WA-/Phone-Verify**.
- ✅ **Admission-Status:** Reuse `verifizierung_status` + `verifizierung_frist_bis` (48 h), nur `'abgelehnt'` ergänzen — **keine neue Spalte**.
- ✅ **Karte:** volle `toOeffentlichesSvProfil`-Projektion **inkl. Google-Bewertung** (wie normale SVs); nur die Matching-Prio macht den Fallback.

**Noch offen:**
1. ✅ **Einstieg geklärt:** Marketing-CTA auf **gutachter.claimondo.de** (`claimondo-marketing` → `/gutachter-partner`, schlank) → Flow im Haupt-App. Offen nur noch: interner Haupt-App-Route-Name (`/sv/registrieren` vs. `/partner-werden`).
2. **Exakte Schadenhöhe-Spalte** auf `faelle` für `berechneLeadpreis` (Netto-RK) — bei Impl. via information_schema verifizieren.
3. **`gutachter_abrechnungen`-Richtung:** sauberster Weg, Basic-Charge (inbound) von Payout-Positionen zu trennen (eigener `preistyp` vs. neues `richtung`-Feld), damit `berechneSvNetto` + Finance-Reader Basic nicht als Auszahlung lesen.
4. **Kundenbetreuer für Basic:** wer hält die Schadenhöhe nach (fester KB vs. Team-Pool) — Workflow-Detail in P5.

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
