// Pure Pruef-Logik fuer check:flow-erhebt-felder (Spec 2026-07-21).
// Ein erhebt_felder-Eintrag MUSS eine echte, NICHT default-behaftete, NICHT abgeleitete
// leads-Rohspalte sein — sonst gatet der Step nie sauber (genau die Symptome 1/2 der Spec):
//   - *_effektiv (abgeleitet) -> per unfallort-Fallback maskiert -> Step entfaellt still (Symptom 2)
//   - DB-Default -> nie "leer" -> Step entfaellt still (Symptom 1: hat_vorschaeden default 'false')
//   - unbekannte Spalte -> Tippfehler, gatet nie
//
// @param steps  [{ step_id, erhebt_felder?: string[] }]  (vom Check-Script aus dem Fixture geparst)
// @param columnDefaults  { <leads-spalte>: <hasDefault:boolean> }  (Snapshot leads-column-defaults.json)
// @returns  string[] Verletzer im Format "<step_id>:<feld>:<grund>"
export function scanErhebtFelder(steps, columnDefaults) {
  const verletzer = []
  for (const s of steps) {
    for (const f of s.erhebt_felder ?? []) {
      if (f.endsWith('_effektiv')) verletzer.push(`${s.step_id}:${f}:abgeleitet`)
      else if (!(f in columnDefaults)) verletzer.push(`${s.step_id}:${f}:unbekannte-spalte`)
      else if (columnDefaults[f] === true) verletzer.push(`${s.step_id}:${f}:hat-default`)
    }
  }
  return verletzer
}
