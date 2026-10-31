# Demo script

Run these steps yourself. This file does not record that they have been done. Screenshot the named screen at each step. Do not paste those images here until the recording exists.

The web UI routes are `ROUTES.SIGN_IN` (`/sign-in`), `ROUTES.CONTRIBUTOR_ONBOARDING` (`/contributor/onboarding`), and `ROUTES.PRESENTATION_VERIFY` (`/contributor/verify/:sessionId`). The GitHub check name is `Heka Identity Verification`.

1. **Sign in.** Open `/sign-in` and complete Heka OIDC. Screenshot the signed-in contributor page.
2. **Link GitHub.** On `/contributor/onboarding`, use Link GitHub and finish the OAuth return at `/github/callback`. Screenshot the linked account id.
3. **GPG.** Request a challenge, clearsign the nonce, and submit it. Screenshot the verified fingerprint.
4. **Optional receive.** Request a credential. The page shows the offer and the transaction code. Receive it in the unpacked extension's `wallet.html`. Screenshot the stored credential summary. Skip this step if the CSP-safe reload is not ready; say so on the recording.
5. **Warn-mode pull request.** On a test repository, put `heka-identity-service/docs/examples/heka-config-warn.yml` on the default branch as `.heka/config.yml`. Open a pull request. Screenshot the Action Required check named `Heka Identity Verification` and its details URL.
6. **Present.** Open the details page. The extension presents from `wallet.html`. Screenshot the check moving to success.
7. **Enforce-mode failure.** Change the default-branch config to `heka-identity-service/docs/examples/heka-config-enforce.yml` with a trusted issuer that will not match the credential, or present a credential whose `exp` is in the past. Push a commit. Screenshot the failure code on the check (`issuer_untrusted` or `credential_expired`).
8. **Timeout.** Open a new pull request and do not present. Wait 15 minutes, or run one sweep of open sessions. Screenshot the timeout check (`session_expired`).

The recording link stays empty until you publish it. See the final report outline.
