export type InstagramConnectionNotice = {
  tone: "success" | "error"
  title: string
  message: string
  reference?: string
}

type SearchParamsReader = {
  get(name: string): string | null
}

const STAGE_MESSAGES: Record<string, string> = {
  validate_oauth_response: "Instagram did not return a complete authorization response. Start the connection again.",
  validate_oauth_state: "The secure login session expired or could not be matched. Start the connection again.",
  authenticate_user: "Your SwiftFlow session expired during authorization. Sign in again, then reconnect Instagram.",
  authorize_workspace: "Your workspace role cannot manage integrations.",
  exchange_authorization_code: "Instagram approved access, but SwiftFlow could not exchange the returned code. Verify that the Instagram app ID and Instagram app secret belong to the same app.",
  exchange_long_lived_token: "The account connected, but the token could not be upgraded to a long-lived token.",
  fetch_profile: "The token was issued, but SwiftFlow could not read the Instagram professional profile.",
  verify_account_identity: "The authorized Instagram account did not match the returned profile.",
  subscribe_comments: "The account connected, but the comment-webhook subscription still needs attention.",
  check_existing_connection: "SwiftFlow could not verify whether this Instagram account is already connected.",
  load_existing_account: "SwiftFlow could not prepare the workspace account record.",
  save_connection: "Instagram authorization completed, but SwiftFlow could not save the account in Supabase.",
}

const ERROR_MESSAGES: Record<string, string> = {
  instagram_authorization_denied: "Instagram authorization was cancelled or denied. Select Allow to complete the connection.",
  invalid_oauth_state: STAGE_MESSAGES.validate_oauth_state,
  unauthorized: STAGE_MESSAGES.authenticate_user,
  forbidden: STAGE_MESSAGES.authorize_workspace,
  instagram_account_mismatch: STAGE_MESSAGES.verify_account_identity,
  instagram_account_connected_elsewhere: "This Instagram account is already connected to another SwiftFlow workspace.",
  instagram_api_error: "Instagram returned an error while SwiftFlow was completing the connection.",
  instagram_connection_failed: "SwiftFlow could not finish saving the Instagram connection.",
}

export function sanitizeInstagramDiagnosticValue(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (/(?:secret|token|bearer)/i.test(trimmed)) return null
  if (/^(?:IGAA|IGQV|EAA)[a-zA-Z0-9_-]+$/i.test(trimmed)) return null
  return /^[a-zA-Z0-9_.-]{1,80}$/.test(trimmed) ? trimmed : null
}

export function getInstagramConnectionNotice(
  searchParams: SearchParamsReader,
): InstagramConnectionNotice | null {
  const success = sanitizeInstagramDiagnosticValue(searchParams.get("success"))
  const subscription = sanitizeInstagramDiagnosticValue(searchParams.get("subscription"))
  if (success === "instagram_connected") {
    return subscription === "action_required"
      ? {
          tone: "success",
          title: "Instagram connected",
          message: "The account was saved. Complete the comment-webhook check below to finish automation readiness.",
        }
      : {
          tone: "success",
          title: "Instagram connected",
          message: "The account, permissions, token, and comment webhook were verified.",
        }
  }

  const error = sanitizeInstagramDiagnosticValue(searchParams.get("error"))
  if (!error) return null

  const stage = sanitizeInstagramDiagnosticValue(searchParams.get("stage"))
  const code = sanitizeInstagramDiagnosticValue(searchParams.get("code"))
  const message = stage && STAGE_MESSAGES[stage]
    ? STAGE_MESSAGES[stage]
    : ERROR_MESSAGES[error] || "Instagram connection did not complete. Start the connection again."
  const referenceParts = [
    stage ? `stage ${stage}` : null,
    code ? `code ${code}` : null,
  ].filter(Boolean)

  return {
    tone: "error",
    title: "Instagram connection did not complete",
    message,
    reference: referenceParts.length > 0 ? referenceParts.join(" · ") : undefined,
  }
}
