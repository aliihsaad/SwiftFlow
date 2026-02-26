type SendWorkspaceInviteEmailParams = {
    to: string
    workspaceName: string
    inviterEmail?: string | null
    role: string
    inviteUrl: string
    expiresAt: string
}

type SendWorkspaceInviteEmailResult = {
    id: string | null
}

function escapeHtml(value: string) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;")
}

function formatInviteExpiry(expiresAt: string) {
    try {
        return new Date(expiresAt).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
        })
    } catch {
        return expiresAt
    }
}

export async function sendWorkspaceInviteEmail({
    to,
    workspaceName,
    inviterEmail,
    role,
    inviteUrl,
    expiresAt,
}: SendWorkspaceInviteEmailParams): Promise<SendWorkspaceInviteEmailResult> {
    const apiKey = process.env.RESEND_API_KEY
    const from = process.env.INVITE_EMAIL_FROM
    const replyTo = process.env.INVITE_EMAIL_REPLY_TO

    if (!apiKey) {
        throw new Error("Automatic invite email is not configured (missing RESEND_API_KEY)")
    }
    if (!from) {
        throw new Error("Automatic invite email is not configured (missing INVITE_EMAIL_FROM)")
    }
    if (!/^https?:\/\//i.test(inviteUrl)) {
        throw new Error("Automatic invite email requires an absolute invite URL (check NEXT_PUBLIC_APP_URL)")
    }

    const safeWorkspaceName = escapeHtml(workspaceName)
    const safeInviter = inviterEmail ? escapeHtml(inviterEmail) : null
    const safeRole = escapeHtml(role)
    const safeInviteUrl = escapeHtml(inviteUrl)
    const expiryLabel = formatInviteExpiry(expiresAt)
    const safeExpiryLabel = escapeHtml(expiryLabel)

    const inviterLine = safeInviter
        ? `<p style="margin:0 0 12px;color:#d4d4d8;font-size:14px;">Invited by: <strong style="color:#ffffff;">${safeInviter}</strong></p>`
        : ""

    const html = `
<div style="background:#070710;padding:24px;font-family:Arial,sans-serif;color:#e5e7eb;">
  <div style="max-width:560px;margin:0 auto;background:#151620;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;">
    <div style="padding:20px 20px 12px;">
      <div style="display:inline-block;padding:6px 10px;border-radius:999px;background:rgba(56,189,248,0.12);border:1px solid rgba(56,189,248,0.2);color:#dff6ff;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Workspace Invite</div>
      <h1 style="margin:14px 0 8px;color:#ffffff;font-size:20px;line-height:1.2;">Join ${safeWorkspaceName}</h1>
      <p style="margin:0 0 12px;color:#d4d4d8;font-size:14px;line-height:1.5;">
        You were invited to collaborate on this workspace as <strong style="color:#ffffff;">${safeRole}</strong>.
      </p>
      ${inviterLine}
      <p style="margin:0 0 12px;color:#d4d4d8;font-size:14px;line-height:1.5;">
        Use the same email address (<strong style="color:#ffffff;">${escapeHtml(to)}</strong>) to sign up or sign in before accepting the invite.
      </p>
      <p style="margin:0 0 18px;color:#a1a1aa;font-size:13px;">This invite expires on ${safeExpiryLabel}.</p>
      <a href="${safeInviteUrl}" style="display:inline-block;padding:11px 16px;border-radius:10px;background:linear-gradient(135deg,#22d3ee,#fb7185);color:#fff;text-decoration:none;font-size:14px;font-weight:700;">Accept Invitation</a>
    </div>
    <div style="padding:14px 20px 20px;border-top:1px solid rgba(255,255,255,0.06);">
      <p style="margin:0 0 8px;color:#a1a1aa;font-size:12px;">If the button doesn't work, use this link:</p>
      <p style="margin:0;word-break:break-all;">
        <a href="${safeInviteUrl}" style="color:#7dd3fc;font-size:12px;text-decoration:underline;">${safeInviteUrl}</a>
      </p>
    </div>
  </div>
</div>`.trim()

    const text = [
        `You were invited to join ${workspaceName} as ${role}.`,
        inviterEmail ? `Invited by: ${inviterEmail}` : null,
        `Sign up or sign in with this email to accept: ${to}`,
        `Accept invite: ${inviteUrl}`,
        `Expires: ${expiryLabel}`,
    ].filter(Boolean).join("\n")

    const payload: Record<string, unknown> = {
        from,
        to: [to],
        subject: `You're invited to join ${workspaceName} on SwiftFlow`,
        html,
        text,
    }

    if (replyTo) {
        payload.reply_to = replyTo
    }

    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        cache: "no-store",
    })

    const result = await response.json().catch(() => ({})) as { id?: string; message?: string; error?: unknown }

    if (!response.ok) {
        const details = typeof result?.message === "string"
            ? result.message
            : typeof result?.error === "string"
                ? result.error
                : `HTTP ${response.status}`
        throw new Error(`Resend email send failed: ${details}`)
    }

    return {
        id: typeof result?.id === "string" ? result.id : null,
    }
}
