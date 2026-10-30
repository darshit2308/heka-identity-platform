import { CREDENTIAL_COUNT_KEY, PENDING_OFFER_KEY, RECEIVE_STATUS_KEY } from '../wallet/storage-keys'

// ── Types for cross-context messages ─────────────────────────────────────────

export type ExtensionMessage =
  | { type: 'PING' }
  | { type: 'RECEIVE_OFFER'; offerUri: string }
  | { type: 'WALLET_TASK_DONE' }
  | { type: 'REFRESH_BADGE' }
  | { type: 'GET_STATUS' }

export type ExtensionResponse =
  | { type: 'PONG'; version: string }
  | { type: 'OFFER_ACKNOWLEDGED' }
  | { type: 'STATUS'; initialized: boolean; credentialCount: number }

chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.local.remove([PENDING_OFFER_KEY, RECEIVE_STATUS_KEY])
  void updateBadge()
})

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: ExtensionResponse) => void,
  ): boolean => {
    void handleMessage(message, sendResponse)
    return true
  },
)

async function handleMessage(
  message: ExtensionMessage,
  sendResponse: (response: ExtensionResponse) => void,
): Promise<void> {
  switch (message.type) {
    case 'PING': {
      sendResponse({ type: 'PONG', version: chrome.runtime.getManifest().version })
      break
    }

    case 'RECEIVE_OFFER': {
      const offerUri = message.offerUri
      if (typeof offerUri === 'string' && offerUri.startsWith('openid-credential-offer:')) {
        await receiveOfferInExtension(offerUri)
      }
      sendResponse({ type: 'OFFER_ACKNOWLEDGED' })
      break
    }

    case 'WALLET_TASK_DONE': {
      if (await chrome.offscreen.hasDocument()) await chrome.offscreen.closeDocument()
      sendResponse({ type: 'OFFER_ACKNOWLEDGED' })
      break
    }

    case 'REFRESH_BADGE': {
      await updateBadge()
      sendResponse({ type: 'OFFER_ACKNOWLEDGED' })
      break
    }

    case 'GET_STATUS': {
      sendResponse({
        type: 'STATUS',
        initialized: true,
        credentialCount: await readCredentialCount(),
      })
      break
    }

    default:
      break
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[CREDENTIAL_COUNT_KEY]) return
  void applyBadge(Number(changes[CREDENTIAL_COUNT_KEY].newValue ?? 0))
})

async function receiveOfferInExtension(offerUri: string): Promise<void> {
  if (await chrome.offscreen.hasDocument()) await chrome.offscreen.closeDocument()
  await chrome.storage.local.set({
    [PENDING_OFFER_KEY]: offerUri,
    [RECEIVE_STATUS_KEY]: { state: 'working', message: 'Opening the wallet… Keep this popup open.' },
  })
  try {
    await chrome.action.openPopup()
  } catch {
    // Chrome only allows this from some user gestures. Clicking the toolbar icon opens the same popup.
  }
}

async function updateBadge(): Promise<void> {
  await applyBadge(await readCredentialCount())
}

async function readCredentialCount(): Promise<number> {
  const stored = await chrome.storage.local.get(CREDENTIAL_COUNT_KEY)
  return Number(stored[CREDENTIAL_COUNT_KEY] ?? 0)
}

async function applyBadge(count: number): Promise<void> {
  await chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' })
  if (count > 0) {
    await chrome.action.setBadgeBackgroundColor({ color: '#22c55e' })
  }
}
