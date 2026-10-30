import { isCredentialOfferUri, isPresentationRequestUri } from '../content-scripts/bridge-message'
import { walletPageUrl } from '../wallet/page-url'
import { CREDENTIAL_COUNT_KEY, PENDING_OFFER_KEY, PENDING_REQUEST_KEY, RECEIVE_STATUS_KEY } from '../wallet/storage-keys'

// ── Types for cross-context messages ─────────────────────────────────────────

export type ExtensionMessage =
  | { type: 'PING' }
  | { type: 'RECEIVE_OFFER'; offerUri: string; expiresAt?: string }
  | { type: 'PRESENT_REQUEST'; requestUri: string }
  | { type: 'OPEN_WALLET' }
  | { type: 'WALLET_TASK_DONE' }
  | { type: 'REFRESH_BADGE' }
  | { type: 'GET_STATUS' }

export type ExtensionResponse =
  | { type: 'PONG'; version: string }
  | { type: 'OFFER_ACKNOWLEDGED' }
  | { type: 'STATUS'; initialized: boolean; credentialCount: number }
  | { type: 'ERROR'; message: string }

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    void chrome.storage.local.remove([PENDING_OFFER_KEY, PENDING_REQUEST_KEY, RECEIVE_STATUS_KEY])
  }
  void updateBadge()
})

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: ExtensionResponse) => void,
  ): boolean => {
    if (sender.id !== chrome.runtime.id) {
      sendResponse({ type: 'ERROR', message: 'Rejected a message from outside this extension.' })
      return false
    }
    void handleMessage(message)
      .then((response) => sendResponse(response))
      .catch((error: unknown) => {
        const text = error instanceof Error ? error.message : 'Wallet request failed'
        sendResponse({ type: 'ERROR', message: text })
      })
    return true
  },
)

async function handleMessage(message: ExtensionMessage): Promise<ExtensionResponse> {
  switch (message.type) {
    case 'PING':
      return { type: 'PONG', version: chrome.runtime.getManifest().version }

    case 'RECEIVE_OFFER': {
      if (isCredentialOfferUri(message.offerUri)) {
        await receiveOfferInExtension(message.offerUri, message.expiresAt)
      }
      return { type: 'OFFER_ACKNOWLEDGED' }
    }

    case 'PRESENT_REQUEST': {
      if (isPresentationRequestUri(message.requestUri)) await presentRequestInExtension(message.requestUri)
      return { type: 'OFFER_ACKNOWLEDGED' }
    }

    case 'OPEN_WALLET':
      await openWalletPage()
      return { type: 'OFFER_ACKNOWLEDGED' }

    case 'WALLET_TASK_DONE': {
      if (await chrome.offscreen.hasDocument()) await chrome.offscreen.closeDocument()
      return { type: 'OFFER_ACKNOWLEDGED' }
    }

    case 'REFRESH_BADGE': {
      await updateBadge()
      return { type: 'OFFER_ACKNOWLEDGED' }
    }

    case 'GET_STATUS':
      return {
        type: 'STATUS',
        initialized: true,
        credentialCount: await readCredentialCount(),
      }

    default:
      return { type: 'ERROR', message: 'Unknown wallet request' }
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[CREDENTIAL_COUNT_KEY]) return
  void applyBadge(Number(changes[CREDENTIAL_COUNT_KEY].newValue ?? 0))
})

async function receiveOfferInExtension(offerUri: string, expiresAt?: string): Promise<void> {
  await chrome.storage.local.set({
    [PENDING_OFFER_KEY]: expiresAt ? { offerUri, expiresAt } : { offerUri },
    [RECEIVE_STATUS_KEY]: { state: 'working', message: 'Opening the wallet so you can review this offer…' },
  })
  await openWalletPage()
}

async function presentRequestInExtension(requestUri: string): Promise<void> {
  await chrome.storage.local.set({ [PENDING_REQUEST_KEY]: requestUri })
  await openWalletPage()
}

async function openWalletPage(): Promise<void> {
  const url = new URL(walletPageUrl())
  url.searchParams.set('opened', String(Date.now()))
  const target = url.toString()
  try {
    const [existing] = await chrome.tabs.query({ url: `${chrome.runtime.getURL('wallet.html')}*` })
    if (existing?.id !== undefined) {
      await chrome.tabs.update(existing.id, { url: target, active: true })
      if (existing.windowId !== undefined) await chrome.windows.update(existing.windowId, { focused: true })
      return
    }
  } catch {
    // Without the tabs permission this query can fail. A new window still opens the wallet page.
  }
  await chrome.windows.create({ url: target, type: 'popup', width: 480, height: 720, focused: true })
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
