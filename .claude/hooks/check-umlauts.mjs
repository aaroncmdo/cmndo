#!/usr/bin/env node
// AAR-105: ehemals Pre-Tool Hook — blockierte git commit -m "..." Messages
// mit ASCII-Ersatz (ae/oe/ue/ss) statt Umlauten.
//
// DEAKTIVIERT 2026-05-15 nach Aaron-Klarstellung:
//   "aber nur im frontend die umlaute / im backend ist das egal"
//
// Commit-Messages, Code-Comments, Markdown-Docs, SQL-Migration-Comments und
// console.log-Strings duerfen wieder ASCII-Ersatz enthalten.
// Pflicht bleiben Umlaute nur in nutzersichtbaren UI-Strings
// (JSX-Literals, Email-Templates, PDF-Strings, WhatsApp-/SMS-Templates).
//
// TODO: Ein neuer Hook auf PostToolUse fuer Write/Edit von .tsx /
// email-templates koennte stattdessen UI-Strings auf ASCII-Ersatz pruefen.
// Bis dahin: kein automatischer Check, nur Code-Review.

process.exit(0)
