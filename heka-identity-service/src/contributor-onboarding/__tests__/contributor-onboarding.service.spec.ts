import { EntityManager } from '@mikro-orm/core'
import { ConflictException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthInfo, Role } from 'common/auth'
import { User } from 'common/entities'

import { ContributorAuditEventType } from '../contributor-audit-event.entity'
import { ContributorBinding } from '../contributor-binding.entity'
import { ContributorOnboardingService } from '../contributor-onboarding.service'

function auth(overrides: Partial<AuthInfo> = {}): AuthInfo {
  return {
    userId: 'user-1',
    user: {} as User,
    userName: 'ada',
    role: Role.User,
    walletId: 'User_user-1',
    tenantId: 'tenant-1',
    ...overrides,
  }
}

function binding(overrides: Partial<ContributorBinding> = {}): ContributorBinding {
  const row = new ContributorBinding()
  row.userId = 'user-1'
  row.tenantId = 'tenant-1'
  row.walletId = 'User_user-1'
  row.githubAccountId = '4115704'
  row.githubUsername = 'octocat'
  row.linkedAt = new Date('2026-10-01T00:00:00Z')
  row.updatedAt = new Date('2026-10-01T00:00:00Z')
  return Object.assign(row, overrides)
}

describe('ContributorOnboardingService', () => {
  let service: ContributorOnboardingService
  let em: {
    findOne: ReturnType<typeof vi.fn>
    find: ReturnType<typeof vi.fn>
    persist: ReturnType<typeof vi.fn>
    flush: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    em = {
      findOne: vi.fn(),
      find: vi.fn().mockResolvedValue([]),
      persist: vi.fn(),
      flush: vi.fn().mockResolvedValue(undefined),
    }
    service = new ContributorOnboardingService(em as unknown as EntityManager)
  })

  it('requires a linked GitHub account before a challenge', async () => {
    em.findOne.mockResolvedValue(null)
    await expect(service.getRequiredBindingForUser(auth())).rejects.toThrow(UnauthorizedException)
  })

  it('rejects a binding stored for a different wallet', async () => {
    em.findOne.mockResolvedValue(binding({ walletId: 'User_other' }))
    await expect(service.getRequiredBindingForUser(auth())).rejects.toThrow(ForbiddenException)
  })

  it('returns not-connected status when the user has no binding', async () => {
    em.findOne.mockResolvedValue(null)
    await expect(service.getStatus(auth())).resolves.toMatchObject({
      verificationStatus: 'NotConnected',
      binding: undefined,
    })
  })

  it('returns GitHubConnected before GPG verification', async () => {
    em.findOne.mockResolvedValue(binding())
    await expect(service.getStatus(auth())).resolves.toMatchObject({
      verificationStatus: 'GitHubConnected',
      github: { accountId: '4115704', username: 'octocat' },
    })
  })

  it('throws when credential issuance asks for a missing binding', async () => {
    em.findOne.mockResolvedValue(null)
    await expect(service.getVerifiedBindingByUser('tenant-1', 'user-1', 'User_user-1')).rejects.toThrow(
      NotFoundException,
    )
  })

  it('throws when the binding is not GPG-verified', async () => {
    em.findOne.mockResolvedValue(binding())
    await expect(service.getVerifiedBindingByUser('tenant-1', 'user-1', 'User_user-1')).rejects.toThrow(
      ConflictException,
    )
  })

  it('returns the stored GitHub account id for a verified binding', async () => {
    const verifiedAt = new Date('2026-10-02T00:00:00Z')
    em.findOne.mockResolvedValue(binding({ gpgFingerprint: 'AABB', verifiedAt }))

    await expect(service.getVerifiedBindingByUser('tenant-1', 'user-1', 'User_user-1')).resolves.toEqual({
      githubAccountId: '4115704',
      githubUsername: 'octocat',
      gpgFingerprint: 'AABB',
      verifiedAt: verifiedAt.toISOString(),
      walletId: 'User_user-1',
    })
  })

  it('does not let user A read user B by passing a different wallet', async () => {
    em.findOne.mockResolvedValue(binding())
    await expect(service.getVerifiedBindingByUser('tenant-1', 'user-1', 'User_other')).rejects.toThrow(
      ForbiddenException,
    )
  })

  it('stamps the binding when the proof matches that user', async () => {
    const row = binding()
    em.findOne.mockResolvedValue(row)
    const verifiedAt = new Date('2026-10-03T00:00:00Z')

    const updated = await service.recordProofAccepted({
      userId: 'user-1',
      tenantId: 'tenant-1',
      githubAccountId: '4115704',
      githubUsername: 'octocat',
      walletId: 'User_user-1',
      gpgFingerprint: 'FF00',
      verifiedAt,
    })

    expect(updated?.gpgFingerprint).toBe('FF00')
    expect(updated?.verifiedAt).toEqual(verifiedAt)
    expect(em.persist).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: ContributorAuditEventType.ProofAccepted }),
    )
  })

  it('does not stamp a binding for a different GitHub account', async () => {
    em.findOne.mockResolvedValue(binding({ githubAccountId: '999' }))

    const updated = await service.recordProofAccepted({
      userId: 'user-1',
      tenantId: 'tenant-1',
      githubAccountId: '4115704',
      githubUsername: 'octocat',
      walletId: 'User_user-1',
      gpgFingerprint: 'FF00',
      verifiedAt: new Date(),
    })

    expect(updated).toBeUndefined()
  })
})
