# Final report outline

Headings only. Do not fill these with a claim that the live demo passed.

## Architecture

Identity service, web UI, Chrome extension, and the separate GitHub App.

## Decisions

- Heka OIDC for the contributor session.
- No holder DID. The holder key is a JWK in `cnf`.
- Credo only in `wallet.html`.
- OID4VP uses DCQL.
- Repository policy is read from the default branch.

## What shipped

Point at `docs/mentorship/deliverable-map.md`. Leave the live-demo column empty.

## Limits

- No status-list client. Expiry is 90 days.
- No Linked VP.
- No third-party wallet. Sphereon is out of scope.
- Rate limits are in memory, per process.
- Webhook delivery ids are stored for 10 minutes. A crash after the claim can suppress one retry until that row expires. This is not a multi-instance outbox.

## Post-mentorship roadmap

- More credential types for roles, maintainer status, review history, and project trust signals.
- Stronger proof caching and a production Linked VP path, if a mentor asks for it.
- DID methods and Hedera deployment beyond the testnet demonstration.
- Richer `.heka/config.yml`, including organisation-wide policy.
- Interoperability with other OID4VC wallets.
- More security, privacy, audit, and scale work from maintainer feedback.

## Demo recording

[Demo recording]()
