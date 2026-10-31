# Threat model

Each item from the mentorship security list is either implemented in this repository or covered by a runbook. CORS stays `origin: *` unless `EXPRESS_CORS_OPTIONS` overrides it, so a local wallet on another origin can call the API. Pin `http://localhost:8000` in that variable when the web UI should be the only browser origin.

## GitHub App private key

Implemented as an environment secret. `GITHUB_APP_PRIVATE_KEY` is read by the check notifier and is not required at startup, because the notifier no-ops when it is unset. The GitHub App loads `PRIVATE_KEY` from the environment and refuses `PRIVATE_KEY_PATH` when it points inside that repository. `private-key.pem` is no longer in the tree. The copy that was committed is still in git history, so revoke it in the GitHub App settings. History was not rewritten.

## GPG key compromise

Runbook only. See `docs/runbooks/gpg-key-compromise.md`. There is no revocation registry. The credential `exp` is 90 days (`CONTRIBUTOR_CREDENTIAL_LIFETIME_SECONDS`).

## GitHub account compromise

Implemented. Bindings are keyed by numeric account id in the contributor onboarding service. Linking writes a `BindingUpdated` audit row. Suspending a credential before `exp` is the GPG runbook plus `trusted_issuers`, not a status list.

## GitHub login reassignment

Implemented. `gpg-challenge.service.spec.ts` covers `does not fetch a GPG key when the login now belongs to another account` and `reads verification from the account-id binding after a username change`.

## OAuth link CSRF and code interception

Implemented. The GitHub link attempt stores hashed single-use state bound to user, tenant, and wallet, and the callback uses PKCE. See `contributor-onboarding.service.ts`.

## Contributor status enumeration

Implemented. `GithubAppStatusGuard` requires the status bearer and limits the route to 60 requests a minute per IP via `common/http/fixed-window-rate-limit.ts`.

## Browser wallet compromise

Implemented in the extension. Credo loads only from `wallet.html`. The production bundle is checked for `eval` and `new Function`. Keys in `heka-wallet-kms` are non-extractable. `chrome.storage.local` stores id, vct, issuer, and issuedAt only. Production builds reject insecure HTTP issuer and verifier URLs.

## Nonce replay

Implemented. A GPG challenge is single-use, expires after 5 minutes, and is bound to the user who requested it. `gpg-challenge.service.ts` consumes the nonce before the GitHub call.

## Webhook replay

Implemented. Probot checks the webhook signature. The App claims the delivery id through `POST /v2/presentation-session/deliveries`, and `github_webhook_deliveries` keeps it for 10 minutes across processes. A crash after that claim and before the check run exists suppresses one retry until the row expires. If the identity service cannot record the id, the App falls back to an in-memory map for that process only. One open session per pull request and commit is enforced by the unique index `presentation_sessions_one_open_per_commit`. This is not a multi-instance outbox.

## Issuer or operator key compromise

Runbook only. See `docs/runbooks/issuer-did-rollover.md`. Previously issued credentials remain valid until `exp` or until the old DID leaves `trusted_issuers`.

## Hedera latency or outage

Implemented. Check updates time out after 8 seconds and retry once on 502, 503, timeout, and network errors. Enforce mode records `resolver_unavailable` when DID resolution fails. Warn mode leaves the session open until the 15-minute TTL. Credo already caches `did:hedera`; this service does not add a second cache. GitHub account-id lookup stays uncached.

## Repository config tampering

Implemented. The GitHub App reads `.heka/config.yml` from `repository.default_branch` only. A file that exists only on the pull request head is ignored. Invalid YAML falls back to warn with `repository_config_invalid`. That warning is written on the GitHub check and on the verification page.

## Privacy leakage

Implemented. The presentation decision compares `githubAccountId`, `vct`, `iss`, `iat`, and `exp`. `githubUsername` and `gpgFingerprint` stay selectively disclosable and are not required to accept a presentation. The extension summary cache does not store them. Audit metadata for a presentation is `failureReason`, `warning`, `owner`, `repo`, and `prNumber`. Offer audit metadata is `expiresAt` only.

## Abuse and flooding

Implemented, in process memory. GPG request and verify: 10 a minute per user. Session polling: 120 a minute per IP. Session retry: 5 a minute per session id. Status route: 60 a minute per IP. JSON and urlencoded bodies are limited to 256kb. Production startup requires `GITHUB_STATUS_TOKEN`, `GITHUB_CLIENT_ID`, and `GITHUB_CLIENT_SECRET`.
