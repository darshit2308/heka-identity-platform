/**
 * A function signature for a DID resolver.
 * Accepts a DID string and returns the resolved DID Document, or null if not found.
 * Using a resolver function type allows callers to inject any resolver implementation
 * (Hedera SDK, mock, cache-backed, etc.) without coupling this utility to a specific
 * network client.
 */
export type DidResolverFn = (did: string) => Promise<DidDocument | null>;

/**
 * Minimal shape of a W3C DID Document.
 * Extended as needed when additional properties become relevant.
 */
export interface DidDocument {
  id: string;
  verificationMethod?: VerificationMethod[];
  authentication?: (string | VerificationMethod)[];
  assertionMethod?: (string | VerificationMethod)[];
  [key: string]: unknown;
}

export interface VerificationMethod {
  id: string;
  type: string;
  controller: string;
  publicKeyMultibase?: string;
  publicKeyJwk?: Record<string, unknown>;
}

/**
 * Resolves a DID string to its DID Document using the provided resolver function.
 *
 * By accepting a `DidResolverFn` as a parameter, this utility remains decoupled from
 * any specific network client (Hedera SDK, universal resolver, cache, etc.).
 * Callers inject the resolver, making this easy to test with a mock.
 *
 * @param did       The DID string to resolve (e.g. "did:hedera:testnet:z6Mk...")
 * @param resolver  A function that performs the actual DID resolution
 * @returns         The resolved DID Document
 * @throws          If the resolver returns null or itself throws
 */
export async function resolveDidDocument(did: string, resolver: DidResolverFn): Promise<DidDocument> {
  const document = await resolver(did);

  if (!document) {
    throw new Error(`DID resolution failed: document not found for ${did}`);
  }

  return document;
}

/**
 * Selects a verification method from a DID Document by matching against a purpose
 * identifier in the key's `id` fragment — NOT by array index.
 *
 * Relying on verificationMethod[0] is fragile because DID Document updates can
 * reorder the array. This function is deterministic across DID Document versions
 * as long as the key `id` fragment is stable.
 *
 * @param didDocument     The resolved DID Document
 * @param expectedPurpose A string fragment expected to appear in the key's `id`
 *                        (e.g. "assertion-key", "authentication-key")
 * @returns               The matched VerificationMethod
 * @throws                If the document is malformed or no key matches the purpose
 */
export function getDeterministicSigningKey(
  didDocument: Pick<DidDocument, 'verificationMethod'>,
  expectedPurpose: string
): VerificationMethod {
  if (!didDocument || !Array.isArray(didDocument.verificationMethod)) {
    throw new Error('Malformed DID Document');
  }

  // Match by key type AND purpose fragment in the key ID — never by array index
  const targetKey = didDocument.verificationMethod.find(
    (method) => method.type === 'Ed25519VerificationKey2020' && method.id.includes(expectedPurpose)
  );

  if (!targetKey) {
    throw new Error(`No deterministic key found for purpose: ${expectedPurpose}`);
  }

  return targetKey;
}
