import type { Pool } from "pg"

import { PostgresActionOutboxRepository } from "../automation/postgres-action-outbox"
import {
  PostgresCommentComparisonLookup,
  createCommentPrivateReplyComparisonHandler,
} from "./comment-private-reply-comparison"
import {
  WebhookInboxWorker,
  type WebhookInboxWorkerOptions,
} from "./inbox-worker"
import {
  PostgresWebhookInboxRepository,
  createPostgresQueryClient,
} from "./postgres-inbox-repository"

export interface CommentComparisonWorkerOptions extends WebhookInboxWorkerOptions {
  /**
   * Enables appending intended provider actions to the outbox. Enqueueing is
   * not execution: the worker still performs no external call, and the action
   * cannot run unless the separately gated executor is enabled.
   */
  enqueueActions?: boolean
}

export function createCommentPrivateReplyComparisonWorker(
  pool: Pool,
  options: CommentComparisonWorkerOptions,
): WebhookInboxWorker {
  const database = createPostgresQueryClient(pool)
  return new WebhookInboxWorker(
    new PostgresWebhookInboxRepository(database),
    createCommentPrivateReplyComparisonHandler(
      new PostgresCommentComparisonLookup(database),
      options.enqueueActions
        ? { actionOutbox: new PostgresActionOutboxRepository(database) }
        : {},
    ),
    options,
  )
}
