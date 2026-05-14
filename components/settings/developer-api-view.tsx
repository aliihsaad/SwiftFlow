"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { CheckCircle2, Clipboard, Code2, KeyRound, Link2, Lock, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { DeveloperApiScope } from "@/lib/developer-api/types"
import {
  buildDeveloperApiGuide,
  DEVELOPER_API_AUTH_HEADER_EXAMPLE,
  DEVELOPER_API_CODEX_CONFIG_TEMPLATE,
} from "@/lib/developer-api/guide"

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { cache: "no-store" })
  const json = await response.json()
  if (!response.ok) throw new Error(json?.error || `Request failed: ${response.status}`)
  return json as T
}

type ScopeOption = {
  scope: DeveloperApiScope
  label: string
  capability: {
    area: string
    level: "read" | "write" | "run"
    description: string
  }
}

type DeveloperApiKey = {
  id: string
  name: string
  keyPrefix: string
  scopes: DeveloperApiScope[]
  status: string
  expiresAt: string | null
  lastUsedAt: string | null
  createdAt: string
  capabilities: {
    summary: string[]
    access: ScopeOption["capability"][]
  }
}

type DeveloperApiResponse = {
  entitlement: {
    allowed: boolean
    mode: "off" | "preview" | "paid_only"
    reason: string
  }
  scopeOptions: ScopeOption[]
  keys: DeveloperApiKey[]
}

type AuditLog = {
  id: string
  key_prefix: string | null
  method: string
  route: string
  action: string
  status_code: number
  error_code: string | null
  created_at: string
}

type KeyActionTarget = {
  action: "revoke" | "delete"
  key: DeveloperApiKey
}

const defaultScopes: DeveloperApiScope[] = [
  "workspace:read",
  "brand:read",
  "posts:read",
  "posts:create",
  "automations:read",
  "analytics:read",
]

function formatDate(value: string | null) {
  if (!value) return "Never"
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
}

function buildExpiry(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString()
}

function copyText(value: string) {
  if (typeof navigator === "undefined") return
  void navigator.clipboard.writeText(value)
}

