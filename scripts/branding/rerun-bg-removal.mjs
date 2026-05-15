#!/usr/bin/env node
// Backfill: re-prozessiert alle Logos im `gutachter-logos`-Bucket durch
// denselben Sharp-Chroma-Key wie `src/lib/branding/server-bg-remove.ts`
// und schreibt das Result zurück.
//
// Hintergrund: Auto-BG-Removal landed mit Commit 1f715d26 am 2026-05-14
// 12:09 UTC. Alle davor hochgeladenen SV-Logos liegen unverändert in
// Storage und haben (mit hoher Wahrscheinlichkeit) noch ihren Original-BG.
// Dieses Script fährt nachträglich denselben Algorithmus für legacy Files.
//
// Pflicht-Env (.env.local oder shell):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   (Service-Role, nicht anon!)
//
// Default: dry-run. Mit --apply tatsächlich schreiben.
//
// Run:
//   node scripts/branding/rerun-bg-removal.mjs              # dry-run
//   node scripts/branding/rerun-bg-removal.mjs --apply      # echtes Apply
//   node scripts/branding/rerun-bg-removal.mjs --apply --limit 10
//
// Output: pro Logo eine Zeile mit Pfad + Result. Am Ende Summary.

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { Buffer } from 'node:buffer'
import sharp from 'sharp'

const ARGS = process.argv.slice(2)
const APPLY = ARGS.includes('--apply')
const limitIdx = ARGS.indexOf('--limit')
const LIMIT = limitIdx >= 0 ? Number(ARGS[limitIdx + 1] ?? '0') : 0
const BUCKET = 'gutachter-logos'

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('FEHLT: NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY')
  console.error('Tipp: aus .env.local — Skript lädt dotenv automatisch.')
  process.exit(2)
}

console.info(`[backfill] Modus: ${APPLY ? 'APPLY (echte Writes)' : 'DRY-RUN (read-only)'}`)
console.info(`[backfill] Limit: ${LIMIT > 0 ? LIMIT : 'kein Limit'}`)

const db = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/**
 * Inline-Port von src/lib/branding/server-bg-remove.ts:stripSolidBackground.
 * Bewusst dupliziert weil .mjs-Scripts keine .ts-Imports ohne tsx-Loader können.
 * Bei Änderungen am Server-Algorithmus dieses Skript synchronisieren.
 */
