import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';

import * as cls from './ContributorVerify.module.scss';

interface SessionView {
  sessionId: string;
  state: 'pending' | 'in_progress' | 'success' | 'failure' | 'timeout';
  expiresAt: string;
  authorizationRequestUri?: string;
  alreadySatisfied: boolean;
  failureReason?: string;
  warning?: string;
  humanReason?: string;
  configWarning?: string;
}

const INVALID_POLICY =
  'The repository policy file is invalid. Verification is using warn mode until .heka/config.yml is fixed.';

const agency = process.env.REACT_APP_AGENCY_ENDPOINT ?? '';

const ContributorVerify = () => {
  const { sessionId } = useParams();
  const [session, setSession] = useState<SessionView | null>(null);
  const [error, setError] = useState<string>();
  const postedUri = useRef<string | undefined>(undefined);

  const askWallet = useCallback((next: SessionView) => {
    if (
      !next.authorizationRequestUri ||
      next.authorizationRequestUri === postedUri.current ||
      (next.state !== 'pending' && next.state !== 'in_progress')
    ) {
      return;
    }
    postedUri.current = next.authorizationRequestUri;
    window.postMessage(
      {
        source: 'heka-web-wallet-bridge',
        type: 'PRESENT_REQUEST',
        payload: { requestUri: next.authorizationRequestUri },
      },
      window.location.origin,
    );
  }, []);

  useEffect(() => {
    if (!sessionId) return undefined;
    let stopped = false;

    const load = async () => {
      try {
        const response = await fetch(
          `${agency}/v2/presentation-session/${sessionId}`,
        );
        if (!response.ok) {
          if (!stopped) setError('This verification session could not be loaded.');
          return;
        }
        const next = (await response.json()) as SessionView;
        if (stopped) return;
        setSession(next);
        setError(undefined);
        askWallet(next);
      } catch {
        if (!stopped) setError('The identity service did not respond.');
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), 2000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [askWallet, sessionId]);

  const retry = async () => {
    if (!sessionId) return;
    setError(undefined);
    const response = await fetch(
      `${agency}/v2/presentation-session/${sessionId}/retry`,
      { method: 'POST' },
    );
    if (!response.ok) {
      setError('Retry did not start. Refresh the page and try again.');
      return;
    }
    const next = (await response.json()) as SessionView;
    setSession(next);
    askWallet(next);
  };

  const open = session?.state === 'pending' || session?.state === 'in_progress';
  const failed = session?.state === 'failure' || session?.state === 'timeout';

  return (
    <main className={cls.page}>
      <h1 className={cls.title}>Contributor verification</h1>
      {error && <p className={cls.error}>{error}</p>}
      {session?.configWarning === 'repository_config_invalid' && (
        <p className={cls.warning}>{INVALID_POLICY}</p>
      )}
      {!session && !error && <p className={cls.copy}>Loading this verification…</p>}
      {session && open && (
        <p className={cls.copy}>
          Open the Heka wallet and present your contributor credential. This page
          updates on its own.
        </p>
      )}
      {session?.state === 'success' && (
        <p className={cls.success}>{session.humanReason ?? 'Verified.'}</p>
      )}
      {session?.warning && <p className={cls.warning}>{session.warning}</p>}
      {failed && (
        <>
          <p className={cls.error}>
            {session?.humanReason ?? 'Verification did not succeed.'}
            {session?.failureReason ? ` (${session.failureReason})` : ''}
          </p>
          <button className={cls.retry} type="button" onClick={() => void retry()}>
            Retry verification
          </button>
        </>
      )}
    </main>
  );
};

export default ContributorVerify;
