// Pure Aggregation der Per-Query-Ergebnisse.

function avg(nums) {
  const xs = nums.filter((n) => typeof n === 'number')
  if (xs.length === 0) return null
  return Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10
}

export function scoreRun(results) {
  const total = results.length
  const present_count = results.filter((r) => r.extract?.claimondo_present).length
  const cited_count = results.filter((r) => r.extract?.claimondo_cited).length
  const sov_competitors = results.reduce((n, r) => n + (r.extract?.competitors_present?.length ?? 0), 0)
  const won = results.filter((r) => r.extract?.claimondo_present).map((r) => r.query)
  const lost = results.filter((r) => !r.extract?.claimondo_present).map((r) => r.query)
  return {
    total,
    present_count,
    cited_count,
    sov_claimondo: present_count,
    sov_competitors,
    judge_avg: {
      accuracy: avg(results.map((r) => r.scores?.accuracy)),
      sentiment: avg(results.map((r) => r.scores?.sentiment)),
      completeness: avg(results.map((r) => r.scores?.completeness)),
    },
    won,
    lost,
  }
}
