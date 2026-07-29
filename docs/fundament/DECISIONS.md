# DECISIONS — Fundament-Programm (append-only)

> Protokoll nach FUNDAMENT.md §8. Jede unterwegs getroffene Entscheidung, die weder im Steuerdokument noch in den Journeys stand. Review-Spalte bleibt `offen`, bis Aaron sie bestätigt/revidiert.

## 2026-07-28 · SV-Org-Lane · organisationen/Verwalter/Pool-Lead-Modell (KFZ-152 / #4579) retiren

**Lücke:** Aaron wies die SV-Org-Lane zu ([[coordination-an-a6c863e2-sv-org-organisation-id-wiring]]): `assignPoolLead` / `/gutachter/team` ist auf prod **unerreichbar** (`v_claim_full.organisation_id` ist hardcoded `NULL::uuid` in `v_claim_base`, verifiziert via `pg_get_viewdef`; 0 `organisationen`, 0 `sachverstaendige.organisation_id`). Erste Aufgabe = Entscheidung **Launch (View verdrahten) vs Retire (toten Pfad entfernen)**, abzustimmen mit dem Netzwerk-Epic (paused), das die kanonische SV-Struktur bestimmt.

**Entscheidung:** **RETIRE** des Code-Pfads — `/gutachter/team` (`page.tsx` + `TeamClient.tsx` + `actions.ts`: `assignPoolLead`/`ensureVerwalter`/`toggleSubSvSperre`) + der `showTeam`-Nav-Thread (`GutachterShell.tsx`/`layout.tsx`/`_shell/page-titles.ts`). **Schema bleibt unangetastet** (`organisationen`-Tabelle, `sachverstaendige.organisation_id`/`rolle_in_organisation`/`ist_parent_account`) — FUNDAMENT §10 Nicht-Ziel „keine Drops".

**Begründung (Verfassung §3 „kein totes Gerüst" + Roadmap):**
1. Der Pfad ist **tot** (0 Orgs, kaputte View → unerreichbar). Belassen = ein stiller Deadlock-Erwartungswert, der bei künftigem Org-Anlegen tot startet.
2. Die **kanonische SV-Struktur-Richtung** ist das Netzwerk-Epic (`netzwerk_owner_id` = Profil-Graph, `docs/superpowers/specs/2026-07-21-netzwerk-verbindungen-freundschaft-design.md:93/99`), das **Multi-Account-Organisationen für v1 explizit ausklammert** (`sv_buero ausgeklammert`, :109). Das organisationen/Verwalter/Pool-Lead-Modell ist damit **off-roadmap** für v1.
3. **Reversibel:** Git-Historie + Schema intakt; bei künftigem Agentur-Bedarf neu gebaut (voraussichtlich netzwerk-aligned).

**Nicht in Scope:** Die `sv-zuweisung/route.ts`-Org-Pool-Branche (schreibt `sv-gesucht` für Pool-Verteilung) ist separat tot UND zugleich der A2-Fund #6 (WILD-`operative_status`-Write, der den Ratchet per Type-Cast umgeht) → gehört zu **C1**. Ein Schema-Drop der org-Spalten liegt **außerhalb** des Fundament-Programms (§10).

**Review:** offen (Aaron)

## 2026-07-28 · Bug3 (C2/C4-Vorgriff) · Logged-in-Redirect → onboarding-details kanonisch

**Lücke:** Welche Erhebungs-Strecke ist kanonisch für eingeloggte Kunden — /flow FlowWizardKfz (Flow A, leads.*) oder /kunde/onboarding-details (Flow B, claims.*)? Beide erheben Unfall-Hergang/Service/Kanzlei/SA in teils anderen Spalten (leads.unfallhergang vs claims.hergang_kunde_text) = die „zwei Feststellungen".

**Entscheidung:** onboarding-details (Flow B) ist kanonisch für eingeloggte Kunden; FlowWizardKfz bleibt anon/Magic-Link-Fallback. Der Logged-in-Redirect (src/app/flow/[token]/page.tsx) lag tot im try/catch (NEXT_REDIRECT wurde ohne isRedirectError-Re-throw verschluckt) und wurde reaktiviert (redirect außerhalb des try).

**Begründung:** Verfassung §4 (eine Akte) + §5 (ein Intake); folgt dem Funnel-v2-Plan (docs/plans/funnel-vereinfachung-2026-05-11.md — „/kunde/onboarding ersetzt FlowWizardKfz"). Dedup: convertLeadToClaim kopiert leads.unfallhergang → claims.hergang_kunde_text.

**Review:** offen (Aaron) — Regel-4-Prod-Smoke 28.07. GELAUFEN (Session 264a7df6, 4 geseedete Sub-Fälle, echte UI, Seeds aufgeräumt): (a) ERLEDIGT. Kernpfade GRÜN wie entschieden: offene Feststellung → Redirect /kunde/onboarding-details mit hergang-Phase; SA-offen (haftpflicht) → FokusSignatur direkt auf /flow/<token>. VERFEHLT: „erledigte Feststellung → Fallakte" — die felderlose sa-Phase (onboarding_phasen kunde-onboarding, ord 40, 0 Felder) ist für den Server-Skip (`pflichtFelder.length > 0`-Guard in ladeNoetigePhasen) nie skippbar → `phases.length === 0` unerreichbar → der Fallakte-Redirect in onboarding-details/page.tsx ist toter Code; ein Kunde mit längst signierter SA sieht stattdessen Schritt 1/1 „Schaden-Abtretung unterschreiben" (irreführende Aufforderung, kein Bruch/500/Sackgasse → kein Revert, fix-forward). (c) dedupe-Edge BESTÄTIGT: hergang-Skip+Prefill sehen nur claims.hergang_kunde_text — leads.unfallhergang wird weder geskippt noch vorbefüllt (textarea leer, per eval verifiziert) = Doppel-Erhebung; Bestand quantifiziert 0/6 echte Kunde-Claims in dieser Konstellation → dormant, fix-forward statt Revert. (b) C2/C4-Vorgriff unverändert offen. NEU (Nebenbefund): Wizard-localStorage-Key `claimondo-wizard-state:<flowKey>` trägt keine fallId → Restore-Banner übernimmt Zustand aus dem ZULETZT bearbeiteten Fall desselben Kunden (Cross-Fall-Contamination bei Mehrfall-Kunden).
