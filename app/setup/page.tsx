'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Player, Foursome } from '@/types/database'

const PLAYER_NAMES = [
  'David','Colin','Daegwon','Forrest','Joel','Judd',
  'Tosh','Matt','Stevie','Tarek','Kevin','Chris',
]

export default function SetupPage() {
  const [password, setPassword] = useState('')
  const [authed, setAuthed] = useState(false)
  const [players, setPlayers] = useState<Player[]>([])
  const [foursomes, setFoursomes] = useState<Foursome[]>([])
  const [roundId, setRoundId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')

  async function loadRound() {
    const { data: rounds } = await supabase
      .from('rounds').select('*').order('created_at', { ascending: false }).limit(1)
    if (!rounds?.length) return
    const round = rounds[0] as { id: string }
    setRoundId(round.id)
    const [{ data: p }, { data: f }] = await Promise.all([
      supabase.from('players').select('*').eq('round_id', round.id).order('name'),
      supabase.from('foursomes').select('*').eq('round_id', round.id).order('group_number'),
    ])
    setPlayers((p ?? []) as Player[])
    setFoursomes((f ?? []) as Foursome[])
  }

  useEffect(() => { loadRound() }, [])

  async function initRound() {
    setSaving(true)
    const { data: round, error: re } = await supabase
      .from('rounds').insert({ date: '2026-07-11', status: 'setup' }).select().single()
    if (re || !round) { setStatus('Error creating round'); setSaving(false); return }

    const fsInserts = [1, 2, 3].map(g => ({ round_id: round.id, group_number: g }))
    const { data: fs } = await supabase.from('foursomes').insert(fsInserts).select()

    const playerInserts = PLAYER_NAMES.map(name => ({ round_id: round.id, name, handicap_index: 0 }))
    await supabase.from('players').insert(playerInserts)

    setRoundId(round.id)
    setFoursomes((fs ?? []) as Foursome[])
    await loadRound()
    setSaving(false)
    setStatus('Round initialized!')
  }

  async function savePlayer(playerId: string, updates: Partial<Pick<Player, 'handicap_index' | 'foursome_id' | 'vegas_team'>>) {
    await supabase.from('players').update(updates).eq('id', playerId)
    setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, ...updates } : p))
  }

  async function startRound() {
    if (!roundId) return
    await supabase.from('rounds').update({ status: 'active' }).eq('id', roundId)
    setStatus('Round is LIVE!')
  }

  if (!authed) return (
    <div className="max-w-sm mx-auto mt-20 space-y-4">
      <h2 className="text-xl font-bold text-center">Admin Setup</h2>
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        className="w-full bg-gray-800 rounded-lg px-4 py-3 text-white"
      />
      <button
        onClick={() => setAuthed(password === (process.env.NEXT_PUBLIC_SETUP_PASSWORD ?? 'golf2026'))}
        className="w-full bg-green-700 rounded-lg py-3 font-semibold"
      >
        Enter
      </button>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Round Setup</h2>
        {status && <span className="text-green-400 text-sm">{status}</span>}
      </div>

      {!roundId ? (
        <button
          onClick={initRound}
          disabled={saving}
          className="w-full bg-green-700 rounded-xl py-4 font-bold text-lg disabled:opacity-50"
        >
          {saving ? 'Initializing...' : 'Initialize July 11 Round'}
        </button>
      ) : (
        <>
          <button
            onClick={startRound}
            className="w-full bg-yellow-600 rounded-xl py-3 font-bold"
          >
            Start Round (Go Live)
          </button>

          <p className="text-gray-400 text-sm">
            Share player links: <code className="text-green-400">/score/[player-id]</code>
          </p>

          <div className="space-y-3">
            {players.map(player => (
              <div key={player.id} className="bg-gray-900 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-bold">{player.name}</p>
                  <a
                    href={`/score/${player.id}`}
                    target="_blank"
                    className="text-xs text-green-400 underline"
                  >
                    Score link
                  </a>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Handicap</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="54"
                      defaultValue={player.handicap_index}
                      onBlur={e => savePlayer(player.id, { handicap_index: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-gray-800 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Group</label>
                    <select
                      value={player.foursome_id ?? ''}
                      onChange={e => savePlayer(player.id, { foursome_id: e.target.value || null })}
                      className="w-full bg-gray-800 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">--</option>
                      {foursomes.map(f => (
                        <option key={f.id} value={f.id}>Group {f.group_number}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Vegas Team</label>
                    <select
                      value={player.vegas_team ?? ''}
                      onChange={e => savePlayer(player.id, { vegas_team: parseInt(e.target.value) || null })}
                      className="w-full bg-gray-800 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">--</option>
                      <option value="1">Team 1</option>
                      <option value="2">Team 2</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