export function DeveloperApiView() {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState("Codex workspace key")
  const [selectedScopes, setSelectedScopes] = useState<DeveloperApiScope[]>(defaultScopes)
  const [expiresInDays, setExpiresInDays] = useState(90)
  const [createdSecret, setCreatedSecret] = useState<string | null>(null)
  const [confirmKeyAction, setConfirmKeyAction] = useState<KeyActionTarget | null>(null)
  const [pendingKeyAction, setPendingKeyAction] = useState<KeyActionTarget | null>(null)
  const {
    data: keysData,
    error: keysError,
    isLoading: keysLoading,
    mutate: reloadKeys,
  } = useSWR<DeveloperApiResponse>("/api/developer/keys", fetcher)
  const {
    data: auditData,
    error: auditError,
    mutate: reloadAudit,
  } = useSWR<{ logs: AuditLog[] }>("/api/developer/audit-logs", fetcher)

  const data = keysData || null
  const auditLogs = auditData?.logs || []
  const loading = keysLoading
  const loadError = keysError || auditError
  const guide = buildDeveloperApiGuide(typeof window === "undefined" ? "https://social.swiftdigital-s.com" : window.location.origin)

  const selectedCapabilities = useMemo(() => {
    const options = data?.scopeOptions || []
    return selectedScopes
      .map((scope) => options.find((option) => option.scope === scope))
      .filter((option): option is ScopeOption => Boolean(option))
      .map((option) => option.capability)
  }, [data?.scopeOptions, selectedScopes])

  function toggleScope(scope: DeveloperApiScope) {
    setSelectedScopes((current) => current.includes(scope)
      ? current.filter((item) => item !== scope)
      : [...current, scope])
  }

  async function createKey() {
    setSaving(true)
    setError(null)
    try {
      const response = await fetch("/api/developer/keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          scopes: selectedScopes,
          expiresAt: buildExpiry(expiresInDays),
        }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json?.error || "Failed to create Developer API key")
      setCreatedSecret(json.plaintext)
      await Promise.all([reloadKeys(), reloadAudit()])
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create Developer API key")
    } finally {
      setSaving(false)
    }
  }

  async function revokeKey(key: DeveloperApiKey) {
    setError(null)
    setPendingKeyAction({ action: "revoke", key })
    try {
      const response = await fetch(`/api/developer/keys/${key.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "revoked_from_settings" }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json?.error || "Failed to revoke key")
      await Promise.all([reloadKeys(), reloadAudit()])
      setConfirmKeyAction(null)
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : "Failed to revoke key")
    } finally {
      setPendingKeyAction(null)
    }
  }

  async function deleteRevokedKey(key: DeveloperApiKey) {
    setError(null)
    setPendingKeyAction({ action: "delete", key })
    try {
      const response = await fetch(`/api/developer/keys/${key.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ permanent: true }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json?.error || "Failed to delete key")
      await Promise.all([reloadKeys(), reloadAudit()])
      setConfirmKeyAction(null)
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete key")
    } finally {
      setPendingKeyAction(null)
    }
  }

  async function runConfirmedKeyAction() {
    if (!confirmKeyAction) return
    if (confirmKeyAction.action === "revoke") {
      await revokeKey(confirmKeyAction.key)
      return
    }
    await deleteRevokedKey(confirmKeyAction.key)
  }

  const preview = data?.entitlement.mode === "preview"

  return (
    <div className="space-y-4">
      <Card className="border-white/10 bg-[#151620] text-white/85">
        <CardHeader className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-white/90">
                <KeyRound className="size-4 text-cyan-300" />
                Developer API
              </CardTitle>
              <CardDescription className="text-white/50">
                Create scoped keys for Codex, Claude, scripts, and automation clients.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {preview && <Badge className="border-cyan-300/30 bg-cyan-300/10 text-cyan-100" variant="outline">Preview access</Badge>}
              <Button type="button" variant="outline" size="sm" onClick={() => { reloadKeys(); reloadAudit() }} disabled={loading}>
                <RefreshCw className="size-4" />
                Refresh
              </Button>
            </div>
          </div>
          {preview && (
            <div className="rounded-md border border-cyan-300/15 bg-cyan-300/8 px-3 py-2 text-sm text-cyan-50/80">
              Full API access is enabled now. The paid-plan entitlement hook is wired and can be enforced later when payments launch.
            </div>
          )}
          {error && (
            <div className="rounded-md border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</div>
          )}
          {loadError && (
            <div className="rounded-md border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-100">
              {loadError instanceof Error ? loadError.message : "Failed to load Developer API"}
            </div>
          )}
        </CardHeader>
        <CardContent className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
          <div className="space-y-3">
            <div className="grid gap-2">
              <Label htmlFor="developer-api-key-name" className="text-white/75">Key name</Label>
              <Input
                id="developer-api-key-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="border-white/10 bg-white/5 text-white"
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-white/75">Expiration</Label>
              <div className="flex flex-wrap gap-2">
                {[30, 90, 180, 365].map((days) => (
                  <Button
                    key={days}
                    type="button"
                    variant={expiresInDays === days ? "default" : "outline"}
                    size="sm"
                    onClick={() => setExpiresInDays(days)}
                  >
                    {days === 365 ? "1 year" : `${days} days`}
                  </Button>
                ))}
              </div>
            </div>
            <div className="grid gap-2">
              <Label className="text-white/75">Access scopes</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {(data?.scopeOptions || []).map((option) => {
                  const selected = selectedScopes.includes(option.scope)
                  return (
                    <button
                      key={option.scope}
                      type="button"
                      onClick={() => toggleScope(option.scope)}
                      className={`rounded-md border p-3 text-left transition ${selected ? "border-cyan-300/40 bg-cyan-300/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-white/90">{option.label}</span>
                        {selected && <CheckCircle2 className="size-4 text-cyan-200" />}
                      </div>
                      <p className="mt-1 text-xs text-white/50">{option.capability.description}</p>
                    </button>
                  )
                })}
              </div>
            </div>
            <Button type="button" onClick={createKey} disabled={saving || selectedScopes.length === 0} className="w-full sm:w-auto">
              <Plus className="size-4" />
              Create API Key
            </Button>
          </div>

          <div className="rounded-md border border-white/10 bg-black/20 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/85">
              <ShieldCheck className="size-4 text-emerald-300" />
              Access model
            </div>
            <div className="space-y-2">
              {selectedCapabilities.map((capability) => (
                <div key={`${capability.area}-${capability.level}-${capability.description}`} className="rounded-md border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-white/90">{capability.area}</span>
                    <Badge variant="outline" className="border-white/15 text-white/65">{capability.level}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-white/50">{capability.description}</p>
                </div>
              ))}
              {selectedCapabilities.length === 0 && <p className="text-sm text-white/45">Select scopes to preview what this key can access.</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-[#151620] text-white/85">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-white/90">
                <Code2 className="size-4 text-cyan-300" />
                Connection Guide
              </CardTitle>
              <CardDescription className="text-white/50">
                Use scoped keys with REST, OpenAPI clients, or the hosted MCP connector.
              </CardDescription>
            </div>
            <Badge variant="outline" className="border-emerald-300/25 bg-emerald-300/10 text-emerald-100">MCP ready</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,520px)]">
          <div className="grid min-w-0 gap-3">
            {[
              { label: "Base URL", value: guide.baseUrl },
              { label: "MCP endpoint", value: guide.mcpUrl },
              { label: "OpenAPI schema", value: guide.openApiUrl },
              { label: "OAuth metadata", value: guide.oauthMetadataUrl },
              { label: "Auth header", value: DEVELOPER_API_AUTH_HEADER_EXAMPLE },
            ].map((item) => (
              <div key={item.label} className="grid min-w-0 gap-2 rounded-md border border-white/10 bg-white/[0.03] p-3 sm:grid-cols-[130px_minmax(0,1fr)_auto] sm:items-center">
                <span className="text-xs font-semibold uppercase text-white/45">{item.label}</span>
                <code className="min-w-0 break-all rounded bg-black/25 px-2 py-1 text-xs text-cyan-50/80">{item.value}</code>
                <Button type="button" variant="outline" size="sm" onClick={() => copyText(item.value)} aria-label={`Copy ${item.label}`} className="w-full sm:w-auto">
                  <Clipboard className="size-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="min-w-0 rounded-md border border-white/10 bg-black/25 p-3">
            <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-white/85">
                <Link2 className="size-4 text-cyan-300" />
                Codex MCP config
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => copyText(DEVELOPER_API_CODEX_CONFIG_TEMPLATE)} className="w-full sm:w-auto">
                <Clipboard className="size-4" />
                Copy
              </Button>
            </div>
            <pre className="max-w-full overflow-x-auto rounded-md border border-white/10 bg-[#0b0c12] p-3 text-xs leading-5 text-white/70">
              <code>{DEVELOPER_API_CODEX_CONFIG_TEMPLATE}</code>
            </pre>
            <div className="mt-3 grid gap-2 text-xs text-white/55">
              <p>Store the key in the local environment as SWIFTFLOW_API_KEY. Do not paste the secret into config files or source control.</p>
              <p>Claude Desktop and ChatGPT use the same MCP endpoint with OAuth linking. For the smoothest setup, add or reconnect SwiftFlow from the desktop browser experience first, then use it on desktop or mobile after it is linked.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-[#151620] text-white/85">
        <CardHeader>
          <CardTitle className="text-white/90">Active Keys</CardTitle>
          <CardDescription className="text-white/50">Secrets are shown once on creation. Stored keys only show their prefix.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && <p className="text-sm text-white/50">Loading Developer API keys...</p>}
          {!loading && (data?.keys || []).length === 0 && <p className="text-sm text-white/50">No API keys created yet.</p>}
          {(data?.keys || []).map((key) => (
            <div key={key.id} className="rounded-md border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                  <p className="font-semibold text-white/90">{key.name}</p>
                    <Badge variant="outline" className="border-white/15 text-white/65">{key.status}</Badge>
                  </div>
                  <p className="mt-1 font-mono text-xs text-white/45">{key.keyPrefix}...</p>
                  <p className="mt-2 text-xs text-white/45">Expires {formatDate(key.expiresAt)} · Last used {formatDate(key.lastUsedAt)}</p>
                </div>
                {key.status === "active" && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmKeyAction({ action: "revoke", key })}
                    disabled={pendingKeyAction?.key.id === key.id}
                    className="w-full sm:w-auto"
                  >
                    {pendingKeyAction?.key.id === key.id ? <RefreshCw className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                    {pendingKeyAction?.key.id === key.id ? "Revoking..." : "Revoke"}
                  </Button>
                )}
                {key.status === "revoked" && (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => setConfirmKeyAction({ action: "delete", key })}
                    disabled={pendingKeyAction?.key.id === key.id}
                    className="w-full sm:w-auto"
                  >
                    {pendingKeyAction?.key.id === key.id ? <RefreshCw className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                    {pendingKeyAction?.key.id === key.id ? "Deleting..." : "Delete"}
                  </Button>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {key.capabilities.summary.map((item) => (
                  <Badge key={item} variant="outline" className="border-cyan-300/20 bg-cyan-300/5 text-cyan-50/75">{item}</Badge>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-[#151620] text-white/85">
        <CardHeader>
          <CardTitle className="text-white/90">Audit Log</CardTitle>
          <CardDescription className="text-white/50">Recent Developer API requests for this workspace.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {auditLogs.length === 0 && <p className="text-sm text-white/50">No API requests recorded yet.</p>}
          {auditLogs.slice(0, 12).map((log) => (
            <div key={log.id} className="grid gap-2 rounded-md border border-white/10 bg-white/[0.03] p-3 text-xs text-white/60 sm:grid-cols-[120px_1fr_70px]">
              <span>{formatDate(log.created_at)}</span>
              <span className="break-all font-mono">{log.method} {log.route}</span>
              <span className={log.status_code >= 400 ? "text-red-200" : "text-emerald-200"}>{log.status_code}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={Boolean(createdSecret)} onOpenChange={(open) => !open && setCreatedSecret(null)}>
        <DialogContent className="border-white/10 bg-[#151620] text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="size-4 text-amber-200" />
              Copy API Key
            </DialogTitle>
            <DialogDescription className="text-white/55">
              This secret is shown once. Store it in your client or agent environment now.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-white/10 bg-black/30 p-3 font-mono text-xs text-white/80 break-all">
            {createdSecret}
          </div>
          <Button type="button" onClick={() => createdSecret && navigator.clipboard.writeText(createdSecret)}>
            <Clipboard className="size-4" />
            Copy
          </Button>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(confirmKeyAction)}
        onOpenChange={(open) => {
          if (!open && !pendingKeyAction) setConfirmKeyAction(null)
        }}
      >
        <AlertDialogContent className="border-white/10 bg-[#151620] text-white/85">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white/90">
              {confirmKeyAction?.action === "delete" ? "Delete revoked API key?" : "Revoke API key?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-white/55">
              {confirmKeyAction?.action === "delete"
                ? "This removes the revoked key record from Settings. Existing requests using this key are already blocked."
                : "This immediately blocks Codex, Claude, ChatGPT, scripts, and other clients using this key."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirmKeyAction && (
            <div className="rounded-md border border-white/10 bg-black/25 p-3 text-sm">
              <p className="font-medium text-white/90">{confirmKeyAction.key.name}</p>
              <p className="mt-1 break-all font-mono text-xs text-white/45">{confirmKeyAction.key.keyPrefix}...</p>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(pendingKeyAction)} className="border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void runConfirmedKeyAction()
              }}
              disabled={Boolean(pendingKeyAction)}
              className={confirmKeyAction?.action === "delete"
                ? "border border-red-500/25 bg-red-500/15 text-red-200 hover:bg-red-500/20"
                : "border border-amber-400/25 bg-amber-400/15 text-amber-100 hover:bg-amber-400/20"}
            >
              {pendingKeyAction && <RefreshCw className="mr-2 size-4 animate-spin" />}
              {pendingKeyAction
                ? pendingKeyAction.action === "delete" ? "Deleting..." : "Revoking..."
                : confirmKeyAction?.action === "delete" ? "Delete key" : "Revoke key"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
