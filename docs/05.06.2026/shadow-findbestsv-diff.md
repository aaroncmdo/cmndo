# Shadow-Diff: findBestSV vs findBestSVviaEngine (Sub-A.2) — 2026-06-05

**Ergebnis: `PASS_TOP1`.** Script `scripts/verify-shadow-findbestsv.mts` — beide Matcher parallel auf echten Lead-Schadenorten, reine Lese-Vergleiche (kein Live-Impact). Läuft auf den Phase-0-Parametern (40/10/10/50) für beide → isoliert die Matcher-Logik-Diffs.

| Metrik | Wert |
|---|---|
| geprüft | 3 (Leads mit `besichtigungsort_lat/lng`) |
| **Top-1 identisch** | **3/3** |
| Reihenfolge identisch | 2/3 |

## Der eine Reihenfolge-Diff (lead `d9b9afd7`)
- **Top-1 + Score IDENTISCH:** `7f79e570`, Score 189.5 (alt == neu).
- Rang 2+3 vertauscht: `b52e79df` ↔ `1da11741` — beide ~gleicher Score, **innerhalb `SCORE_BUCKET=5`**.
- **Ursache (gewollt):** `findeBestePerson` nutzt den **Bucket+Tenure-Tie-Break** (`matching-score.ts`, Aaron: „wer zuerst eingetreten ist hat im Zweifelsfall Vorrang"); `findBestSV` nutzt den Raw-Score-`sort`. Bei ~gleichem Score ordnet die Engine nach Tenure → andere (bessere) Reihenfolge am Rand. **Die DECISION (Top-1) ist unberührt.**

## Schluss
Die Engine liefert **dieselbe Dispatch-Entscheidung** wie `findBestSV` (Top-1 100 %), mit einer bewussten Tie-Break-Verbesserung an Score-Gleichständen. **Flip (Sub-A.3) ist sicher** — kein Regression auf die tatsächliche Auswahl.

## Caveats vor dem Flip (Sub-A.3, gated)
- **Sample klein** (3 Leads mit Coords). Optional vor dem Flip auf mehr Inputs erweitern (gt-Coords mitziehen).
- **busy-source:** findBestSV macht Live-Google/CalDAV-FreeBusy; findeBestePerson liest `v_belegung` (5-min-Cache via Phase-0). Bei den 3 Samples kein Top-1-Effekt; bei Wunschtermin-Checks (`verfuegbarAmWunschtermin`) könnte ein Cache-vs-Live-Diff auftreten → im A.3-Smoke prüfen.
- **terminDatum-Urlaub:** findBestSV schließt SVs am `terminDatum` im Urlaub aus dem Kandidaten-Set; findeBestePerson lässt sie drin, aber `waehleSlot` meidet Urlaubsslots → leicht andere Kandidaten-Präsenz ohne Wunschtermin. Kein Top-1-Effekt im Sample.
- **Sign-off + aar-956-Koordination** stehen vor A.3 ohnehin an.
