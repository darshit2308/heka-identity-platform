import * as crypto from 'crypto'

import { EntityManager } from '@mikro-orm/core'
import { HttpService } from '@nestjs/axios'
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigType } from '@nestjs/config'
import axios from 'axios'
import * as openpgp from 'openpgp'
import { firstValueFrom } from 'rxjs'

import { AuthInfo } from 'common/auth'
import GithubConfig from 'config/github'

import { ContributorOnboardingService } from '../contributor-onboarding'

import { GpgChallenge } from './gpg-challenge.entity'

const CHALLENGE_TTL_MINUTES = 5

/** GitHub logins are 1–39 characters and cannot start or end with a hyphen. */
const GITHUB_USERNAME_PATTERN = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/
const ARMORED_PUBLIC_KEY_BLOCK_PATTERN =
  /-----BEGIN PGP PUBLIC KEY BLOCK-----[\s\S]*?-----END PGP PUBLIC KEY BLOCK-----/g

export interface VerificationSuccess {
  verified: true
  gpgFingerprint: string
  githubAccountId: string
  githubUsername: string
  walletId: string
}

export interface VerificationFailure {
  verified: false
}

export type VerificationResult = VerificationSuccess | VerificationFailure

export interface ContributorStatus {
  isVerified: boolean
  githubUsername: string
  gpgFingerprint?: string
  verifiedAt?: Date
}

interface CreateChallengeInput {
  userId: string
  tenantId: string
  walletId: string
  githubAccountId: string
  githubUsername: string
}

@Injectable()
export class GpgChallengeService {
  private readonly logger = new Logger(GpgChallengeService.name)

  public constructor(
    private readonly em: EntityManager,
    private readonly httpService: HttpService,
    private readonly contributorOnboardingService: ContributorOnboardingService,
    @Inject(GithubConfig.KEY) private readonly githubConfig: ConfigType<typeof GithubConfig>,
  ) {}

  /**
   * Nonce bound to the caller's linked GitHub account.
   * The caller signs it with `echo "<nonce>" | gpg --clearsign`.
   */
  public async createChallengeForUser(authInfo: AuthInfo): Promise<GpgChallenge> {
    const binding = await this.contributorOnboardingService.getRequiredBindingForUser(authInfo)
    const challenge = await this.createChallenge({
      userId: authInfo.userId,
      tenantId: authInfo.tenantId,
      walletId: authInfo.walletId,
      githubAccountId: binding.githubAccountId,
      githubUsername: binding.githubUsername,
    })

    await this.contributorOnboardingService.recordChallengeRequested({
      userId: authInfo.userId,
      tenantId: authInfo.tenantId,
      githubAccountId: binding.githubAccountId,
      githubUsername: binding.githubUsername,
      walletId: authInfo.walletId,
      challengeId: challenge.id,
    })

    return challenge
  }

  public async createChallenge(input: CreateChallengeInput): Promise<GpgChallenge> {
    const expiresAt = new Date()
    expiresAt.setMinutes(expiresAt.getMinutes() + CHALLENGE_TTL_MINUTES)

    const challenge = new GpgChallenge()
    challenge.userId = input.userId
    challenge.tenantId = input.tenantId
    challenge.walletId = input.walletId
    challenge.githubAccountId = input.githubAccountId
    challenge.githubUsername = input.githubUsername
    challenge.nonce = crypto.randomBytes(32).toString('hex')
    challenge.expiresAt = expiresAt
    challenge.consumed = false

    this.em.persist(challenge)
    await this.em.flush()
    this.logger.log(`Challenge created for @${input.githubUsername} (${challenge.id})`)
    return challenge
  }

