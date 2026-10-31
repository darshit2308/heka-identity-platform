# Maintainer: GitHub App

Install the Heka GitHub App on the repository. Accept `contents: read` as well as checks, metadata, and pull requests. Changing `app.yml` does not update an app that is already installed.

Set these on the App process:

- `HEKA_SERVICE_URL` — identity service origin
- `HEKA_STATUS_TOKEN` — bearer the identity service expects on session routes
- `APP_ID` — GitHub App id
- `PRIVATE_KEY` — the App private key, from the environment. Do not point `PRIVATE_KEY_PATH` at a file in the repository. Revoke any key that was committed; deleting the file does not remove it from history.
- webhook secret — the value Probot uses to check delivery signatures

On the identity service, set the same `GITHUB_STATUS_TOKEN`, plus `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY` if check updates should be posted. Production also requires `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.

Add `.heka/config.yml` on the default branch. Copy `docs/examples/heka-config-warn.yml` or `docs/examples/heka-config-enforce.yml`. The App reads that file from the default branch only. A copy that exists only on the pull request head is ignored. A missing file is warn mode. An invalid file is also warn mode, and the check says the policy file is invalid.

- **warn** — a failed check is recorded, and the pull request is not blocked by this App. A status-list claim succeeds with a warning.
- **enforce** — issuer, credential type, DID method, expiry, credential age since `iat`, and an unresolvable issuer fail the check. `max_age_seconds` defaults to 90 days. The 15-minute session is presentation freshness and is not that field.
- **disabled** — the check is neutral. No wallet request is opened.
- **grace** — while `grace_period` is enabled and the account has no verified binding, the first days succeed without a wallet request.

Draft pull requests get a neutral check and no session. Marking the pull request ready runs verification. A pull request from a fork is verified as the author. Closing the pull request ends open sessions and does not create a new check. Reopening that pull request at the same commit starts a new session. If the check cannot be attached to the session, the App completes it as a failure and tells the author to push another commit.

Issuer DID replacement is `docs/runbooks/issuer-did-rollover.md`.
