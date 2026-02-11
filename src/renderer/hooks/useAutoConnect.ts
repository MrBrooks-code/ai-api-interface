/**
 * @fileoverview Hook that attempts automatic SSO connection on application
 * startup. If a saved SSO configuration exists, it triggers connection
 * immediately — displaying device-auth progress in the UI when a cached
 * token is unavailable.
 */

import { useEffect, useRef } from 'react';
import { useChatStore } from '../stores/chat-store';
import { ipc } from '../lib/ipc-client';

/** Maximum time (ms) to wait for the auto-connect SSO flow before giving up. */
const AUTO_CONNECT_TIMEOUT_MS = 120_000;

/**
 * Runs once on mount to auto-connect using the most recent saved SSO
 * configuration. Progress is written to the Zustand store so the ChatView
 * overlay can reflect the current auth stage.
 */
export function useAutoConnect() {
  const attempted = useRef(false);

  // SSO progress listener — lives in its own effect so it survives React
  // strict-mode double-mount (the attempted guard must not prevent re-registration).
  useEffect(() => {
    const cleanup = ipc.onSsoStatus((status) => {
      useChatStore.getState().setAutoConnectSsoStatus(status);
    });
    return cleanup;
  }, []);

  // One-shot auto-connect attempt.
  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    const {
      setAutoConnecting,
      setAutoConnectSsoStatus,
      setConnectionStatus,
      setAvailableModels,
      setSelectedModelId,
    } = useChatStore.getState();

    (async () => {
      try {
        // Skip if already connected (e.g. profile restored by main process).
        const currentStatus = await ipc.getConnectionStatus();
        if (currentStatus.connected) {
          setConnectionStatus(currentStatus);
          if (currentStatus.modelId) setSelectedModelId(currentStatus.modelId);
          return;
        }

        const configs = await ipc.listSsoConfigs();
        if (configs.length === 0) return;

        // Pick the most recently updated configuration.
        const config = configs[0];

        setAutoConnecting(true);
        setAutoConnectSsoStatus({ stage: 'registering' });

        // Race the SSO flow against a timeout so the UI never hangs indefinitely.
        const result = await Promise.race([
          ipc.connectWithSsoConfig(config.id),
          new Promise<{ success: false; error: string }>((resolve) =>
            setTimeout(
              () => resolve({ success: false, error: 'Connection timed out — try connecting manually from Settings' }),
              AUTO_CONNECT_TIMEOUT_MS,
            ),
          ),
        ]);

        if (result.success) {
          setAutoConnectSsoStatus({ stage: 'complete' });
          const status = await ipc.getConnectionStatus();
          setConnectionStatus(status);
          if (status.modelId) setSelectedModelId(status.modelId);

          // Fetch available models after successful connection.
          const modelsResult = await ipc.listModels();
          if (modelsResult.success) {
            setAvailableModels(modelsResult.models);
          }
        } else {
          setAutoConnectSsoStatus({
            stage: 'error',
            error: result.error ?? 'Auto-connect failed',
          });
        }
      } catch (err) {
        // Surface unexpected errors (network failures, IPC errors) in the overlay.
        useChatStore.getState().setAutoConnectSsoStatus({
          stage: 'error',
          error: err instanceof Error ? err.message : 'Auto-connect failed',
        });
      } finally {
        // Brief delay so the user sees the final status before the overlay clears.
        setTimeout(() => {
          useChatStore.getState().setAutoConnecting(false);
          useChatStore.getState().setAutoConnectSsoStatus(null);
        }, 1500);
      }
    })();
  }, []);

  // Listen for session-expiry events pushed from the main process and
  // reset the connection state so the UI reflects disconnection.
  useEffect(() => {
    const cleanup = ipc.onSessionExpired(() => {
      useChatStore.getState().setConnectionStatus({ connected: false });
    });
    return cleanup;
  }, []);
}
