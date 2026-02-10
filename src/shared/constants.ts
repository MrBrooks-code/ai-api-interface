/**
 * @fileoverview Application-wide constants for AWS regions, default model IDs,
 * and Bedrock API limits. Shared across main and renderer processes.
 */

/** AWS GovCloud region identifiers. */
export const GOVCLOUD_REGIONS = ['us-gov-west-1', 'us-gov-east-1'] as const;

/** AWS commercial region identifiers where Bedrock is available. */
export const COMMERCIAL_REGIONS = [
  'us-east-1',
  'us-east-2',
  'us-west-2',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'eu-central-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
] as const;

/** Combined list of all supported AWS regions (GovCloud first). */
export const ALL_REGIONS = [...GOVCLOUD_REGIONS, ...COMMERCIAL_REGIONS] as const;

/** Default region used when no prior selection exists. */
export const DEFAULT_REGION = 'us-gov-west-1';

/** Default Bedrock inference profile model IDs by partition. */
export const MODEL_IDS = {
  govcloud: 'us-gov.anthropic.claude-sonnet-4-5-20250929-v1:0',
  commercial: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
} as const;

/**
 * Returns the default Bedrock model ID for the given region.
 * @param region AWS region string (e.g. `'us-gov-west-1'`).
 */
export function getDefaultModelId(region: string): string {
  if (region.startsWith('us-gov')) {
    return MODEL_IDS.govcloud;
  }
  return MODEL_IDS.commercial;
}

/** Maximum output tokens per Bedrock Converse API request. */
export const MAX_TOKENS = 8192;

/** Display name shown in the title bar and logon banner defaults. */
export const APP_NAME = 'Bedrock Chat';
