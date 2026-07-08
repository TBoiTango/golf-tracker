'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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
        grossVsPar: gross - parPlayed,
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
  const router = useRouter()
  const [rows, setRows] = useState<any[]>([])
  const [foursomes, setFoursomes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [round, setRound] = useState<any>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [players, setPlayers] = useState<any[]>([])
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null)
  const [showNet, setShowNet] = useState(false)

  // Registration fields
  const [newName, setNewName] = useState('')
  const [newHandicap, setNewHandicap] = useState('0')
  const [newGroup, setNewGroup] = useState('')
  const [newTeam, setNewTeam] = useState('1')
  const [newGameType, setNewGameType] = useState('vegas')
  const [newStakes, setNewStakes] = useState('1')
  const [newCtpStakes, setNewCtpStakes] = useState('1')
  const [registering, setRegistering] = useState(false)
  const [regError, setRegError] = useState('')

  useEffect(() => {
    const saved = localStorage.getItem('golf_player_id')
    if (saved) setMyPlayerId(saved)
  }, [])

  async function load() {
    const { data: rounds } = await supabase
      .from('rounds').select('*').order('created_at', { ascending: false })
    if (!rounds?.length) { setLoading(false); return }
    // Prefer the active round; fall back to most recently created
    const r = rounds.find((x: any) => x.status === 'active') ?? rounds[0]
    setRound(r)

    const holePars      = r.hole_pars      ?? DEFAULT_PARS
    const holeHandicaps = r.hole_handicaps ?? DEFAULT_HANDICAPS

    const [{ data: ps }, { data: fs }] = await Promise.all([
      supabase.from('players').select('*').eq('round_id', r.id),
      supabase.from('foursomes').select('*').eq('round_id', r.id),
    ])
    const playerIds = (ps ?? []).map((p: any) => p.id)
    const { data: scores } = playerIds.length
      ? await supabase.from('scores').select('*').in('player_id', playerIds)
      : { data: [] }

    setPlayers(ps ?? [])
    setFoursomes(fs ?? [])
    setRows(buildLeaderboard(ps ?? [], scores ?? [], fs ?? [], holePars, holeHandicaps))
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

  // When group selection changes, sync defaults from that group's settings
  useEffect(() => {
    if (!newGroup || !round) return
    const f = foursomes.find(f => f.group_number === parseInt(newGroup))
    if (!f) return
    setNewGameType(f.game_type ?? round.game_type ?? 'vegas')
    setNewStakes(String(f.stakes ?? round.stakes ?? 1))
    setNewCtpStakes(String(f.ctp_stakes ?? 1))
    // Auto-select team if one is already full
    const groupPlayers = players.filter(p => p.foursome_id === f.id)
    const t1 = groupPlayers.filter(p => p.vegas_team === 1).length
    const t2 = groupPlayers.filter(p => p.vegas_team === 2).length
    if (t1 >= 2 && t2 < 2) setNewTeam('2')
    else if (t2 >= 2 && t1 < 2) setNewTeam('1')
  }, [newGroup, foursomes, players])

  function pickPlayer(player: any) {
    localStorage.setItem('golf_player_id', player.id)
    router.push(`/score/${player.id}`)
  }

  async function registerPlayer() {
    if (!newName.trim() || !round || !newGroup) return
    setRegError('')

    const selectedFoursome = foursomes.find(f => f.group_number === parseInt(newGroup))
    if (!selectedFoursome) return

    const groupPlayers = players.filter(p => p.foursome_id === selectedFoursome.id)
    const t1Count = groupPlayers.filter(p => p.vegas_team === 1).length
    const t2Count = groupPlayers.filter(p => p.vegas_team === 2).length

    // Capacity check
    if (groupPlayers.length >= 4) {
      setRegError('This group is full (4 players max). See admin to join.')
      return
    }

    // Team balance check
    const teamNum = parseInt(newTeam)
    if (teamNum === 1 && t1Count >= 2) {
      setRegError('Team 1 is full in this group. Choose Team 2.')
      return
    }
    if (teamNum === 2 && t2Count >= 2) {
      setRegError('Team 2 is full in this group. Choose Team 1.')
      return
    }

    setRegistering(true)

    // If first player in group, set the group's game settings
    const isFirstInGroup = groupPlayers.length === 0
    if (isFirstInGroup) {
      await supabase.from('foursomes').update({
        game_type: newGameType,
        stakes: parseFloat(newStakes) || 1,
        ctp_stakes: parseFloat(newCtpStakes) || 1,
      }).eq('id', selectedFoursome.id)
    }

    await supabase.from('roster').upsert(
      { name: newName.trim(), default_handicap: parseFloat(newHandicap) || 0 },
      { onConflict: 'name' }
    )
    const { data: p } = await supabase.from('players').insert({
      round_id: round.id,
      name: newName.trim(),
      handicap_index: parseFloat(newHandicap) || 0,
      foursome_id: selectedFoursome.id,
      vegas_team: teamNum,
    }).select().single()

    setRegistering(false)
    if (p) pickPlayer(p)
  }

  if (loading) return <p className="text-center text-gray-400 mt-12">Loading...</p>

  if (!round) return (
    <div className="text-center mt-16 space-y-4">
      <p className="text-gray-400">No round yet.</p>
      <Link href="/setup" className="bg-green-700 px-6 py-3 rounded-lg font-semibold inline-block">Go to Setup</Link>
    </div>
  )

  // Name picker / registration
  if (showPicker) {
    // Compute stats per foursome for the UI
    const foursomeStats = foursomes.reduce((acc, f) => {
      const gp = players.filter(p => p.foursome_id === f.id)
      acc[f.id] = {
        playerCount: gp.length,
        team1Count: gp.filter(p => p.vegas_team === 1).length,
        team2Count: gp.filter(p => p.vegas_team === 2).length,
        gameType: f.game_type,
        isFull: gp.length >= 4,
      }
      return acc
    }, {} as Record<string, any>)

    const selectedFoursome = foursomes.find(f => f.group_number === parseInt(newGroup))
    const selectedStats = selectedFoursome ? foursomeStats[selectedFoursome.id] : null
    const isFirstInGroup = selectedStats?.playerCount === 0
    const groupFull = selectedStats?.isFull
    const team1Full = (selectedStats?.team1Count ?? 0) >= 2
    const team2Full = (selectedStats?.team2Count ?? 0) >= 2
    const lockedGameType = selectedFoursome?.game_type

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setShowPicker(false)} className="text-gray-400 text-sm">← Back</button>
          <h2 className="text-xl font-bold">Who are you?</h2>
        </div>
        <p className="text-gray-400 text-sm">Tap your name to go to your score card.</p>

        <div className="space-y-2">
          {players
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((p: any) => (
              <button
                key={p.id}
                onClick={() => pickPlayer(p)}
                className="w-full bg-gray-900 hover:bg-green-900 rounded-xl px-4 py-4 text-left font-semibold transition"
              >
                {p.name}
                <span className="text-gray-500 text-sm ml-2">Hcp {p.handicap_index}</span>
              </button>
            ))}
        </div>

        {/* Self-registration */}
        <div className="border-t border-gray-800 pt-4 space-y-3">
          <p className="text-sm font-semibold text-gray-400">Don't see your name?</p>

          <input
            type="text"
            placeholder="Your name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="w-full bg-gray-800 rounded-lg px-4 py-3 text-white"
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Handicap Index</label>
              <input
                type="number" min="0" max="54" step="0.1" placeholder="0"
                value={newHandicap}
                onChange={e => setNewHandicap(e.target.value)}
                className="w-full bg-gray-800 rounded-lg px-3 py-3 text-white"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Group</label>
              <select
                value={newGroup}
                onChange={e => setNewGroup(e.target.value)}
                className="w-full bg-gray-800 rounded-lg px-3 py-3 text-white"
              >
                <option value="">Select...</option>
                {foursomes.map((f: any) => {
                  const s = foursomeStats[f.id]
                  return (
                    <option key={f.id} value={f.group_number} disabled={s?.isFull}>
                      Group {f.group_number} ({s?.playerCount ?? 0}/4){s?.isFull ? ' — FULL' : ''}
                    </option>
                  )
                })}
              </select>
            </div>
          </div>

          {groupFull && (
            <div className="bg-red-900 text-red-300 rounded-lg px-4 py-3 text-sm">
              ⛔ This group is full. See admin to be added.
            </div>
          )}

          {selectedFoursome && !groupFull && (
            <>
              {/* Vegas team selector */}
              {(lockedGameType === 'vegas' || (!lockedGameType && newGameType === 'vegas')) && (
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Vegas Team</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[1, 2].map(t => {
                      const isFull = t === 1 ? team1Full : team2Full
                      const count = t === 1 ? selectedStats?.team1Count : selectedStats?.team2Count
                      return (
                        <button
                          key={t}
                          disabled={isFull}
                          onClick={() => setNewTeam(String(t))}
                          className={`py-3 rounded-xl font-bold text-sm transition ${
                            newTeam === String(t) && !isFull
                              ? 'bg-green-700 text-white'
                              : isFull
                              ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                              : 'bg-gray-800 text-gray-300'
                          }`}
                        >
                          Team {t} ({count ?? 0}/2){isFull ? ' — FULL' : ''}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Game type — locked if already set by first player */}
              <div>
                <label className="text-xs text-gray-500 block mb-1">Game</label>
                {lockedGameType ? (
                  <div className="bg-gray-800 rounded-lg px-4 py-3 text-sm text-gray-300">
                    {lockedGameType === 'vegas' ? '🎰 Vegas' : lockedGameType === 'stroke' ? '🏌️ Stroke Play' : '⛳ None'} — set by your group
                  </div>
                ) : (
                  <select
                    value={newGameType}
                    onChange={e => setNewGameType(e.target.value)}
                    className="w-full bg-gray-800 rounded-lg px-3 py-3 text-white"
                  >
                    <option value="vegas">🎰 Vegas</option>
                    <option value="stroke">🏌️ Stroke Play</option>
                    <option value="none">⛳ No side game</option>
                  </select>
                )}
                {isFirstInGroup && (
                  <p className="text-xs text-yellow-500 mt-1">You're first in this group — your selection sets the game.</p>
                )}
              </div>

              {/* Stakes — only shown to first player */}
              {isFirstInGroup && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">$ Per Point</label>
                    <input
                      type="number" step="0.5" min="0"
                      value={newStakes}
                      onChange={e => setNewStakes(e.target.value)}
                      className="w-full bg-gray-800 rounded-lg px-3 py-3 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">$ CTP Per Hole</label>
                    <input
                      type="number" step="0.5" min="0"
                      value={newCtpStakes}
                      onChange={e => setNewCtpStakes(e.target.value)}
                      className="w-full bg-gray-800 rounded-lg px-3 py-3 text-white"
                    />
                  </div>
                </div>
              )}

              {!isFirstInGroup && (
                <div className="bg-gray-800 rounded-lg px-4 py-3 text-sm space-y-1">
                  <p className="text-gray-300 font-semibold">
                    {lockedGameType === 'vegas' ? '🎰 Vegas' : lockedGameType === 'stroke' ? '🏌️ Stroke Play' : '⛳ No side game'}
                  </p>
                  <p className="text-gray-400 text-xs">
                    ${selectedFoursome?.stakes ?? round?.stakes ?? 1}/pt Vegas · ${selectedFoursome?.ctp_stakes ?? 1}/hole CTP
                  </p>
                </div>
              )}
            </>
          )}

          {regError && (
            <div className="bg-red-900 text-red-300 rounded-lg px-4 py-3 text-sm">⚠️ {regError}</div>
          )}

          <button
            onClick={registerPlayer}
            disabled={!newName.trim() || !newGroup || registering || groupFull}
            className="w-full bg-green-700 rounded-xl py-3 font-bold disabled:opacity-50"
          >
            {registering ? 'Adding...' : "I'm In — Add Me"}
          </button>
          <p className="text-xs text-gray-600">You'll be added to the round and taken to your score card.</p>
        </div>
      </div>
    )
  }

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

      {/* Round banner */}
      <div className="bg-gray-900 rounded-xl px-4 py-3 flex items-center justify-between">
        <div>
          <p className="font-semibold text-sm">{round.round_name}</p>
          <p className="text-xs text-gray-500">{round.date ? new Date(round.date).toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' }) : ''}</p>
        </div>
        <span className={`text-xs px-3 py-1 rounded-full font-semibold ${round.status === 'active' ? 'bg-green-800 text-green-300' : 'bg-gray-700 text-gray-400'}`}>
          {round.status === 'active' ? '🟢 Live' : '⚙️ Setup'}
        </span>
      </div>

      <button
        onClick={() => {
          if (myPlayerId && players.find(p => p.id === myPlayerId)) {
            router.push(`/score/${myPlayerId}`)
          } else {
            setShowPicker(true)
          }
        }}
        className="w-full bg-green-700 rounded-xl py-4 font-bold text-lg"
      >
        {myPlayerId && players.find(p => p.id === myPlayerId)
          ? `Enter My Scores (${players.find(p => p.id === myPlayerId)?.name})`
          : 'Enter My Scores'}
      </button>

      {myPlayerId && players.find(p => p.id === myPlayerId) && (
        <button onClick={() => setShowPicker(true)} className="text-xs text-gray-500 underline w-full text-center -mt-3">
          Not you? Switch player
        </button>
      )}

      {/* Net / Gross toggle */}
      <div className="flex items-center justify-between -mb-2">
        <span className="text-sm text-gray-400">Standings</span>
        <div className="flex bg-gray-800 rounded-lg p-0.5 text-xs font-semibold">
          <button
            onClick={() => setShowNet(false)}
            className={`px-3 py-1.5 rounded-md transition ${!showNet ? 'bg-green-700 text-white' : 'text-gray-400'}`}
          >Gross</button>
          <button
            onClick={() => setShowNet(true)}
            className={`px-3 py-1.5 rounded-md transition ${showNet ? 'bg-green-700 text-white' : 'text-gray-400'}`}
          >Net</button>
        </div>
      </div>

      <div className="bg-gray-900 rounded-xl overflow-hidden">
        <div className="grid grid-cols-[2rem_1fr_3rem_3rem_3rem] gap-x-2 px-4 py-2 text-xs text-gray-500 uppercase tracking-wide border-b border-gray-800">
          <span>#</span><span>Player</span>
          <span className="text-right">Thru</span>
          <span className="text-right">{showNet ? 'Net' : 'Gross'}</span>
          <span className="text-right">+/-</span>
        </div>
        {[...rows]
          .sort((a, b) => {
            if (a.holesPlayed === 0 && b.holesPlayed === 0) return 0
            if (a.holesPlayed === 0) return 1
            if (b.holesPlayed === 0) return -1
            return showNet ? a.netVsPar - b.netVsPar : a.grossTotal - b.grossTotal
          })
          .map((row: any, i: number) => (
          <div
            key={row.player.id}
            className={`grid grid-cols-[2rem_1fr_3rem_3rem_3rem] gap-x-2 px-4 py-3 border-b border-gray-800 last:border-0 ${i === 0 && row.holesPlayed > 0 ? 'bg-yellow-950' : ''} ${row.player.id === myPlayerId ? 'ring-1 ring-inset ring-green-700' : ''}`}
          >
            <span className="text-gray-500 text-sm self-center">{row.holesPlayed > 0 ? i + 1 : '-'}</span>
            <div className="self-center">
              <p className="font-semibold text-sm">{row.player.name} {row.player.id === myPlayerId ? '👤' : ''}</p>
              <p className="text-xs text-gray-500">Grp {row.foursome?.group_number ?? '?'} · Hcp {row.player.handicap_index}</p>
            </div>
            <span className="text-right text-sm self-center text-gray-400">
              {row.holesPlayed === 18 ? 'F' : row.holesPlayed === 0 ? '-' : row.holesPlayed}
            </span>
            <span className="text-right text-sm self-center">{row.holesPlayed > 0 ? (showNet ? row.netTotal : row.grossTotal) : '-'}</span>
            <span className="text-right self-center text-sm">
              {row.holesPlayed > 0 ? <VsParBadge diff={showNet ? row.netVsPar : row.grossVsPar} /> : '-'}
            </span>
          </div>
        ))}
      </div>

      <h2 className="text-lg font-bold">Foursomes</h2>
      <div className={`grid gap-3 ${foursomes.length <= 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {[...foursomes].sort((a, b) => a.group_number - b.group_number).map((f: any) => (
          <Link key={f.id} href={`/foursome/${f.id}`} className="bg-gray-900 rounded-xl p-4 text-center hover:bg-gray-800 transition">
            <p className="font-bold text-green-400">Group {f.group_number}</p>
            <p className="text-xs text-gray-400 mt-1">{f.game_type ?? round.game_type ?? 'vegas'}</p>
            <p className="text-xs text-gray-600 mt-0.5">
              {players.filter(p => p.foursome_id === f.id).length}/4
            </p>
          </Link>
        ))}
      </div>
    </div>
  )
}
