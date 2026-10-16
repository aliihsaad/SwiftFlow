import { redactSensitiveString } from './log-redaction.ts'

export interface MetaMessagingError {
  code?: number
  subcode?: number
  type?: string
  message?: string
  trace_id?: string
  is_transient: boolean
  http_status: number
  outcome: 'recipient_restricted' | 'rate_limited' | 'temporary' | 'authentication' | 'unknown'
}

export interface VerifiedRestrictionSignature {
  code: number
  subcode: number
  type: string
  message: string
  evidence: string
}

// Deliberately empty until an Instagram response is verified against primary
// documentation + a sanitized production payload. Broad 10/200/551 codes,
// delivery-window errors and "recipient unavailable" are NOT privacy evidence.
// Add reviewed signatures here with an evidence citation, never via user config.
export const VERIFIED_INSTAGRAM_RESTRICTIONS: readonly VerifiedRestrictionSignature[] = []

export function normalizeMetaMessagingError(
  value: unknown, httpStatus: number,
  signatures: readonly VerifiedRestrictionSignature[] = VERIFIED_INSTAGRAM_RESTRICTIONS,
): MetaMessagingError {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const numeric = (v: unknown) => typeof v === 'number' && Number.isInteger(v) ? v : undefined
  const text = (v: unknown, max: number) => typeof v === 'string'
    ? redactSensitiveString(v).replace(/https?:\/\/\S+/g, '[URL]').replace(/[\r\n\u0000-\u001f]/g, ' ').slice(0, max) : undefined
  const error: MetaMessagingError = {
    code: numeric(raw.code), subcode: numeric(raw.error_subcode), type: text(raw.type, 80),
    message: text(raw.message, 500), trace_id: text(raw.fbtrace_id, 100),
    is_transient: raw.is_transient === true, http_status: httpStatus, outcome: 'unknown',
  }
  // Graph API error handling documents these general categories; none enables recovery.
  if (httpStatus === 429 || [4, 17, 32, 613].includes(error.code ?? -1)) error.outcome = 'rate_limited'
  else if (httpStatus >= 500 || error.is_transient || [1, 2].includes(error.code ?? -1)) error.outcome = 'temporary'
  else if ([102, 190].includes(error.code ?? -1) || httpStatus === 401) error.outcome = 'authentication'
  else if (httpStatus >= 400 && httpStatus < 500 && signatures.some(s => s.evidence
    && error.code === s.code && error.subcode === s.subcode && error.type === s.type && raw.message === s.message)) error.outcome = 'recipient_restricted'
  return error
}