async function stripSolidBackground(srcBuffer) {
  const meta = await sharp(srcBuffer).metadata()
  const width = meta.width ?? 0
  const height = meta.height ?? 0
  if (width < 5 || height < 5) {
    return { cleaned: srcBuffer, applied: false }
  }
  const rawImg = await sharp(srcBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { data: rawData, info } = rawImg
  const sampleAt = (x, y) => {
    const i = (y * info.width + x) * info.channels
    const a = info.channels >= 4 ? rawData[i + 3] : 255
    return { r: rawData[i], g: rawData[i + 1], b: rawData[i + 2], a }
  }
  const corners = [
    sampleAt(2, 2),
    sampleAt(info.width - 3, 2),
    sampleAt(2, info.height - 3),
    sampleAt(info.width - 3, info.height - 3),
  ]
  const hasTransparentCorner = corners.some((c) => c.a < 200)
  if (hasTransparentCorner) {
    const normalized = await sharp(srcBuffer).png().toBuffer()
    return { cleaned: normalized, applied: false }
  }
  const avg = {
    r: Math.round(corners.reduce((s, c) => s + c.r, 0) / 4),
    g: Math.round(corners.reduce((s, c) => s + c.g, 0) / 4),
    b: Math.round(corners.reduce((s, c) => s + c.b, 0) / 4),
  }
  const isUniform = corners.every(
    (c) =>
      Math.abs(c.r - avg.r) < 12 &&
      Math.abs(c.g - avg.g) < 12 &&
      Math.abs(c.b - avg.b) < 12,
  )
  const isNearWhite = avg.r > 235 && avg.g > 235 && avg.b > 235
  const isNearBlack = avg.r < 20 && avg.g < 20 && avg.b < 20
  const isLightUniform =
    avg.r > 200 &&
    avg.g > 200 &&
    avg.b > 200 &&
    Math.max(avg.r, avg.g, avg.b) - Math.min(avg.r, avg.g, avg.b) < 8
  if (!isUniform || (!isNearWhite && !isNearBlack && !isLightUniform)) {
    const normalized = await sharp(srcBuffer).png().toBuffer()
    return { cleaned: normalized, applied: false }
  }
  const THRESH = 28
  const out = Buffer.alloc(rawData.length)
  for (let i = 0; i < rawData.length; i += info.channels) {
    const dr = rawData[i] - avg.r
    const dg = rawData[i + 1] - avg.g
    const db = rawData[i + 2] - avg.b
    const dist = Math.sqrt(dr * dr + dg * dg + db * db)
    out[i] = rawData[i]
    out[i + 1] = rawData[i + 1]
    out[i + 2] = rawData[i + 2]
    out[i + 3] = dist < THRESH ? 0 : rawData[i + 3]
  }
  const cleaned = await sharp(out, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .png()
    .toBuffer()
  return { cleaned, applied: true, bgColor: avg }
}

/** Recursive list — Storage-list selbst ist nicht rekursiv. */
async function listAll(prefix = '') {
  const result = []
  const { data, error } = await db.storage.from(BUCKET).list(prefix, {
    limit: 1000,
    sortBy: { column: 'name', order: 'asc' },
  })
  if (error) {
    console.error(`[backfill] list("${prefix}") failed:`, error.message)
    return result
  }
  for (const entry of data ?? []) {
    const full = prefix ? `${prefix}/${entry.name}` : entry.name
    // Storage gibt für „Folder" einen Eintrag ohne id zurück.
    if (!entry.id) {
      result.push(...(await listAll(full)))
    } else {
      result.push({
        path: full,
        size: entry.metadata?.size ?? 0,
        contentType: entry.metadata?.mimetype ?? null,
      })
    }
  }
  return result
}

async function main() {
  const files = await listAll()
  console.info(`[backfill] ${files.length} Logo-Files im Bucket gefunden`)

  const targets = LIMIT > 0 ? files.slice(0, LIMIT) : files
  const stats = { processed: 0, skipped: 0, applied: 0, errors: 0 }

  for (const f of targets) {
    if (f.contentType === 'image/svg+xml' || f.path.endsWith('.svg')) {
      console.info(`[skip svg]  ${f.path}`)
      stats.skipped++
      continue
    }
    if (f.size < 5 * 1024) {
      console.info(`[skip tiny ${f.size}b] ${f.path}`)
      stats.skipped++
      continue
    }

    try {
      const { data: blob, error: dlErr } = await db.storage
        .from(BUCKET)
        .download(f.path)
      if (dlErr || !blob) {
        console.error(`[err dl]  ${f.path}: ${dlErr?.message ?? 'no body'}`)
        stats.errors++
        continue
      }
      const srcBuffer = Buffer.from(await blob.arrayBuffer())
      const result = await stripSolidBackground(srcBuffer)
      if (!result.applied) {
        console.info(`[no-bg]   ${f.path} (size=${f.size}b)`)
        stats.processed++
        continue
      }
      const bg = result.bgColor
      console.info(
        `[apply${APPLY ? '' : ' DRY'}] ${f.path} — BG rgb(${bg?.r},${bg?.g},${bg?.b}), ${srcBuffer.length}→${result.cleaned.length}b`,
      )
      if (APPLY) {
        const { error: upErr } = await db.storage
          .from(BUCKET)
          .upload(f.path, result.cleaned, {
            contentType: 'image/png',
            upsert: true,
          })
        if (upErr) {
          console.error(`[err up]  ${f.path}: ${upErr.message}`)
          stats.errors++
          continue
        }
      }
      stats.applied++
      stats.processed++
    } catch (err) {
      console.error(
        `[err proc] ${f.path}: ${err instanceof Error ? err.message : err}`,
      )
      stats.errors++
    }
  }

  console.info('\n=== Summary ===')
  console.info(`Files gesamt:       ${files.length}`)
  console.info(`Limit/Targets:      ${targets.length}`)
  console.info(`Processed:          ${stats.processed}`)
  console.info(
    `BG entfernt:        ${stats.applied}${APPLY ? '' : ' (dry-run — keine Writes)'}`,
  )
  console.info(`Skipped (svg/tiny): ${stats.skipped}`)
  console.info(`Errors:             ${stats.errors}`)
  if (!APPLY && stats.applied > 0) {
    console.info(
      `\n→ Mit echtem Apply fahren: node scripts/branding/rerun-bg-removal.mjs --apply`,
    )
  }
}

main().catch((err) => {
  console.error('[fatal]', err)
  process.exit(1)
})
