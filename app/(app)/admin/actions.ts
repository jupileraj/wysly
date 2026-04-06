'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function maakGebruikerAan(formData: FormData): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Niet ingelogd' }

  const { data: profiel } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profiel?.role !== 'admin') return { error: 'Geen toegang' }

  const email         = (formData.get('email') as string)?.trim()
  const password      = formData.get('password') as string
  const name          = (formData.get('name') as string)?.trim()
  const role          = (formData.get('role') as string) || 'employee'
  const contractHours = parseFloat(formData.get('contract_hours') as string) || 40

  if (!email || !password || !name) return { error: 'Vul alle verplichte velden in' }
  if (password.length < 8) return { error: 'Wachtwoord moet minimaal 8 tekens zijn' }

  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role, contract_hours: contractHours },
  })

  if (error) return { error: error.message }

  if (data.user) {
    await admin.from('profiles')
      .update({ name, role, contract_hours: contractHours })
      .eq('id', data.user.id)
  }

  return { success: true }
}

export async function updateGebruiker(
  userId: string,
  data: { name: string; role: string; contract_hours: number }
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Niet ingelogd' }

  const { data: profiel } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profiel?.role !== 'admin') return { error: 'Geen toegang' }

  const { error } = await supabase.from('profiles')
    .update({ name: data.name, role: data.role, contract_hours: data.contract_hours })
    .eq('id', userId)

  if (error) return { error: error.message }
  return { success: true }
}
