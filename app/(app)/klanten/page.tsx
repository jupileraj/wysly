'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

type Client = { id: string; name: string; created_at: string }

export default function KlantenPage() {
  const supabase = createClient()

  const [klanten,   setKlanten]   = useState<Client[]>([])
  const [naam,      setNaam]      = useState('')
  const [isAdmin,   setIsAdmin]   = useState(false)
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')
  const [verwijder, setVerwijder] = useState<string | null>(null)
  const [editId,    setEditId]    = useState<string | null>(null)
  const [editNaam,  setEditNaam]  = useState('')
  const [editSaving,setEditSaving]= useState(false)

  const laad = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return
    const { data: profiel } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    setIsAdmin(profiel?.role === 'admin')
    const { data } = await supabase.from('clients').select('id, name, created_at').order('name')
    setKlanten(data ?? [])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { laad() }, [laad])

  async function voegToe() {
    const trimmed = naam.trim()
    if (!trimmed) return
    setSaving(true); setError('')
    const { data: { user } } = await supabase.auth.getUser()
    const { error: err } = await supabase.from('clients').insert({ name: trimmed, created_by: user?.id })
    if (err) {
      setError(err.message.includes('unique') ? `"${trimmed}" bestaat al.` : err.message)
    } else {
      setNaam('')
      await laad()
    }
    setSaving(false)
  }

  async function verwijderKlant(id: string) {
    await supabase.from('clients').delete().eq('id', id)
    setVerwijder(null)
    await laad()
  }

  async function slaEditOp(id: string) {
    const trimmed = editNaam.trim()
    if (!trimmed) return
    setEditSaving(true)
    await supabase.from('clients').update({ name: trimmed }).eq('id', id)
    setEditId(null)
    await laad()
    setEditSaving(false)
  }

  if (loading) return <div className="flex justify-center items-center h-48 text-muted text-sm">Laden…</div>

  return (
    <div>
      <h1 className="text-xl font-medium text-dark tracking-tight mb-6">Klanten</h1>

      {/* Nieuw toevoegen */}
      <div className="bg-light rounded-2xl border border-black/20 px-5 py-5 mb-6">
        <p className="text-sm font-medium text-dark mb-3">Klant toevoegen</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={naam}
            onChange={e => setNaam(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') voegToe() }}
            placeholder="Naam van de klant"
            className="flex-1 border border-black/20 rounded-xl px-4 py-2.5 text-sm text-dark placeholder-muted/50 focus:outline-none focus:border-dark/40 bg-cream"
          />
          <button onClick={voegToe} disabled={saving || !naam.trim()}
            className="px-5 py-2.5 bg-brand text-dark text-sm font-medium rounded-full border border-brand hover:bg-dark hover:text-white hover:border-dark disabled:opacity-40 transition-all duration-150 shrink-0">
            {saving ? '…' : 'Toevoegen'}
          </button>
        </div>
        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      </div>

      {/* Lijst */}
      {klanten.length === 0 ? (
        <div className="text-center py-12 text-muted text-sm">
          Nog geen klanten. Voeg er een toe hierboven.
        </div>
      ) : (
        <div className="bg-light rounded-2xl border border-black/20 overflow-hidden">
          {klanten.map((klant, i) => (
            <div key={klant.id}
              className={`group flex items-center gap-3 px-5 py-3.5 ${i < klanten.length - 1 ? 'border-b border-black/10' : ''}`}>
              <div className="w-7 h-7 rounded-full bg-dark text-brand text-xs font-medium flex items-center justify-center shrink-0">
                {klant.name.charAt(0).toUpperCase()}
              </div>

              {editId === klant.id ? (
                <div className="flex-1 flex items-center gap-2">
                  <input
                    autoFocus
                    type="text"
                    value={editNaam}
                    onChange={e => setEditNaam(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') slaEditOp(klant.id); if (e.key === 'Escape') setEditId(null) }}
                    className="flex-1 border border-dark/30 rounded-lg px-3 py-1.5 text-sm text-dark bg-cream focus:outline-none focus:border-dark/60"
                  />
                  <button onClick={() => slaEditOp(klant.id)} disabled={editSaving || !editNaam.trim()}
                    className="text-xs font-medium text-brand-600 hover:text-dark disabled:opacity-40 transition-colors">
                    {editSaving ? '…' : 'Opslaan'}
                  </button>
                  <button onClick={() => setEditId(null)}
                    className="text-xs text-muted hover:text-dark transition-colors">
                    Annuleren
                  </button>
                </div>
              ) : (
                <>
                  <span className="flex-1 text-sm font-medium text-dark">{klant.name}</span>
                  {isAdmin && (
                    verwijder === klant.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted">Zeker weten?</span>
                        <button onClick={() => verwijderKlant(klant.id)}
                          className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors">
                          Verwijderen
                        </button>
                        <button onClick={() => setVerwijder(null)}
                          className="text-xs text-muted hover:text-dark transition-colors">
                          Annuleren
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setEditId(klant.id); setEditNaam(klant.name); setVerwijder(null) }}
                          className="text-xs text-muted hover:text-dark transition-colors">
                          Bewerken
                        </button>
                        <button onClick={() => setVerwijder(klant.id)}
                          className="text-xs text-muted hover:text-red-500 transition-colors">
                          ×
                        </button>
                      </div>
                    )
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {!isAdmin && klanten.length > 0 && (
        <p className="text-xs text-muted mt-3">Klanten bewerken of verwijderen kan alleen de beheerder.</p>
      )}
    </div>
  )
}
