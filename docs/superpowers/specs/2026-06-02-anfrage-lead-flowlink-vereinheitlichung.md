# Anfrage → Lead → FlowLink — Vereinheitlichung (Single lead-keyed FlowLink)

**Datum:** 2026-06-02 · **Autor:** Stream-8b/9-Session (Worktree `aar-939-stream8b-sv-tracking`)
**Status:** PROPOSAL — zum Review durch Aaron + die laufenden Sessions. NICHT implementiert.
**Auslöser:** Stream-9-Smoke heute deckte auf, dass mehrere parallele Anfrage→Lead→Link-Pfade
nebeneinander existieren und sich widersprechen (Bug-Serie unten). Aaron: „der FlowLink ist für
die Leads, das heißt der kann nicht doppelt sein."

---

## 1 · Kernprinzip (verbindlich, Aaron 02.06.)

**Es gibt genau EINEN Link, und der ist lead-gekeyt: der FlowLink.**
- Ein Link = ein Eintrag in `flow_links` mit `lead_id`. Kein zweites, parallel laufendes
  Token-/Link-System.
- Der heute entdeckte Self-Service-Link `/anfrage/[token]` (anfrage-gekeyt, VOR Lead-Existenz)
  ist genau dieses verbotene „Doppel" → muss weg bzw. in den lead-gekeyten FlowLink aufgehen.
- Konsequenz: **Self-Service (falls gewollt) erzeugt zuerst den Lead, dann den Standard-FlowLink** —
  niemals einen eigenen anfrage-gekeyten Link.

---

## 2 · Problem / Symptome (alle heute real aufgetreten)

