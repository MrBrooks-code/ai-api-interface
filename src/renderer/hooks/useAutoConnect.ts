/**
 * @fileoverview Hook that attempts automatic SSO connection on application
 * startup. If a saved SSO configuration exists, it triggers connection
 * immediately — displaying device-auth progress in the UI when a cached
 * token is unavailable.
 */

import { useEffect, useRef } from 'react';
import { useChatStore } from '../stores/chat-store';
import { ipc } from '../lib/ipc-client';

/**
 * Runs once on mount to auto-connect using the most recent saved SSO
 * configuration. Progress is written to the Zustand store so the ChatView
 * overlay can reflect the current auth stage.
 */
export function useAutoConnect() {
  const attempted = useRef(false);

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

    let cleanupSsoListener: (() => void) | undefined;

    (async () => {
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

      // Listen for device-auth progress events from the main process.
      cleanupSsoListener = ipc.onSsoStatus((status) => {
        setAutoConnectSsoStatus(status);
      });

      const result = await ipc.connectWithSsoConfig(config.id);

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

      // Brief delay so the user sees the final status before the overlay clears.
      setTimeout(() => {
        setAutoConnecting(false);
        setAutoConnectSsoStatus(null);
      }, 1500);
    })();

    return () => {
      cleanupSsoListener?.();
    };
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
