'use server'

import { createClient } from '@/lib/supabase/server'

export async function updateProfiel(formData: FormData): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Niet ingelogd' }

  const naam = (formData.get('name') as string)?.trim()
  const ww   = formData.get('password') as string

  if (!naam) return { error: 'Naam is verplicht' }

  const { error: pErr } = await supabase.from('profiles').update({ name: naam }).eq('id', user.id)
  if (pErr) return { error: pErr.message }

  if (ww) {
    if (ww.length < 8) return { error: 'Wachtwoord minimaal 8 tekens' }
    const { error: aErr } = await supabase.auth.updateUser({ password: ww })
    if (aErr) return { error: aErr.message }
  }

  return { success: true }
}
