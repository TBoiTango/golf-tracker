import { HOLES, SLOPE } from './course'

/** Course handicap from handicap index (blue tees, slope 125) */
export function courseHandicap(handicapIndex: number): number {
  return Math.round(handicapIndex * (SLOPE / 113))
}

/**
 * Returns an array of 18 stroke allocations (0 or 1) indexed by hole number (1-based).
 * A player with course handicap 9 gets 1 stroke on the 9 hardest holes.
 */
export function strokesPerHole(handicapIndex: number): Record<number, number> {
  const ch = courseHandicap(handicapIndex)
  const strokes: Record<number, number> = {}
  for (const { hole, handicap } of HOLES) {
    strokes[hole] = handicap <= ch ? 1 : 0
  }
  return strokes
}

/** Net score for a single hole */
export function netScore(gross: number, hole: number, handicapIndex: number): number {
  return gross - strokesPerHole(handicapIndex)[hole]
}

/** Score label vs par: -2 "Eagle", -1 "Birdie", 0 "Par", +1 "Bogey", etc */
export function scoreLabel(score: number, par: number): string {
  const diff = score - par
  if (diff <= -2) return 'Eagle'
  if (diff === -1) return 'Birdie'
  if (diff === 0)  return 'Par'
  if (diff === 1)  return 'Bogey'
  if (diff === 2)  return 'Double'
  return `+${diff}`
}

/** Format score relative to par as string: "E", "+3", "-1" */
export function formatVsPar(totalGross: number, totalPar: number): string {
  const diff = totalGross - totalPar
  if (diff === 0) return 'E'
  return diff > 0 ? `+${diff}` : `${diff}`
}

/**
 * Vegas calculation for one hole.
 * Takes two gross scores per team and returns the 2-digit Vegas number for each.
 * Lower number wins. Returns points won (positive = team1 wins, negative = team2 wins).
 */
export function vegasHole(
  team1: [number, number],
  team2: [number, number]
): { t1Number: number; t2Number: number; points: number; winner: 1 | 2 | 0 } {
  const toVegas = ([a, b]: [number, number]) => {
    const lo = Math.min(a, b)
    const hi = Math.max(a, b)
    // Handle double-digit scores (e.g. 10) by concatenating as strings
    return parseInt(`${lo}${hi}`, 10)
  }

  const t1Number = toVegas(team1)
  const t2Number = toVegas(team2)
  const diff = t2Number - t1Number

  return {
    t1Number,
    t2Number,
    points: Math.abs(diff),
    winner: diff > 0 ? 1 : diff < 0 ? 2 : 0,
  }
}
