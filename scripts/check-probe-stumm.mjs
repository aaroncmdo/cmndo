#!/usr/bin/env node
// WEGWERF-PROBE — Positivkontrolle fuer den Stumme-Waechter-Ratchet, Achse 2 (PR #5879).
//
// Dieses Skript wird von KEINEM Workflow aufgerufen (kein npm-Key, kein Step) und steht
// weder in der Baseline noch in der SKRIPT_ALLOWLIST. Der CI-Job "Stumme-Waechter-Ratchet"
// MUSS daran rot werden und den Dateinamen nennen. Danach wird dieser Branch geloescht.
//
// Zweck: eine Null ist erst ein Befund, wenn dasselbe Werkzeug einen Fehler auch ZEIGEN
// wuerde. Der gruene Lauf auf #5879 beweist ohne diese Gegenprobe nichts.
console.log('probe')
