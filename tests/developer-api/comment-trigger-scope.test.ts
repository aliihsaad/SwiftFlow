import { afterEach, describe, expect, it, vi } from "vitest"

import { validateDeveloperAutomationGraph } from "@/lib/developer-api/automation-graph"
import {
    commentTriggerScopeMatches,
    normalizeCommentMediaType,
    resolveCommentPostScope,
} from "../../supabase/functions/_shared/comment-scope.ts"
import {
    buildAutomationAiPrompt,
    enrichCommentPostContext,
} from "../../supabase/functions/_shared/automation-context.ts"

function commentTriggerGraph(triggerConfig: Record<string, unknown>) {
    return {
        nodes: [
            {
                id: "trigger-comment",
                type: "trigger",
                position: { x: 0, y: 0 },
                data: {
                    type: "trigger_new_comment",
                    label: "New Comment",
                    config: { social_account_id: "account-1", trigger_type: "any", keywords: [], ...triggerConfig },
                },
            },
            {
                id: "reply",
                type: "action",
                position: { x: 240, y: 0 },
                data: {
                    type: "action_reply_comment",
                    label: "Reply",
                    config: { messages: ["Thanks!"] },
                },
            },
        ],
        edges: [{ id: "edge-1", source: "trigger-comment", target: "reply" }],
    }
}

describe("normalizeCommentMediaType", () => {
    it("maps Instagram media_product_type values", () => {
        expect(normalizeCommentMediaType("REELS")).toBe("reel")
        expect(normalizeCommentMediaType("reels")).toBe("reel")
        expect(normalizeCommentMediaType("FEED")).toBe("post")
        expect(normalizeCommentMediaType("AD")).toBe("post")
        expect(normalizeCommentMediaType("")).toBe("unknown")
        expect(normalizeCommentMediaType(undefined)).toBe("unknown")
    })
})

describe("resolveCommentPostScope", () => {
    it("uses the explicit scope when valid", () => {
        expect(resolveCommentPostScope({ post_scope: "any_reel" })).toBe("any_reel")
        expect(resolveCommentPostScope({ post_scope: "any", post_id: "123" })).toBe("any")
    })

    it("falls back to legacy semantics (post_id means specific)", () => {
        expect(resolveCommentPostScope({ post_id: "123" })).toBe("specific")
        expect(resolveCommentPostScope({})).toBe("any")
        expect(resolveCommentPostScope({ post_scope: "bogus", post_id: "123" })).toBe("specific")
    })
})

describe("commentTriggerScopeMatches", () => {
    const reelComment = { post_id: "media-1", media_type: "REELS" }
    const postComment = { post_id: "media-2", media_type: "FEED" }
    const unknownComment = { post_id: "media-3" }

    it("matches everything for 'any'", () => {
        expect(commentTriggerScopeMatches({ post_scope: "any" }, reelComment)).toBe(true)
        expect(commentTriggerScopeMatches({ post_scope: "any" }, unknownComment)).toBe(true)
    })

    it("filters Reels for 'any_post' and requires them for 'any_reel'", () => {
        expect(commentTriggerScopeMatches({ post_scope: "any_post" }, postComment)).toBe(true)
        expect(commentTriggerScopeMatches({ post_scope: "any_post" }, reelComment)).toBe(false)
        expect(commentTriggerScopeMatches({ post_scope: "any_reel" }, reelComment)).toBe(true)
        expect(commentTriggerScopeMatches({ post_scope: "any_reel" }, postComment)).toBe(false)
    })

    it("never matches Reel-only triggers on unidentified media", () => {
        expect(commentTriggerScopeMatches({ post_scope: "any_reel" }, unknownComment)).toBe(false)
        expect(commentTriggerScopeMatches({ post_scope: "any_post" }, unknownComment)).toBe(true)
    })

    it("keeps legacy lenient matching for specific posts", () => {
        expect(commentTriggerScopeMatches({ post_id: "media-1" }, reelComment)).toBe(true)
        expect(commentTriggerScopeMatches({ post_id: "media-9" }, reelComment)).toBe(false)
        // Missing incoming post id keeps the legacy pass-through.
        expect(commentTriggerScopeMatches({ post_id: "media-1" }, {})).toBe(true)
    })
})

