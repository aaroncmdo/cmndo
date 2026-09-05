#!/usr/bin/env bash
# GEO-Wirkungsmessung Kasko-WB Phase 2 — dieselben Zaehlungen vorher und nachher.
# Vorher gemessen am 05.09.2026, 21:09 Uhr (prod, vor dem Drain). Nach dem prod-Deploy erneut fahren:
#   bash scripts/geo-phase2-messung.sh
# Jede Zeile ist eine Behauptung aus Phase 2. Steht rechts der erwartete Wert nicht, ist es ein BEFUND.
UA='Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)'
echo "=== Kasko-WB Phase 2 — GEO-Wirkung ($(date '+%d.%m.%Y %H:%M')) ==="
printf '%-52s %s\n' "KENNZAHL" "VORHER -> JETZT (Soll)"

L=$(curl -s -A "$UA" https://claimondo.de/llms.txt)
printf '%-52s %s -> %s\n' "llms.txt: Werkstattbindung erwaehnt"      "1"  "$(printf '%s' "$L" | grep -ci 'werkstattbindung')  (Soll >1)"
printf '%-52s %s -> %s\n' "llms.txt: neuer Endpunkt genannt"          "0"  "$(printf '%s' "$L" | grep -c 'kasko-werkstattbindung')  (Soll >=1)"
printf '%-52s %s -> %s\n' "llms.txt: 'namentlich' (alter Fehler)"     "1"  "$(printf '%s' "$L" | grep -c 'namentlich')  (Soll 0)"
printf '%-52s %s -> %s\n' "llms.txt: '6 Endpunkte' (alter Fehler)"    "1"  "$(printf '%s' "$L" | grep -c '6 Endpunkte')  (Soll 0)"

C=$(curl -s -A "$UA" https://claimondo.de/check)
printf '%-52s %s -> %s\n' "/check: 'Partnerwerkstatt' (Versprechen)"  "1"  "$(printf '%s' "$C" | grep -ci 'Partnerwerkstatt')  (Soll 0)"
printf '%-52s %s -> %s\n' "/check: 'Tarif ab' (neue Aussage)"         "0"  "$(printf '%s' "$C" | grep -ci 'Tarif ab')  (Soll >=1)"
printf '%-52s %s -> %s\n' "/check: 'Werkstattbindung'"                "0"  "$(printf '%s' "$C" | grep -ci 'Werkstattbindung')  (Soll >=1)"

A=$(curl -s -A "$UA" 'https://app.claimondo.de/api/v1/pruefe-anspruch?schuldfrage=selbst&vollkasko=ja&werkstattbindung=ja')
printf '%-52s %s -> %s\n' "API: Feld werkstattbindung"                "0"  "$(printf '%s' "$A" | grep -c '\"werkstattbindung\"')  (Soll 1)"
printf '%-52s %s -> %s\n' "API gebunden: empfiehlt werkstatt-finden"  "1"  "$(printf '%s' "$A" | grep -c 'werkstatt-finden')  (Soll 0)"

printf '%-52s %s -> %s\n' "neuer Endpunkt (HTTP)"                     "404" "$(curl -s -o /dev/null -w '%{http_code}' -A "$UA" 'https://app.claimondo.de/api/v1/kasko-werkstattbindung?versicherer=HUK-COBURG')  (Soll 200)"

O=$(curl -s -A "$UA" https://app.claimondo.de/api/v1/openapi.json)
printf '%-52s %s -> %s\n' "openapi.json: Pfade"                       "9"  "$(printf '%s' "$O" | grep -o '\"/api/v1/[a-z0-9./{}-]*\"' | sort -u | wc -l)  (Soll 10)"
echo
echo "Allgemeine GEO-Baseline (27 Seiten, vorher: Score 70.2 / 22 mit Datum / 15 mit Quelle):"
echo "  node scripts/geo-baseline.mjs"
