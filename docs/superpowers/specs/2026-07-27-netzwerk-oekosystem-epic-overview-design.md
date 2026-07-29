# Epic: Claimondo Netzwerk-Ökosystem — Overview & Reuse-Landkarte

**Datum:** 2026-07-27
**Status:** Epic-Overview (Brainstorming, laufend) — Master-Dokument
**Branch:** `kitta/netzwerk-verbindungen-freundschaft` (Basis `origin/staging`)
**Component-Specs:** Spec 1 (Netzwerk-Verbindungen `2026-07-21`), Spec 2 (Angebotsstruktur/Freemium `2026-07-25`), Spec 3 (SV-Vermittlungs-Flow `2026-07-27`)
**Leitprinzip (Aaron):** **Bestehende Infra mappen und integrieren — nur was wirklich neu ist, wird neu gebaut.**

---

## 1 · Das Modell in einem Satz

> Der Werkstatt-/Gutachter-Finder eines **netzwerk-gebundenen Kunden** zeigt oben immer die Sektion **„Dein Netzwerk"** = die befreundeten, **zahlenden** Gegenstücke seines Owners (SV *oder* Werkstatt), **innerhalb** normal gerankt. Niemand empfiehlt oder wählt mehr vor — das Netzwerk ist einfach immer da. Genau das ist der Wert hinter dem SV-Abo.

**Bidirektional, symmetrisch, eine Mechanik:**
- Kunde kam über **SV** → sucht Werkstatt → „Dein Netzwerk" = Partner-**Werkstätten** des SV.
- Kunde kam über **Werkstatt** → sucht Gutachter → „Dein Netzwerk" = Partner-**SVs** der Werkstatt.
- Funktion: `resolveNetzwerkFreundKandidatIds(owner, zielRolle)`, `zielRolle ∈ {werkstatt, gutachter}`.

**Das Gate hängt IMMER am SV** (die monetarisierte Rolle): ein SV nimmt am Boost teil — als Owner *oder* als Kandidat — **nur wenn er zahlt**. Werkstatt/Flotte sind **kostenlose Verbindungsknoten** (v1). Regel: *ein Kandidat kommt in „Dein Netzwerk", wenn er (a) mit dem Owner befreundet ist UND (b) — falls SV — zahlt.*

---

## 2 · Workstreams

| WS | Inhalt | Spec |
|---|---|---|
| **A · Verbindungs-Graph + Einladen** | Kanten SV↔Werkstatt↔Flotte; „neuen Partner einladen" (Werkstatt lädt SV+Flotten; SV fügt B2B-Flottenpartner) | Spec 1 (+ Invite neu) |
| **B · Freemium & Abo** | Free vs. zahlender „Netzwerkpartner"; Registrierung-Freemium + Abo-Ask im Onboarding + In-App-Upgrade | Spec 2 |
| **C · Boost & Badge (bidirektional)** | „Dein Netzwerk"-Sektion (Kunde-Finder, immer an) + Matching-Score-Term (SV-Reverse) + „Netzwerkpartner"-Badge | Spec 1 |
| **D · SV-Vermittlungs-Flow** | Gutachten→Sofort-Claim→onboarden→Kunde self-served im Netzwerk-Finder→Werkstatt-Termin | Spec 3 |
| **E · Netzwerkkarte** | Schadenkarte → „Netzwerkkarte" umframen, als Partner-Vorteil verkaufen | (neu) |
| **F · DAT-Gating raus** | Registrierung für alle Gutachter öffnen; DAT-Gating auditieren + entfernen | (neu) |
| **G · Flottenpartner-Features** | Feature-Set + Verkaufsargumente für Flottenpartner | (offen) |
| **H · Kunde fahrzeug-zentrisch** | Fahrzeug-Übersicht statt Fälle-Liste; Schäden als Historie in Detail-Views | (neu, spiegelt FM) |

---