  /**
   * Burns the nonce before any network or crypto work, then checks the
   * cleartext signature against the public key published at github.com/<user>.gpg.
   * A challenge that belongs to another user is reported as not found.
   */
  public async verifySignature(
    authInfo: AuthInfo,
    challengeId: string,
    armoredMessage: string,
  ): Promise<VerificationResult> {
    const challenge = await this.em.findOne(GpgChallenge, { id: challengeId })
    if (!challenge || !this.ownsChallenge(authInfo, challenge)) {
      throw new NotFoundException(`Challenge session '${challengeId}' not found.`)
    }

    if (challenge.consumed) {
      throw new BadRequestException(
        'Replay attack detected: this challenge has already been consumed. Request a new challenge to try again.',
      )
    }

    if (new Date() > challenge.expiresAt) {
      throw new BadRequestException(
        `Challenge expired at ${challenge.expiresAt.toISOString()}. Request a new challenge - each nonce is valid for ${CHALLENGE_TTL_MINUTES} minutes.`,
      )
    }

    const updated = await this.em.nativeUpdate(GpgChallenge, { id: challengeId, consumed: false }, { consumed: true })
    if (updated === 0) {
      throw new BadRequestException(
        'Replay attack detected: this challenge has already been consumed. Request a new challenge to try again.',
      )
    }
    await this.em.refresh(challenge)
    this.logger.log(`Challenge ${challengeId} consumed for @${challenge.githubUsername}`)

    const publicKeyArmored = await this.fetchGithubGpgKey(challenge.githubUsername)
    const verification = await this.verifyPgpSignature(challenge.nonce, armoredMessage, publicKeyArmored)

    if (!verification.isValid) {
      this.logger.warn(`Signature verification failed for @${challenge.githubUsername}`)
      await this.contributorOnboardingService.recordProofRejected({
        userId: challenge.userId,
        tenantId: challenge.tenantId,
        githubAccountId: challenge.githubAccountId,
        githubUsername: challenge.githubUsername,
        walletId: challenge.walletId,
        challengeId,
        reason: 'Invalid signature',
      })
      return { verified: false }
    }

    challenge.verifiedAt = new Date()
    challenge.gpgFingerprint = verification.gpgFingerprint
    await this.em.flush()

    await this.contributorOnboardingService.recordProofAccepted({
      userId: challenge.userId,
      tenantId: challenge.tenantId,
      githubAccountId: challenge.githubAccountId,
      githubUsername: challenge.githubUsername,
      walletId: challenge.walletId,
      gpgFingerprint: verification.gpgFingerprint,
      verifiedAt: challenge.verifiedAt,
    })

    return {
      verified: true,
      gpgFingerprint: verification.gpgFingerprint,
      githubAccountId: challenge.githubAccountId,
      githubUsername: challenge.githubUsername,
      walletId: challenge.walletId,
    }
  }

  /** Read-only lookup used by the Heka GitHub App. Always returns a status, never 404. */
  public async getContributorStatus(githubUsername: string): Promise<ContributorStatus> {
    const verifiedChallenge = await this.em.findOne(
      GpgChallenge,
      { githubUsername, consumed: true, verifiedAt: { $ne: null } },
      { orderBy: { verifiedAt: 'DESC' } },
    )

    if (!verifiedChallenge?.verifiedAt) {
      return { isVerified: false, githubUsername }
    }

    return {
      isVerified: true,
      githubUsername,
      gpgFingerprint: verifiedChallenge.gpgFingerprint,
      verifiedAt: verifiedChallenge.verifiedAt,
    }
  }

  private ownsChallenge(authInfo: AuthInfo, challenge: GpgChallenge): boolean {
    return (
      challenge.userId === authInfo.userId &&
      challenge.tenantId === authInfo.tenantId &&
      challenge.walletId === authInfo.walletId
    )
  }

