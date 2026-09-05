#!/usr/bin/env bash
# GEO-Wirkungsmessung Kasko-WB Phase 2 — dieselben Zaehlungen vorher und nachher.
# Vorher: 05.09.2026 21:09 (prod, vor dem Drain) · Nachher: 05.09.2026 ~21:20 (Deploys 19:19 UTC).
#   bash scripts/geo-phase2-messung.sh
#
# ⚠ ZWEI MESSFEHLER DER ERSTEN FASSUNG — beide hier korrigiert, beide lehrreich:
#
# 1. `grep -c` zaehlt ZEILEN, nicht Treffer. Ausgeliefertes HTML ist minifiziert (eine Zeile),
#    also lieferte jede Zaehlung nur 0 oder 1 — 5 echte Vorkommen sahen aus wie „1".
#    Richtig: `grep -o <muster> | wc -l`.
#
# 2. „Partnerwerkstatt" war als Erfolgsmarker untauglich. Das Wort steht auf /check auch in
#    FAQ- und Decoder-Texten ueber die SCHADENSTEUERUNG der gegnerischen Versicherung — die
#    sollen dort bleiben. Der Indikator konnte also nie 0 werden, und ein Monitor, der darauf
#    wartete, haette bis zum Sitzungsende gewartet, obwohl der Deploy laengst durch war.
#    Richtig: den KONKRETEN alten Textbaustein pruefen („Koordination mit der Partnerwerkstatt"
#    = der fruehere Wert von ent_kasko_werkstatt_d), nicht das Stichwort.
#
# Merksatz fuer beide: ein Marker, der aus einem anderen Grund gesetzt sein kann, ist kein
# Ausschlusskriterium — und eine Zaehlung muss zaehlen, was sie zu zaehlen vorgibt.
UA='Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)'
zaehle() { printf '%s' "$2" | grep -o -- "$1" | wc -l | tr -d ' '; }

echo "=== Kasko-WB Phase 2 — GEO-Wirkung ($(date '+%d.%m.%Y %H:%M')) ==="
printf '%-54s %-8s %s\n' "KENNZAHL" "VORHER" "JETZT (Soll)"

L=$(curl -s --max-time 25 -A "$UA" https://claimondo.de/llms.txt)
printf '%-54s %-8s %s\n' "llms.txt: Werkstattbindung erwaehnt"     "1"  "$(zaehle 'Werkstattbindung' "$L")  (Soll >1)"
printf '%-54s %-8s %s\n' "llms.txt: neuer Endpunkt genannt"         "0"  "$(zaehle 'kasko-werkstattbindung' "$L")  (Soll >=1)"
printf '%-54s %-8s %s\n' "llms.txt: 'namentlich' (alter Fehler)"    "1"  "$(zaehle 'namentlich' "$L")  (Soll 0)"
printf '%-54s %-8s %s\n' "llms.txt: '6 Endpunkte' (alter Fehler)"   "1"  "$(zaehle '6 Endpunkte' "$L")  (Soll 0)"

C=$(curl -s --max-time 25 -A "$UA" https://claimondo.de/check)
printf '%-54s %-8s %s\n' "/check: alter Baustein 'Koordination mit der P.'" "1" "$(zaehle 'Koordination mit der Partnerwerkstatt' "$C")  (Soll 0)"
printf '%-54s %-8s %s\n' "/check: neu 'ob Ihr Tarif eine Werkstatt vorschr.'" "0" "$(zaehle 'ob Ihr Tarif eine Werkstatt vorschreibt' "$C")  (Soll >=1)"
printf '%-54s %-8s %s\n' "/check: 'Werkstattbindung' (neuer Hinweis)"        "0" "$(zaehle 'Werkstattbindung' "$C")  (Soll >=1)"
# Gegenprobe, dass die Seite ueberhaupt gelesen wurde — sonst waere jede 0 bedeutungslos.
printf '%-54s %-8s %s\n' "/check: Laenge (Positivkontrolle)"                 "180k" "$(printf '%s' "$C" | wc -c | tr -d ' ') Zeichen (Soll >100000)"

A=$(curl -s --max-time 25 -A "$UA" 'https://app.claimondo.de/api/v1/pruefe-anspruch?schuldfrage=selbst&vollkasko=ja&werkstattbindung=ja')
printf '%-54s %-8s %s\n' "API: Feld werkstattbindung"               "0"  "$(zaehle '\"werkstattbindung\"' "$A")  (Soll 1)"
printf '%-54s %-8s %s\n' "API gebunden: empfiehlt werkstatt-finden" "1"  "$(zaehle 'werkstatt-finden' "$A")  (Soll 0)"

printf '%-54s %-8s %s\n' "neuer Endpunkt (HTTP)" "404" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 -A "$UA" 'https://app.claimondo.de/api/v1/kasko-werkstattbindung?versicherer=HUK-COBURG')  (Soll 200)"

O=$(curl -s --max-time 25 -A "$UA" https://app.claimondo.de/api/v1/openapi.json)
printf '%-54s %-8s %s\n' "openapi.json: Pfade" "9" "$(printf '%s' "$O" | grep -o '\"/api/v1/[a-z0-9./{}-]*\"' | sort -u | wc -l | tr -d ' ')  (Soll 10)"
echo
echo "Allgemeine GEO-Baseline (27 Seiten, vorher: Score 70.2 / 22 mit Datum / 15 mit Quelle):"
echo "  node scripts/geo-baseline.mjs"
