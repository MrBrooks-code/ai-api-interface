import { useCallback, useEffect, useState } from 'react';
import { useChatStore } from '../stores/chat-store';
import { ipc } from '../lib/ipc-client';
import type { AwsProfile, SsoLoginStatus, SsoConfiguration } from '../../shared/types';
import { DEFAULT_REGION } from '../../shared/constants';

export function useSettings() {
  const store = useChatStore();
  const [profiles, setProfiles] = useState<AwsProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [ssoStatus, setSsoStatus] = useState<SsoLoginStatus | null>(null);
  const [ssoConfigs, setSsoConfigs] = useState<SsoConfiguration[]>([]);

  // Listen for SSO progress events pushed from main process
  useEffect(() => {
    const cleanup = ipc.onSsoStatus((status) => {
      setSsoStatus(status);
      if (status.stage === 'complete' || status.stage === 'error') {
        // Clear after a short delay so the user can see the final state
        setTimeout(() => setSsoStatus(null), 2000);
      }
    });
    return cleanup;
  }, []);

  const loadProfiles = useCallback(async () => {
    const result = await ipc.listAwsProfiles();
    setProfiles(result);
  }, []);

  const checkConnectionStatus = useCallback(async () => {
    const status = await ipc.getConnectionStatus();
    store.setConnectionStatus(status);
    if (status.modelId) {
      store.setSelectedModelId(status.modelId);
    }
  }, []);

  const fetchModels = useCallback(async () => {
    setModelsLoading(true);
    setModelsError(null);
    const result = await ipc.listModels();
    setModelsLoading(false);
    if (result.success) {
      store.setAvailableModels(result.models);
    } else {
      setModelsError(result.error ?? 'Failed to load models');
    }
  }, []);

  const selectModel = useCallback(async (modelId: string) => {
    await ipc.setModel(modelId);
    store.setSelectedModelId(modelId);
  }, []);

  const connectWithProfile = useCallback(async (profile: string, region: string) => {
    setLoading(true);
    setError(null);
    setSsoStatus(null);
    const result = await ipc.connectWithProfile(profile, region);
    setLoading(false);
    if (result.success) {
      store.setConnectionStatus({ connected: true, profile, region });
      fetchModels();
      // Refresh profiles to update token status
      loadProfiles();
    } else {
      setError(result.error ?? 'Connection failed');
    }
    return result.success;
  }, [fetchModels, loadProfiles]);

  const loadSsoConfigs = useCallback(async () => {
    const configs = await ipc.listSsoConfigs();
    setSsoConfigs(configs);
  }, []);

  const deleteSsoConfig = useCallback(async (id: string) => {
    await ipc.deleteSsoConfig(id);
    setSsoConfigs((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const connectWithSsoConfig = useCallback(async (configId: string) => {
    setLoading(true);
    setError(null);
    setSsoStatus(null);
    const result = await ipc.connectWithSsoConfig(configId);
    setLoading(false);
    if (result.success) {
      await checkConnectionStatus();
      fetchModels();
    } else {
      setError(result.error ?? 'SSO connection failed');
    }
    return result.success;
  }, [checkConnectionStatus, fetchModels]);

  useEffect(() => {
    loadProfiles();
    loadSsoConfigs();
    checkConnectionStatus();
  }, [loadProfiles, loadSsoConfigs, checkConnectionStatus]);

  // If already connected on mount, fetch models
  useEffect(() => {
    if (store.connectionStatus.connected && store.availableModels.length === 0) {
      fetchModels();
    }
  }, [store.connectionStatus.connected]);

  return {
    profiles,
    connectionStatus: store.connectionStatus,
    loading,
    error,
    connectWithProfile,
    defaultRegion: DEFAULT_REGION,
    // Models
    availableModels: store.availableModels,
    selectedModelId: store.selectedModelId,
    modelsLoading,
    modelsError,
    selectModel,
    fetchModels,
    // SSO
    ssoStatus,
    ssoConfigs,
    loadSsoConfigs,
    deleteSsoConfig,
    connectWithSsoConfig,
  };
}
