# Firmen-Flotte Layer 2 · Slice 2 — Gegner-Flow (`/schaden/[token]` → Claim) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Der Unfallgegner tippt die NFC-Karte ans Handy → `/schaden/{karten_token}` (kein Login) → erfasst seine Seite (Unfallbericht + Groq-Diktat + Fotos beider Autos + Kontakt + Haftpflicht/Kennzeichen/Police + Unterschrift) → daraus entsteht ein **Claim** (Reuse `createLead`→`convertLeadToClaim`), der Gegner wird optional per SMS eingeladen, und der Schaden wird der **Gegner-Haftpflicht** gemeldet. Der Flottenmanager sieht den Schaden am Fahrzeug (schließt den Slice-1-Draft-Loop).

**Architecture:** Neue Route `/schaden/[token]` + Gegner-Wizard **NEBEN** den aktiven `flow/[token]`-Files (aar-956) — nur Lib-Reuse, keine Edits an deren Files. Token = `schadenkarten.karten_token` (keine neue Tabelle). Gegner-Daten-SSoT = `claim_parties(verursacher)`. Alle Reads/Writes über kanonische Primitive.

**Tech Stack:** Next 15 RSC + Client-Wizard, Supabase (DDL via MCP `apply_migration`), Groq Whisper (`transcribeAudio`), `SignaturePadInput`, `VersichererSelect`, `uploadFallDokument`, `createLead`/`convertLeadToClaim`, `erfasseVsKorrespondenz`.

## Global Constraints
- NIE auf main; Branch `kitta/firmen-flotte-layer2-slice2` (off staging), PR gegen staging.
- **DDL NUR via `apply_migration` (MCP-Plugin)**, File exakt nach getrackter Version. `execute_sql` nur READ. Types dürfen lagen (AnyDb).
- **KEIN Edit an aar-956-Territorium** (`src/app/flow/[token]/*`, `melde-schaden`, `src/lib/leads/*` — nur importieren/reusen). Bei nötiger Signatur-Erweiterung → Marker + Aaron.
- Frontend echte Umlaute (ä/ö/ü/ß). Komponenten shared/primitives. Server-Actions Result-Object `{ ok, error? }`, kein throw; `revalidatePath`.
- **DPIA-GATE:** Der Gegner-Flow verarbeitet Gegner-PII (Name/Tel/Email/Fotos/Unterschrift/Hergang). **Prod-Launch ist auf die abgeschlossene DPIA gegated** (Spec `2026-07-11-dpia-nfc-schadenkarte-gegner-flow.md`). Bau/staging läuft; **Consent-Screen ist Pflicht im Flow** (Checkbox + Timestamp vor jedem Write). Fotos NUR Sachschaden (kein Personenschaden — Art.-9-Vermeidung).
- 7-Punkte-Audit je Commit + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## Koordination (VOR dem Bau)
- **claim-dokumente-kanon (a6c863e2, aktiv — hat 470d55c9/claims+dokumente-Owner übernommen):** (1) `claims.hergang_gegner_text`-DDL + (2) alle Foto-/Doku-Reads über **`v_claim_dokumente`** + `sichtbar_fuer`. **Marker vor der claims-DDL + vor den Doku-Reads; ggf. nach deren Merge sequenzieren.** (v_claim_dokumente-Existenz zuerst prüfen — Explore konnte es nicht bestätigen.)
- **aar-956:** `createLead`/`convertLeadToClaim`-Reuse (Lib-Import, deren Files unberührt). Reihenfolge claim-first.
- **6f60c510:** 150€-Provision (Slice 3/eigene Lane).

---

## Dekomposition — 3 Sub-Slices

### **Slice 2a — Capture (Route + Wizard + Draft-Lead)** ← DIESER PLAN baut 2a
`/schaden/[token]` resolved → Consent → Wizard (Kontakt/Fahrzeug+Haftpflicht/Hergang+Voice/Fotos/Unterschrift/Review) → **`createLead`** (source_channel `schadenkarte_gegner`, vehicle_id+firma_id+Gegner-Daten) = **Draft-Lead**. Der Flottenmanager sieht „Schaden-Entwurf" am Fahrzeug (Slice-1-Loop geschlossen). **NOCH KEIN** convertLeadToClaim.

### **Slice 2b — Claim + VS-Meldung** (Folge-Plan)
Review→Absenden → `convertLeadToClaim` (verursacher-Party: Gegner-VS/Kennzeichen/Police) → `erfasseVsKorrespondenz` + Send an Gegner-Haftpflicht (`versicherungen.schaden_email`) + Pflicht-Hinweis + optional `inviteGegnerViaAirdrop` (SMS-Kopie). SV/Kanzlei-Sicht-Nachzug.

### **Slice 2c / Slice 3 — Kasko + Härtung** (Folge-Plan)
Kasko-Angebot (reine Meldung an eigene VS, KEIN SV/Kanzlei — Aaron-Lock), Consent-Audit-Härtung, Kanzlei-Detail-View (Haftpflicht-only).

---

## Slice 2a — Tasks

