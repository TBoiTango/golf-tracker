'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { DEFAULT_PARS, DEFAULT_HANDICAPS } from '@/lib/scoring'

type Tab = 'round' | 'players' | 'course' | 'history'

export default function SetupPage() {
  const [authed, setAuthed]       = useState(false)
  const [password, setPassword]   = useState('')
  const [tab, setTab]             = useState<Tab>('round')
  const [msg, setMsg]             = useState('')

  // Data
  const [round, setRound]         = useState<any>(null)
  const [roster, setRoster]       = useState<any[]>([])
  const [players, setPlayers]     = useState<any[]>([])
  const [foursomes, setFoursomes] = useState<any[]>([])
  const [allRounds, setAllRounds] = useState<any[]>([])

  // Round form
  const [roundName, setRoundName] = useState('Tierra Rejada')
  const [roundDate, setRoundDate] = useState(new Date().toISOString().split('T')[0])
  const [gameType, setGameType]   = useState('vegas')
  const [stakes, setStakes]       = useState('1')
  const [numGroups, setNumGroups] = useState(3)

  // Course editor
  const [holePars, setHolePars]           = useState([...DEFAULT_PARS])
  const [holeHandicaps, setHoleHandicaps] = useState([...DEFAULT_HANDICAPS])

  // Roster
  const [newName, setNewName] = useState('')

  function flash(m: string) { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  async function loadAll() {
    const [{ data: rs }, { data: rosterData }] = await Promise.all([
      supabase.from('rounds').select('*').order('created_at', { ascending: false }),
      supabase.from('roster').select('*').order('name'),
    ])
    setAllRounds(rs ?? [])
    setRoster(rosterData ?? [])
    const active = (rs ?? []).find((r: any) => r.status !== 'completed') ?? (rs ?? [])[0]
    if (active) {
      setRound(active)
      setRoundName(active.round_name ?? 'Tierra Rejada')
      setGameType(active.game_type ?? 'vegas')
      setStakes(String(active.stakes ?? 1))
      if (active.hole_pars)      setHolePars(active.hole_pars)
      if (active.hole_handicaps) setHoleHandicaps(active.hole_handicaps)
      await loadRoundData(active.id)
    }
  }

  async function loadRoundData(roundId: string) {
    const [{ data: p }, { data: f }] = await Promise.all([
      supabase.from('players').select('*').eq('round_id', roundId).order('name'),
      supabase.from('foursomes').select('*').eq('round_id', roundId).order('group_number'),
    ])
    setPlayers(p ?? [])
    setFoursomes(f ?? [])
  }

  useEffect(() => { if (authed) loadAll() }, [authed])

  async function createRound() {
    const { data: r, error } = await supabase.from('rounds').insert({
      round_name: roundName, date: roundDate, game_type: gameType,
      stakes: parseFloat(stakes) || 1, num_groups: numGroups,
      hole_pars: holePars, hole_handicaps: holeHandicaps, status: 'setup',
    }).select().single()
    if (error || !r) { flash('Error creating round'); return }
    await supabase.from('foursomes').insert(
      Array.from({ length: numGroups }, (_, i) => ({ round_id: r.id, group_number: i + 1 }))
    )
    setRound(r)
    flash('Round created!')
    await loadRoundData(r.id)
    await loadAll()
  }

  async function updateSettings() {
    if (!round) return
    await supabase.from('rounds').update({
      round_name: roundName, game_type: gameType, stakes: parseFloat(stakes) || 1,
    }).eq('id', round.id)
    flash('Settings saved!')
    await loadAll()
  }

  async function saveCourse() {
    if (!round) return
    await supabase.from('rounds').update({ hole_pars: holePars, hole_handicaps: holeHandicaps }).eq('id', round.id)
    flash('Course saved!')
  }

  async function startRound() {
    if (!round) return
    await supabase.from('rounds').update({ status: 'active' }).eq('id', round.id)
    setRound({ ...round, status: 'active' })
    flash('Round is LIVE!')
  }

  async function resetScores() {
    if (!round || !confirm('Clear all scores for this round?')) return
    const ids = players.map(p => p.id)
    if (ids.length) await supabase.from('scores').delete().in('player_id', ids)
    flash('Scores cleared!')
  }

  async function deleteRound(id: string) {
    if (!confirm('Delete this round and all its data?')) return
    await supabase.from('rounds').delete().eq('id', id)
    if (round?.id === id) { setRound(null); setPlayers([]); setFoursomes([]) }
    await loadAll()
    flash('Round deleted')
  }

  async function addToRoster() {
    if (!newName.trim()) return
    await supabase.from('roster').insert({ name: newName.trim() })
    setNewName('')
    await loadAll()
  }

  async function removeFromRoster(id: string) {
    if (!confirm('Remove from roster?')) return
    await supabase.from('roster').delete().eq('id', id)
    await loadAll()
  }

  async function togglePlayer(rp: any, include: boolean) {
    if (!round) return
    if (include) {
      await supabase.from('players').insert({ round_id: round.id, name: rp.name, handicap_index: rp.default_handicap ?? 0 })
    } else {
      await supabase.from('players').delete().eq('round_id', round.id).eq('name', rp.name)
    }
    await loadRoundData(round.id)
  }

  async function savePlayer(playerId: string, updates: any) {
    await supabase.from('players').update(updates).eq('id', playerId)
    setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, ...updates } : p))
    if (updates.handicap_index !== undefined) {
      const p = players.find(p => p.id === playerId)
      if (p) await supabase.from('roster').update({ default_handicap: updates.handicap_index }).eq('name', p.name)
    }
  }

  if (!authed) return (
    <div className="max-w-sm mx-auto mt-20 space-y-4">
      <h2 className="text-xl font-bold text-center">Admin Setup</h2>
      <input type="password" placeholder="Password" value={password}
        onChange={e => setPassword(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && setAuthed(password === (process.env.NEXT_PUBLIC_SETUP_PASSWORD ?? 'golf2026'))}
        className="w-full bg-gray-800 rounded-lg px-4 py-3 text-white"
      />
      <button onClick={() => setAuthed(password === (process.env.NEXT_PUBLIC_SETUP_PASSWORD ?? 'golf2026'))}
        className="w-full bg-green-700 rounded-lg py-3 font-semibold">Enter</button>
    </div>
  )

  const TABS: { key: Tab; label: string }[] = [
    { key: 'round', label: 'Round' }, { key: 'players', label: 'Players' },
    { key: 'course', label: 'Course' }, { key: 'history', label: 'History' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex border-b border-gray-800">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 py-3 text-sm font-semibold transition ${tab === t.key ? 'text-green-400 border-b-2 border-green-400' : 'text-gray-500'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {msg && (
        <div className="bg-green-900 text-green-300 px-4 py-2 rounded-lg text-sm flex justify-between">
          <span>{msg}</span><button onClick={() => setMsg('')}>×</button>
        </div>
      )}

      {/* ROUND TAB */}
      {tab === 'round' && (
        <div className="space-y-4">
          <div className="bg-gray-900 rounded-xl p-4 space-y-3">
            <h3 className="font-bold">{round ? 'Round Settings' : 'Create New Round'}</h3>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Round Name</label>
              <input type="text" value={roundName} onChange={e => setRoundName(e.target.value)}
                className="w-full bg-gray-800 rounded-lg px-3 py-2 text-sm" />
            </div>
            {!round && (
              <div>
                <label className="text-xs text-gray-500 block mb-1">Date</label>
                <input type="date" value={roundDate} onChange={e => setRoundDate(e.target.value)}
                  className="w-full bg-gray-800 rounded-lg px-3 py-2 text-sm" />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Game Type</label>
                <select value={gameType} onChange={e => setGameType(e.target.value)}
                  className="w-full bg-gray-800 rounded-lg px-3 py-2 text-sm">
                  <option value="vegas">Vegas</option>
                  <option value="skins">Skins</option>
                  <option value="stroke">Stroke Play</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">$ Per Point</label>
                <input type="number" step="0.5" min="0" value={stakes} onChange={e => setStakes(e.target.value)}
                  className="w-full bg-gray-800 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            {!round && (
              <div>
                <label className="text-xs text-gray-500 block mb-1">Number of Groups</label>
                <div className="flex gap-2">
                  {[2,3,4,5,6].map(n => (
                    <button key={n} onClick={() => setNumGroups(n)}
                      className={`flex-1 py-2 rounded-lg text-sm font-bold ${numGroups === n ? 'bg-green-700' : 'bg-gray-800'}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {!round
              ? <button onClick={createRound} className="w-full bg-green-700 rounded-xl py-3 font-bold">Create Round</button>
              : <button onClick={updateSettings} className="w-full bg-blue-700 rounded-xl py-3 font-bold">Save Settings</button>
            }
          </div>

          {round && (
            <div className="space-y-2">
              <div className={`rounded-xl px-4 py-3 text-sm font-semibold ${round.status === 'active' ? 'bg-green-800 text-green-300' : 'bg-gray-800 text-gray-400'}`}>
                Status: {round.status === 'active' ? '🟢 LIVE' : round.status === 'setup' ? '⚙️ Setup' : '✅ Completed'}
              </div>
              {round.status === 'setup' && (
                <button onClick={startRound} className="w-full bg-yellow-600 rounded-xl py-3 font-bold">Start Round (Go Live)</button>
              )}
              <button onClick={resetScores} className="w-full bg-orange-800 rounded-xl py-3 font-bold">Reset All Scores</button>
              <button onClick={() => deleteRound(round.id)} className="w-full bg-red-900 rounded-xl py-3 font-bold">Delete Round</button>
            </div>
          )}
        </div>
      )}

      {/* PLAYERS TAB */}
      {tab === 'players' && (
        <div className="space-y-3">
          {!round && <p className="text-gray-400 text-sm text-center py-4">Create a round first</p>}
          <div className="flex gap-2">
            <input type="text" placeholder="Add player to roster" value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addToRoster()}
              className="flex-1 bg-gray-800 rounded-lg px-3 py-2 text-sm" />
            <button onClick={addToRoster} className="bg-green-700 px-4 rounded-lg text-sm font-bold">Add</button>
          </div>

          {roster.map(rp => {
            const inRound = players.find(p => p.name === rp.name)
            return (
              <div key={rp.id} className="bg-gray-900 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {round && (
                      <input type="checkbox" checked={!!inRound}
                        onChange={e => togglePlayer(rp, e.target.checked)}
                        className="w-5 h-5 accent-green-500" />
                    )}
                    <p className="font-bold">{rp.name}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {inRound && (
                      <a href={`/score/${inRound.id}`} target="_blank" className="text-xs text-green-400 underline">Score link</a>
                    )}
                    <button onClick={() => removeFromRoster(rp.id)} className="text-xs text-red-400">Remove</button>
                  </div>
                </div>

                {inRound && round && (
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Handicap</label>
                      <input type="number" step="0.1" min="0" max="54" defaultValue={inRound.handicap_index}
                        onBlur={e => savePlayer(inRound.id, { handicap_index: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-gray-800 rounded-lg px-2 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Group</label>
                      <select value={inRound.foursome_id ?? ''}
                        onChange={e => savePlayer(inRound.id, { foursome_id: e.target.value || null })}
                        className="w-full bg-gray-800 rounded-lg px-2 py-2 text-sm">
                        <option value="">--</option>
                        {foursomes.map(f => <option key={f.id} value={f.id}>Group {f.group_number}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Vegas</label>
                      <select value={inRound.vegas_team ?? ''}
                        onChange={e => savePlayer(inRound.id, { vegas_team: parseInt(e.target.value) || null })}
                        className="w-full bg-gray-800 rounded-lg px-2 py-2 text-sm">
                        <option value="">--</option>
                        <option value="1">T1</option>
                        <option value="2">T2</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* COURSE TAB */}
      {tab === 'course' && (
        <div className="space-y-4">
          <button onClick={() => { setHolePars([...DEFAULT_PARS]); setHoleHandicaps([...DEFAULT_HANDICAPS]) }}
            className="text-xs text-gray-400 underline">
            Reset to Tierra Rejada defaults
          </button>

          <div className="bg-gray-900 rounded-xl overflow-hidden">
            <div className="grid grid-cols-[2.5rem_1fr_1fr] gap-2 px-4 py-2 text-xs text-gray-500 uppercase border-b border-gray-800">
              <span>Hole</span><span className="text-center">Par</span><span className="text-center">Handicap</span>
            </div>
            {Array.from({ length: 18 }, (_, i) => (
              <div key={i} className={`grid grid-cols-[2.5rem_1fr_1fr] gap-2 px-4 py-2 border-b border-gray-800 last:border-0 items-center ${i === 8 ? 'border-b-2 border-green-800' : ''}`}>
                <span className="text-gray-400 text-sm font-bold">{i + 1}</span>
                <input type="number" min="3" max="6" value={holePars[i]}
                  onChange={e => { const v = [...holePars]; v[i] = parseInt(e.target.value) || 4; setHolePars(v) }}
                  className="bg-gray-800 rounded-lg px-2 py-1 text-sm text-center w-full" />
                <input type="number" min="1" max="18" value={holeHandicaps[i]}
                  onChange={e => { const v = [...holeHandicaps]; v[i] = parseInt(e.target.value) || 1; setHoleHandicaps(v) }}
                  className="bg-gray-800 rounded-lg px-2 py-1 text-sm text-center w-full" />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-4 text-center bg-gray-900 rounded-xl p-4">
            <div><p className="text-xs text-gray-500">Front 9</p><p className="font-bold">{holePars.slice(0,9).reduce((a,b)=>a+b,0)}</p></div>
            <div><p className="text-xs text-gray-500">Back 9</p><p className="font-bold">{holePars.slice(9).reduce((a,b)=>a+b,0)}</p></div>
            <div><p className="text-xs text-gray-500">Total</p><p className="font-bold">{holePars.reduce((a,b)=>a+b,0)}</p></div>
          </div>

          <button onClick={saveCourse} className="w-full bg-green-700 rounded-xl py-3 font-bold">Save Course</button>
        </div>
      )}

      {/* HISTORY TAB */}
      {tab === 'history' && (
        <div className="space-y-3">
          {allRounds.length === 0 && <p className="text-center text-gray-500 py-8">No rounds yet</p>}
          {allRounds.map(r => (
            <div key={r.id} className="bg-gray-900 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold">{r.round_name ?? 'Golf Round'}</p>
                  <p className="text-xs text-gray-400">{r.date} · {r.game_type} · ${r.stakes}/pt</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${r.status === 'active' ? 'bg-green-800 text-green-300' : r.status === 'completed' ? 'bg-blue-900 text-blue-300' : 'bg-gray-800 text-gray-400'}`}>
                  {r.status}
                </span>
              </div>
              <div className="flex gap-3">
                <button onClick={async () => { setRound(r); setRoundName(r.round_name ?? ''); setGameType(r.game_type ?? 'vegas'); setStakes(String(r.stakes ?? 1)); if (r.hole_pars) setHolePars(r.hole_pars); if (r.hole_handicaps) setHoleHandicaps(r.hole_handicaps); await loadRoundData(r.id); setTab('round') }}
                  className="text-xs text-green-400 underline">Load</button>
                <button onClick={() => deleteRound(r.id)} className="text-xs text-red-400 underline">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
