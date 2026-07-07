'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { strokesPerHole, DEFAULT_PARS, DEFAULT_HANDICAPS } from '@/lib/scoring'

function buildLeaderboard(players: any[], scores: any[], foursomes: any[], holePars: number[], holeHandicaps: number[]) {
  const foursomeMap = Object.fromEntries(foursomes.map((f: any) => [f.id, f]))
  return players
    .map((player: any) => {
      const playerScores = scores.filter((s: any) => s.player_id === player.id)
      const strokes = strokesPerHole(player.handicap_index, holeHandicaps)
      let gross = 0, net = 0
      for (const s of playerScores) {
        gross += s.gross_score
        net += s.gross_score - (strokes[s.hole_number] ?? 0)
      }
      const parPlayed = playerScores.reduce((sum: number, s: any) => sum + (holePars[s.hole_number - 1] ?? 4), 0)
      return {
        player,
        holesPlayed: playerScores.length,
        grossTotal: gross,
        netTotal: net,
        netVsPar: net - parPlayed,
        foursome: player.foursome_id ? foursomeMap[player.foursome_id] ?? null : null,
      }
    })
    .sort((a: any, b: any) => {
      if (a.holesPlayed === 0 && b.holesPlayed === 0) return 0
      if (a.holesPlayed === 0) return 1
      if (b.holesPlayed === 0) return -1
      return a.netVsPar - b.netVsPar
    })
}

function VsParBadge({ diff }: { diff: number }) {
  if (diff < 0) return <span className="text-red-400 font-bold">{diff}</span>
  if (diff === 0) return <span className="text-gray-300 font-bold">E</span>
  return <span className="text-blue-400 font-bold">+{diff}</span>
}

export default function LeaderboardPage() {
  const [rows, setRows] = useState<any[]>([])
  const [foursomes, setFoursomes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [round, setRound] = useState<any>(null)

  async function load() {
    const { data: rounds } = await supabase
      .from('rounds').select('*').order('created_at', { ascending: false }).limit(1)
    if (!rounds?.length) { setLoading(false); return }
    const r = rounds[0]
    setRound(r)

    const holePars      = r.hole_pars      ?? DEFAULT_PARS
    const holeHandicaps = r.hole_handicaps ?? DEFAULT_HANDICAPS

    const [{ data: players }, { data: scores }, { data: fs }] = await Promise.all([
      supabase.from('players').select('*').eq('round_id', r.id),
      supabase.from('scores').select('*'),
      supabase.from('foursomes').select('*').eq('round_id', r.id),
    ])

    setFoursomes(fs ?? [])
    setRows(buildLeaderboard(players ?? [], scores ?? [], fs ?? [], holePars, holeHandicaps))
    setLoading(false)
  }

  useEffect(() => {
    load()
    const channel = supabase
      .channel('leaderboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, load)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  if (loading) return <p className="text-center text-gray-400 mt-12">Loading...</p>
  if (!round) return (
    <div className="text-center mt-16 space-y-4">
      <p className="text-gray-400">No round yet.</p>
      <Link href="/setup" className="bg-green-700 px-6 py-3 rounded-lg font-semibold inline-block">Go to Setup</Link>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Leaderboard</h2>
          <p className="text-xs text-gray-500">
            {round.round_name} · {round.game_type} · ${round.stakes}/pt
          </p>
        </div>
        <Link href="/setup" className="text-xs text-green-400 underline">Setup</Link>
      </div>

      <div className="bg-gray-900 rounded-xl overflow-hidden">
        <div className="grid grid-cols-[2rem_1fr_3rem_3rem_3rem] gap-x-2 px-4 py-2 text-xs text-gray-500 uppercase tracking-wide border-b border-gray-800">
          <span>#</span><span>Player</span>
          <span className="text-right">Thru</span>
          <span className="text-right">Net</span>
          <span className="text-right">+/-</span>
        </div>
        {rows.map((row: any, i: number) => (
          <div key={row.player.id} className={`grid grid-cols-[2rem_1fr_3rem_3rem_3rem] gap-x-2 px-4 py-3 border-b border-gray-800 last:border-0 ${i === 0 && row.holesPlayed > 0 ? 'bg-yellow-950' : ''}`}>
            <span className="text-gray-500 text-sm self-center">{row.holesPlayed > 0 ? i + 1 : '-'}</span>
            <div className="self-center">
              <p className="font-semibold text-sm">{row.player.name}</p>
              <p className="text-xs text-gray-500">Grp {row.foursome?.group_number ?? '?'} · Hcp {row.player.handicap_index}</p>
            </div>
            <span className="text-right text-sm self-center text-gray-400">
              {row.holesPlayed === 18 ? 'F' : row.holesPlayed === 0 ? '-' : row.holesPlayed}
            </span>
            <span className="text-right text-sm self-center">{row.holesPlayed > 0 ? row.netTotal : '-'}</span>
            <span className="text-right self-center text-sm">
              {row.holesPlayed > 0 ? <VsParBadge diff={row.netVsPar} /> : '-'}
            </span>
          </div>
        ))}
      </div>

      <h2 className="text-lg font-bold">Foursomes</h2>
      <div className={`grid gap-3 ${foursomes.length <= 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {foursomes.map((f: any) => (
          <Link key={f.id} href={`/foursome/${f.id}`} className="bg-gray-900 rounded-xl p-4 text-center hover:bg-gray-800 transition">
            <p className="font-bold text-green-400">Group {f.group_number}</p>
            <p className="text-xs text-gray-400 mt-1">{round.game_type === 'vegas' ? 'Vegas' : round.game_type}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
