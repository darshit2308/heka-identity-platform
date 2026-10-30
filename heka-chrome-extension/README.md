# Heka Web Wallet Chrome Extension

Chrome extension that holds a GithubContributorCredential. Credo 0.7.0 runs in the `wallet.html` extension page. The popup and the service worker stay free of Credo and read a credential summary from `chrome.storage.local`.

## What it does

- Receives an OID4VCI offer on `wallet.html` only after the holder accepts it. The content script runs on `http://localhost:8000`, `http://127.0.0.1:8000`, and `https://heka.hiero.org`. It forwards a well-shaped offer and its expiry. The wallet resolves the issuer and credential type, and the holder enters the transaction code shown in Heka before the offer is redeemed. An expired pending offer is removed and explained. A presentation request stays stored until it is submitted or declined.
- Stores the SD-JWT in IndexedDB and publishes a summary for the popup and the toolbar badge.
- Presents a credential with OID4VP only when the request uses DCQL.
- Creates holder keys with WebCrypto. The private key is non-extractable and cannot be imported.

Holder keys are not hardware-backed. A key attestation, when an issuer requires one, is not available in this wallet.

The measured bundle sizes and initialization times are in [docs/credo-spike-result.md](docs/credo-spike-result.md).

## Development

```bash
yarn install
yarn test
yarn build
```

`yarn build` is the production build. It refuses `http://` issuer and verifier URLs. Use `yarn dev` when the local issuer is `http://localhost:3003`.

Load `dist/` in Chrome at `chrome://extensions` with Developer Mode, then Load unpacked. Chrome does not support `protocol_handlers`, so an `openid-credential-offer:` link does not open this extension.

The Heka page sends the offer to the content script. The service worker stores it and opens `wallet.html`, which asks for approval before contacting the issuer. Localhost and `127.0.0.1` are always allowed. Contacting any other HTTPS issuer or verifier asks for the optional `https://*/*` host permission from the Review or Accept click. To import an offer that did not come from that page, paste the URI on the popup Receive tab. That opens the same approval screen. The popup itself does not run Credo.

`yarn build` does not emit source maps. `yarn dev` does, because that build is for local debugging.

## Checks

From this directory, after `yarn install`:

```bash
yarn lint
yarn type-check
yarn test
yarn build
```

The Heka web UI checks that CI runs are in `heka-identity-service-web-ui`:

```bash
yarn install --immutable
yarn lint:ts
yarn lint:scss
```

Those are the same commands as `.github/workflows/heka-identity-service-web-ui-verify.yml`. If `yarn lint:ts` cannot find `eslint-plugin-unused-imports`, the install is stale — run `yarn install --immutable` again in that package. Do not add the plugin by hand.
