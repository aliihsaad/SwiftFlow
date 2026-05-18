import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const proxySource = readFileSync(path.join(process.cwd(), "proxy.ts"), "utf8")

describe("security headers", () => {
  it("sets browser hardening headers in the shared proxy", () => {
    expect(proxySource).toContain('response.headers.set("X-Frame-Options", "DENY")')
    expect(proxySource).toContain('response.headers.set("X-Content-Type-Options", "nosniff")')
    expect(proxySource).toContain('response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")')
    expect(proxySource).toContain('"Permissions-Policy"')
    expect(proxySource).toContain('response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload")')
  })

  it("ships a report-only CSP baseline before enforced launch CSP is finalized", () => {
    expect(proxySource).toContain("CONTENT_SECURITY_POLICY_REPORT_ONLY")
    expect(proxySource).toContain('response.headers.set("Content-Security-Policy-Report-Only", CONTENT_SECURITY_POLICY_REPORT_ONLY)')
    expect(proxySource).toContain("\"default-src 'self'\"")
    expect(proxySource).toContain("\"base-uri 'self'\"")
    expect(proxySource).toContain("\"frame-ancestors 'none'\"")
    expect(proxySource).toContain("\"object-src 'none'\"")
    expect(proxySource).toContain("\"connect-src 'self' https: wss:\"")
  })
})
