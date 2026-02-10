export const GOVCLOUD_REGIONS = ['us-gov-west-1', 'us-gov-east-1'] as const;

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

export const ALL_REGIONS = [...GOVCLOUD_REGIONS, ...COMMERCIAL_REGIONS] as const;

export const DEFAULT_REGION = 'us-gov-west-1';

export const MODEL_IDS = {
  govcloud: 'us-gov.anthropic.claude-sonnet-4-5-20250929-v1:0',
  commercial: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
} as const;

export function getDefaultModelId(region: string): string {
  if (region.startsWith('us-gov')) {
    return MODEL_IDS.govcloud;
  }
  return MODEL_IDS.commercial;
}

export const MAX_TOKENS = 8192;

export const APP_NAME = 'Bedrock Chat';
