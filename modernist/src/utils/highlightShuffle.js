// Shuffled overview highlight cards (federation + club pages).
// A big pool of card ideas is built per page; every page open shows a
// random 4, never featuring the same swimmer twice in one set.

// Deterministic PRNG: the picked set stays stable across re-renders within
// one visit, but reshuffles every time the page is opened (new seed).
export function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function pickHighlights(pool, rand, count = 4) {
  const valid = pool.filter((c) => c.valid)
  for (let i = valid.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[valid[i], valid[j]] = [valid[j], valid[i]]
  }
  const picked = []
  const seen = new Set()
  for (const c of valid) {
    if (c.person && seen.has(c.person)) continue
    picked.push(c)
    if (c.person) seen.add(c.person)
    if (picked.length === count) return picked
  }
  // Not enough distinct-person cards → allow repeats rather than gaps
  for (const c of valid) {
    if (picked.length === count) break
    if (!picked.includes(c)) picked.push(c)
  }
  return picked
}
