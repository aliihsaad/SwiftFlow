type SendPasswordChangedEmailParams = {
    to: string
    changedAt: string
}

function escapeHtml(value: string) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;")
}

function formatChangedAt(changedAt: string) {
    try {
        return new Date(changedAt).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
            second: "2-digit",
            timeZoneName: "short",
        })
    } catch {
        return changedAt
    }
}

export async function sendPasswordChangedEmail({
    to,
    changedAt,
}: SendPasswordChangedEmailParams): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY
    const from = process.env.INVITE_EMAIL_FROM
    const replyTo = process.env.INVITE_EMAIL_REPLY_TO

    if (!apiKey || !from) {
        return
    }

    const safeTo = escapeHtml(to)
    const changedAtLabel = formatChangedAt(changedAt)
    const safeChangedAt = escapeHtml(changedAtLabel)

    const html = `
<div style="background:#070710;padding:24px;font-family:Arial,sans-serif;color:#e5e7eb;">
  <div style="max-width:560px;margin:0 auto;background:#151620;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;">
    <div style="padding:20px;">
      <div style="display:inline-block;padding:6px 10px;border-radius:999px;background:rgba(251,113,133,0.12);border:1px solid rgba(251,113,133,0.2);color:#ffe4e6;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Security Notice</div>
      <h1 style="margin:14px 0 8px;color:#ffffff;font-size:20px;line-height:1.2;">Your SwiftFlow password was changed</h1>
      <p style="margin:0 0 12px;color:#d4d4d8;font-size:14px;line-height:1.5;">
        This is a confirmation that the password for <strong style="color:#ffffff;">${safeTo}</strong> was updated.
      </p>
      <p style="margin:0 0 12px;color:#d4d4d8;font-size:14px;line-height:1.5;">
        Change time: <strong style="color:#ffffff;">${safeChangedAt}</strong>
      </p>
      <p style="margin:0;color:#a1a1aa;font-size:13px;line-height:1.5;">
        If you did not make this change, reset your password immediately and contact support.
      </p>
    </div>
  </div>
</div>`.trim()

    const text = [
        "Your SwiftFlow password was changed.",
        `Account: ${to}`,
        `Change time: ${changedAtLabel}`,
        "If you did not make this change, reset your password immediately and contact support.",
    ].join("\n")

    const payload: Record<string, unknown> = {
        from,
        to: [to],
        subject: "Your SwiftFlow password was changed",
        html,
        text,
    }

    if (replyTo) {
        payload.reply_to = replyTo
    }

    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        cache: "no-store",
    })

    if (!response.ok) {
        const details = await response.text().catch(() => `HTTP ${response.status}`)
        throw new Error(`Password change email send failed: ${details}`)
    }
}
