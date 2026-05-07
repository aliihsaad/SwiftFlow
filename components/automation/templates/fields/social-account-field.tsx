"use client"

import { useEffect } from 'react'
import useSWR from 'swr'
import { Label } from '@/components/ui/label'

interface SocialAccountOption {
  id: string
  username: string
  platform: 'instagram' | 'facebook'
}

const fetcher = async (url: string): Promise<{ accounts: SocialAccountOption[] }> => {
  const res = await fetch(url)
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error || 'Failed to load accounts')
  return data
}

export function SocialAccountField({
  value,
  onChange,
  platform,
  label,
  required,
}: {
  value: string
  onChange: (id: string) => void
  platform: 'instagram' | 'facebook'
  label: string
  required?: boolean
}) {
  const { data, isLoading } = useSWR(
    `/api/automations/social-accounts?platform=${platform}`,
    fetcher,
  )
  const accounts = data?.accounts || []

  useEffect(() => {
    if (!isLoading && accounts.length === 1 && !value) {
      onChange(accounts[0].id)
    }
  }, [isLoading, accounts, value, onChange])

  if (!isLoading && accounts.length === 1) return null

  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold text-white/80">
        {label}
        {required && <span className="ml-1 text-rose-300">*</span>}
      </Label>
      {isLoading ? (
        <p className="text-xs text-white/45">Loading accounts…</p>
      ) : accounts.length === 0 ? (
        <p className="text-xs text-amber-300">
          No {platform === 'facebook' ? 'Facebook pages' : 'Instagram accounts'} connected. Connect one in Settings first.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {accounts.map((account) => {
            const isActive = value === account.id
            return (
              <button
                key={account.id}
                type="button"
                onClick={() => onChange(account.id)}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                  isActive
                    ? 'bg-cyan-500/15 text-white ring-1 ring-cyan-300/40'
                    : 'bg-white/[0.04] text-white/80 hover:bg-white/[0.08]'
                }`}
              >
                <span>@{account.username}</span>
                <span className="text-xs uppercase tracking-wider text-white/40">{account.platform}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
