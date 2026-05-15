import type { WorkflowGraph } from '@/types/automation-graph'

export interface SendEmailNodeValidationIssue {
    code: string
    message: string
    nodeId?: string
}

function nonEmptyString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : ''
}

function looksLikeEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function validateSendEmailNodeConfigs(
    graph: WorkflowGraph | null | undefined,
): SendEmailNodeValidationIssue[] {
    const issues: SendEmailNodeValidationIssue[] = []

    for (const node of graph?.nodes || []) {
        if (node.data?.type !== 'action_send_email') continue

        const config = (node.data.config || {}) as unknown as Record<string, unknown>
        const recipientType = String(config.recipient_type || 'custom')
        const recipientEmail = nonEmptyString(config.recipient_email)
        const subject = nonEmptyString(config.subject)
        const body = nonEmptyString(config.body)
        const includeContext = config.include_context !== false

        if (recipientType !== 'custom') {
            issues.push({
                code: 'SEND_EMAIL_RECIPIENT_TYPE_UNSUPPORTED',
                message: 'Send Email supports custom recipients only.',
                nodeId: node.id,
            })
        }

        if (!recipientEmail) {
            issues.push({
                code: 'SEND_EMAIL_RECIPIENT_REQUIRED',
                message: 'Send Email requires a recipient email address.',
                nodeId: node.id,
            })
        } else if (!looksLikeEmail(recipientEmail)) {
            issues.push({
                code: 'SEND_EMAIL_RECIPIENT_INVALID',
                message: 'Send Email recipient must be a valid email address.',
                nodeId: node.id,
            })
        }

        if (!subject) {
            issues.push({
                code: 'SEND_EMAIL_SUBJECT_REQUIRED',
                message: 'Send Email requires a subject.',
                nodeId: node.id,
            })
        }

        if (!includeContext && !body) {
            issues.push({
                code: 'SEND_EMAIL_BODY_REQUIRED',
                message: 'Send Email requires a body when automation context is disabled.',
                nodeId: node.id,
            })
        }
    }

    return issues
}
