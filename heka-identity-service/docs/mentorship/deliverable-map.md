# Deliverable map

Each line is the file, test, or doc that shows the item. Where the demo script is the live evidence, the line says `evidence: pending demo` and points at a step in `docs/mentorship/demo-script.md`.

- Credential profile and ADR-0001: `heka-identity-service/docs/adr/0001-github-contributor-credential-profile.md`. Evidence: pending demo, step 4.
- `did:hedera`: issuer selection in `heka-identity-service/src/contributor-credential/contributor-credential.service.ts`. Evidence: pending demo, step 4.
- GPG: `heka-identity-service/src/gpg-challenge/gpg-challenge.service.ts` and `gpg-challenge.service.spec.ts` (`reads verification from the account-id binding after a username change`). Evidence: pending demo, step 3.
- Linking: `heka-identity-service/src/contributor-onboarding/contributor-onboarding.service.ts`. Evidence: pending demo, step 2.
- OID4VCI: `POST /v2/contributor-credential/offer` in `contributor-credential.controller.ts`. Evidence: pending demo, step 4.
- Wallet: `heka-chrome-extension/docs/wallet-lifecycle.md` and `heka-chrome-extension/src/credo/__tests__/WebCryptoKeyManagementService.spec.ts`. Evidence: pending demo, step 4.
- OID4VP: `heka-identity-service/src/presentation-session/presentation-decision.ts` and `presentation-decision.spec.ts`. The page route is `PRESENTATION_VERIFY`. Evidence: pending demo, step 6.
- Policy and `.heka/config.yml`: `heka-identity-service/src/presentation-session/repository-policy.ts`, `docs/examples/heka-config-warn.yml`, `docs/examples/heka-config-enforce.yml`. Evidence: pending demo, steps 5 and 7.
- Grace: `presentation-session.service.spec.ts` (`covers the first pull request inside the grace window without a wallet request`). Evidence: pending demo, not a separate recording step.
- Event matrix: `heka-identity-service/docs/contributor-test-matrix.md` and GitHub App `test/index.test.ts`. Evidence: pending demo, step 5.
- Resilience: `presentation-session.service.spec.ts` (`fails closed when enforce mode cannot resolve the issuer`, `retries a timed-out check update once`). Evidence: pending demo, step 8.
- Security controls: `heka-identity-service/docs/threat-model.md` and `src/common/http/fixed-window-rate-limit.ts`. Evidence: pending demo, not a separate recording step.
- Runbooks: `heka-identity-service/docs/runbooks/gpg-key-compromise.md` and `heka-identity-service/docs/runbooks/issuer-did-rollover.md`. Evidence: the docs themselves. A live key replacement is pending demo.
- Tests: `heka-identity-service/docs/contributor-test-matrix.md`. Evidence: the named specs. Live rows stay `manual`.
- Docs: `heka-identity-service/docs/contributor-onboarding.md`, `maintainer-github-app.md`, `contributor-troubleshooting.md`. Evidence: pending demo, steps 1 through 3.
