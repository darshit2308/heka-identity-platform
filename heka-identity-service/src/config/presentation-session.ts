import { registerAs } from '@nestjs/config'

/**
 * `AGENT_OID4VCI_ENDPOINT` is the public origin Credo embeds in an OID4VP
 * request. The wallet posts the presentation to `{AGENT_OID4VCI_ENDPOINT}/oid4vp`,
 * so that value must be the Nginx or tunnel URL, not raw localhost, whenever
 * the wallet is not on the same machine as the verifier.
 */
export default registerAs('presentationSession', () => ({
  pageBaseUrl: (process.env.PRESENTATION_PAGE_BASE_URL ?? 'http://localhost:8000').replace(/\/$/, ''),
  githubAppId: process.env.GITHUB_APP_ID,
  githubAppPrivateKey: process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, '\n'),
}))
