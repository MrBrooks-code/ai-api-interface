import React, { useState } from 'react';
import { ipc } from '../lib/ipc-client';
import { ALL_REGIONS } from '../../shared/constants';
import type { SsoLoginStatus, SsoAccount, SsoRole, SsoConfiguration } from '../../shared/types';
import { v4 as uuid } from 'uuid';

type WizardStep = 'url' | 'auth' | 'account' | 'role' | 'region' | 'save';

interface SsoWizardProps {
  onClose: () => void;
  onSaved: (config: SsoConfiguration) => void;
  ssoStatus: SsoLoginStatus | null;
}

export default function SsoWizard({ onClose, onSaved, ssoStatus }: SsoWizardProps) {
  const [step, setStep] = useState<WizardStep>('url');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Step: url
  const [startUrl, setStartUrl] = useState('');
  const [ssoRegion, setSsoRegion] = useState('us-east-1');

  // Step: account
  const [accounts, setAccounts] = useState<SsoAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<SsoAccount | null>(null);

  // Step: role
  const [roles, setRoles] = useState<SsoRole[]>([]);
  const [selectedRole, setSelectedRole] = useState<SsoRole | null>(null);

  // Step: region
  const [bedrockRegion, setBedrockRegion] = useState('us-east-1');

  // Step: save
  const [configName, setConfigName] = useState('');

  const handleStartAuth = async () => {
    if (!startUrl.trim()) return;
    setError(null);
    setLoading(true);
    setStep('auth');

    const result = await ipc.startSsoDeviceAuth(startUrl.trim(), ssoRegion);
    setLoading(false);

    if (!result.success) {
      setError(result.error ?? 'Device auth failed');
      setStep('url');
      return;
    }

    // Auth succeeded — discover accounts
    setLoading(true);
    const acctResult = await ipc.discoverSsoAccounts();
    setLoading(false);

    if (!acctResult.success) {
      setError(acctResult.error ?? 'Failed to list accounts');
      setStep('url');
      return;
    }

    setAccounts(acctResult.accounts);
    setStep('account');
  };

  const handleSelectAccount = async (account: SsoAccount) => {
    setSelectedAccount(account);
    setError(null);
    setLoading(true);

    const result = await ipc.discoverSsoRoles(account.accountId);
    setLoading(false);

    if (!result.success) {
      setError(result.error ?? 'Failed to list roles');
      return;
    }

    setRoles(result.roles);
    setStep('role');
  };

  const handleSelectRole = (role: SsoRole) => {
    setSelectedRole(role);
    setStep('region');
  };

  const handleSelectRegion = () => {
    // Pre-fill config name
    const acctLabel = selectedAccount?.accountName || selectedAccount?.accountId || '';
    const roleLabel = selectedRole?.roleName || '';
    setConfigName(`${acctLabel} - ${roleLabel}`);
    setStep('save');
  };

  const handleSave = async () => {
    if (!configName.trim()) return;
    const now = Date.now();
    const config: SsoConfiguration = {
      id: uuid(),
      name: configName.trim(),
      ssoStartUrl: startUrl.trim(),
      ssoRegion,
      accountId: selectedAccount?.accountId,
      accountName: selectedAccount?.accountName,
      roleName: selectedRole?.roleName,
      bedrockRegion,
      createdAt: now,
      updatedAt: now,
    };

    await ipc.saveSsoConfig(config);
    onSaved(config);
  };

  const stepTitles: Record<WizardStep, string> = {
    url: 'SSO Start URL',
    auth: 'Authenticating',
    account: 'Select Account',
    role: 'Select Role',
    region: 'Bedrock Region',
    save: 'Save Configuration',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-surface-light rounded-2xl w-[480px] max-h-[90vh] overflow-y-auto shadow-xl border border-surface-lighter">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-lighter">
          <h2 className="text-lg font-semibold text-text">{stepTitles[step]}</h2>
          <button
            onClick={onClose}
            className="text-text-dim hover:text-text transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Step indicator */}
          <div className="flex gap-1.5">
            {(['url', 'auth', 'account', 'role', 'region', 'save'] as WizardStep[]).map((s, i) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full ${
                  i <= ['url', 'auth', 'account', 'role', 'region', 'save'].indexOf(step)
                    ? 'bg-primary'
                    : 'bg-surface-lighter'
                }`}
              />
            ))}
          </div>

          {/* Error */}
          {error && (
            <p className="text-accent-red text-sm">{error}</p>
          )}

          {/* Step: URL */}
          {step === 'url' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-text-muted mb-1">SSO Start URL</label>
                <input
                  type="url"
                  value={startUrl}
                  onChange={(e) => setStartUrl(e.target.value)}
                  placeholder="https://mycompany.awsapps.com/start"
                  className="w-full bg-surface rounded-lg px-3 py-2 text-sm text-text border border-surface-lighter focus:border-primary outline-none"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">SSO Region</label>
                <select
                  value={ssoRegion}
                  onChange={(e) => setSsoRegion(e.target.value)}
                  className="w-full bg-surface rounded-lg px-3 py-2 text-sm text-text border border-surface-lighter focus:border-primary outline-none"
                >
                  {ALL_REGIONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleStartAuth}
                disabled={!startUrl.trim()}
                className="w-full py-2.5 rounded-lg bg-primary text-surface font-medium text-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
              >
                Authenticate
              </button>
            </div>
          )}

          {/* Step: Auth (progress) */}
          {step === 'auth' && (
            <div className="space-y-3">
              <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 space-y-2">
                {(!ssoStatus || ssoStatus.stage === 'registering') && (
                  <p className="text-sm text-text-muted">Registering SSO client...</p>
                )}
                {ssoStatus?.stage === 'authorizing' && (
                  <p className="text-sm text-text-muted">Starting device authorization...</p>
                )}
                {ssoStatus?.stage === 'polling' && (
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
                {ssoStatus?.stage === 'complete' && (
                  <p className="text-sm text-accent-green">SSO login successful! Discovering accounts...</p>
                )}
                {ssoStatus?.stage === 'error' && (
                  <p className="text-sm text-accent-red">{ssoStatus.error ?? 'SSO login failed'}</p>
                )}
              </div>
              {loading && (
                <p className="text-xs text-text-dim text-center">Please wait...</p>
              )}
            </div>
          )}

          {/* Step: Account */}
          {step === 'account' && (
            <div className="space-y-2">
              {accounts.length === 0 ? (
                <p className="text-sm text-text-muted">No accounts found.</p>
              ) : (
                <div className="max-h-64 overflow-y-auto space-y-1.5">
                  {accounts.map((acct) => (
                    <button
                      key={acct.accountId}
                      onClick={() => handleSelectAccount(acct)}
                      disabled={loading}
                      className="w-full text-left px-4 py-3 rounded-lg border border-surface-lighter hover:border-primary/50 hover:bg-primary/5 transition-colors disabled:opacity-50"
                    >
                      <div className="text-sm font-medium text-text">{acct.accountName}</div>
                      <div className="text-xs text-text-muted">
                        {acct.accountId}
                        {acct.emailAddress ? ` — ${acct.emailAddress}` : ''}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => setStep('url')}
                className="w-full py-2 rounded-lg text-sm text-text-muted hover:text-text transition-colors"
              >
                Back
              </button>
            </div>
          )}

          {/* Step: Role */}
          {step === 'role' && (
            <div className="space-y-2">
              <p className="text-xs text-text-muted">
                Account: {selectedAccount?.accountName} ({selectedAccount?.accountId})
              </p>
              {roles.length === 0 ? (
                <p className="text-sm text-text-muted">No roles found for this account.</p>
              ) : (
                <div className="max-h-64 overflow-y-auto space-y-1.5">
                  {roles.map((role) => (
                    <button
                      key={role.roleName}
                      onClick={() => handleSelectRole(role)}
                      className="w-full text-left px-4 py-3 rounded-lg border border-surface-lighter hover:border-primary/50 hover:bg-primary/5 transition-colors"
                    >
                      <div className="text-sm font-medium text-text">{role.roleName}</div>
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => setStep('account')}
                className="w-full py-2 rounded-lg text-sm text-text-muted hover:text-text transition-colors"
              >
                Back
              </button>
            </div>
          )}

          {/* Step: Bedrock Region */}
          {step === 'region' && (
            <div className="space-y-3">
              <p className="text-xs text-text-muted">
                {selectedAccount?.accountName} / {selectedRole?.roleName}
              </p>
              <div>
                <label className="block text-xs text-text-muted mb-1">Bedrock Region</label>
                <select
                  value={bedrockRegion}
                  onChange={(e) => setBedrockRegion(e.target.value)}
                  className="w-full bg-surface rounded-lg px-3 py-2 text-sm text-text border border-surface-lighter focus:border-primary outline-none"
                >
                  {ALL_REGIONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleSelectRegion}
                className="w-full py-2.5 rounded-lg bg-primary text-surface font-medium text-sm hover:bg-primary-hover transition-colors"
              >
                Next
              </button>
              <button
                onClick={() => setStep('role')}
                className="w-full py-2 rounded-lg text-sm text-text-muted hover:text-text transition-colors"
              >
                Back
              </button>
            </div>
          )}

          {/* Step: Save */}
          {step === 'save' && (
            <div className="space-y-3">
              <div className="text-xs text-text-muted space-y-1">
                <p>Account: {selectedAccount?.accountName} ({selectedAccount?.accountId})</p>
                <p>Role: {selectedRole?.roleName}</p>
                <p>Bedrock Region: {bedrockRegion}</p>
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Configuration Name</label>
                <input
                  type="text"
                  value={configName}
                  onChange={(e) => setConfigName(e.target.value)}
                  placeholder="My SSO Config"
                  className="w-full bg-surface rounded-lg px-3 py-2 text-sm text-text border border-surface-lighter focus:border-primary outline-none"
                  autoFocus
                />
              </div>
              <button
                onClick={handleSave}
                disabled={!configName.trim()}
                className="w-full py-2.5 rounded-lg bg-primary text-surface font-medium text-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
              >
                Save & Close
              </button>
              <button
                onClick={() => setStep('region')}
                className="w-full py-2 rounded-lg text-sm text-text-muted hover:text-text transition-colors"
              >
                Back
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
