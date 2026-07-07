'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { HOLES } from '@/lib/course'
import { strokesPerHole, vegasHole, formatVsPar } from '@/lib/scoring'
import type { Player, Score, Foursome } from '@/types/database'

interface Props { params: { id: string } }

interface PlayerWithScores extends Player {
  scores: Record<number, number>
}

export default function FoursomePage({ params }: Props) {
  const { id } = params
  const [foursome, setFoursome] = useState<Foursome | null>(null)
  const [players, setPlayers] = useState<PlayerWithScores[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    const [{ data: fs }, { data: rawPlayers }] = await Promise.all([
      supabase.from('foursomes').select('*').eq('id', id).single(),
      supabase.from('players').select('*').eq('foursome_id', id).order('vegas_team'),
    ])
    if (!fs || !rawPlayers) { setLoading(false); return }
    setFoursome(fs)

    const playerIds = rawPlayers.map((p: Player) => p.id)
    const { data: rawScores } = await supabase
      .from('scores')
      .select('*')
      .in('player_id', playerIds)

    const scores = (rawScores ?? []) as Score[]
    const enriched: PlayerWithScores[] = (rawPlayers as Player[]).map(p => {
      const scoreMap: Record<number, number> = {}
      scores.filter(s => s.player_id === p.id).forEach(s => { scoreMap[s.hole_number] = s.gross_score })
      return { ...p, scores: scoreMap }
    })
    setPlayers(enriched)
    setLoading(false)
  }

  useEffect(() => {
    load()
    const channel = supabase
      .channel(`foursome-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, load)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [id])

  if (loading) return <p className="text-center text-gray-400 mt-12">Loading...</p>
  if (!foursome) return <p className="text-center text-gray-400 mt-12">Group not found.</p>

  const team1 = players.filter(p => p.vegas_team === 1)
  const team2 = players.filter(p => p.vegas_team === 2)

  // Vegas running totals
  let t1TotalPoints = 0, t2TotalPoints = 0
  const vegasHoles: { hole: number; t1: number; t2: number; pts: number; winner: 0 | 1 | 2 }[] = []

  for (const h of HOLES) {
    const t1Scores = team1.map(p => p.scores[h.hole]).filter(Boolean)
    const t2Scores = team2.map(p => p.scores[h.hole]).filter(Boolean)
    if (t1Scores.length === 2 && t2Scores.length === 2) {
      const result = vegasHole(
        [t1Scores[0], t1Scores[1]],
        [t2Scores[0], t2Scores[1]]
      )
      if (result.winner === 1) t1TotalPoints += result.points
      if (result.winner === 2) t2TotalPoints += result.points
      vegasHoles.push({ hole: h.hole, t1: result.t1Number, t2: result.t2Number, pts: result.points, winner: result.winner })
    }
  }

  const moneyDiff = Math.abs(t1TotalPoints - t2TotalPoints)
  const moneyWinner = t1TotalPoints > t2TotalPoints ? 1 : t2TotalPoints > t1TotalPoints ? 2 : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/" className="text-gray-400 text-sm">← Leaderboard</Link>
        <h2 className="text-xl font-bold">Group {foursome.group_number}</h2>
      </div>

      {/* Team cards */}
      <div className="grid grid-cols-2 gap-3">
        {[team1, team2].map((team, ti) => {
          const teamNum = ti + 1
          const isWinning = moneyWinner === teamNum
          return (
            <div key={teamNum} className={`rounded-xl p-4 space-y-2 ${isWinning ? 'bg-green-900' : 'bg-gray-900'}`}>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Team {teamNum}</p>
              {team.map(p => {
                const strokes = strokesPerHole(p.handicap_index)
                const holesPlayed = Object.keys(p.scores).length
                const gross = Object.values(p.scores).reduce((a, b) => a + b, 0)
                const net = Object.entries(p.scores).reduce((sum, [hole, g]) => sum + g - strokes[parseInt(hole)], 0)
                const parPlayed = HOLES.filter(h => p.scores[h.hole] !== undefined).reduce((s, h) => s + h.par, 0)
                return (
                  <div key={p.id}>
                    <p className="font-semibold text-sm">{p.name}</p>
                    <p className="text-xs text-gray-400">
                      {holesPlayed > 0
                        ? `Thru ${holesPlayed} · Net ${formatVsPar(net, parPlayed)}`
                        : 'Not started'}
                    </p>
                    <Link href={`/score/${p.id}`} className="text-xs text-green-400 underline">Enter scores</Link>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Vegas scoreboard */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-lg">Vegas</h3>
          <div className="text-sm">
            {moneyWinner > 0 ? (
              <span className="text-green-400 font-bold">
                Team {moneyWinner} +${moneyDiff}
              </span>
            ) : (
              <span className="text-gray-400">All Square</span>
            )}
          </div>
        </div>

        <div className="bg-gray-900 rounded-xl overflow-hidden">
          <div className="grid grid-cols-[2.5rem_1fr_1fr_2.5rem] gap-2 px-4 py-2 text-xs text-gray-500 uppercase border-b border-gray-800">
            <span>Hole</span>
            <span className="text-center">T1</span>
            <span className="text-center">T2</span>
            <span className="text-right">Pts</span>
          </div>

          {vegasHoles.map(vh => (
            <div
              key={vh.hole}
              className={`grid grid-cols-[2.5rem_1fr_1fr_2.5rem] gap-2 px-4 py-2 border-b border-gray-800 last:border-0 text-sm ${
                vh.winner === 1 ? 'bg-blue-950' : vh.winner === 2 ? 'bg-red-950' : ''
              }`}
            >
              <span className="text-gray-500">{vh.hole}</span>
              <span className={`text-center font-mono font-bold ${vh.winner === 1 ? 'text-blue-300' : 'text-gray-400'}`}>
                {vh.t1}
              </span>
              <span className={`text-center font-mono font-bold ${vh.winner === 2 ? 'text-red-300' : 'text-gray-400'}`}>
                {vh.t2}
              </span>
              <span className="text-right text-gray-300">{vh.pts > 0 ? vh.pts : '–'}</span>
            </div>
          ))}

          {vegasHoles.length === 0 && (
            <p className="text-center text-gray-500 py-6 text-sm">Vegas starts once both teams have scores</p>
          )}
        </div>

        {/* Running totals */}
        {vegasHoles.length > 0 && (
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className={`rounded-xl p-4 text-center ${moneyWinner === 1 ? 'bg-green-800' : 'bg-gray-800'}`}>
              <p className="text-xs text-gray-400">Team 1 Points</p>
              <p className="text-3xl font-bold">{t1TotalPoints}</p>
              <p className="text-green-400 font-semibold">${t1TotalPoints}</p>
            </div>
            <div className={`rounded-xl p-4 text-center ${moneyWinner === 2 ? 'bg-green-800' : 'bg-gray-800'}`}>
              <p className="text-xs text-gray-400">Team 2 Points</p>
              <p className="text-3xl font-bold">{t2TotalPoints}</p>
              <p className="text-green-400 font-semibold">${t2TotalPoints}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