describe("developer API graph validation with scopes", () => {
    it("keeps requiring post_id without an explicit broad scope", () => {
        const { errors } = validateDeveloperAutomationGraph(commentTriggerGraph({}), { requirePostId: true })
        expect(errors.map((e) => e.code)).toContain("MISSING_FIELD")
    })

    it("allows broad scopes to omit post_id when opted in explicitly", () => {
        const { errors } = validateDeveloperAutomationGraph(
            commentTriggerGraph({ post_scope: "any_reel" }),
            { requirePostId: true },
        )
        expect(errors).toEqual([])
    })

    it("clears stale post selections when a broad scope is set", () => {
        const { graph } = validateDeveloperAutomationGraph(
            commentTriggerGraph({ post_scope: "any", post_id: "17895695668004550", post_caption: "old" }),
        )
        expect(graph?.nodes[0]?.data?.config).toHaveProperty("post_id", "")
        expect(graph?.nodes[0]?.data?.config).not.toHaveProperty("post_caption")
    })

    it("drops invalid scope values so legacy resolution applies", () => {
        const { graph, errors } = validateDeveloperAutomationGraph(
            commentTriggerGraph({ post_scope: "everything", post_id: "17895695668004550" }),
        )
        expect(graph?.nodes[0]?.data?.config).not.toHaveProperty("post_scope")
        expect(errors).toEqual([])
    })
})

describe("enrichCommentPostContext", () => {
    const automationWithConfig = (config: Record<string, unknown>) => ({
        workflow_graph: {
            nodes: [{ id: "t", data: { type: "trigger_new_comment", config } }],
        },
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it("uses the trigger config caption for the selected post without fetching", async () => {
        const fetchSpy = vi.fn()
        vi.stubGlobal("fetch", fetchSpy)

        const enriched = await enrichCommentPostContext(
            { post_id: "media-1", comment_text: "price?" },
            automationWithConfig({ post_id: "media-1", post_caption: "Summer drop is live" }),
            { access_token: "token" },
        )

        expect(enriched.post_caption).toBe("Summer drop is live")
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it("fetches caption and media type from the Graph API for broad scopes", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => ({
            ok: true,
            json: async () => ({ caption: "New Reel about pricing", media_product_type: "REELS" }),
        })))

        const enriched = await enrichCommentPostContext(
            { post_id: "media-7" },
            automationWithConfig({ post_scope: "any_reel" }),
            { access_token: "token" },
        )

        expect(enriched.post_caption).toBe("New Reel about pricing")
        expect(enriched.media_type).toBe("REELS")
    })

    it("never blocks the run when enrichment fails", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down") }))
        vi.spyOn(console, "error").mockImplementation(() => undefined)

        const enriched = await enrichCommentPostContext(
            { post_id: "media-7", comment_text: "hello" },
            automationWithConfig({ post_scope: "any" }),
            { access_token: "token" },
        )

        expect(enriched.post_caption).toBeUndefined()
        expect(enriched.comment_text).toBe("hello")
    })

    it("skips fetching entirely when there is no post context to resolve", async () => {
        const fetchSpy = vi.fn()
        vi.stubGlobal("fetch", fetchSpy)

        const enriched = await enrichCommentPostContext(
            { message_text: "dm" },
            automationWithConfig({}),
            { access_token: "token" },
        )

        expect(enriched.post_caption).toBeUndefined()
        expect(fetchSpy).not.toHaveBeenCalled()
    })
})

describe("buildAutomationAiPrompt post grounding", () => {
    it("includes the post caption so the AI does not reply blindly", () => {
        const prompt = buildAutomationAiPrompt({}, {
            commenter_username: "jane",
            comment_text: "how much?",
            post_caption: "Limited edition sneakers, link in bio",
            media_type: "REELS",
        })

        expect(prompt).toContain('a Reel with caption: "Limited edition sneakers, link in bio"')
        expect(prompt).toContain("Comment text: how much?")
    })

    it("labels non-Reel media as a post", () => {
        const prompt = buildAutomationAiPrompt({}, {
            comment_text: "nice!",
            post_caption: "Behind the scenes",
            media_type: "FEED",
        })

        expect(prompt).toContain('a post with caption: "Behind the scenes"')
    })
})
