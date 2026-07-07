'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { HOLES } from '@/lib/course'
import { strokesPerHole, scoreLabel } from '@/lib/scoring'
import type { Player, Score } from '@/types/database'

interface Props { params: { playerId: string } }

export default function ScoreEntryPage({ params }: Props) {
  const { playerId } = params
  const [player, setPlayer] = useState<Player | null>(null)
  const [scores, setScores] = useState<Record<number, number>>({})
  const [saving, setSaving] = useState<number | null>(null)
  const [currentHole, setCurrentHole] = useState(1)

  useEffect(() => {
    async function load() {
      const [{ data: p }, { data: s }] = await Promise.all([
        supabase.from('players').select('*').eq('id', playerId).single(),
        supabase.from('scores').select('*').eq('player_id', playerId),
      ])
      if (p) setPlayer(p)
      if (s) {
        const map: Record<number, number> = {}
        s.forEach(score => { map[score.hole_number] = score.gross_score })
        setScores(map)
        // Jump to next unplayed hole
        const nextHole = HOLES.find(h => !map[h.hole])
        if (nextHole) setCurrentHole(nextHole.hole)
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
      await supabase.from('scores').insert({ player_id: playerId, hole_number: hole, gross_score: gross })
    }
    setScores(prev => ({ ...prev, [hole]: gross }))
    setSaving(null)
    // Auto-advance to next hole
    const next = HOLES.find(h => h.hole > hole && !scores[h.hole])
    if (next) setCurrentHole(next.hole)
  }

  if (!player) return <p className="text-center text-gray-400 mt-12">Loading...</p>

  const strokes = strokesPerHole(player.handicap_index)
  const holeData = HOLES.find(h => h.hole === currentHole)!
  const currentGross = scores[currentHole]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{player.name}</h2>
        <p className="text-gray-400 text-sm">Handicap {player.handicap_index} · Hcp {player.handicap_index} index</p>
      </div>

      {/* Current hole entry */}
      <div className="bg-gray-900 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-sm uppercase tracking-wide">Hole {currentHole}</p>
            <p className="text-3xl font-bold">Par {holeData.par}</p>
          </div>
          {strokes[currentHole] > 0 && (
            <span className="bg-green-800 text-green-300 text-xs px-3 py-1 rounded-full">
              +{strokes[currentHole]} stroke
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {[...Array(8)].map((_, i) => {
            const score = i + holeData.par - 2
            if (score < 1) return null
            return (
              <button
                key={score}
                onClick={() => submitScore(currentHole, score)}
                disabled={saving === currentHole}
                className={`flex-1 py-4 rounded-xl text-lg font-bold transition ${
                  currentGross === score
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-800 hover:bg-gray-700'
                }`}
              >
                {score}
              </button>
            )
          })}
        </div>

        {currentGross && (
          <p className="text-center text-sm text-gray-400">
            {scoreLabel(currentGross, holeData.par)} ·{' '}
            Net {currentGross - strokes[currentHole]}
          </p>
        )}
      </div>

      {/* Hole selector */}
      <div className="grid grid-cols-9 gap-1.5">
        {HOLES.map(h => {
          const gross = scores[h.hole]
          const diff = gross ? gross - h.par - strokes[h.hole] : null
          return (
            <button
              key={h.hole}
              onClick={() => setCurrentHole(h.hole)}
              className={`aspect-square rounded-lg text-xs font-bold flex flex-col items-center justify-center transition ${
                h.hole === currentHole ? 'ring-2 ring-green-500' : ''
              } ${
                gross === undefined ? 'bg-gray-800 text-gray-500'
                : diff! < 0 ? 'bg-red-700 text-white'
                : diff === 0 ? 'bg-gray-600 text-white'
                : 'bg-blue-900 text-blue-300'
              }`}
            >
              <span className="text-gray-400 text-[9px]">{h.hole}</span>
              <span>{gross ?? '-'}</span>
            </button>
          )
        })}
      </div>

      {/* Summary */}
      {Object.keys(scores).length > 0 && (
        <div className="bg-gray-900 rounded-xl p-4 grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-gray-500 text-xs">Holes</p>
            <p className="text-xl font-bold">{Object.keys(scores).length}</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs">Gross</p>
            <p className="text-xl font-bold">{Object.values(scores).reduce((a, b) => a + b, 0)}</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs">Net</p>
            <p className="text-xl font-bold">
              {Object.entries(scores).reduce((sum, [hole, gross]) => sum + gross - strokes[parseInt(hole)], 0)}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
