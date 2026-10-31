# Issuer DID rollover

Operational steps only. This does not revoke credentials already issued.

1. On the demo tenant, create a new `did:hedera` with `POST /prepare-wallet` (or the existing DID creation path for that tenant).
2. Put the new DID in `.heka/config.yml` `trusted_issuers` next to the old DID, on the repository default branch.
3. Issue new contributor credentials from the new DID.
4. Leave the old DID in `trusted_issuers` until credentials it signed have passed their 90-day `exp`.
5. Remove the old DID from `trusted_issuers` after that window.

Credentials signed by the old DID fail `issuer_untrusted` once it is no longer trusted. Credentials with no entry in `trusted_issuers` are still checked against the session's demo issuer DID.
