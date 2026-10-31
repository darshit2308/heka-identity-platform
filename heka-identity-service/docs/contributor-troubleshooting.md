# Contributor troubleshooting

- **Expired challenge.** Request a new nonce. The previous one cannot be reused after 5 minutes or after one submission.
- **Missing GPG key.** Publish a key at `https://github.com/<login>.gpg` and submit again.
- **Login reused.** The login now belongs to a different numeric account. Link GitHub again for the account that owns the pull request.
- **No matching credential.** The wallet message is `No stored credential matches this request. Receive a GitHub contributor credential, then try again.`
- **Holder key gone.** Clearing site data removes the non-extractable key. The wallet message is `The holder key for this credential is gone. Receive the credential again.` See `heka-chrome-extension/docs/wallet-lifecycle.md`.
- **Session timeout.** The page says the session expired. Use Retry verification on the same page, or push another commit.
- **Heka down.** The check title is `Contributor verification unavailable`. Push another commit to try again. The App retries one network failure before it posts that check.
