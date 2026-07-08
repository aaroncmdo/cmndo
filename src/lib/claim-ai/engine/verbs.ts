// Claim-AI-Engine — geteilte Verb-Registry-Struktur (SP2-Konvergenz P1b).
//
// Ein Verb = eine Aktion, die Claude via Tool-Use vorschlagen kann. Jeder
// Eingang (Orchestrator/Aufsicht/Konsole) definiert seine Verben mit dieser
// gemeinsamen Struktur und wählt sein Subset — die Draft-Typen bleiben layer-
// spezifisch (generisch über T), die Definitions- + Validierungs-Mechanik ist
// geteilt. KEIN 'use server'.

import type Anthropic from '@anthropic-ai/sdk'

export type VerbValidation<T> = { ok: true; draft: T } | { ok: false; error: string }

export type VerbDefinition<T> = {
  name: string
  tool: Anthropic.Tool
  /** Verb-eigene Zod-/Struktur-Validierung → Draft oder Fehler. */
  validate: (input: unknown) => VerbValidation<T>
}

/** Die Anthropic-Tool-Definitionen aus einer Verb-Registry (das angebotene Subset). */
export function toolsFrom<T>(verbs: VerbDefinition<T>[]): Anthropic.Tool[] {
  return verbs.map((v) => v.tool)
}

/**
 * Validiert einen Tool-Use-Aufruf gegen die Registry: Name-Lookup, dann die
 * verb-eigene Validierung. Unbekanntes Verb → Fehler.
 */
export function validateVerb<T>(
  verbs: VerbDefinition<T>[],
  name: string,
  input: unknown,
): VerbValidation<T> {
  const verb = verbs.find((v) => v.name === name)
  if (!verb) return { ok: false, error: `unbekanntes Tool: ${name}` }
  return verb.validate(input)
}
