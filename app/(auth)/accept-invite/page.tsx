'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AcceptInvitePage() {
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError('Wachtwoorden komen niet overeen.'); return }
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/planning')
      router.refresh()
    }
  }

  const inputClass = "w-full bg-white/5 border border-white/20 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-brand/60 transition-colors"
  const labelClass = "block text-sm text-white/50 mb-1.5"

  return (
    <div className="flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">

        <div className="text-center mb-10">
          <span className="text-brand font-medium text-3xl tracking-tight">Wysly</span>
          <p className="text-white/30 mt-1 text-sm">Welkom!</p>
        </div>

        <div className="bg-dark-800 rounded-2xl border border-white/20 p-7">
          <h2 className="text-lg font-medium text-white tracking-tight mb-2">Stel je wachtwoord in</h2>
          <p className="text-sm text-white/40 mb-6">Kies een wachtwoord om je account te activeren.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={labelClass}>Wachtwoord</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                required minLength={8} autoComplete="new-password" placeholder="Minimaal 8 tekens"
                className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Herhaal wachtwoord</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                required minLength={8} autoComplete="new-password"
                className={inputClass} />
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-2.5">
                {error}
              </p>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-2.5 bg-brand text-dark text-sm font-medium rounded-full hover:bg-dark hover:text-white border border-brand hover:border-dark disabled:opacity-50 transition-all duration-150">
              {loading ? 'Opslaan…' : 'Account activeren'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
