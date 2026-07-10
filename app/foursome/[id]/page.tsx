'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { strokesPerHole, relativeStrokesPerHole, strokesFromCount, vegasHole, formatVsPar, DEFAULT_PARS, DEFAULT_HANDICAPS } from '@/lib/scoring'

interface Props { params: { id: string } }

export default function FoursomePage({ params }: Props) {
  const { id } = params
  const [foursome, setFoursome] = useState<any>(null)
  const [players, setPlayers] = useState<any[]>([])
  const [round, setRound] = useState<any>(null)
  const [ctpResults, setCtpResults] = useState<Record<number, number>>({})
  const [savingCtp, setSavingCtp] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedHole, setExpandedHole] = useState<number | null>(null)
  const [strokeOverrides, setStrokeOverrides] = useState<Record<string, number>>({})
  const [teamScores, setTeamScores] = useState<Record<string, number>>({}) // key: `${team}-${hole}`
  const [savingTeamScore, setSavingTeamScore] = useState<string | null>(null)

  async function load() {
    const [{ data: fs }, { data: rawPlayers }] = await Promise.all([
      supabase.from('foursomes').select('*').eq('id', id).single(),
      supabase.from('players').select('*').eq('foursome_id', id).order('vegas_team'),
    ])
    if (!fs || !rawPlayers) { setLoading(false); return }
    setFoursome(fs)

    const { data: r } = await supabase.from('rounds').select('*').eq('id', fs.round_id).single()
    setRound(r)

    const playerIds = rawPlayers.map((p: any) => p.id)
    const [{ data: rawScores }, { data: ctpData }, { data: tsData }] = await Promise.all([
      supabase.from('scores').select('*').in('player_id', playerIds),
      supabase.from('ctp_results').select('*').eq('foursome_id', id),
      supabase.from('team_scores').select('*').eq('foursome_id', id),
    ])

    const tsMap: Record<string, number> = {}
    ;(tsData ?? []).forEach((ts: any) => { tsMap[`${ts.team_number}-${ts.hole_number}`] = ts.gross_score })
    setTeamScores(tsMap)
    const scores = (rawScores ?? []) as any[]

    const ctpMap: Record<number, number> = {}
    ;(ctpData ?? []).forEach((c: any) => { ctpMap[c.hole_number] = c.winning_team })
    setCtpResults(ctpMap)

    const enriched = rawPlayers.map((p: any) => {
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ctp_results' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_scores' }, load)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [id])

  async function saveCtp(hole: number, team: number) {
    setSavingCtp(hole)
    if (ctpResults[hole] === team) {
      // Toggle off
      await supabase.from('ctp_results').delete().eq('foursome_id', id).eq('hole_number', hole)
      setCtpResults(prev => { const n = { ...prev }; delete n[hole]; return n })
    } else {
      await supabase.from('ctp_results').upsert(
        { foursome_id: id, hole_number: hole, winning_team: team },
        { onConflict: 'foursome_id,hole_number' }
      )
      setCtpResults(prev => ({ ...prev, [hole]: team }))
    }
    setSavingCtp(null)
  }

  async function saveTeamScore(team: number, hole: number, score: number) {
    const key = `${team}-${hole}`
    setSavingTeamScore(key)
    const existing = teamScores[key]
    if (existing === score) {
      await supabase.from('team_scores').delete().eq('foursome_id', id).eq('team_number', team).eq('hole_number', hole)
      setTeamScores(prev => { const n = { ...prev }; delete n[key]; return n })
    } else {
      await supabase.from('team_scores').upsert(
        { foursome_id: id, team_number: team, hole_number: hole, gross_score: score },
        { onConflict: 'foursome_id,team_number,hole_number' }
      )
      setTeamScores(prev => ({ ...prev, [key]: score }))
    }
    setSavingTeamScore(null)
  }

  if (loading) return <p className="text-center text-gray-400 mt-12">Loading...</p>
  if (!foursome) return <p className="text-center text-gray-400 mt-12">Group not found.</p>

  const holePars      = round?.hole_pars      ?? DEFAULT_PARS
  const holeHandicaps = round?.hole_handicaps ?? DEFAULT_HANDICAPS
  const gameType      = foursome.game_type    ?? round?.game_type ?? 'vegas'
  const stakes        = foursome.stakes       ?? round?.stakes    ?? 1
  const ctpStakes     = foursome.ctp_stakes   ?? 1
  const useHandicaps  = foursome.use_handicaps !== false

  const slope = round?.slope ?? 125

  function getStrokesForPlayer(p: any, minHcp: number): Record<number, number> {
    if (!useHandicaps) return strokesFromCount(p.manual_strokes ?? 0, holeHandicaps)
    // If manual_strokes is explicitly set, use it as an override
    if (p.manual_strokes != null) return strokesFromCount(p.manual_strokes, holeHandicaps)
    return relativeStrokesPerHole(p.handicap_index, minHcp, holeHandicaps, slope)
  }

  function getFullStrokesForPlayer(p: any): Record<number, number> {
    if (!useHandicaps) return strokesFromCount(p.manual_strokes ?? 0, holeHandicaps)
    return strokesPerHole(p.handicap_index, holeHandicaps, slope)
  }

  const team1 = players.filter(p => p.vegas_team === 1)
  const team2 = players.filter(p => p.vegas_team === 2)

  // Vegas calculation
  let t1VegasPoints = 0, t2VegasPoints = 0
  const vegasRows: any[] = []

  if (gameType === 'vegas') {
    const allPlayers = [...team1, ...team2]
    const minHcp = useHandicaps && allPlayers.length > 0
      ? Math.min(...allPlayers.map(p => p.handicap_index))
      : 0

    for (let i = 0; i < 18; i++) {
      const hole = i + 1
      const par = holePars[i] ?? 4
      const t1HasScores = team1.length === 2 && team1.every(p => p.scores[hole] !== undefined)
      const t2HasScores = team2.length === 2 && team2.every(p => p.scores[hole] !== undefined)
      if (t1HasScores && t2HasScores) {
        const t1Net = team1.map(p => {
          const strokes = getStrokesForPlayer(p, minHcp)
          return (p.scores[hole] as number) - (strokes[hole] ?? 0)
        }) as [number, number]
        const t2Net = team2.map(p => {
          const strokes = getStrokesForPlayer(p, minHcp)
          return (p.scores[hole] as number) - (strokes[hole] ?? 0)
        }) as [number, number]
        const t1Gross = team1.map(p => p.scores[hole] as number) as [number, number]
        const t2Gross = team2.map(p => p.scores[hole] as number) as [number, number]
        const result = vegasHole(t1Net, t2Net, par, t1Gross, t2Gross)
        if (result.winner === 1) t1VegasPoints += result.points
        if (result.winner === 2) t2VegasPoints += result.points
        vegasRows.push({ hole, par, ...result })
      }
    }
  }

  // CTP calculation
  const par3Holes = holePars.map((p, i) => p === 3 ? i + 1 : null).filter(Boolean) as number[]
  const t1CtpWins = par3Holes.filter(h => ctpResults[h] === 1).length
  const t2CtpWins = par3Holes.filter(h => ctpResults[h] === 2).length

  // Payout summary
  const t1VegasMoney = t1VegasPoints * stakes
  const t2VegasMoney = t2VegasPoints * stakes
  const t1CtpMoney   = t1CtpWins * ctpStakes
  const t2CtpMoney   = t2CtpWins * ctpStakes
  const t1Total      = t1VegasMoney + t1CtpMoney
  const t2Total      = t2VegasMoney + t2CtpMoney

  const vegasWinner  = t1VegasPoints > t2VegasPoints ? 1 : t2VegasPoints > t1VegasPoints ? 2 : 0
  const overallWinner = t1Total > t2Total ? 1 : t2Total > t1Total ? 2 : 0

  const teamUnbalanced = gameType === 'vegas' && (team1.length !== 2 || team2.length !== 2)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/" className="text-gray-400 text-sm">← Leaderboard</Link>
        <h2 className="text-xl font-bold">Group {foursome.group_number}</h2>
        <span className="text-xs text-gray-500 ml-auto">
          {gameType === 'vegas' ? '🎰 Vegas' : gameType === 'stroke' ? '🏌️ Stroke' : '⛳ No game'}
          {' · '}{useHandicaps ? 'Handicap' : 'Straight up'}
        </span>
      </div>

      {/* Team balance warning */}
      {teamUnbalanced && (
        <div className="bg-yellow-900 text-yellow-300 rounded-xl px-4 py-3 text-sm">
          ⚠️ Vegas requires 2 players per team. Teams are unbalanced — see admin to fix in Setup.
        </div>
      )}

      {/* Team cards */}
      <div className="grid grid-cols-2 gap-3">
        {[team1, team2].map((team, ti) => {
          const teamNum = ti + 1
          return (
            <div key={teamNum} className={`rounded-xl p-4 space-y-2 ${overallWinner === teamNum ? 'bg-green-900' : 'bg-gray-900'}`}>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Team {teamNum}</p>
              {team.length === 0 && <p className="text-xs text-gray-600">No players yet</p>}
              {team.map(p => {
                const strokes = getFullStrokesForPlayer(p)
                const holesPlayed = Object.keys(p.scores).length
                const net = Object.entries(p.scores).reduce((sum, [hole, g]: any) => sum + g - (strokes[parseInt(hole)] ?? 0), 0)
                const parPlayed = Object.keys(p.scores).reduce((sum, h) => sum + (holePars[parseInt(h) - 1] ?? 4), 0)
                const allPlayers = [...team1, ...team2]
                const minHcp = useHandicaps && allPlayers.length > 0 ? Math.min(...allPlayers.map(q => q.handicap_index)) : 0
                const vegasStrokes = getStrokesForPlayer(p, minHcp)
                const vegasStrokeHoles = Array.from({ length: 18 }, (_, i) => i + 1).filter(h => vegasStrokes[h] > 0)
                return (
                  <div key={p.id}>
                    <p className="font-semibold text-sm">{p.name}</p>
                    <p className="text-xs text-gray-400">
                      {holesPlayed > 0 ? `Thru ${holesPlayed}` : 'Not started'}
                    </p>
                    {gameType === 'vegas' && vegasStrokeHoles.length > 0 && (
                      <p className="text-xs text-yellow-500 mt-0.5">Strokes: {vegasStrokeHoles.join(', ')}</p>
                    )}
                    {gameType === 'vegas' && vegasStrokeHoles.length === 0 && useHandicaps && (
                      <p className="text-xs text-gray-600 mt-0.5">No strokes (lowest hcp)</p>
                    )}
                    <Link href={`/score/${p.id}`} className="text-xs text-green-400 underline">Enter scores</Link>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Scramble scorecard */}
      {gameType === 'scramble' && (() => {
        const is2v2 = team1.length > 0 && team2.length > 0
        const teams = is2v2 ? [1, 2] : [1]
        const totalPar = holePars.reduce((a, b) => a + b, 0)
        const teamTotals = teams.map(t => ({
          team: t,
          total: Array.from({ length: 18 }, (_, i) => teamScores[`${t}-${i + 1}`] ?? 0).reduce((a, b) => a + b, 0),
          holes: Array.from({ length: 18 }, (_, i) => teamScores[`${t}-${i + 1}`]).filter(Boolean).length,
        }))
        const parPlayed = (h: number) => holePars.slice(0, h).reduce((a, b) => a + b, 0)
        const scrambleWinner = is2v2
          ? (teamTotals[0].total < teamTotals[1].total && teamTotals[0].holes > 0 ? 1
            : teamTotals[1].total < teamTotals[0].total && teamTotals[1].holes > 0 ? 2 : 0)
          : 0

        return (
          <div className="space-y-4">
            {is2v2 && (
              <div className="grid grid-cols-2 gap-3">
                {teamTotals.map(({ team, total, holes }) => {
                  const pp = parPlayed(holes)
                  const diff = total - pp
                  return (
                    <div key={team} className={`rounded-xl p-4 text-center ${scrambleWinner === team ? 'bg-green-900' : 'bg-gray-900'}`}>
                      <p className="text-xs text-gray-400 uppercase mb-1">Team {team}</p>
                      <p className="text-2xl font-bold">{total > 0 ? total : '—'}</p>
                      {holes > 0 && <p className={`text-sm font-semibold ${diff < 0 ? 'text-red-400' : diff === 0 ? 'text-gray-300' : 'text-blue-400'}`}>{diff === 0 ? 'E' : diff > 0 ? `+${diff}` : diff} · Thru {holes}</p>}
                    </div>
                  )
                })}
              </div>
            )}

            <div className="bg-gray-900 rounded-xl overflow-hidden">
              <div className={`grid px-4 py-2 text-xs text-gray-500 uppercase border-b border-gray-800 ${is2v2 ? 'grid-cols-[2.5rem_1fr_1fr]' : 'grid-cols-[2.5rem_1fr]'}`}>
                <span>Hole</span>
                {is2v2 ? <><span className="text-center">Team 1</span><span className="text-center">Team 2</span></> : <span className="text-center">Score</span>}
              </div>
              {Array.from({ length: 18 }, (_, i) => {
                const hole = i + 1
                const par = holePars[i] ?? 4
                return (
                  <div key={hole} className={`border-b border-gray-800 last:border-0 ${i === 8 ? 'border-b-2 border-green-900' : ''}`}>
                    <div className={`grid px-4 py-1 items-center text-xs text-gray-500 ${is2v2 ? 'grid-cols-[2.5rem_1fr_1fr]' : 'grid-cols-[2.5rem_1fr]'}`}>
                      <span className="font-bold text-gray-400">{hole}<span className="text-gray-600 ml-1">p{par}</span></span>
                      {teams.map(t => {
                        const key = `${t}-${hole}`
                        const current = teamScores[key]
                        const scoreOptions = Array.from({ length: 7 }, (_, j) => par - 1 + j).filter(s => s > 0)
                        return (
                          <div key={t} className="flex gap-1 justify-center py-1.5">
                            {scoreOptions.map(s => (
                              <button
                                key={s}
                                onClick={() => saveTeamScore(t, hole, s)}
                                disabled={savingTeamScore === key}
                                className={`w-8 h-8 rounded-lg text-xs font-bold transition ${
                                  current === s ? (s < par ? 'bg-red-600 text-white' : s === par ? 'bg-gray-500 text-white' : 'bg-blue-800 text-white')
                                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                }`}
                              >{s}</button>
                            ))}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            {is2v2 && scrambleWinner > 0 && (
              <div className="bg-green-900 rounded-xl px-4 py-3 text-center">
                <p className="text-green-300 font-bold">Team {scrambleWinner} wins! 🏆</p>
              </div>
            )}
          </div>
        )
      })()}

      {/* Stroke summary + adjustment */}
      {gameType === 'vegas' && useHandicaps && players.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm">Vegas Strokes</h3>
            <p className="text-xs text-gray-500">Tap +/− to adjust</p>
          </div>
          {(() => {
            const allP = [...team1, ...team2]
            const minHcp = allP.length > 0 ? Math.min(...allP.map(p => p.handicap_index)) : 0
            return allP.map(p => {
              const calculated = Math.max(0, Math.round(p.handicap_index - minHcp))
              const current = strokeOverrides[p.id] ?? (p.manual_strokes != null ? p.manual_strokes : calculated)
              return (
                <div key={p.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{p.name}</p>
                    <p className="text-xs text-gray-500">Hcp {p.handicap_index} · calculated {calculated}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        const next = Math.max(0, current - 1)
                        setStrokeOverrides(prev => ({ ...prev, [p.id]: next }))
                        await supabase.from('players').update({ manual_strokes: next }).eq('id', p.id)
                        setPlayers(prev => prev.map(x => x.id === p.id ? { ...x, manual_strokes: next } : x))
                      }}
                      className="w-8 h-8 rounded-lg bg-gray-700 font-bold text-lg flex items-center justify-center"
                    >−</button>
                    <span className="w-6 text-center font-bold text-lg">{current}</span>
                    <button
                      onClick={async () => {
                        const next = current + 1
                        setStrokeOverrides(prev => ({ ...prev, [p.id]: next }))
                        await supabase.from('players').update({ manual_strokes: next }).eq('id', p.id)
                        setPlayers(prev => prev.map(x => x.id === p.id ? { ...x, manual_strokes: next } : x))
                      }}
                      className="w-8 h-8 rounded-lg bg-gray-700 font-bold text-lg flex items-center justify-center"
                    >+</button>
                    {(strokeOverrides[p.id] != null || p.manual_strokes != null) && current !== calculated && (
                      <button
                        onClick={async () => {
                          setStrokeOverrides(prev => { const n = { ...prev }; delete n[p.id]; return n })
                          await supabase.from('players').update({ manual_strokes: null }).eq('id', p.id)
                          setPlayers(prev => prev.map(x => x.id === p.id ? { ...x, manual_strokes: null } : x))
                        }}
                        className="text-xs text-gray-500 underline"
                      >reset</button>
                    )}
                  </div>
                </div>
              )
            })
          })()}
        </div>
      )}

      {/* Vegas scoreboard */}
      {gameType === 'vegas' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-lg">Vegas (${stakes}/pt)</h3>
            <div className="text-sm">
              {vegasWinner > 0
                ? <span className="text-green-400 font-bold">Team {vegasWinner} +${Math.abs(t1VegasMoney - t2VegasMoney).toFixed(2)}</span>
                : <span className="text-gray-400">All Square</span>
              }
            </div>
          </div>

          <div className="bg-gray-900 rounded-xl overflow-hidden">
            <div className="grid grid-cols-[2.5rem_1fr_1fr_3rem] gap-2 px-4 py-2 text-xs text-gray-500 uppercase border-b border-gray-800">
              <span>Hole</span><span className="text-center">T1</span><span className="text-center">T2</span><span className="text-right">Pts</span>
            </div>
            {vegasRows.map((vh: any) => (
              <div key={vh.hole}>
                <button
                  onClick={() => setExpandedHole(expandedHole === vh.hole ? null : vh.hole)}
                  className={`w-full grid grid-cols-[2.5rem_1fr_1fr_3rem] gap-2 px-4 py-2 border-b border-gray-800 text-sm text-left transition ${vh.winner === 1 ? 'bg-blue-950' : vh.winner === 2 ? 'bg-red-950' : ''}`}
                >
                  <span className="text-gray-500 self-center">
                    {vh.hole}
                    {vh.events?.length > 0 && <span className="ml-1 text-yellow-400 text-xs">●</span>}
                  </span>
                  <span className={`text-center font-mono font-bold self-center ${vh.winner === 1 ? 'text-blue-300' : 'text-gray-400'}`}>{vh.t1Number}</span>
                  <span className={`text-center font-mono font-bold self-center ${vh.winner === 2 ? 'text-red-300' : 'text-gray-400'}`}>{vh.t2Number}</span>
                  <span className="text-right text-gray-300 self-center">{vh.points > 0 ? vh.points : '–'}</span>
                </button>
                {expandedHole === vh.hole && vh.events?.length > 0 && (
                  <div className="px-4 py-3 bg-gray-800 border-b border-gray-700 space-y-1">
                    {vh.events.map((e: string, i: number) => (
                      <p key={i} className="text-xs text-yellow-300">{e}</p>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {vegasRows.length === 0 && (
              <p className="text-center text-gray-500 py-6 text-sm">Vegas starts once both teams have scores</p>
            )}
          </div>
          {vegasRows.length > 0 && (
            <p className="text-xs text-gray-600 text-center mt-1">Tap a hole with ● to see what happened</p>
          )}
        </div>
      )}

      {/* Closest to the Pin */}
      {par3Holes.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-lg">Closest to the Pin</h3>
            <span className="text-sm text-gray-400">${ctpStakes}/hole</span>
          </div>
          <div className="bg-gray-900 rounded-xl overflow-hidden">
            <div className="grid grid-cols-[3rem_1fr_1fr] gap-2 px-4 py-2 text-xs text-gray-500 uppercase border-b border-gray-800">
              <span>Hole</span><span className="text-center">Team 1</span><span className="text-center">Team 2</span>
            </div>
            {par3Holes.map(hole => {
              const winner = ctpResults[hole]
              return (
                <div key={hole} className="grid grid-cols-[3rem_1fr_1fr] gap-2 px-4 py-3 border-b border-gray-800 last:border-0 items-center">
                  <span className="text-gray-400 text-sm font-bold">#{hole}</span>
                  <button
                    onClick={() => saveCtp(hole, 1)}
                    disabled={savingCtp === hole}
                    className={`mx-1 py-2 rounded-xl text-sm font-bold transition ${
                      winner === 1 ? 'bg-green-700 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    {winner === 1 ? '✓ T1 Wins' : 'T1'}
                  </button>
                  <button
                    onClick={() => saveCtp(hole, 2)}
                    disabled={savingCtp === hole}
                    className={`mx-1 py-2 rounded-xl text-sm font-bold transition ${
                      winner === 2 ? 'bg-green-700 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    {winner === 2 ? '✓ T2 Wins' : 'T2'}
                  </button>
                </div>
              )
            })}
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            {[{ wins: t1CtpWins, money: t1CtpMoney, n: 1 }, { wins: t2CtpWins, money: t2CtpMoney, n: 2 }].map(({ wins, money, n }) => (
              <div key={n} className="bg-gray-800 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-400">Team {n} CTP</p>
                <p className="text-xl font-bold">{wins} holes</p>
                <p className="text-green-400 text-sm font-semibold">${money.toFixed(2)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payout Summary */}
      <div>
        <h3 className="font-bold text-lg mb-3">Payout Summary</h3>
        <div className="bg-gray-900 rounded-xl overflow-hidden">
          <div className="grid grid-cols-3 px-4 py-2 text-xs text-gray-500 uppercase border-b border-gray-800">
            <span></span><span className="text-center">Team 1</span><span className="text-center">Team 2</span>
          </div>
          {gameType === 'vegas' && (
            <div className="grid grid-cols-3 px-4 py-3 border-b border-gray-800 text-sm">
              <span className="text-gray-400">Vegas</span>
              <span className={`text-center font-semibold ${vegasWinner === 1 ? 'text-green-400' : 'text-gray-300'}`}>${t1VegasMoney.toFixed(2)}</span>
              <span className={`text-center font-semibold ${vegasWinner === 2 ? 'text-green-400' : 'text-gray-300'}`}>${t2VegasMoney.toFixed(2)}</span>
            </div>
          )}
          {par3Holes.length > 0 && (
            <div className="grid grid-cols-3 px-4 py-3 border-b border-gray-800 text-sm">
              <span className="text-gray-400">CTP</span>
              <span className={`text-center font-semibold ${t1CtpMoney > t2CtpMoney ? 'text-green-400' : 'text-gray-300'}`}>${t1CtpMoney.toFixed(2)}</span>
              <span className={`text-center font-semibold ${t2CtpMoney > t1CtpMoney ? 'text-green-400' : 'text-gray-300'}`}>${t2CtpMoney.toFixed(2)}</span>
            </div>
          )}
          <div className="grid grid-cols-3 px-4 py-4 text-base font-bold">
            <span>Total</span>
            <span className={`text-center ${overallWinner === 1 ? 'text-green-400' : 'text-gray-200'}`}>${t1Total.toFixed(2)}</span>
            <span className={`text-center ${overallWinner === 2 ? 'text-green-400' : 'text-gray-200'}`}>${t2Total.toFixed(2)}</span>
          </div>
        </div>
        {overallWinner > 0 && (
          <div className="mt-3 bg-green-900 rounded-xl px-4 py-3 text-center">
            <p className="text-green-300 font-bold">Team {overallWinner} wins ${Math.abs(t1Total - t2Total).toFixed(2)} 💰</p>
          </div>
        )}
      </div>
    </div>
  )
}