Die Bugs der heutigen Stream-9-Aktivierung sind allesamt Symptome der Pfad-Zersplitterung:
- `wunschtermin_wann`-CHECK-Crash (Cluster-Insert kippte) — weil der Embed-Pfad anders schreibt als der native.
- Cluster-Notify-WA ging an die Baileys-Eigennummer (Selbst-Send) — eigener Notify-Pfad, nie end-to-end gesmoked.
- `/api/embed-track` CORS — eigener Tracking-Pfad mit Wildcard-`*`.
- `convert_embed_anfrage_zu_lead` setzt `lead.zugewiesen_an = SV` (Gutachter) statt Dispatcher.
- `SELF_SERVICE_AUTO_ISSUE=true` feuerte automatisch `/anfrage/`-Links an Kunden — am Dispatcher vorbei,
  gegen den AAR-939-Scope („Dispatcher-Telefonat Default, **kein** Auto-Flow-Link").

Gemeinsame Wurzel: **zu viele Eintritts-, Konversions-, Link- und Routing-Varianten.**

---

## 3 · Ist-Zustand (Inventur — heute verifiziert, Rest mit „⚠️ confirm" markiert)

**Eintritts-Kanäle (Roh-Anfrage):**
- Nativer Gutachter-Finder-Funnel → `gutachter_finder_anfragen` (gfa), `source IS NULL`.
- Monika Cluster-LP → gfa, `source='kfz_gutachter_lp'`.
- Monika SV-Embed A/B → gfa, `source='sv_embed'`.
- ⚠️ Separate `anfragen`-Inbox-Tabelle (Migration `anfragen_inbox`) — eigener Konversions-Pfad.
- ⚠️ Manuelles Dispatch / `admin/faelle/anlegen`.

**Anfrage→Lead-Konversionen (VIER):**
- `convert_anfrage_zu_lead` (DB-Fn, `anfragen`-Inbox) — `convert_round_robin_dispatch` weist Dispatcher Round-Robin zu.
- `convert_embed_anfrage_zu_lead` (DB-Trigger, gfa sv_embed B) — `zugewiesen_an = SV-profile` (❗ Gutachter, nicht Dispatcher).
- `issueSelfServiceFlowLink` + `/anfrage/[token]`-Flow → ⚠️ `createLead`-Promotion (AAR-940 Self-Service).
- ⚠️ `konvertiereAnfrageZuFall` (Dispatch, voller Lead→Fall).

**Link-Systeme (ZWEI — das „Doppel"):**
- ✅ **FlowLink** `/flow/[token]` · `flow_links.lead_id` · `sendFlowLinkMultiChannel` (Dispatcher-Action,
  WA/SMS/Email) · setzt `lead.zugewiesen_an = Dispatcher` (Zeile 171) · für SA-Unterschrift + Termin.
- ❌ **Self-Service** `/anfrage/[token]` · `gfa.self_service_token` · `issueSelfServiceFlowLink` · auto/anfrage-gekeyt.

**Lead-Routing (VIER Regeln):** Round-Robin (Inbox) · `=SV` (embed-B) · `=Dispatcher` (FlowLink) · Shared-Queue (Cluster `neu`).

**Bereits kanonische Bausteine (Wiederverwenden, nicht neu bauen):**
- `gutachter_finder_anfragen` = kanonische Roh-Anfrage-Tabelle.
- `v_offene_anfragen` = quelle-agnostische Dispatch-Aufgreif-Liste (#2100).
- `flow_links` (lead_id) = das eine Link-System.

---

## 4 · Ziel-Pipeline (vereinheitlicht)

```
[beliebige Quelle: native | cluster | embed | inbox]
        │  source = nur Diskriminator + Branding, KEIN eigener Code-Pfad
        ▼
  gutachter_finder_anfragen (status='neu')      ← EINE Anfrage-Tabelle
        ▼
  v_offene_anfragen                              ← EINE Dispatch-Queue
        ▼
  Dispatcher greift auf + qualifiziert
        ▼
  EINE Konversion: anfrage → lead               ← zugewiesen_an = Dispatcher (immer)
        ▼
  EIN FlowLink /flow/[token] (flow_links.lead_id) ← lead-gekeyt, SA + Termin
        ▼
  Lead → Fall → Auftrag (bestehender Lifecycle)
```

**Single-Link-Invariante:** Jeder kunden-gerichtete Magic-Link ist ein `flow_links`-Eintrag mit `lead_id`.
Wo heute ein Link vor Lead-Existenz nötig schien (Self-Service), gilt: **erst Lead anlegen
(EINE Konversion), dann FlowLink ausstellen.** Kein anfrage-gekeyter Token.

---

## 5 · FlowLink-Vereinheitlichung im Detail (Aarons Schwerpunkt)

- `/anfrage/[token]` + `gfa.self_service_token` + `issueSelfServiceFlowLink` werden **deprecated**.
- `/flow/[token]` + `flow_links` bleibt das einzige Link-System.
- `sendFlowLinkMultiChannel` wird der einzige Versand-Weg (WA/SMS/Email, lead-gekeyt, Dispatcher-Zuweisung).
- Falls ein „früher Link" produktlich gewollt ist (Kunde soll loslegen bevor ein Mensch dran war):
  Das ist dann ein **FlowLink auf einem Lead**, den die EINE Konversion vorab anlegt — nicht ein zweites Token.
  (Produktentscheidung §6.)

---

## 6 · Self-Service — Entscheidung nötig (offen)

Aaron heute: skeptisch ggü. Auto-Self-Service (Kunde unterschreibt SA ohne Mensch/Quali/Betrugs-Check).
`SELF_SERVICE_AUTO_ISSUE` ist auf Prod bereits auf `false` gesetzt (heute). Optionen:
- **(A) Self-Service ganz raus:** nur Dispatcher-begleiteter FlowLink. Einfachste, sicherste Pipeline.
- **(B) Self-Service als Dispatcher-Knopf:** Dispatcher kann einen „Self-Service-FlowLink" auslösen
  (= Lead anlegen + FlowLink) — aber bewusst, nicht auto. Bleibt Single-Link (lead-gekeyt).
- **(C) Self-Service automatisch, aber lead-gekeyt + mit Quali-Gate** (riskanter, gegen AAR-939-Scope).

Empfehlung: **(B)** — vereint Aarons „Dispatcher bekommt die Leads" mit optionaler Self-Service-Beschleunigung, ohne Doppel-Link.

---

## 7 · Deprecation-/Migrations-Plan (phasiert, je eigener PR + Review)

1. **Inventur abschließen** (⚠️-Punkte oben verifizieren: `anfragen`-Inbox-Nutzung, `createLead`, `konvertiereAnfrageZuFall`, alle `/anfrage`-Consumer).
2. **Routing fixen:** `convert_embed_anfrage_zu_lead` → `zugewiesen_an = Dispatcher` (Round-Robin) statt SV. (Kleiner, isolierter Fix — kann vorgezogen werden.)
3. **Konversionen konsolidieren:** eine kanonische `anfrage → lead`-Funktion (Dispatcher-Zuweisung), die anderen deprecaten.
4. **Self-Service-Link deprecaten:** `/anfrage/[token]` + `issueSelfServiceFlowLink` entfernen (nach §6-Entscheidung); ggf. durch lead-gekeyten FlowLink-Pfad ersetzen.
5. **Notify/Tracking konsolidieren:** ein Notify-Pfad (heute getrennt für cluster/embed/native), embed-track-CORS-Fix (bereits committet).
6. **Cleanup:** tote Routen/Tabellen (`gfa.self_service_token*`, ggf. `anfragen`-Inbox), Doku.

---

## 8 · Cross-Session-Koordination (kritisch)

Diese Files sind GERADE in Bearbeitung durch andere Sessions — Unification darf nicht trampeln:
- `kitta/marketing-finder-livebuchung` — „Wizard bei Gutachter-Finden integrieren" (Eintritts-Kanal!).
- `kitta/dispatch-config-unify-*` — Dispatch-Konsolidierung (Routing/Queue!).
- `kitta/aar-939-embed-b-cascade-6b` — embed-B-Konversion (`convert_embed_anfrage_zu_lead`!).
- AAR-940-Self-Service — `/anfrage/`-Link (deprecation-Kandidat!).

→ Diese Vereinheitlichung braucht **ein eigenes Ticket** + Abstimmung, WER welche Phase macht.
Sie ist die natürliche Klammer über die schon laufenden Teil-Unifications.

---

## 9 · Non-Goals
- Keine Änderung am Lead→Fall→Auftrag-Lifecycle (CMM-Strecke) — nur der Anfrage→Lead→Link-Vorbau.
- Keine neue Anfrage-Tabelle (gfa bleibt kanonisch).
- Kein Re-Theming / UI-Redesign der Wizards.

## 10 · Offene Fragen an Aaron
1. Self-Service: §6 (A) raus / (B) Dispatcher-Knopf / (C) auto+gated?
2. Soll diese Unification ein eigenes Ticket werden, das die laufenden Teil-Unifications (dispatch-config, finder-livebuchung) als Phasen einsammelt — oder bleiben die getrennt + diese Spec ist nur die Klammer/Leitplanke?
3. Wer fährt Phase 2 (embed-B-Routing-Fix) — diese Session oder die embed-B-cascade-Session?
