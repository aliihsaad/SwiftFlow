# Tracked Credential / Security-Sensitive Archive Inventory — 2026-07-02

Produced during Task 1 (P0 Security Blockers). **No files were deleted and git history
was not rewritten** — per the handoff, purging requires explicit user approval. This is an
inventory + remediation recommendation only.

## CRITICAL — live-shaped Supabase `service_role` JWT committed to the repo

A complete, signed Supabase **`service_role`** JWT for project ref `txomrdymcawauezlprvn`
is present in tracked files. Decoded payload:

```
{"iss":"supabase","ref":"txomrdymcawauezlprvn","role":"service_role","iat":1768110428,"exp":2083686428}
```

`iat` ≈ 2026-01-11, `exp` ≈ 2036. A `service_role` key bypasses RLS entirely, so if this
signing key is the project's real one, anyone with repo (or git-history) access has full
read/write to the database and Storage.

Tracked files containing the full signed `service_role` token:

- `docs/archive/cleanup-review-2026-05-29/delete-candidates/security-sensitive/ssrf_part1.py`
- `docs/archive/cleanup-review-2026-05-29/delete-candidates/security-sensitive/ssrf_part1_v2.py`
- `docs/archive/cleanup-review-2026-05-29/delete-candidates/security-sensitive/ssrf_part2_test.py`

The matching **`anon`** JWT for the same project ref also appears in these files (lower risk,
anon keys are public by design, but still ties the ref to the archive).

### Required remediation (needs user action — not performed here)

1. **Rotate the Supabase `service_role` and `anon` keys** for project `txomrdymcawauezlprvn`
   in the Supabase dashboard (Settings → API → "Reset service role key"). Rotation is the
   only real fix — the token is already in git history, so redaction alone is insufficient.
2. Update `SUPABASE_SERVICE_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` wherever they are set
   (Vercel env, local `.env`).
3. After rotation, decide with the user whether to purge these files from history
   (`git filter-repo` / BFG). Until keys are rotated, history purge provides no protection.

## Sensitive assessment/exploitation artifacts (JWTs, sample keys, test passwords)

These tracked files embed access-token samples, fake API keys, and a reused test password
(`PentestPassword123!@#`). The API keys are self-labeled fakes (`AIzaPentest-fake-key…`,
`sk-pentest-fake-key…`), so the main real exposure is the `service_role` JWT above; the rest
is noise that still shouldn't ship in a production repo.

- `docs/archive/cleanup-review-2026-05-29/delete-candidates/security-sensitive/` — 6 `.py`
  pentest scripts (`auth_registration_test.py`, `ssrf_part1.py`, `ssrf_part1_v2.py`,
  `ssrf_part2_test.py`, `ssrf_vuln_04_06.py`, `test_authz_vuln_02.py`).
- `docs/archive/cleanup-review-2026-05-29/delete-candidates/duplicate-deliverables/deliverables/`
  — duplicate copies of `auth_exploitation_evidence.md`, `authz_exploitation_evidence.md`,
  `comprehensive_security_assessment_report.md` and related deliverables (JWT samples inline).
- `docs/detailed-security-report/` — canonical copies of the same exploitation evidence.

## Recommended follow-ups (safe to schedule)

- Add **secret scanning to CI / pre-commit** (e.g. `gitleaks` or `trufflehog`) so committed
  tokens are caught before merge. This is the "add secret scanning" step from the plan; it is
  additive and does not require the destructive history purge, so it can land independently.
- Once keys are rotated, delete the `delete-candidates/` archive material and consider a
  history rewrite — **only with explicit user approval**.

## Scope note

The real `service_role` token was found **only** under `docs/`. It does not appear in
application source (`app/`, `lib/`, `supabase/functions/`). No `.env` file with live secrets
is tracked (`.env.vercel.example` is a placeholder template).
