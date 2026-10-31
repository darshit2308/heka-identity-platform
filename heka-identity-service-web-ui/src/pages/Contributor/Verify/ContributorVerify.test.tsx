import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { routerFuture } from '@/shared/config/router';

import ContributorVerify from './ContributorVerify';

const pending = {
  sessionId: 'sess-1',
  state: 'pending',
  expiresAt: '2026-10-30T12:15:00.000Z',
  authorizationRequestUri: 'openid4vp://request',
  alreadySatisfied: false,
};

function renderPage() {
  return render(
    <MemoryRouter future={routerFuture} initialEntries={['/contributor/verify/sess-1']}>
      <Routes>
        <Route path="/contributor/verify/:sessionId" element={<ContributorVerify />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ContributorVerify', () => {
  let tick: (() => void) | undefined;

  beforeEach(() => {
    tick = undefined;
    window.postMessage = jest.fn();
    jest.spyOn(window, 'setInterval').mockImplementation((handler) => {
      tick = handler as () => void;
      return 1 as unknown as ReturnType<typeof setInterval>;
    });
    jest.spyOn(window, 'clearInterval').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('posts the presentation request once', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => pending,
    }) as jest.Mock;

    renderPage();

    await waitFor(() => expect(window.postMessage).toHaveBeenCalledTimes(1));
    expect(window.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'heka-web-wallet-bridge',
        type: 'PRESENT_REQUEST',
        payload: { requestUri: 'openid4vp://request' },
      }),
      window.location.origin,
    );

    await act(async () => {
      tick?.();
      await Promise.resolve();
    });

    expect(window.postMessage).toHaveBeenCalledTimes(1);
  });

  it('posts retry when verification failed', async () => {
    const failed = {
      ...pending,
      state: 'failure',
      failureReason: 'credential_expired',
      humanReason: 'The contributor credential has expired.',
      authorizationRequestUri: undefined,
    };
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => failed })
      .mockResolvedValueOnce({ ok: true, json: async () => pending }) as jest.Mock;

    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Retry verification' }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith('/v2/presentation-session/sess-1/retry', {
        method: 'POST',
      }),
    );
  });
});
