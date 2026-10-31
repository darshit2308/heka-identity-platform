# Contributor onboarding

Sign in to the Heka web UI with the existing Heka OIDC session. The contributor steps are on the onboarding page.

1. **Link GitHub.** The button starts a GitHub OAuth grant. The identity service stores a hashed single-use state bound to your user, tenant, and wallet, and it uses PKCE. The binding is the numeric GitHub account id, so a later username change does not create a second person.
2. **GPG challenge.** Request a nonce. It expires in 5 minutes and works once. Sign it with `echo "<nonce>" | gpg --clearsign` and submit the armored signature. The service checks the key published at `https://github.com/<login>.gpg`, and only if that login still resolves to the linked account id.
3. **Credential.** After the signature is verified, request a contributor credential. The page shows an offer URI and a numeric transaction code. The code is not inside the URI.

The offer is delivered by the page's content script, which posts a message the Heka extension can read. There is no browser protocol handler. Credo runs only in the extension's `wallet.html`.

Recovery after a lost key or cleared site data is re-issuance, not export. See `heka-chrome-extension/docs/wallet-lifecycle.md`. Replacing a GPG key is `docs/runbooks/gpg-key-compromise.md`.
