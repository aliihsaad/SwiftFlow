import { FunctionsHttpError, type FunctionInvokeOptions } from "@supabase/functions-js"
import type { SupabaseClient } from "@supabase/supabase-js"

function isUnauthorizedFunctionsError(error: unknown): error is FunctionsHttpError {
    return error instanceof FunctionsHttpError && error.context?.status === 401
}

export async function invokeWithSessionRetry<TData, TBody = unknown>(
    supabase: SupabaseClient,
    functionName: string,
    options?: FunctionInvokeOptions
) {
    const firstAttempt = await supabase.functions.invoke<TData>(functionName, options)
    if (!isUnauthorizedFunctionsError(firstAttempt.error)) {
        return firstAttempt
    }

    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession()
    if (refreshError || !refreshed.session) {
        return firstAttempt
    }

    return supabase.functions.invoke<TData>(functionName, options)
}
