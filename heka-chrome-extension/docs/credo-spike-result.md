# Credo-TS browser wallet

`@credo-ts/core` 0.7.0 and `@credo-ts/openid4vc` 0.7.0 run in `wallet.html`, a durable extension page. The popup and the service worker do not import Credo. They read a credential summary from `chrome.storage.local`.

Askar is not used. Records go through `IndexedDbStorageService`, registered on `InjectionSymbols.StorageService` by `BrowserStorageModule`. Private keys are created non-extractable in `WebCryptoKeyManagementService` (`backend: webcrypto-browser`). `importKey` is rejected.

## Build workarounds

- `express` is aliased to `src/credo/express-stub.ts`. `@credo-ts/openid4vc` imports it, and the holder path does not call it.
- `@digitalcredentials/open-badges-context` is aliased to `js/index.js`. The published `module` field points at a file that is not in the tarball.
- `KeyManagementModule` is imported from `@credo-ts/core/kms`. It is not exported from the package root.
- The node `eval('require')` fallback in `@sphereon/kmp-mdoc-core`, and the `Function` / `eval` global lookup in `reflect-metadata`, are rewritten to browser-safe equivalents during the production build.
- `cbor-x` is aliased to its `index-no-eval` build. `setimmediate` is aliased to a `setTimeout` shim. Presentation Exchange, which compiles Ajv and JSONPath through `Function`, is replaced with stubs. The holder path uses DCQL only.

The production `dist/` has no `Function(` or `eval(` calls. That check does not prove OID4VCI receipt or DCQL presentation against a running issuer or verifier. Those flows were not exercised here.

## Runtime

Chrome 156 ignores `--load-extension`. The unpacked `dist/` was loaded in Chromium 141, which still accepts that switch. `wallet.html` ran at `chrome-extension://<id>/wallet.html`. The status text was `Wallet ready`, and the page reported no errors.

A fresh IndexedDB is below Credo's storage version, so the agent is created with `autoUpdateStorageOnStartup: true`. Without that flag, initialization throws and asks for an update from storage version 0.1 to 0.5.

| Measurement | Value |
|---|---|
| `dist/wallet/index.js` | 2,910.82 kB minified, 753.98 kB gzip |
| Hedera resolver chunk | 1,635.54 kB minified, 318.79 kB gzip |
| `dist/popup/index.js` | 18.33 kB minified, 5.52 kB gzip |
| `dist/background/service-worker.js` | 2.28 kB minified, 1.09 kB gzip |
| `dist/content-scripts/heka-bridge.js` | 0.87 kB minified, 0.54 kB gzip |
| `agent.initialize()` inside the loaded extension | 52 ms |
| `agent.initialize()`, empty IndexedDB, same CSP over HTTP | 66 ms |
| `agent.initialize()`, existing storage, same CSP over HTTP | 34 ms |
| Credential receive | not measured; no issuer was running |

The wallet entry is large because `@credo-ts/core` statically imports the modules the holder needs, so the dynamic import in `lazy-agent.ts` does not split them out of `wallet/index.js`. The popup bundle does not contain Credo.

## Holder behaviour

OID4VCI uses `agent.openid4vc.holder`. Each issued SD-JWT record is stored with `agent.sdJwtVc.store`. The holder binding is a P-256 `Kms.PublicJwk`. Issuers that require a key attestation are rejected.

OID4VP accepts only DCQL. `handlePresentationRequest` throws when the resolved request has no `dcql` property. Presentation Exchange is not used.
