# GPG key compromise

There is no revocation registry. A credential stays acceptable until its `exp`.

`CONTRIBUTOR_CREDENTIAL_LIFETIME_SECONDS` is 90 days. After that the presentation decision returns `credential_expired`.

When a contributor's GPG key is replaced or compromised:

1. If the GitHub account itself changed, link GitHub again from the Heka web UI. The binding stays keyed by the numeric account id.
2. Complete a new GPG challenge. The old nonce cannot be reused.
3. Request a new contributor credential. The wallet holds the new SD-JWT. The previous credential is not remotely revoked; it expires at its own `exp`.

Maintainers who need a credential to stop working before `exp` set the repository to `enforce` and remove the issuer from `trusted_issuers`, or set `mode: disabled` only when verification should stop entirely. That is a repository policy change, not a revocation list.
