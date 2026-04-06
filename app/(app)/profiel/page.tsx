'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { updateProfiel } from './actions'
import Avatar from '../Avatar'

export default function ProfielPage() {
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [naam,      setNaam]      = useState('')
  const [email,     setEmail]     = useState('')
  const [ww,        setWw]        = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [bericht,   setBericht]   = useState<{ ok?: boolean; tekst: string } | null>(null)

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setEmail(user.email ?? '')
      const { data: p } = await supabase.from('profiles').select('name, avatar_url').eq('id', user.id).single()
      setNaam(p?.name ?? '')
      setAvatarUrl(p?.avatar_url ?? null)
      setLoading(false)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function uploadAvatar(file: File) {
    setUploading(true); setBericht(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setUploading(false); return }

    const ext = file.name.split('.').pop()
    const path = `${user.id}/avatar.${ext}`

    const { error: upErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type })

    if (upErr) { setBericht({ tekst: 'Upload mislukt: ' + upErr.message }); setUploading(false); return }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    const cacheBust = `${publicUrl}?t=${Date.now()}`

    await supabase.from('profiles').update({ avatar_url: cacheBust }).eq('id', user.id)
    setAvatarUrl(cacheBust)
    setUploading(false)
    setBericht({ ok: true, tekst: 'Profielfoto opgeslagen.' })
  }

  async function slaOp(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setBericht(null)
    const fd = new FormData()
    fd.set('name', naam)
    if (ww) fd.set('password', ww)
    const res = await updateProfiel(fd)
    if (res.error) {
      setBericht({ tekst: res.error })
    } else {
      setBericht({ ok: true, tekst: 'Wijzigingen opgeslagen.' })
      setWw('')
    }
    setSaving(false)
  }

  if (loading) return <div className="flex justify-center items-center h-48 text-muted text-sm">Laden…</div>

  return (
    <div className="max-w-md">
      <h1 className="text-xl font-medium text-dark tracking-tight mb-6">Mijn profiel</h1>

      {/* Avatar upload */}
      <div className="bg-light rounded-2xl border border-black/20 px-6 py-6 mb-4 flex items-center gap-5">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="relative group shrink-0"
          title="Profielfoto wijzigen"
        >
          <Avatar name={naam} avatarUrl={avatarUrl} size="lg" />
          <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <span className="text-white text-xs font-medium">Wijzig</span>
          </div>
          {uploading && (
            <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
              <span className="text-white text-xs">…</span>
            </div>
          )}
        </button>
        <div>
          <p className="text-sm font-medium text-dark">{naam}</p>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="text-xs text-muted hover:text-dark underline transition-colors mt-0.5"
          >
            {uploading ? 'Uploaden…' : 'Profielfoto wijzigen'}
          </button>
          <p className="text-xs text-muted/60 mt-0.5">JPG of PNG, max 2MB</p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) uploadAvatar(f) }}
        />
      </div>

      <form onSubmit={slaOp} className="bg-light rounded-2xl border border-black/20 px-6 py-6 space-y-4">
        <div>
          <label className="block text-xs text-muted mb-1">Naam</label>
          <input type="text" value={naam} onChange={e => setNaam(e.target.value)} required
            className="w-full border border-black/20 rounded-xl px-4 py-2.5 text-sm text-dark bg-cream focus:outline-none focus:border-dark/40" />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">E-mailadres</label>
          <input type="email" value={email} disabled
            className="w-full border border-black/10 rounded-xl px-4 py-2.5 text-sm text-muted bg-grey/30 cursor-not-allowed" />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Nieuw wachtwoord <span className="text-muted/50">(laat leeg om niet te wijzigen)</span></label>
          <input type="password" value={ww} onChange={e => setWw(e.target.value)} minLength={8} placeholder="Minimaal 8 tekens"
            className="w-full border border-black/20 rounded-xl px-4 py-2.5 text-sm text-dark bg-cream focus:outline-none focus:border-dark/40 placeholder-muted/40" />
        </div>
        {bericht && (
          <p className={`text-sm ${bericht.ok ? 'text-green-600' : 'text-red-500'}`}>{bericht.tekst}</p>
        )}
        <button type="submit" disabled={saving}
          className="w-full py-3 rounded-full text-sm font-medium border bg-brand text-dark border-brand hover:bg-dark hover:text-white hover:border-dark disabled:opacity-50 transition-all duration-150">
          {saving ? 'Opslaan…' : 'Opslaan'}
        </button>
      </form>
    </div>
  )
}
