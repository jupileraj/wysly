'use server'

import { createAdminClient } from '@/lib/supabase/admin'

export async function validateInviteCode(code: string): Promise<boolean> {
  return code.trim() === process.env.INVITE_CODE
}

export async function createUser(
  email: string,
  password: string,
  name: string,
  contractHours: number
): Promise<{ error?: string }> {
  const admin = createAdminClient()

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, contract_hours: contractHours },
  })

  if (error) return { error: error.message }
  return {}
}
