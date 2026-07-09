'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { strokesPerHole, scoreLabel, DEFAULT_PARS, DEFAULT_HANDICAPS } from '@/lib/scoring'

interface Props { params: { playerId: string } }

export default function ScoreEntryPage({ params }: Props) {
  const { playerId } = params
  const [player, setPlayer] = useState<any>(null)
  const [foursomeId, setFoursomeId] = useState<string | null>(null)
  const [scores, setScores] = useState<Record<number, number>>({})
  const [saving, setSaving] = useState<number | null>(null)
  const [currentHole, setCurrentHole] = useState(1)
  const [holePars, setHolePars] = useState(DEFAULT_PARS)
  const [holeHandicaps, setHoleHandicaps] = useState(DEFAULT_HANDICAPS)
  const [slope, setSlope] = useState(125)

  useEffect(() => {
    async function load() {
      const [{ data: p }, { data: s }] = await Promise.all([
        supabase.from('players').select('*').eq('id', playerId).single(),
        supabase.from('scores').select('*').eq('player_id', playerId),
      ])
      if (!p) return
      setPlayer(p)
      if (p.foursome_id) setFoursomeId(p.foursome_id)

      // Load course config from round
      const { data: r } = await supabase.from('rounds').select('hole_pars, hole_handicaps, slope').eq('id', p.round_id).single()
      if (r?.hole_pars)      setHolePars(r.hole_pars)
      if (r?.hole_handicaps) setHoleHandicaps(r.hole_handicaps)
      if (r?.slope)          setSlope(r.slope)

      if (s) {
        const map: Record<number, number> = {}
        s.forEach((score: any) => { map[score.hole_number] = score.gross_score })
        setScores(map)
        const nextHole = Array.from({ length: 18 }, (_, i) => i + 1).find(h => !map[h])
        if (nextHole) setCurrentHole(nextHole)
      }
    }
    load()
  }, [playerId])

  async function submitScore(hole: number, gross: number) {
    if (gross < 1 || gross > 15) return
    setSaving(hole)
    const existing = scores[hole]
    if (existing !== undefined) {
      await supabase.from('scores')
        .update({ gross_score: gross, updated_at: new Date().toISOString() })
        .eq('player_id', playerId).eq('hole_number', hole)
    } else {
      await supabase.from('scores').insert({ player_id: playerId, round_id: player.round_id, hole_number: hole, gross_score: gross })
    }
    setScores(prev => ({ ...prev, [hole]: gross }))
    setSaving(null)
    const next = Array.from({ length: 18 }, (_, i) => i + 1).find(h => h > hole && !scores[h])
    if (next) setCurrentHole(next)
  }

  if (!player) return <p className="text-center text-gray-400 mt-12">Loading...</p>

  const strokes = strokesPerHole(player.handicap_index, holeHandicaps, slope)
  const strokeHoles = Array.from({ length: 18 }, (_, i) => i + 1).filter(h => strokes[h] > 0)
  const par = holePars[currentHole - 1] ?? 4
  const currentGross = scores[currentHole]

  const scoreButtons = Array.from({ length: 8 }, (_, i) => par - 2 + i).filter(s => s > 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-gray-400 text-sm">← Leaderboard</Link>
        {foursomeId && (
          <Link href={`/foursome/${foursomeId}`} className="text-green-400 text-sm">My Group →</Link>
        )}
      </div>
      <div>
        <h2 className="text-2xl font-bold">{player.name}</h2>
        <p className="text-gray-400 text-sm">Handicap {player.handicap_index}</p>
        {strokeHoles.length > 0 && (
          <p className="text-green-400 text-xs mt-1">
            Stroke holes: {strokeHoles.join(', ')}
          </p>
        )}
      </div>

      {/* Current hole entry */}
      <div className="bg-gray-900 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-sm uppercase tracking-wide">Hole {currentHole}</p>
            <p className="text-3xl font-bold">Par {par}</p>
          </div>
          {strokes[currentHole] > 0 && (
            <span className="bg-green-800 text-green-300 text-xs px-3 py-1 rounded-full">+{strokes[currentHole]} stroke</span>
          )}
        </div>

        <div className="flex gap-2">
          {scoreButtons.map(score => (
            <button
              key={score}
              onClick={() => submitScore(currentHole, score)}
              disabled={saving === currentHole}
              className={`flex-1 py-4 rounded-xl text-lg font-bold transition ${
                currentGross === score ? 'bg-green-600 text-white' : 'bg-gray-800 hover:bg-gray-700'
              }`}
            >
              {score}
            </button>
          ))}
        </div>

        {currentGross && (
          <p className="text-center text-sm text-gray-400">
            {scoreLabel(currentGross, par)}
          </p>
        )}
      </div>

      {/* Hole grid */}
      <div className="grid grid-cols-9 gap-1.5">
        {Array.from({ length: 18 }, (_, i) => i + 1).map(h => {
          const gross = scores[h]
          const p2 = holePars[h - 1] ?? 4
          const diff = gross !== undefined ? gross - p2 : null
          return (
            <button
              key={h}
              onClick={() => setCurrentHole(h)}
              className={`aspect-square rounded-lg text-xs font-bold flex flex-col items-center justify-center transition ${
                h === currentHole ? 'ring-2 ring-green-500' : ''
              } ${
                gross === undefined ? 'bg-gray-800 text-gray-500'
                : diff! < 0 ? 'bg-red-700 text-white'
                : diff === 0 ? 'bg-gray-600 text-white'
                : 'bg-blue-900 text-blue-300'
              }`}
            >
              <span className="text-gray-400 text-[9px]">{h}</span>
              <span>{gross ?? '-'}</span>
            </button>
          )
        })}
      </div>

      {/* Summary */}
      {Object.keys(scores).length > 0 && (
        <div className="bg-gray-900 rounded-xl p-4 grid grid-cols-2 gap-4 text-center">
          <div>
            <p className="text-gray-500 text-xs">Holes</p>
            <p className="text-xl font-bold">{Object.keys(scores).length}</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs">Gross</p>
            <p className="text-xl font-bold">{Object.values(scores).reduce((a, b) => a + b, 0)}</p>
          </div>
        </div>
      )}
    </div>
  )
}
