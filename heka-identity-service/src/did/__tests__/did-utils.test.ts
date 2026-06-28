import { getDeterministicSigningKey, resolveDidDocument, type DidResolverFn } from '../did-utils';

// ─── Deterministic Key Selector Tests ────────────────────────────────────────

describe('DID Utils: Deterministic Key Selector', () => {
  it('should successfully extract the target key by purpose', () => {
    const mockDidDocument = {
      id: 'did:example:123',
      verificationMethod: [
        {
          id: 'did:example:123#wrong-key',
          type: 'Ed25519VerificationKey2020',
          controller: 'did:example:123',
          publicKeyMultibase: 'zWrongKey'
        },
        {
          id: 'did:example:123#assertion-key',
          type: 'Ed25519VerificationKey2020',
          controller: 'did:example:123',
          publicKeyMultibase: 'zTargetKey'
        }
      ]
    };

    const targetKey = getDeterministicSigningKey(mockDidDocument, 'assertion-key');
    expect(targetKey).toBeDefined();
    expect(targetKey.id).toBe('did:example:123#assertion-key');
    expect(targetKey.publicKeyMultibase).toBe('zTargetKey');
  });

  it('should not depend on array ordering — same result regardless of verificationMethod order', () => {
    const documentWithKeyFirst = {
      id: 'did:example:abc',
      verificationMethod: [
        { id: 'did:example:abc#assertion-key', type: 'Ed25519VerificationKey2020', controller: 'did:example:abc', publicKeyMultibase: 'zCorrectKey' },
        { id: 'did:example:abc#authentication-key', type: 'Ed25519VerificationKey2020', controller: 'did:example:abc', publicKeyMultibase: 'zOtherKey' }
      ]
    };
    const documentWithKeyLast = {
      id: 'did:example:abc',
      verificationMethod: [
        { id: 'did:example:abc#authentication-key', type: 'Ed25519VerificationKey2020', controller: 'did:example:abc', publicKeyMultibase: 'zOtherKey' },
        { id: 'did:example:abc#assertion-key', type: 'Ed25519VerificationKey2020', controller: 'did:example:abc', publicKeyMultibase: 'zCorrectKey' }
      ]
    };

    const resultFirst = getDeterministicSigningKey(documentWithKeyFirst, 'assertion-key');
    const resultLast = getDeterministicSigningKey(documentWithKeyLast, 'assertion-key');
    expect(resultFirst.publicKeyMultibase).toBe('zCorrectKey');
    expect(resultLast.publicKeyMultibase).toBe('zCorrectKey');
    expect(resultFirst.id).toBe(resultLast.id);
  });

  it('should throw an error if the verification method array is missing or malformed', () => {
    expect(() => getDeterministicSigningKey({} as any, 'assertion-key')).toThrow('Malformed DID Document');
    expect(() => getDeterministicSigningKey({ verificationMethod: null } as any, 'assertion-key')).toThrow('Malformed DID Document');
  });

  it('should throw an error if no key matches the expected purpose', () => {
    const mockDidDocument = {
      id: 'did:example:123',
      verificationMethod: [
        {
          id: 'did:example:123#wrong-key',
          type: 'Ed25519VerificationKey2020',
          controller: 'did:example:123'
        }
      ]
    };

    expect(() => getDeterministicSigningKey(mockDidDocument, 'assertion-key')).toThrow(
      'No deterministic key found for purpose: assertion-key'
    );
  });
});

// ─── DID Resolution Tests ─────────────────────────────────────────────────────

describe('DID Utils: DID Resolution', () => {
  const mockHederaDidDocument = {
    id: 'did:hedera:testnet:z6MkhaXgBZDvotDkL5257faiztiuC2ZXOS',
    verificationMethod: [
      {
        id: 'did:hedera:testnet:z6MkhaXgBZDvotDkL5257faiztiuC2ZXOS#assertion-key',
        type: 'Ed25519VerificationKey2020',
        controller: 'did:hedera:testnet:z6MkhaXgBZDvotDkL5257faiztiuC2ZXOS',
        publicKeyMultibase: 'z6MkhaXgBZDvotDkL5257faiztiuC2ZXOS'
      }
    ],
    authentication: ['did:hedera:testnet:z6MkhaXgBZDvotDkL5257faiztiuC2ZXOS#assertion-key'],
    assertionMethod: ['did:hedera:testnet:z6MkhaXgBZDvotDkL5257faiztiuC2ZXOS#assertion-key']
  };

  it('should resolve a did:hedera DID and return the DID Document', async () => {
    const mockResolver: DidResolverFn = vi.fn().mockResolvedValue(mockHederaDidDocument);
    const did = 'did:hedera:testnet:z6MkhaXgBZDvotDkL5257faiztiuC2ZXOS';

    const result = await resolveDidDocument(did, mockResolver);

    expect(mockResolver).toHaveBeenCalledOnce();
    expect(mockResolver).toHaveBeenCalledWith(did);
    expect(result.id).toBe(did);
    expect(result.verificationMethod).toHaveLength(1);
  });

  it('should resolve a DID and then successfully select the correct verification key', async () => {
    const mockResolver: DidResolverFn = vi.fn().mockResolvedValue(mockHederaDidDocument);
    const did = 'did:hedera:testnet:z6MkhaXgBZDvotDkL5257faiztiuC2ZXOS';

    const didDocument = await resolveDidDocument(did, mockResolver);
    const signingKey = getDeterministicSigningKey(didDocument, 'assertion-key');

    expect(signingKey.id).toContain('#assertion-key');
    expect(signingKey.type).toBe('Ed25519VerificationKey2020');
  });

  it('should throw if the resolver returns null for an unknown DID', async () => {
    const mockResolver: DidResolverFn = vi.fn().mockResolvedValue(null);

    await expect(
      resolveDidDocument('did:hedera:testnet:unknownDID', mockResolver)
    ).rejects.toThrow('DID resolution failed: document not found for did:hedera:testnet:unknownDID');
  });

  it('should propagate resolver errors cleanly', async () => {
    const mockResolver: DidResolverFn = vi.fn().mockRejectedValue(new Error('Hedera mirror node unavailable'));

    await expect(
      resolveDidDocument('did:hedera:testnet:z6MkhaXgBZDvotDkL5257faiztiuC2ZXOS', mockResolver)
    ).rejects.toThrow('Hedera mirror node unavailable');
  });
});
