import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()
const tableOrderCsv = readFileSync(path.join(root, "supabase", "schema-map", "table-order.csv"), "utf8")
const policiesCsv = readFileSync(path.join(root, "supabase", "schema-map", "policies.csv"), "utf8")
const liveSchema = readFileSync(path.join(root, "supabase", "schema.live.sql"), "utf8")

const tables = tableOrderCsv
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((line) => line.trim())
  .filter(Boolean)

const policyBlocks = policiesCsv
  .split(/\r?\n(?=public,)/)
  .map((block) => block.trim())
  .filter((block) => block.startsWith("public,"))

function policiesForTable(table: string) {
  return policyBlocks.filter((block) => block.startsWith(`public,${table},`))
}

describe("Supabase RLS and policy inventory", () => {
  it("has a tracked policy export for every public table in the schema map", () => {
    expect(tables).toHaveLength(25)

    for (const table of tables) {
      expect(policiesForTable(table), `${table} should have exported policies`).not.toHaveLength(0)
    }
  })

  it("enables row level security on every public table in the live schema export", () => {
    for (const table of tables) {
      expect(liveSchema, `${table} should enable RLS`).toContain(
        `ALTER TABLE "public"."${table}" ENABLE ROW LEVEL SECURITY;`,
      )
    }
  })

  it("keeps user-facing workspace tables scoped through workspace membership or auth uid", () => {
    const workspaceScopedTables = [
      "account_analytics",
      "analytics_snapshots",
      "automation_events",
      "automation_logs",
      "automation_node_runs",
      "automation_runs",
      "automation_scheduled_executions",
      "automations",
      "comments",
      "conversations",
      "external_services",
      "generated_assets",
      "messages",
      "post_analytics",
      "posts",
      "processed_comments",
      "published_posts",
      "social_accounts",
      "workspace_brand_profiles",
      "workspace_members",
      "workspace_settings",
      "workspaces",
    ]

    for (const table of workspaceScopedTables) {
      const combinedPolicies = policiesForTable(table).join("\n")
      expect(
        /(workspace_members|is_member_of|auth\.uid\(\))/.test(combinedPolicies),
        `${table} should be scoped by workspace membership or auth.uid()`,
      ).toBe(true)
    }
  })

  it("limits internal tables to service-role-only access when they are not user-facing", () => {
    for (const table of ["oauth_page_sessions", "webhook_events"]) {
      const combinedPolicies = policiesForTable(table).join("\n")
      expect(combinedPolicies, `${table} should not expose broad public access`).toContain("service_role")
      expect(combinedPolicies, `${table} should not have permissive true user policies`).not.toContain(",{public},ALL,true,true")
    }
  })
})
