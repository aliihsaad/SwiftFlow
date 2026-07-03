import { createClient } from '@supabase/supabase-js'
import { requireSupabaseServiceRoleKey } from '@/lib/supabase/service-key'

export function createAdminClient() {
    const serviceKey = requireSupabaseServiceRoleKey()
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceKey,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        }
    )
}
