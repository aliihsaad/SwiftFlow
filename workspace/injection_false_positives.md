# Injection False Positives Log

## INJ-VULN-01 (Partial) — CRLF Header Injection sub-vector (OpenRouter/OpenAI providers)

**What was attempted:**
- Injected `\r\n` (JSON-escaped CRLF) into `apiKey` field for `provider=openrouter` and `provider=openai`
- Tested `{"provider":"openrouter","apiKey":"sk-or-v1-test\r\nX-Injected: evil-header\r\nX-Second: injected"}`
- Tested null byte injection `\u0000`
- Tested unicode NEL `\u0085` and Line Separator `\u2028`

**Why determined to be blocked (not a false positive of the code vulnerability):**
- The application CODE IS vulnerable (no CRLF sanitization)
- The blocking mechanism is the Node.js/Undici HTTP client runtime: `Headers.append: "Bearer sk-or-v1-test\r\nX-Injected: evil" is an invalid header value.`
- Node.js 18+ with Undici 6+ rejects CRLF in header values at the HTTP client level
- The CRLF reaches the Authorization header construction code — the runtime provides the mitigation, not the application
- Classification: This is a RUNTIME-MITIGATED vulnerability, not a false positive in the code. The Gemini URL parameter injection sub-vector of the same vulnerability IS exploitable (see INJ-VULN-01 in main evidence).
