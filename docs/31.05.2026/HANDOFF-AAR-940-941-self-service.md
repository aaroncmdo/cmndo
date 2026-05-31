# HANDOFF → Self-Service-Implementierung (AAR-940 + AAR-941)

**Von:** Session 98044b6b (Billing/Monika/Dispatch) · **Datum:** 31.05.2026
**An:** frische Implementierungs-Session · **Status:** Specs komplett + Aaron-Entscheidungen gelockt, **NICHTS implementiert**

---

## 🟢 START HIER

Du baust **Monika-Self-Service**: ein anon-Kunde kommt über eine Anfrage rein und macht **ohne Dispatcher** alles selbst — FlowLink → Quali → SV-Matching → SA → Termin buchen. Zwei Specs sind fertig durchgedacht (Aaron + Vorsession), du **implementierst nur noch**.

**Lies zuerst, in dieser Reihenfolge:**
1. `docs/31.05.2026/AAR-940-self-service-implementierungsplan.md` — der Phasen-Plan (0–6) + SV-Weiche
2. `docs/31.05.2026/AAR-940-self-service-matching-modul-spec.md` — das Matching-Modul + öffentliches SV-Profil (Voll-Spec)
3. Linear **AAR-940** (Kern) + **AAR-941** (Matching-Modul) — gespiegelt, kürzer
4. Memory `project_monika_embed.md` + `session-active-98044b6b-billing.md` — Monika-Gesamtkontext

**Erste Tat:** eigenen Worktree ziehen (NICHT auf diesem Branch weiterbauen):
```
node scripts/new-session-worktree.mjs aar-940-self-service staging
```

---

## WAS ENTSCHIEDEN IST (Aaron 31.05., gelockt — nicht neu aufmachen)

1. **EIN wiederverwendbares Modul** (`lib/sv-matching-modul/`): Matching + Slots + SV-Profil + Reservierung. Dispatch + /gutachter-finden + Self-Service teilen es.
2. **Übertragbar für jede Anfrage** — keyt auf `gutachter_finder_anfragen` (quelle-agnostisch).
3. **Promotion Anfrage→Lead = beim FlowLink-KLICK**, NICHT bei SA/Termin.
4. **Promotion-Akteur = token-gebundener Server-Pfad** (service_role). Anon schreibt NIE direkt in `leads`.
5. **Quali-Gate = Wizard-Selbst-Quali im FlowLink** (Schuldfrage/Plausibilität wie Onboarding-Wizard). Eigenverschulden → kein Termin. KEIN Dispatcher-Approve.
6. **Prio-Matching nach Besichtigungsort, Auto-Top-1 Default** (wie Auto-Dispatch ohne Mensch).
7. **KUNDENWUNSCH IM VORDERGRUND:** Prio-1-SV nicht zur Wunschzeit frei → trotzdem mit Alt-Zeiten + Google-Bewertung anbieten; Kunde wägt ab.
8. **Öffentliches SV-Profil — Kunde sieht NUR:** vorname (NICHT nachname), profilbild, profilbeschreibung, Google-Bewertung, gerundete Distanz/Region.

## SV-Weiche (zentral)
| `gutachter_finder_anfragen.zugeordneter_sv_id` | Matching | Kalender |
|---|---|---|
| **NULL** = intern (native/Cluster-LP) | `findBestSV` GLOBAL → Auto-Top-1 | der des gematchten SV |
| **gesetzt** = SV-Embed (von SV-Seite) | KEIN findBestSV | `ladeFreieSlots(svId)` — nur sein Kalender |
> Präzision: `findBestSV` = globaler Scorer (nur NULL-Fall). Bei fixem SV läuft `ladeFreieSlots`, NICHT findBestSV.

---

## 🔴 DER KRITISCHE PUNKT — Daten-Leak verhindern

Die heutige `SvSuggestion` (aus `findBestSV`) enthält **interne Scoring-Daten**:
`score`, `reasons: ['2 Ablehnungen', 'Paket: premium']`, `kontingentFrei`, `ablehnungen30d`, exakte ETA-Minuten.
**Das ist Dispatcher-Info und darf NIEMALS an den anon-Kunden.** Heute gibt es keine kundensichere Projektion → das musst du bauen:

```
toOeffentlichesSvProfil(candidate, bewertung) → {
  vorname, profilbild, profilbeschreibung,
  bewertungDurchschnitt, bewertungAnzahl,
  distanzGerundet  // "ca. 12 km", NICHT exakte Route/ETA
}
```
Die Self-Service-UI bekommt **nur** diese Projektion, nie das rohe `SvSuggestion`-Objekt. Adversarial testen: kein `score`/`reasons`/`nachname`/Telefon im Client-Payload.

---

## BAUSTEINE — alle code-verifiziert vorhanden (REUSE, nicht neu bauen)