### Task 1: DDL — Gegner-Felder (nach Koordination mit claim-dokumente-kanon)
**Files:** `supabase/migrations/<version>_gegner_flow_felder.sql` (via apply_migration).
- [ ] **Step 1 — Koordinieren:** Marker an claim-dokumente-kanon (claims-Owner) bzgl. `claims.hergang_gegner_text`; `v_claim_dokumente`-Existenz prüfen (`execute_sql` READ auf information_schema/pg_views).
- [ ] **Step 2 — DDL** (apply_migration): `alter table claims add column if not exists hergang_gegner_text text;` + `alter table leads add column if not exists gegner_telefon text, add column if not exists dsgvo_consent_gegner_am timestamptz;` (nur wenn nicht vorhanden — Explore: leads hat gegner_versicherung_id/gegner_kennzeichen schon; verifizieren). Foto-Gegner-Sichtbarkeit via bestehendes `fall_dokumente.sichtbar_fuer` (Explore: existiert) → ggf. keine neue Spalte.
- [ ] **Step 3:** `list_migrations` → getrackte Version ablesen → File exakt danach benennen + committen (Twin-Drift-Schutz). `execute_sql` READ zum Verifizieren.

### Task 2: Public Token-Resolver `/schaden/[token]`
**Files:** Create `src/lib/schadenkarte/gegner-flow.ts` (+ Test).
- **Produces:** `resolveSchadenTokenContext(db, token): Promise<{ ok: true; fahrzeugId; firmaId; kennzeichen; hersteller; modell; firmaName } | { ok: false; reason }>` — nutzt Layer-1 `resolveSchadenkarteToFahrzeug` (status='gebunden'-Gate) + lädt Fahrzeug/Firma-Kontext (unsere Seite steht vor).
- [ ] TDD: Token unbekannt/nicht-gebunden → `{ok:false}`; gebunden → Kontext. Service-role Admin-Client (anon hat kein RLS-Zugriff — Auflösung server-side).

### Task 3: `/schaden/[token]/page.tsx` (public, kein Login) + Consent-Screen
**Files:** Create `src/app/schaden/[token]/page.tsx`, `src/app/schaden/[token]/SchadenGegnerConsent.tsx`.
- [ ] Server-Page: `resolveSchadenTokenContext` → wenn ok: „Unsere Seite" (Firma+Kennzeichen) + **Consent-Screen** (Datenschutz via `getAllLegalDocs()` + Pflicht-Checkbox „Ich stimme der Verarbeitung zur Unfallregulierung zu") → erst nach Consent den Wizard. Kein Redirect-Stub (Content-return). Branding: Claimondo default (anon Gegner) ODER Firma-Brand falls `use_custom_branding`.
- [ ] Consent-State wird beim ersten Write (Task 5) als `dsgvo_consent_gegner_am` gespeichert.

### Task 4: `SchadenGegnerWizard.tsx` (Client, mehrstufig)
**Files:** Create `src/app/schaden/[token]/SchadenGegnerWizard.tsx` + `src/app/api/schaden/voice-transcribe/route.ts` (fork der flow-voice-route, token-gate auf schadenkarten).
- [ ] Steps: (1) Kontakt (Name/Tel/Email), (2) Fahrzeug + Haftpflicht (`<VersichererSelect>` + Kennzeichen + Police-Nr), (3) Unfallhergang (Freitext + Groq-Diktat via `transcribeAudio`-Endpoint), (4) Fotos beider Autos (`uploadFallDokument`-Wrapper, Sachschaden-Scope), (5) Unterschrift (`<SignaturePadInput>`), (6) Review + Pflicht-Hinweis „Der Schaden wird der Haftpflicht des Unfallverursachers gemeldet; Sie sind verpflichtet, ihn auch selbst zu melden."
- Alle Komponenten REUSE (shared/primitives). Umlaute.

### Task 5: `submitSchadenGegner` Action → Draft-Lead
**Files:** Create `src/app/schaden/[token]/actions.ts` (`'use server'`).
- [ ] `submitSchadenGegner(token, gegnerData): Promise<{ok, leadId?, error?}>`: Token-resolve (server) → **Consent-Check** (Pflicht) → `createLead(admin, { source_channel:'schadenkarte_gegner', status:<draft> }, { vehicle_id, firma_id, gegner_name/telefon/email, gegner_versicherung_id, gegner_kennzeichen, hergang_gegner_text, dsgvo_consent_gegner_am })` → Fotos/Unterschrift als `fall_dokumente` (via uploadFallDokument-Wrapper, `sichtbar_fuer` gesetzt). **KEIN convertLeadToClaim (Slice 2b).** `revalidatePath('/flotte/fahrzeug/${vehicleId}')` → „Schaden-Entwurf" erscheint. Result-Object.
- [ ] Note: `source_channel`/`status`-Enum-Werte ggf. neu (via DDL/enum add if needed — mit aar-956 abstimmen, da leads-Enum shared).

## Self-Review
- Spec-Coverage: Gegner erfasst am Handy (Task 3-5); Groq/Fotos/Unterschrift/Haftpflicht (Task 4); Draft am Fahrzeug (Task 5 → Slice-1-Loop). Claim+VS = Slice 2b (bewusst). DPIA-Consent = Task 3+5.
- Sicherheit: Token-Auflösung server-side (anon kein RLS); Consent-Gate vor Write; Fotos Sachschaden-Scope.
- Koordination: claims-DDL + Doku-Reads mit claim-dokumente-kanon; leads-Enum mit aar-956.
