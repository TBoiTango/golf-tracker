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
  team1: [number, number],
  team2: [number, number]
): { t1Number: number; t2Number: number; points: number; winner: 1 | 2 | 0 } {
  const toVegas = ([a, b]: [number, number]) => {
    const lo = Math.min(a, b)
    const hi = Math.max(a, b)
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
