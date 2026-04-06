import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
    const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) {
        throw new Error("Missing SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY env variable")
    }
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
