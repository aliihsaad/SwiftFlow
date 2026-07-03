import { META_GRAPH_API_BASE_URL } from '@/lib/meta-graph-version'

// Hard cap for outbound DM text (Facebook allows 2000 chars; Instagram less —
// Meta rejects over-limit sends and the routes surface that error).
export const MAX_OUTBOUND_MESSAGE_LENGTH = 2000

export function requiredMessagingPermissions(platform: string): string[] {
    return platform === 'facebook' ? ['pages_messaging'] : ['instagram_manage_messages']
}

export interface SendMetaTextMessageParams {
    pageId: string
    recipientId: string
    text: string
    accessToken: string
    platform: string
}

export interface MetaSendResult {
    ok: boolean
    status: number
    messageId?: string
    error?: Record<string, unknown>
}

/** Send a plain-text DM via the Meta Graph API page messages endpoint. */
export async function sendMetaTextMessage(params: SendMetaTextMessageParams): Promise<MetaSendResult> {
    const response = await fetch(`${META_GRAPH_API_BASE_URL}/${params.pageId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            recipient: { id: params.recipientId },
            ...(params.platform === 'facebook' ? { messaging_type: 'RESPONSE' } : {}),
            message: { text: params.text },
            access_token: params.accessToken,
        }),
    })

    const result = await response.json().catch(() => ({})) as { message_id?: string; error?: Record<string, unknown> }
    return {
        ok: response.ok,
        status: response.status,
        messageId: result.message_id,
        error: result.error,
    }
}
