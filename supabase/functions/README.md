# Supabase Edge Functions Map

This folder contains the Supabase functions used by SwiftFlow's engagement-only runtime.

## AI replies

- generate-reply
- generate-message-reply

These functions generate responses for automation nodes. They do not expose standalone content-studio capabilities.

## Synchronization

- sync-analytics
- sync-comments
- sync-messages

## Automation runtime

- process-automations
- process-scheduled-executions — resumes Delay nodes and resolved/expired Telegram approvals
- automation-orchestrator
- automation-worker-run
- automation-worker-ai-response
- automation-worker-condition
- automation-worker-http-request
- automation-worker-private-reply
- automation-worker-reply-comment
- automation-worker-send-dm
- automation-worker-send-email — legacy saved workflows only
- automation-worker-telegram
- telegram-automation-webhook — signed Telegram callback endpoint

## Operations

- scheduler-tick — resumes delayed executions and runs hourly maintenance
- retention-cleanup
- token-health-sweep
- instagram-token-refresh — renews long-lived Instagram tokens before expiry
- _shared/

The scheduler resumes delayed nodes, resolves expired Telegram approvals through their Rejected branch, and runs maintenance jobs.

## Internal invocation

Functions called by other server components or edge functions should be deployed with --no-verify-jwt only when they also enforce SwiftFlow's internal service-role check.

    supabase functions deploy process-scheduled-executions --no-verify-jwt
    supabase functions deploy automation-worker-run --no-verify-jwt
    supabase functions deploy automation-worker-ai-response --no-verify-jwt
    supabase functions deploy automation-worker-condition --no-verify-jwt
    supabase functions deploy automation-worker-http-request --no-verify-jwt
    supabase functions deploy automation-worker-private-reply --no-verify-jwt
    supabase functions deploy automation-worker-reply-comment --no-verify-jwt
    supabase functions deploy automation-worker-send-dm --no-verify-jwt
    supabase functions deploy automation-worker-send-email --no-verify-jwt
    supabase functions deploy automation-worker-telegram --no-verify-jwt
    supabase functions deploy telegram-automation-webhook --no-verify-jwt
    supabase functions deploy retention-cleanup --no-verify-jwt
    supabase functions deploy token-health-sweep --no-verify-jwt
    supabase functions deploy instagram-token-refresh --no-verify-jwt

Normal orchestration entrypoints:

    supabase functions deploy scheduler-tick
    supabase functions deploy automation-orchestrator
    supabase functions deploy process-automations
    supabase functions deploy generate-reply
    supabase functions deploy generate-message-reply
    supabase functions deploy sync-analytics
    supabase functions deploy sync-comments
    supabase functions deploy sync-messages

Use one Supabase cron schedule targeting scheduler-tick every minute:

    * * * * *

This schedule is **not** version-controlled in this repository — there is no
`pg_cron` migration and no `supabase/config.toml` schedule block. It must be
created once per environment in the Supabase dashboard (Integrations → Cron), or
via the Supabase CLI/API, and verified there. Every maintenance job — retention
cleanup (minute 0), Instagram token refresh (minute 5), token health sweep
(minute 30) — is dispatched from inside a scheduler-tick run, so if that
every-minute schedule is missing, none of them ever execute and the failure is
silent. See `docs/project-memory/2026-08-04-instagram-token-refresh.md` for the
exact configuration and verification steps.

Historical migrations remain append-only even when an old runtime feature has been retired.
