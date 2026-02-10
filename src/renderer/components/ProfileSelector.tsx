/**
 * @fileoverview Dropdown selector that groups discovered AWS profiles into
 * SSO and static-credential categories with session status indicators.
 */

import React from 'react';
import type { AwsProfile } from '../../shared/types';

/** Props accepted by {@link ProfileSelector}. */
interface Props {
  profiles: AwsProfile[];
  selected: string;
  onSelect: (name: string) => void;
}

/** Grouped dropdown for choosing an AWS CLI profile. */
export default function ProfileSelector({ profiles, selected, onSelect }: Props) {
  if (profiles.length === 0) {
    return (
      <p className="text-text-dim text-sm">
        No AWS profiles found in ~/.aws/credentials or ~/.aws/config.
        Use the SSO Connection tab to configure access.
      </p>
    );
  }

  const ssoProfiles = profiles.filter((p) => p.isSso);
  const staticProfiles = profiles.filter((p) => !p.isSso);

  return (
    <div>
      <label className="block text-xs text-text-muted mb-1">AWS Profile</label>
      <select
        value={selected}
        onChange={(e) => onSelect(e.target.value)}
        className="w-full bg-surface rounded-lg px-3 py-2 text-sm text-text border border-surface-lighter focus:border-primary outline-none"
      >
        {ssoProfiles.length > 0 && (
          <optgroup label="SSO Profiles">
            {ssoProfiles.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
                {p.region ? ` (${p.region})` : ''}
                {p.ssoTokenValid ? ' — session active' : ' — login required'}
              </option>
            ))}
          </optgroup>
        )}
        {staticProfiles.length > 0 && (
          <optgroup label="Static Credentials">
            {staticProfiles.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
                {p.region ? ` (${p.region})` : ''}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
  );
}