  private async fetchGithubGpgKey(githubUsername: string): Promise<string> {
    if (!GITHUB_USERNAME_PATTERN.test(githubUsername)) {
      throw new BadRequestException(
        `Invalid GitHub username format: '${githubUsername}'. Usernames may only contain alphanumeric characters and hyphens.`,
      )
    }

    const base = this.githubConfig.gpgKeyBaseUrl.replace(/\/$/, '')
    const url = `${base}/${encodeURIComponent(githubUsername)}.gpg`

    let armoredKeys: string
    try {
      const response = await firstValueFrom(
        this.httpService.get<string>(url, { timeout: this.githubConfig.requestTimeoutMs }),
      )
      armoredKeys = response.data
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status
        if (status === 404) {
          throw new BadRequestException(
            `No public GPG key found for @${githubUsername} on GitHub. Upload your GPG public key at https://github.com/settings/keys before requesting a challenge.`,
          )
        }
        if (status === 403 || status === 429) {
          throw new HttpException(
            'GitHub API rate limit reached. Please wait a few minutes before retrying.',
            HttpStatus.TOO_MANY_REQUESTS,
          )
        }
        throw new ServiceUnavailableException(
          'Unable to reach GitHub to fetch your GPG public key. Check your network connection and retry.',
        )
      }
      throw error
    }

    if (!armoredKeys || armoredKeys.trim().length === 0) {
      throw new BadRequestException(
        `GitHub returned an empty GPG key for @${githubUsername}. Ensure your GPG key is uploaded and visible on your GitHub profile.`,
      )
    }

    return armoredKeys
  }

  private async verifyPgpSignature(
    expectedNonce: string,
    armoredMessage: string,
    armoredKeys: string,
  ): Promise<{ isValid: false } | { isValid: true; gpgFingerprint: string }> {
    const publicKeys = await this.readPublicKeys(armoredKeys)

    let signedMessage: openpgp.CleartextMessage
    try {
      signedMessage = await openpgp.readCleartextMessage({ cleartextMessage: armoredMessage })
    } catch {
      throw new BadRequestException(
        'The submitted signature could not be parsed as a PGP cleartext-signed message. Ensure you ran: echo "<nonce>" | gpg --clearsign and submitted the complete output including the BEGIN/END headers.',
      )
    }

    const verificationResult = await openpgp.verify({
      message: signedMessage,
      verificationKeys: publicKeys,
    })

    const signature = verificationResult.signatures[0]
    if (!signature) {
      return { isValid: false }
    }

    let signingKeyId: openpgp.KeyID
    try {
      await signature.verified
      signingKeyId = signature.keyID
    } catch {
      return { isValid: false }
    }

    if (signedMessage.getText().trim() !== expectedNonce) {
      this.logger.warn('Signed content did not match the challenge nonce')
      return { isValid: false }
    }

    return {
      isValid: true,
      gpgFingerprint: this.extractFingerprint(publicKeys, signingKeyId),
    }
  }

  private extractFingerprint(publicKeys: openpgp.Key[], signingKeyId: openpgp.KeyID): string {
    for (const publicKey of publicKeys) {
      const [matchingKey] = publicKey.getKeys(signingKeyId)
      if (matchingKey) {
        return matchingKey.getFingerprint().toUpperCase()
      }
    }
    throw new BadRequestException('The verified signature did not match any public GPG key from GitHub.')
  }

  private async readPublicKeys(armoredKeys: string): Promise<openpgp.Key[]> {
    try {
      const publicKeys = await openpgp.readKeys({ armoredKeys })
      const armoredBlocks = armoredKeys.match(ARMORED_PUBLIC_KEY_BLOCK_PATTERN) ?? []
      if (armoredBlocks.length <= publicKeys.length) {
        return publicKeys
      }

      const parsedBlocks = await Promise.all(
        armoredBlocks.map((armoredBlock) => openpgp.readKeys({ armoredKeys: armoredBlock })),
      )
      return parsedBlocks.flat()
    } catch {
      throw new BadRequestException(
        'The GPG public key returned by GitHub could not be parsed. This may indicate a corrupted key on your GitHub profile.',
      )
    }
  }
}
