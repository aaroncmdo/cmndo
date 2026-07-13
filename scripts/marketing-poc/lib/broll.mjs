// Pexels: Portrait-B-Roll je Segment-Query (erste passende Datei herunterladen)
import { writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'

export async function fetchBroll(queries = []) {
  for (const q of queries) {
    const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(q)}&orientation=portrait&size=medium&per_page=1`
    const res = await fetch(url, { headers: { Authorization: process.env.PEXELS_API_KEY } })
    if (!res.ok) continue
    const data = await res.json()
    const vid = data.videos?.[0]
    if (!vid) continue
    // portrait-taugliche Datei mit hoechster Aufloesung bevorzugen
    const file =
      vid.video_files.filter((f) => f.height >= f.width).sort((a, b) => b.height - a.height)[0] ||
      vid.video_files[0]
    if (!file) continue
    await mkdir('./.work/broll', { recursive: true })
    const path = `./.work/broll/${createHash('md5').update(file.link).digest('hex')}.mp4`
    const bin = Buffer.from(await (await fetch(file.link)).arrayBuffer())
    await writeFile(path, bin)
    return path
  }
  return null
}
