export const COURSE_NAME = 'Tierra Rejada Golf Club'

export const HOLES: { hole: number; par: number; handicap: number }[] = [
  { hole: 1,  par: 5, handicap: 5  },
  { hole: 2,  par: 3, handicap: 11 },
  { hole: 3,  par: 4, handicap: 1  },
  { hole: 4,  par: 5, handicap: 7  },
  { hole: 5,  par: 4, handicap: 15 },
  { hole: 6,  par: 4, handicap: 13 },
  { hole: 7,  par: 4, handicap: 17 },
  { hole: 8,  par: 4, handicap: 9  },
  { hole: 9,  par: 5, handicap: 3  },
  { hole: 10, par: 4, handicap: 2  },
  { hole: 11, par: 3, handicap: 18 },
  { hole: 12, par: 5, handicap: 8  },
  { hole: 13, par: 4, handicap: 4  },
  { hole: 14, par: 3, handicap: 10 },
  { hole: 15, par: 4, handicap: 14 },
  { hole: 16, par: 5, handicap: 6  },
  { hole: 17, par: 3, handicap: 16 },
  { hole: 18, par: 4, handicap: 12 },
]

export const TOTAL_PAR = HOLES.reduce((sum, h) => sum + h.par, 0) // 72
export const FRONT_PAR = HOLES.slice(0, 9).reduce((sum, h) => sum + h.par, 0) // 37
export const BACK_PAR  = HOLES.slice(9).reduce((sum, h) => sum + h.par, 0)    // 35

export const SLOPE = 125
export const RATING = 70.5
