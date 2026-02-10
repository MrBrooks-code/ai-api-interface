import React, { useState } from 'react';
import ProfileSelector from './ProfileSelector';
import SsoWizard from './SsoWizard';
import { useSettings } from '../hooks/useSettings';
import { useChatStore } from '../stores/chat-store';
import { ALL_REGIONS } from '../../shared/constants';
import { ipc } from '../lib/ipc-client';
import { applyThemeClass } from '../App';
import type { ThemeId } from '../../shared/types';

type TopTab = 'general' | 'connection';

const THEME_OPTIONS: { id: ThemeId; label: string }[] = [
  { id: 'catppuccin-mocha', label: 'Midnight' },
  { id: 'catppuccin-latte', label: 'Cloud' },
  { id: 'nord', label: 'Arctic' },
  { id: 'tokyo-night', label: 'Twilight' },
  { id: 'rose-pine', label: 'Dusk' },
  { id: 'gruvbox-dark', label: 'Ember' },
  { id: 'solarized-light', label: 'Daylight' },
];

export default function SettingsPanel() {
  const setShowSettings = useChatStore((s) => s.setShowSettings);
  const theme = useChatStore((s) => s.theme);
  const setTheme = useChatStore((s) => s.setTheme);
  const {
    profiles,
    connectionStatus,
    loading,
    error,
    connectWithProfile,
    defaultRegion,
    availableModels,
    selectedModelId,
    modelsLoading,
    modelsError,
    selectModel,
    fetchModels,
    ssoStatus,
    ssoConfigs,
    loadSsoConfigs,
    deleteSsoConfig,
    connectWithSsoConfig,
  } = useSettings();

  const [topTab, setTopTab] = useState<TopTab>('general');
  const [mode, setMode] = useState<'profile' | 'sso'>(
    profiles.length > 0 ? 'profile' : 'sso'
  );
  const [showSsoWizard, setShowSsoWizard] = useState(false);

  // Wipe data confirmation
  const [showWipeConfirm, setShowWipeConfirm] = useState(false);

  // Profile mode state
  const [selectedProfile, setSelectedProfile] = useState(profiles[0]?.name ?? '');
  const [profileRegion, setProfileRegion] = useState(
    connectionStatus.region ?? defaultRegion
  );

  // Custom model ID input
  const [customModelId, setCustomModelId] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  const handleConnect = async () => {
    await connectWithProfile(selectedProfile, profileRegion);
  };

  const handleModelChange = (value: string) => {
    if (value === '__custom__') {
      setShowCustomInput(true);
    } else {
      setShowCustomInput(false);
      selectModel(value);
    }
  };

  const handleCustomModelSubmit = () => {
    if (customModelId.trim()) {
      selectModel(customModelId.trim());
      setShowCustomInput(false);
    }
  };

  const handleThemeChange = (themeId: ThemeId) => {
    setTheme(themeId);
    applyThemeClass(themeId);
    ipc.setSetting('theme', themeId);
  };

  const handleWipeData = async () => {
    await ipc.wipeAllData();
    useChatStore.getState().setConversations([]);
    useChatStore.getState().setMessages([]);
    useChatStore.getState().setActiveConversation(null);
    setShowWipeConfirm(false);
  };

  // Group models by provider for the dropdown
  const modelsByProvider = availableModels.reduce(
    (acc, m) => {
      const key = m.provider;
      if (!acc[key]) acc[key] = [];
      acc[key].push(m);
      return acc;
    },
    {} as Record<string, typeof availableModels>
  );

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
      <div className="bg-surface-light rounded-2xl w-[480px] h-[560px] flex flex-col shadow-xl border border-surface-lighter">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-lighter shrink-0">
          <h2 className="text-lg font-semibold text-text">Settings</h2>
          <button
            onClick={() => setShowSettings(false)}
            className="text-text-dim hover:text-text transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Top-level section tabs: General | Connection */}
        <div className="flex gap-2 px-6 pt-4 shrink-0">
          <button
            onClick={() => setTopTab('general')}
            className={`flex-1 py-2 text-sm rounded-lg transition-colors ${
              topTab === 'general'
                ? 'bg-primary/20 text-primary'
                : 'bg-surface-lighter text-text-muted hover:text-text'
            }`}
          >
            General
          </button>
          <button
            onClick={() => setTopTab('connection')}
            className={`flex-1 py-2 text-sm rounded-lg transition-colors ${
              topTab === 'connection'
                ? 'bg-primary/20 text-primary'
                : 'bg-surface-lighter text-text-muted hover:text-text'
            }`}
          >
            Connection
          </button>
        </div>

        {/* Scrollable tab content */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
          {/* ==================== GENERAL TAB ==================== */}
          {topTab === 'general' && (
            <>
              {/* Appearance */}
              <div className="space-y-2">
                <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide">Appearance</h3>
                <div>
                  <label className="block text-xs text-text-muted mb-1">Theme</label>
                  <select
                    value={theme}
                    onChange={(e) => handleThemeChange(e.target.value as ThemeId)}
                    className="w-full bg-surface rounded-lg px-3 py-2 text-sm text-text border border-surface-lighter focus:border-primary outline-none"
                  >
                    {THEME_OPTIONS.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Data */}
              <div className="space-y-2 pt-2 border-t border-surface-lighter">
                <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide">Data</h3>
                {!showWipeConfirm ? (
                  <button
                    onClick={() => setShowWipeConfirm(true)}
                    className="w-full py-2.5 rounded-lg bg-accent-red/10 text-accent-red font-medium text-sm hover:bg-accent-red/20 transition-colors"
                  >
                    Wipe All Data
                  </button>
                ) : (
                  <div className="rounded-lg border border-accent-red/30 bg-accent-red/5 px-4 py-3 space-y-3">
                    <p className="text-sm text-text">
                      Are you sure? This will delete all conversations and saved SSO configurations.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowWipeConfirm(false)}
                        className="flex-1 py-2 rounded-lg bg-surface-lighter text-text text-sm font-medium hover:bg-surface-lighter/80 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleWipeData}
                        className="flex-1 py-2 rounded-lg bg-accent-red text-surface text-sm font-medium hover:bg-accent-red/90 transition-colors"
                      >
                        Confirm
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ==================== CONNECTION TAB ==================== */}
          {topTab === 'connection' && (
            <>
              {/* Connection Status */}
              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    connectionStatus.connected ? 'bg-accent-green' : 'bg-accent-red'
                  }`}
                />
                <span className="text-sm text-text-muted">
                  {connectionStatus.connected
                    ? `Connected — ${connectionStatus.ssoConfigName ?? connectionStatus.profile ?? 'Unknown'} (${connectionStatus.region})`
                    : 'Not Connected'}
                </span>
              </div>

              {/* Mode Toggle */}
              <div className="flex gap-2">
                <button
                  onClick={() => setMode('profile')}
                  className={`flex-1 py-2 text-sm rounded-lg transition-colors ${
                    mode === 'profile'
                      ? 'bg-primary/20 text-primary'
                      : 'bg-surface-lighter text-text-muted hover:text-text'
                  }`}
                >
                  AWS Profile
                </button>
                <button
                  onClick={() => setMode('sso')}
                  className={`flex-1 py-2 text-sm rounded-lg transition-colors ${
                    mode === 'sso'
                      ? 'bg-primary/20 text-primary'
                      : 'bg-surface-lighter text-text-muted hover:text-text'
                  }`}
                >
                  SSO Connection
                </button>
              </div>

              {/* Profile Mode */}
              {mode === 'profile' && (
                <div className="space-y-3">
                  <ProfileSelector
                    profiles={profiles}
                    selected={selectedProfile}
                    onSelect={setSelectedProfile}
                  />
                  <div>
                    <label className="block text-xs text-text-muted mb-1">Region</label>
                    <select
                      value={profileRegion}
                      onChange={(e) => setProfileRegion(e.target.value)}
                      className="w-full bg-surface rounded-lg px-3 py-2 text-sm text-text border border-surface-lighter focus:border-primary outline-none"
                    >
                      {ALL_REGIONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* SSO Mode */}
              {mode === 'sso' && (
                <div className="space-y-3">
                  {ssoConfigs.length > 0 ? (
                    <div className="space-y-2">
                      {ssoConfigs.map((config) => (
                        <div
                          key={config.id}
                          className="flex items-center justify-between px-4 py-3 rounded-lg border border-surface-lighter"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-text truncate">{config.name}</div>
                            <div className="text-xs text-text-muted truncate">
                              {config.accountName} / {config.roleName} — {config.bedrockRegion}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-3 shrink-0">
                            <button
                              onClick={() => connectWithSsoConfig(config.id)}
                              disabled={loading}
                              className="px-3 py-1.5 rounded-lg bg-primary text-surface text-xs font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
                            >
                              Connect
                            </button>
                            <button
                              onClick={() => deleteSsoConfig(config.id)}
                              className="px-2 py-1.5 rounded-lg text-xs text-accent-red hover:bg-accent-red/10 transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-text-muted text-center py-2">
                      No saved SSO configurations.
                    </p>
                  )}
                  <button
                    onClick={() => setShowSsoWizard(true)}
                    className="w-full py-2.5 rounded-lg bg-primary text-surface font-medium text-sm hover:bg-primary-hover transition-colors"
                  >
                    Add New
                  </button>
                </div>
              )}

              {/* Error */}
              {error && (
                <p className="text-accent-red text-sm">{error}</p>
              )}

              {/* SSO Login Progress */}
              {ssoStatus && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 space-y-2">
                  {ssoStatus.stage === 'registering' && (
                    <p className="text-sm text-text-muted">Registering SSO client...</p>
                  )}
                  {ssoStatus.stage === 'authorizing' && (
                    <p className="text-sm text-text-muted">Starting device authorization...</p>
                  )}
                  {ssoStatus.stage === 'polling' && (
                    <>
                      <p className="text-sm text-text">
                        A browser window has opened for SSO login.
                      </p>
                      {ssoStatus.userCode && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-text-muted">Code:</span>
                          <code className="px-2 py-1 bg-surface rounded text-sm font-mono text-primary font-bold tracking-wider">
                            {ssoStatus.userCode}
                          </code>
                        </div>
                      )}
                      <p className="text-xs text-text-dim">
                        Waiting for you to complete authentication in the browser...
                      </p>
                    </>
                  )}
                  {ssoStatus.stage === 'complete' && (
                    <p className="text-sm text-accent-green">SSO login successful!</p>
                  )}
                  {ssoStatus.stage === 'error' && (
                    <p className="text-sm text-accent-red">{ssoStatus.error ?? 'SSO login failed'}</p>
                  )}
                </div>
              )}

              {/* Connect Button (profile mode only) */}
              {mode === 'profile' && (
                <button
                  onClick={handleConnect}
                  disabled={loading}
                  className="w-full py-2.5 rounded-lg bg-primary text-surface font-medium text-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
                >
                  {loading
                    ? ssoStatus?.stage === 'polling'
                      ? 'Waiting for SSO...'
                      : 'Connecting...'
                    : 'Connect'}
                </button>
              )}

              {/* ---- Model Selection ---- */}
              {connectionStatus.connected && (
                <div className="pt-2 border-t border-surface-lighter space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs text-text-muted">Model</label>
                    <button
                      onClick={fetchModels}
                      disabled={modelsLoading}
                      className="text-xs text-primary hover:text-primary-hover transition-colors disabled:opacity-50"
                    >
                      {modelsLoading ? 'Loading...' : 'Refresh'}
                    </button>
                  </div>

                  {modelsError && (
                    <p className="text-accent-red text-xs">{modelsError}</p>
                  )}

                  {availableModels.length > 0 ? (
                    <select
                      value={
                        showCustomInput
                          ? '__custom__'
                          : selectedModelId ?? ''
                      }
                      onChange={(e) => handleModelChange(e.target.value)}
                      className="w-full bg-surface rounded-lg px-3 py-2 text-sm text-text border border-surface-lighter focus:border-primary outline-none"
                    >
                      {Object.entries(modelsByProvider).map(([provider, models]) => (
                        <optgroup key={provider} label={provider}>
                          {models.map((m) => (
                            <option key={m.modelId} value={m.modelId}>
                              {m.modelName}
                              {m.source === 'inference-profile' ? ' (cross-region)' : ''}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                      <optgroup label="Other">
                        <option value="__custom__">Enter custom model ID...</option>
                      </optgroup>
                    </select>
                  ) : (
                    <p className="text-text-dim text-xs">
                      {modelsLoading
                        ? 'Fetching available models...'
                        : 'No models found. Click Refresh or enter a custom model ID.'}
                    </p>
                  )}

                  {/* Custom model ID input */}
                  {(showCustomInput || availableModels.length === 0) && (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={customModelId}
                        onChange={(e) => setCustomModelId(e.target.value)}
                        placeholder="e.g. us-gov.anthropic.claude-sonnet-4-5-20250929-v1:0"
                        className="flex-1 bg-surface rounded-lg px-3 py-2 text-sm text-text border border-surface-lighter focus:border-primary outline-none"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCustomModelSubmit();
                        }}
                      />
                      <button
                        onClick={handleCustomModelSubmit}
                        disabled={!customModelId.trim()}
                        className="px-3 py-2 rounded-lg bg-primary text-surface text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
                      >
                        Set
                      </button>
                    </div>
                  )}

                  {/* Currently active model */}
                  {selectedModelId && (
                    <p className="text-text-dim text-xs break-all">
                      Active: {selectedModelId}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Done Button — pinned to bottom */}
        <div className="px-6 pb-4 pt-2 border-t border-surface-lighter shrink-0">
          <button
            onClick={() => setShowSettings(false)}
            className="w-full py-2.5 rounded-lg bg-surface-lighter text-text font-medium text-sm hover:bg-surface-lighter/80 transition-colors"
          >
            Done
          </button>
        </div>
      </div>

      {/* SSO Wizard Modal */}
      {showSsoWizard && (
        <SsoWizard
          onClose={() => setShowSsoWizard(false)}
          onSaved={() => {
            setShowSsoWizard(false);
            loadSsoConfigs();
          }}
          ssoStatus={ssoStatus}
        />
      )}
    </div>
  );
}
