import { describe, expect, it } from "vitest"

import {
  getMetaGraphApiBaseUrl,
  INSTAGRAM_GRAPH_API_BASE_URL,
  META_GRAPH_API_BASE_URL,
} from "@/lib/meta-graph-version"

describe("Next.js Meta Graph provider routing", () => {
  it("routes direct Instagram Login tokens to the Instagram Graph host", () => {
    expect(getMetaGraphApiBaseUrl("instagram_login"))
      .toBe(INSTAGRAM_GRAPH_API_BASE_URL)
  })

  it("keeps Facebook Login and legacy accounts on the Facebook Graph host", () => {
    expect(getMetaGraphApiBaseUrl("facebook_login"))
      .toBe(META_GRAPH_API_BASE_URL)
    expect(getMetaGraphApiBaseUrl())
      .toBe(META_GRAPH_API_BASE_URL)
  })
})
