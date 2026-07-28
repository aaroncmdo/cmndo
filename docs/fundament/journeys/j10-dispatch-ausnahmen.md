# J10 — Dispatch (Netzwerk-Ranking + Ausnahmen: kein SV, Eskalation, Reservierung)

> Fundament A1 · Journey-Bibel. **Soll-Ablauf aus Nutzersicht** (Soll ≠ Ist — Abweichungen unter „⚠ IST weicht ab").
> **Soll = das Netzwerk-Ökosystem-Modell** (Lane 332d22f1, [[coordination-netzwerk-verbindungen-freemium-angebotsstruktur]] — paused).
> Abgestimmt mit a6c863e2 (DECISIONS.md): SV-Zuweisung via `findBestSV`/Ranking, **nicht** über Org-Pool-Lead (retired).

**Rollen:** Dispatcher/KB · Admin (Eskalations-Ziel) · SV (Kandidat, ggf. Netzwerkpartner) · Kunde (ggf. gebunden/reserviert) · System (Matching-Score, Cron).
**Vorbedingungen:** ein Lead/Fall braucht einen SV.
**Startpunkt(e):** SV-Matching (`findBestSV` / `matching-score.ts` / `api/sv-zuweisung/route.ts`) · Gutachter-Finder · Reservierungs-Rückruf (Embed) · Eskalations-Cron.

## Ablauf (Soll)

Der Dispatch rankt SVs — **Netzwerkpartner (zahlender SV) vor kostenfreien** — und behandelt die Ausnahmen (kein
Treffer, Frist, Reservierung). Das Netzwerk-Ranking ist der **Rahmen**, die Ausnahmen der Fokus.

### A · Ranking (Normalfall-Rahmen)
1. **Matching** (`findBestSV`) — Kandidaten nach Geo/Typ/Verfügbarkeit. **Ranking-Primärsignal:** `istZahlenderNetzwerkPartner` (löst `paketPrio` ab), `partner_rang` verfeinert **innerhalb** der Stufe. Gilt in **beiden** Engines (`matching-score.ts` **+** `api/sv-zuweisung/route.ts`). **Gate immer am SV**; Werkstatt/Flotte = freie Verbindungsknoten (kein Gate).
2. **Gebundener Kunde** — hat der Kunde/Claim einen Owner (`claims.netzwerk_owner_id`, Bindung per-Claim + Kunden-Default), zeigt der Finder oben eine **„Dein Netzwerk"-Sektion** (befreundete Partner des Owners; **innerhalb** normal gerankt).

### B · Kein passender SV
3. **Kein Treffer** → Umkreis erweitern, DAT-Partner bevorzugen (dormantes Rang-System), oder Round-Robin-Dispatcher (`pickRoundRobinDispatcher`) übernimmt manuell. **Status:** bleibt `sv-gesucht`.

### C · Eskalation (Frist/Blockade)
4. **Fristüberschreitung** — `runEskalationsCron` (SLA) → Task/Notif an Admin. **Manuell:** `eskaliereFallAnAdmin` / `eskalationZuruecknehmen`. **VS-Dispatch:** `erstelleVsDispatchTask` (der **einzige** Sende-Pfad mit Dedup, A3).

### D · Reservierung (Kunde ohne festen Termin)
5. **Reservierungs-Rückruf** (Embed) — `upsertReservierungsRueckruf`: **soft** — der Lead ist gehalten, nicht hart gebunden; ein Dispatcher meldet sich.
6. **Slot-Reservierung** — `reserviere` (Termin-Engine) / `reserviereSlot` hält einen Slot bis zur Kunden-Bestätigung.

## Varianten / Abzweige

- **Konfrontations-Dispatch** (`triggerKonfrontationsDispatch`) — Gegner-Flow-Sonderweg.
- **Flotten-Leads** — firma-scoped Sichtbarkeit (`firma_name`-Fallback + Filter, #4738).
- **Dispatcher-Termin-Ausnahmen** — abgelehnt/Gegenvorschlag (`sendDispatcherTerminAbgelehnt`/`sendDispatcherGegenvorschlag`).

## Fehlerfälle und ihr Soll-Verhalten

- **Harte Reservierung bei Rückruf** → **darf nicht**: soft halten, keinen Slot/SV hart binden (Klasse `melde-schaden`-Hard-Reservierungs-Bug, behoben `route.ts:234-258`).
- **Doppel-Dispatch-Task** → verhindert durch `erstelleVsDispatchTask`-Dedup (der einzige Pfad mit Dedup, A3-P1).
- **Freundes-Lookup als Hot-Path-Bremse** → der Netzwerk-Lookup in `findBestSV` (~1.8s hottest path) muss **gebatcht** sein, sonst bremst das Ranking den ganzen Dispatch (K-Blocker).
- **Eskalation ohne Ziel** → `listAdminsFuerEskalation` muss ≥1 Admin liefern.

## ⚠ IST weicht ab (mit Fundort)

1. **Netzwerk-Ranking noch nicht gebaut (Epic paused):** Soll = `istZahlenderNetzwerkPartner` als Primärsignal in beiden Engines. IST: `matching-score.ts` rankt über `paket`/`partner_rang`; `netzwerk_owner_id` ist 0-genutzt (Bindung existiert als Spalte, keine „Dein Netzwerk"-Sektion). Umbau = Netzwerk-Lane P0.
2. **Org-Pool-Verteilung tot (DECISIONS.md / A2-Fund #6):** die `sv-zuweisung/route.ts`-Org-Branche schreibt `sv-gesucht` für eine Pool-Verteilung ohne Orgs (0) **und** umgeht den `operative_status`-Ratchet per Type-Cast (WILD-Write) → **C1**.
3. **Dedup nur an EINEM Pfad:** nur `erstelleVsDispatchTask` hat Dedup; übrige Dispatch-/Notif-Sends nicht (A3-P1).
4. **`findBestSV` zweigleisig:** `findBestSV` **und** `findBestSVviaEngine` — Kanon im C-Umbau zu klären.
5. **Reservierungs-Semantik Live-Baustelle:** mehrere Sessions bauen am Embed-Reservierungs-Rückruf (`aar-956-embed-reservierung-rueckruf`); die Soft/Hard-Grenze ist in Bewegung.

## Offene Fragen an Aaron (max. 5)

1. **Ranking-Härte:** Rankt ein Netzwerkpartner **immer** über jedem kostenfreien SV, auch wenn letzterer geografisch/fachlich deutlich besser passt? Wo ist die Grenze?
2. **„Dein Netzwerk"-Priorität:** Werden befreundete Partner des Owners nur *angezeigt* (Sektion) oder auch im Auto-Dispatch bevorzugt zugewiesen?
3. **Kein-SV-Eskalation:** Umkreis automatisch erweitern, Kunde vertrösten, oder Admin-Handarbeit?
4. **`findBestSV`-Kanon:** Welcher der beiden Matching-Pfade wird die eine Quelle (C1)?