## 2b · Nachträge (27.07.) — WS H, Kontaktverwaltung, Verfeinerungen

**Workstream H · Kunde-Portal fahrzeug-zentrisch:** statt Fälle-Liste → **Fahrzeug-Übersicht** `/kunde/fahrzeuge` → Fahrzeug-Detail (Stammdaten + **Schadenhistorie**) → Schaden-Detail (bestehende Claim-View). **Reuse = FM-Muster generalisieren** (`/flotte/fahrzeug/[id]` + `schaden/[claimId]`, `lib/flotte/fahrzeug-schaeden.ts`, `flotten-claim-detail.ts`) von firma-scoped auf owner-scoped (`vehicles.current_owner_id`). `/kunde/faelle/[id]` bleibt Legacy-Redirect. Net-new: `/kunde/fahrzeuge`-Routen + owner-scoped Query. Ein-Auto-Kunden auto-expandiert.

**Kontaktverwaltung (WS A):** der „Verbindungen"-Tab ist ein echter Kontakt-Manager — Freunde-Liste · offene Anfragen (annehmen/ablehnen) · entfernen/blockieren · Partner einladen. Soziale Substanz für späteren Chat.

**Verfeinerungen (operativ beste Version):**
1. **Bindung per-Claim, nicht per-Kunde** — Owner aus dem Claim-Ursprung (ein Kunde kann mehrere Fahrzeuge/Netzwerke haben); dovetailt mit WS H.
2. **Entitlement partner-typ-agnostisch** (wie `partner_rang`/`partner_provisionen`: `partner_typ`+`partner_id`); Gate v1 nur SV, später ohne Umbau erweiterbar.
3. **Reverse-Sicht trennen:** gebundener Kunde → SV-**Liste** (`SvSlotAuswahl` + „Dein Netzwerk"); anon Prospect → **Karte** + Badge.
4. **DAT-Gating raus, Verifizierungs-Freigabe behalten** (48h Admin-Review bleibt → kein Spam).
5. **„Dein Netzwerk" graceful + messbar:** leer → normales Ranking; Telemetrie (gezeigt/gewählt/konvertiert); Free-SV-Upsell.
6. **Sofort-Claim ohne SA: Expiry + Nudge** (keine hängenden Claims).
7. **Netzwerkkarte pro Fahrzeug** (WS E hängt am Fahrzeug, überlebt Schäden).

**Revidierte offene Entscheidung (Graph-Knoten):** tendenziell **polymorph `partner_typ`+`partner_id`** (konsistent mit `partner_rang`/`partner_provisionen`) statt `profiles↔profiles`, da der ganze Partner-Stack entity-typ-basiert ist; Chat (profil-basiert, später) mappt via Entity→Profil. Zu bestätigen in der WS-A-Durchsprache (§überschreibt Offene Entscheidung #1).

## 3 · Reuse-Landkarte — BESTEHEND → INTEGRATION → NET-NEW

> Verifiziert gegen prod-DB `paizkjajbuxxksdoycev` + Worktree-Code (`origin/staging`). „Net-new" ist bewusst minimal gehalten.

### 3.1 Graph & Identität
| Baustein | Bestehende Infra | Integration | Net-new |
|---|---|---|---|
| Knoten-Identität | `profiles(id, rolle)`; `sachverstaendige.profile_id`, `werkstaetten.user_id`, `firmen_flotten_konten.user_id` (alle 1:1 → Profil) | Graph-Kanten referenzieren `profiles.id` | — |
| Netzwerk-Surface | `/{portal}/netzwerk` = **existierender Community-Feed** (0-Migration, community-RPCs, Aaron-approved, Spec `2026-07-04`) | Tabs **Verbindungen / Anfragen** daneben; Feed unberührt | Verbindungen/Anfragen-UI |
| Kanten selbst | *keine* (kein Freund-Graph existiert) | — | **`netzwerk_verbindungen` + View `v_netzwerk_freunde`** |

### 3.2 Boost & Ranking (der zentrale Reuse-Hebel)
| Baustein | Bestehende Infra | Integration | Net-new |
|---|---|---|---|
| Partner-Qualität (global) | **`partner_rang`** (typ-agnostisch sv/makler/werkstatt, bronze/silber/gold, cron, DB-config `partner_rang_config`) — LIVE | Ordnet **innerhalb** der Sektion mit | — |
| SV-Matching-Score | `matching-score.ts` `bewerteSvKandidat`: `paketPrio*100 + rangOrdinal*10` (flag `PARTNER_RANG_MATCHING`, prod=an) | **+ Netzwerk-Term** für befreundete zahlende SVs (Reverse-Richtung), unter `W_PAKET` | Netzwerk-Term |
| Werkstatt-Ranking | `rank-vorschlaege.ts` `rankeWerkstattVorschlaege` (Marke>Gewerke>Gruppe>verifiziert>Distanz) | **„Dein Netzwerk"-Sektion partitioniert oben, rankt darin normal** | `applyNetzwerkPraeferenz` (Partition) |
| Finder-Sichtbarkeit | `applyDispatchableFilter` (SV), `bewerteMarke`+`provision_aktiv` (Werkstatt) | unverändert, Boost dockt danach an | — |
| Badge | `istTopPartner` (paket≠basic, leak-safe), `PartnerRangBadge.tsx`, `SvProfilePopup.tsx` | „Netzwerkpartner"-Variant, an Abo-Prädikat gebunden | Abo-gebundener Badge |

### 3.3 Entitlement / Freemium / Billing
| Baustein | Bestehende Infra | Integration | Net-new |
|---|---|---|---|
| Tier-Feld | `sachverstaendige.paket` (basic/standard/pro/premium), `BASIC_PAKET` (außerhalb `PAKETE`, preis=0), `getSvStatus`, `wartet_auf_freigabe`, `gibBasicSvFrei` | Free = basic; „Netzwerkpartner" = neue Achse *daneben* | — |
| Entitlement-Status | *keiner* (kein Abo-Objekt) | Prädikat `istZahlenderNetzwerkPartner` = **derive-at-read** aus Subscription-Row (Flag-Drift-Ratchet verbietet rohen Bool) | **Subscription-Row + Prädikat** |
| Setup-Gebühr | `sv_onboarding_rechnungen` (`onboarding_anzahlung_betrag`, Stripe-PI/Session, `typ`), `rechnungs_konfiguration` (versioniert) | Setup-Fee = Anzahlung `typ='netzwerk_einrichtung'`; Preis aus Config | Config-Werte |
| Monats-Flatrate | *keine* (App nutzt nur Einmal-Anzahlung, **kein Recurring**) | — | **Stripe-Subscription** (recurring) + Dunning via `sv_payment_reminders` |
| Provisions-Release | `completion-release-gate.ts` (Completion+7d) | für jede etwaige Provision | — |
| Provisions-Ledger | `partner_provisionen` (polymorph typ+id), `provision_aktiv` (Fee-Waiver-Muster); inbound-Haftpflicht-only | SV-Referral: **keine** Ledger-Zeile (kein Override); Waiver = `provision_aktiv=false`-Muster | — |

### 3.4 Bindung & Owner-Auflösung
| Baustein | Bestehende Infra | Integration | Net-new |
|---|---|---|---|
| Inbound-Attribution | `claims.vermittler_id`/`_typ` (SSoT, `deriveVermittler`: makler>werkstatt>flotte) | Owner-Quelle (Werkstatt/Flotte-gebundene Kunden) | — |
| Herkunfts-Spur | `profiles.entstanden_via`/`entstanden_aus_claim_id` | Seed-Aufhänger | — |
| Kunden-Bindung | *keine* | — | **`profiles.netzwerk_owner_id`/`_seit`** (Sticky First-Touch) + Seeding |

### 3.5 Vermittlungs-Flow & Claim-Lifecycle (Details Spec 3)
| Baustein | Bestehende Infra | Integration | Net-new |
|---|---|---|---|
| Claim-Erzeugung | `convertLeadToClaim` (Initial-State `:441`) | **datengetriebener** Initial-State (Gutachten → `gutachten-eingegangen`) | Data-driven-Zweig |
| SV-Selbstanlage | `anlegeFall` (admin-Muster: Lead→Claim→Slots→Vehicle) | SV-gegateter Zwilling | **SV-Anlage-Entry** |
| Onboarding-Send | `issueCanonicalFlowLinkForAnfrage` → `/flow/[token]` → `signSAandCreateFall` | FlowLink zeigt auf **bestehenden** Claim | **Onboarden-in-Claim** (SA updated statt konvertiert) |
| Gutachten | `uploadGutachten` (`gutachten`-Row), `createPflichtdokumenteFromKatalog` | Upload vor/bei Claim-Anlage | — |
| Werkstatt-Zuweisung | `assignReparaturWerkstatt({quelle:'gutachter'})` (`reparatur_werkstatt_quelle='gutachter'` schon erlaubt), `reparatur_vermittlung_status` | Kunde wählt im Netzwerk-Finder → Assign | — (Empfehl-Batch entfällt) |
| Reparatur-Phasen | `operative_status` `reparatur-werkstatt-suche/-angefragt/-laeuft/-erledigt` + `reparatur-cursor.ts` | Sub-Track vor `abgeschlossen` | — |
| Werkstatt-Termin | `reparatur_termine` + `schlageWerkstattTerminVor` (Werkstatt-Portal) | vollständig | — |

### 3.6 Einladen, Events, Karte, Registrierung
| Baustein | Bestehende Infra | Integration | Net-new |
|---|---|---|---|
| Partner einladen (A) | Makler-Referral-Muster (`lib/makler/*`, `EmpfehlungShareCard`), Admin-„Partner anlegen"-Picker #4512 + 4 Drawer, `anlegePartnerKern`, `/{rolle}/registrieren` | Invite-Link + Kanten-Anlage | **Invite-Flow (Bestand + Kalt) → Kante** |
| Events/Notify | Mitteilungs-Resolver `emitEvent`/`event-to-task-map.ts` | Netzwerk-Events registrieren (Anfrage/Referral/Verifiziert) | Event-Definitionen |
| Upgrade-Nudge | `findStuckPartnerAccounts`-Cron-Muster | Netzwerk-/Upgrade-Erinnerung | Nudge-Job |
| Netzwerkkarte (E) | `mintSchadenkarten`, `werkstatt_qr_pool`, NFC-Provisioner, Karten-Druck | **Rebrand** „Netzwerkkarte" + Vorteil-Positionierung | Wording + Sales-Frame |
| Registrierung/DAT (F) | DAT-Nr. schon optional (#4021), Wording-Spec `2026-07-08` | Audit + Gating entfernen, Freemium-Onboarding-Step | Onboarding-Umbau |

---

## 4 · Locked Decisions (Session 21.–27.07.)

- **Graph:** Knoten = `profiles` (SV/Werkstatt/Flotte, rollen-agnostisch); Makler deferred; **Kunde = bound-only** (keine Netzwerk-Funktionen, Claim-Chat unberührt), echtes chat-ready Netzwerk für Profis.
- **Boost:** relationale **„Dein Netzwerk"-Sektion** auf der *bestehenden* gerankten Ausgabe, **immer an** im Finder des gebundenen Kunden, **bidirektional**; innerhalb normal gerankt; „Wahl frei".
- **Gate:** **immer am SV** (Owner *oder* Kandidat) — zahlt er nicht, keine Sektion → normales Ranking. Werkstatt/Flotte kostenlose Verbindungsknoten (v1).
- **Bindung:** Sticky First-Touch (`profiles.netzwerk_owner_id`).
- **Entitlement:** derive-at-read Subscription (kein roher Bool); Preise config-getrieben; **service-role-only setzbar** (Guard-Lücke bei `sachverstaendige`).
- **Freemium:** kostenlose Registrierung für **alle** Gutachter (DAT-Gating raus); zahlender „Netzwerkpartner" = Monats-Flat + einmalige Einrichtungsgebühr; Abo-Ask 1× im Onboarding + In-App-Upgrade.
- **SV-Referral:** analog Makler, **ohne** Provisions-Override (keine Ledger-Zeile), + Werkstatt-Einrichtungsgebühr-Waiver-Haken (Gebühr selbst später).
- **Empfehl-Batch** (`empfehleWerkstaettenAlsGutachter`): durch den immer-an-Netzwerk-Finder **abgelöst** (Assignment-Kern `assignReparaturWerkstatt` bleibt).
- **Vermittlungs-Flow:** SV-Upload → **Sofort-Claim** (`gutachten-eingegangen`, `onboarding_complete=false`); Kunde onboardet+signiert in den Claim; danach self-served im Netzwerk-Finder; Werkstatt terminiert. **Invariante:** Regulierung + Reparatur-Vermittlung gaten auf `sa_unterschrieben`+`onboarding_complete`.
- **Provisions-neutral:** Boost = nur Outbound-Steuerung.
- **Netzwerkkarte:** Schadenkarte umgeframt, als Partner-Vorteil.

---

## 5 · Offene Entscheidungen

1. **Graph-Knoten:** `profiles↔profiles` (empfohlen, chat-aligned) vs. polymorph `typ+id` (wie `partner_provisionen`).
2. **Gutachter-Finder-Sicht:** Karte (System-Pick + Badge) vs. **SV-Liste** (sichtbare „Dein Netzwerk"-Sektion) für gebundene Kunden.
3. **Empfehl-Batch:** komplett retiren vs. als Fallback (Nicht-Netzwerk-/Dispatch-Fälle) behalten.
4. **Freemium-Tier vs. `paket`:** flache Netzwerk-Monatsflat neben dem per-Fall-`paket`-Pricing — Koexistenz/Ersetzung.
5. **Werkstatt/Flotte-Monetarisierung** (später) — dann greift das Gate auch für deren Boost.
6. **Wording:** „Netzwerkpartner" (Abo) vs. „DAT Expert Partner-Netzwerk" (Marke) vs. Feed „Netzwerk" — Abgrenzung.
7. **DAT-Pivot:** Gating raus **↔** „Zugang zum DAT Expert Partner-Netzwerk"-Marketingclaim.
8. **Flottenpartner-Feature-Set** (WS G) — komplett offen.

---

## 6 · Landminen (aus dem Memory-Audit)

- Neue Tabellen: **explizite Grants** (anon nichts, authenticated explizit) + `TO`-Klausel + **nicht anon-realtime** (Realtime-Gate `subscribeWhenAuthed`).
- Entitlement **service-role-only** (Guard `guard_sachverstaendige_privilegien` deckt paket/portal NICHT).
- `createAdminClient()` **ungetypt** → Select-Strings gegen prod proben.
- **RDG:** Claimondo koordiniert, LexDrive verhandelt — Copy nie „wir verhandeln/klagen". **B2B-ToV:** SV = „Du".
- **DDL nur via Supabase-Plugin** (Regel 2); File == getrackte Version.
- prod+staging **teilen die DB**; Code driftet — Namen am richtigen Ref verifizieren.
- CLAIMONDO_*-Finanzdaten auf prod = **Dummies** → §14-UStG-Rechnungen brauchen echte IBAN/USt (Aaron). Stripe-Live-Webhook `whsec` + Custom-SMTP = Aaron-Blocker.
