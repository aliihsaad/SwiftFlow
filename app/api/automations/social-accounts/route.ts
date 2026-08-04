import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getActiveWorkspace } from '@/lib/workspace-utils'

// GET - List connected Instagram accounts for automations.
export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const activeWorkspace = await getActiveWorkspace()
    if (!activeWorkspace) {
      return NextResponse.json({ error: 'No active workspace found' }, { status: 404 })
    }

    const { data: accounts, error } = await supabase
      .from('social_accounts')
      .select('id, platform, account_name, account_id')
      .eq('workspace_id', activeWorkspace.id)
      .eq('platform', 'instagram')
      .order('account_name', { ascending: true })

    if (error) throw error

    return NextResponse.json({ accounts: accounts || [] })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch Instagram accounts'
    console.error('Get automation social accounts API error:', error)
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
