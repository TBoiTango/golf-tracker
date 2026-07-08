import { HOLES, SLOPE } from './course'

export const DEFAULT_PARS      = [5,3,4,5,4,4,4,4,5,4,3,5,4,3,4,5,3,4]
export const DEFAULT_HANDICAPS = [5,11,1,7,15,13,17,9,3,2,18,8,4,10,14,6,16,12]

export function courseHandicap(handicapIndex: number): number {
  return Math.round(handicapIndex * (SLOPE / 113))
}

export function strokesPerHole(
  handicapIndex: number,
  customHandicaps?: number[]
): Record<number, number> {
  const ch = courseHandicap(handicapIndex)
  const handicaps = customHandicaps ?? HOLES.map(h => h.handicap)
  const strokes: Record<number, number> = {}
  handicaps.forEach((hcp, i) => {
    strokes[i + 1] = hcp <= ch ? 1 : 0
  })
  return strokes
}

// For Vegas: strokes relative to the lowest handicap in the group.
// The lowest handicap player gets 0 strokes; everyone else gets the difference.
export function relativeStrokesPerHole(
  handicapIndex: number,
  minHandicapIndex: number,
  customHandicaps?: number[]
): Record<number, number> {
  const ch    = courseHandicap(handicapIndex)
  const minCh = courseHandicap(minHandicapIndex)
  const relativeCh = Math.max(0, ch - minCh)
  const handicaps = customHandicaps ?? HOLES.map(h => h.handicap)
  const strokes: Record<number, number> = {}
  handicaps.forEach((hcp, i) => {
    strokes[i + 1] = hcp <= relativeCh ? 1 : 0
  })
  return strokes
}

export function scoreLabel(score: number, par: number): string {
  const diff = score - par
  if (diff <= -2) return 'Eagle'
  if (diff === -1) return 'Birdie'
  if (diff === 0)  return 'Par'
  if (diff === 1)  return 'Bogey'
  if (diff === 2)  return 'Double'
  return `+${diff}`
}

export function formatVsPar(totalNet: number, totalPar: number): string {
  const diff = totalNet - totalPar
  if (diff === 0) return 'E'
  return diff > 0 ? `+${diff}` : `${diff}`
}

export function vegasHole(
  team1Net: [number, number],
  team2Net: [number, number],
  par: number
): { t1Number: number; t2Number: number; points: number; winner: 1 | 2 | 0; events: string[] } {
  const events: string[] = []

  // 10+ rule: if either score is 10 or higher, that score goes FIRST (protects opponent from blowout)
  const toVegas = ([a, b]: [number, number]) => {
    const lo = Math.min(a, b)
    const hi = Math.max(a, b)
    if (hi >= 10) {
      events.push(`🔢 Score of ${hi} — 10+ rule: high number goes first (${hi}${lo} not ${lo}${hi})`)
      return parseInt(`${hi}${lo}`, 10)
    }
    return parseInt(`${lo}${hi}`, 10)
  }

  let t1Number = toVegas(team1Net)
  let t2Number = toVegas(team2Net)

  // Birdie/eagle detection (best net score on the team vs par)
  const t1Best = Math.min(...team1Net)
  const t2Best = Math.min(...team2Net)
  const t1Eagle  = t1Best <= par - 2
  const t1Birdie = t1Best === par - 1
  const t2Eagle  = t2Best <= par - 2
  const t2Birdie = t2Best === par - 1

  let multiplier = 1

  if (t1Eagle && !t2Eagle) {
    // Team 1 eagles: flip Team 2's number and double points
    const flipped = parseInt(`${String(t2Number).split('').reverse().join('')}`, 10)
    events.push(`🦅 Eagle by Team 1! Team 2's score flips (${t2Number} → ${flipped}) and points are doubled`)
    t2Number = flipped
    multiplier = 2
  } else if (t2Eagle && !t1Eagle) {
    // Team 2 eagles: flip Team 1's number and double points
    const flipped = parseInt(`${String(t1Number).split('').reverse().join('')}`, 10)
    events.push(`🦅 Eagle by Team 2! Team 1's score flips (${t1Number} → ${flipped}) and points are doubled`)
    t1Number = flipped
    multiplier = 2
  } else if (t1Eagle && t2Eagle) {
    // Both eagle: double the points, no flip
    events.push(`🦅🦅 Both teams eagle! Points doubled, no flip`)
    multiplier = 2
  } else if (t1Birdie && !t2Birdie) {
    // Team 1 birdies: flip Team 2's number
    const orig = t2Number
    const flipped = parseInt(`${String(t2Number).split('').reverse().join('')}`, 10)
    events.push(`🐦 Birdie by Team 1! Team 2's score flips (${orig} → ${flipped})`)
    t2Number = flipped
  } else if (t2Birdie && !t1Birdie) {
    // Team 2 birdies: flip Team 1's number
    const orig = t1Number
    const flipped = parseInt(`${String(t1Number).split('').reverse().join('')}`, 10)
    events.push(`🐦 Birdie by Team 2! Team 1's score flips (${orig} → ${flipped})`)
    t1Number = flipped
  } else if (t1Birdie && t2Birdie) {
    // Both birdie: no flip, normal scoring
    events.push(`🐦🐦 Both teams birdie — no flip, normal scoring`)
  }

  const diff = t2Number - t1Number
  const points = Math.abs(diff) * multiplier

  return {
    t1Number,
    t2Number,
    points,
    winner: diff > 0 ? 1 : diff < 0 ? 2 : 0,
    events,
  }
}
