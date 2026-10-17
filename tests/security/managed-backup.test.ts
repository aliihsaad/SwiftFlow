import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { encryptBackup, decryptBackup, generateKeys, MAX_ARCHIVE_BYTES } from '@/scripts/managed-backup/crypto.mjs'
import { shouldLogSchedulerSuccess } from '@/supabase/functions/_shared/scheduler-logging'

const keys = generateKeys()
describe('encrypted managed backups', () => {
  it('round-trips binary database and secret content without plaintext in the artifact', () => {
    const data = Buffer.from('private credentials\0binary\xffcheckpoint')
    const encrypted = encryptBackup(data, keys.publicKey)
    expect(encrypted.includes(Buffer.from('private credentials'))).toBe(false)
    expect(decryptBackup(encrypted, keys.privateKey)).toEqual(data)
    expect(encryptBackup(data, keys.publicKey)).not.toEqual(encrypted)
  })
  it('rejects a wrong recovery key', () => {
    expect(() => decryptBackup(encryptBackup(Buffer.from('data'), keys.publicKey), generateKeys().privateKey)).toThrow()
  })
  it.each(['header', 'ciphertext', 'tag', 'truncated'])('rejects %s corruption', part => {
    const data = encryptBackup(Buffer.from('sensitive rows'), keys.publicKey)
    if (part === 'header') data[30] ^= 1
    if (part === 'ciphertext') data[data.length - 17] ^= 1
    if (part === 'tag') data[data.length - 1] ^= 1
    expect(() => decryptBackup(part === 'truncated' ? data.subarray(0, -10) : data, keys.privateKey)).toThrow()
  })
  it('fails closed before exceeding the free artifact budget', () => {
    expect(() => encryptBackup(Buffer.alloc(MAX_ARCHIVE_BYTES + 1), keys.publicKey)).toThrow('safety cap')
  })
  it('does not include application data tables in cleanup', () => {
    const migration = readFileSync('supabase/migrations/20261017120000_bound_scheduler_diagnostic_history.sql', 'utf8')
    expect(migration).not.toMatch(/(?:delete from|truncate|update)\s+public\./i)
    expect(migration).toContain('for update skip locked')
    expect(migration).toContain("set lock_timeout = '500ms'")
    expect(migration).toContain('history.end_time is not null')
  })
})

describe('scheduler log sampling leaves work visible', () => {
  const idle = { success: true, message: 'No pending executions', count: 0, reclaim: { reclaimed: 0, abandoned: 0 }, expiredApprovals: 0 }
  it('suppresses only known idle minute diagnostics and retains an hourly heartbeat', () => {
    expect(shouldLogSchedulerSuccess('process-scheduled-executions', idle, 15)).toBe(false)
    expect(shouldLogSchedulerSuccess('process-scheduled-executions', idle, 0)).toBe(true)
  })
  it.each([
    { ...idle, success: false }, { ...idle, count: 1 }, { ...idle, expiredApprovals: 1 },
    { ...idle, reclaim: { reclaimed: 1 } }, { ...idle, reclaim: { abandoned: 1 } },
    { stats: { processed: 1, errors: 0 } }, null,
  ])('retains non-idle, failure and unfamiliar outcomes', data => {
    expect(shouldLogSchedulerSuccess('process-scheduled-executions', data, 15)).toBe(true)
  })
  it('retains maintenance worker diagnostics', () => {
    expect(shouldLogSchedulerSuccess('retention-cleanup', idle, 15)).toBe(true)
  })
})
