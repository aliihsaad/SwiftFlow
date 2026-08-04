import { describe, expect, it } from "vitest"
import { isTokenCheckDue, resolveTokenHealth } from "../../supabase/functions/_shared/token-health.ts"

const now = new Date("2026-07-03T12:00:00Z")

describe("resolveTokenHealth", () => {
    it("treats a valid non-expiring token (expires_at=0) as valid", () => {
        const health = resolveTokenHealth({ is_valid: true, expires_at: 0, scopes: ["instagram_business_basic"] }, now)
        expect(health.status).toBe("valid")
        expect(health.expiresAt).toBeNull()
        expect(health.scopes).toEqual(["instagram_business_basic"])
    })

    it("flags tokens expiring within 7 days", () => {
        const inThreeDays = Math.floor(new Date("2026-07-06T12:00:00Z").getTime() / 1000)
        const health = resolveTokenHealth({ is_valid: true, expires_at: inThreeDays }, now)
        expect(health.status).toBe("expiring_soon")
        expect(health.expiresAt).toBe("2026-07-06T12:00:00.000Z")
    })

    it("treats invalid or already-expired tokens as invalid", () => {
        expect(resolveTokenHealth({ is_valid: false, expires_at: 0 }, now).status).toBe("invalid")

        const yesterday = Math.floor(new Date("2026-07-02T12:00:00Z").getTime() / 1000)
        expect(resolveTokenHealth({ is_valid: true, expires_at: yesterday }, now).status).toBe("invalid")
    })

    it("treats missing debug data as invalid, never as valid", () => {
        expect(resolveTokenHealth(null, now).status).toBe("invalid")
        expect(resolveTokenHealth({}, now).status).toBe("invalid")
    })

    it("extracts granular scopes for permission re-sync", () => {
        const health = resolveTokenHealth({
            is_valid: true,
            expires_at: 0,
            scopes: ["instagram_business_manage_comments"],
            granular_scopes: [{ scope: "instagram_business_manage_comments", target_ids: ["123"] }, { scope: 42 }],
        }, now)
        expect(health.granularScopes).toEqual([{ scope: "instagram_business_manage_comments", target_ids: ["123"] }])
    })
})

describe("isTokenCheckDue", () => {
    it("is due when never checked or past the interval", () => {
        expect(isTokenCheckDue(null, now)).toBe(true)
        expect(isTokenCheckDue("garbage", now)).toBe(true)
        expect(isTokenCheckDue("2026-07-02T10:00:00Z", now)).toBe(true)
    })

    it("is not due within the interval", () => {
        expect(isTokenCheckDue("2026-07-03T02:00:00Z", now)).toBe(false)
    })
})
