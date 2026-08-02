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
- process-scheduled-executions — resumes Delay nodes
- automation-orchestrator
- automation-worker-run
- automation-worker-ai-response
- automation-worker-condition
- automation-worker-http-request
- automation-worker-private-reply
- automation-worker-reply-comment
- automation-worker-send-dm
- automation-worker-send-email

## Operations

- scheduler-tick — resumes delayed executions and runs hourly maintenance
- retention-cleanup
- token-health-sweep
- _shared/

The scheduler only resumes delayed automation nodes and runs maintenance jobs.

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
    supabase functions deploy retention-cleanup --no-verify-jwt
    supabase functions deploy token-health-sweep --no-verify-jwt

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

Historical migrations remain append-only even when an old runtime feature has been retired.