| Baustein | Pfad | Zweck |
|---|---|---|
| `findBestSV` | `src/lib/dispatch/findBestSV.ts` | Voll-Scorer (Distanz/ETA/Paket/Reachability/Wunschtermin-Bonus/Sticky), Top-N |
| `getSvSuggestionsWithSlots` | `src/app/dispatch/leads/[id]/_actions/sv-termin.ts` | SVs + Slots in 1 Call, nach Wunschtermin gerankt (matchType) |
| `getNextFreeSlotsForSv` | dito | Slot-Liste eines SV, matchType-Ranking |
| `ladeFreieSlots` / `ladeSlotsFuerTier` | `src/lib/onboarding/slots.ts` | SV-gescopte Slots (fixer-SV-Fall) |
| `reserviereSlot` / `bestaetigeSlot` | `src/lib/onboarding/slots.ts` | gutachter_termine status reserviert→geplant + GFA-Marker |
| `reserveSvTerminForLead` | `src/app/dispatch/leads/[id]/_actions/sv-termin.ts` | Lead→Termin (reserviert), inkl. SV-WA-Notify |
| `findSvsForLocation` | `src/lib/onboarding/findSvsForLocation.ts` | Tier-1/3-Wrapper für Karte |
| `matcheSvFuerWizard` | `src/lib/onboarding/svMatching.ts` | einfacher Wizard-Matcher (Distanz/Iso) |
| `GoogleBewertungBadge` | `src/components/shared/GoogleBewertungBadge.tsx` | Sterne+Anzahl aus `google_bewertungen_cache` |
| `dispatchMagicLink` | `src/lib/magic-link/dispatch-magic-link.ts` | FlowLink-Versand WA→Email |
| `konvertiereAnfrageZuFall` | `src/lib/actions/konvertiere-anfrage-zu-fall.ts` | Anfrage→Lead+Fall-Promotion (heute Wizard+Dispatch) |
| `DynamicWizard`/`saveStep`/`finalizeAnfrage` | `src/components/onboarding/` | Quali-Logik (für Self-Quali wiederverwenden) |
| `/flow/[token]/actions.ts` | `ladeFlowDaten`, `unterschreibeSA` | Token-Self-Service-Strecke (SA) — Promotion hier einhängen |
| `/kunde-termin/[token]/actions.ts` | — | RLS-Vorlage für token-gescopte Termin-Interaktion |
| `check_gfa_rate_limit` (RPC) | DB | anon-Abuse-Schutz |

## NEU ZU BAUEN
- 🔴 `OeffentlichesSvProfil`-Projektion + `toOeffentlichesSvProfil()` (Daten-Leak-Schutz)
- 🔴 Bewertungs-Merge: `findBestSV`-Output liefert keine Bewertung → `google_bewertungen_cache` für Top-N batch-nachladen (wie findSvsForLocation die Geo-Felder nachlädt)
- 🔴 Token-Promotion beim FlowLink-Klick (Anfrage→Lead via service_role, token-autorisiert)
- 🟡 Modul-Extraktion `lib/sv-matching-modul/` (heute verstreut) — `matchAndSlots({lat,lng,wunschterminIso?,fixerSvId?})`
- 🟡 Self-Service-Wizard-Einbettung: Quali → Matching-Modul → SA → Reserve

## IMPLEMENTIERUNGS-PHASEN (aus dem Plan)
- **Phase 0 (Pflicht vor Code):** `flow_links`-Schema+RLS live ziehen (anon-tauglich?); `gutachter_termine`-Token-Write-Policy prüfen (`/kunde-termin/[token]` als Vorlage); `konvertiereAnfrageZuFall` aus service_role/token-Kontext aufrufbar bestätigen.
- **Phase 1:** FlowLink-Ausgabe server-seitig (welche Anfragen? idempotent, rate-limit).
- **Phase 2:** Promotion beim Klick (token→Lead, service_role).
- **Phase 3:** Selbst-Quali im FlowLink (DynamicWizard-Logik, Eigenverschulden→Abbruch).
- **Phase 4:** SA + Termin-Selbstbuchung (Matching-Modul + OeffentlichesSvProfil).
- **Phase 5:** Positiv- + Negativ-Smoke (Eigenverschulden→kein Termin) + RLS-Smoke (Token-Grenze).

---

## ⚠️ NOCH OFFENE AARON-ENTSCHEIDUNGEN (vor/während Bau klären)
1. **sv_leads (Tier-3) im Self-Service anbieten?** Deren „Kalender immer frei" → ein gewählter Slot kann real belegt sein → Termin platzt. **Tendenz: nur echte SVs (Tier-1) für verbindliche Selbstbuchung.** Aaron fragen.
2. **Distanz-Granularität:** „ca. X km" gerundet vs. nur Stadt/Region.
3. **Phase-4-Detail (interner NULL-SV):** Termin erst NACH SV-Zuweisung buchbar, oder Wunsch-Slot + Zuweisung passt sich an? (Auto-Top-1 löst das meist — der gematchte SV ist sofort da.)

## HARTE REGELN (AGENTS.md — nicht brechen)
- DDL nur via `mcp__plugin_supabase_supabase__apply_migration` (Plugin), File==recorded version (Twin-Drift!)
- Nie direkt auf main; PR gegen staging; NICHT selbst mergen (Merge-Session existiert)
- Eigener Worktree (parallele Sessions!)
- `'use server'`-Files: keine Konstanten/Types exportieren (Client-Bundle → undefined)
- Umlaute in UI-Strings; Result-Object `{ok,error?}` statt throw; revalidatePath nach Writes
- nach jedem Write `</content>`-Artefakt-Scan

## KONTEXT-STAND MONIKA (alles andere ist fertig + gemergt)
- Billing #2092→main, v_offene_anfragen #2100→main, Rate-Limit fail-closed #2103 (#2104→main läuft)
- 3 Cluster-LPs live (Widget rendert), VPS-Crontab + WA-Nummer gesetzt
- **#2107 (Dispatch verwertbare Anfragen + Herkunfts-Badge + DIESE Specs) = OPEN/MERGEABLE → staging.** Die Specs liegen auf diesem Branch; nach Merge sind sie auf staging.
- Heutiges Monika-Widget = Rückruf-Anfrage mit Wunschzeit (KEIN Kalender). Self-Service = genau dieser Ausbau.
