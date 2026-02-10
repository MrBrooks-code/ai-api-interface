import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import {
  BedrockClient,
  ListInferenceProfilesCommand,
} from '@aws-sdk/client-bedrock';
import { getCredentials, getRegion } from './credential-manager';
import { getDefaultModelId } from '../shared/constants';
import type { BedrockModel } from '../shared/types';

let runtimeClient: BedrockRuntimeClient | null = null;
let controlClient: BedrockClient | null = null;
let selectedModelId: string | null = null;

export function getBedrockClient(): BedrockRuntimeClient {
  if (runtimeClient) return runtimeClient;

  const credentials = getCredentials();
  const region = getRegion();

  if (!credentials || !region) {
    throw new Error('Not connected to AWS. Please configure credentials first.');
  }

  runtimeClient = new BedrockRuntimeClient({
    region,
    credentials,
  });

  return runtimeClient;
}

function getControlClient(): BedrockClient {
  if (controlClient) return controlClient;

  const credentials = getCredentials();
  const region = getRegion();

  if (!credentials || !region) {
    throw new Error('Not connected to AWS. Please configure credentials first.');
  }

  controlClient = new BedrockClient({
    region,
    credentials,
  });

  return controlClient;
}

export async function listAvailableModels(): Promise<BedrockModel[]> {
  const client = getControlClient();
  const models: BedrockModel[] = [];

  // Only list inference profiles — raw foundation model IDs cannot be used
  // with the Converse API for on-demand throughput. Users can still enter
  // a custom model ID/ARN via the text input if they have provisioned throughput.
  try {
    let nextToken: string | undefined;
    do {
      const resp = await client.send(
        new ListInferenceProfilesCommand({ maxResults: 100, nextToken })
      );
      for (const profile of resp.inferenceProfileSummaries ?? []) {
        if (profile.inferenceProfileId && profile.inferenceProfileName) {
          models.push({
            modelId: profile.inferenceProfileId,
            modelName: profile.inferenceProfileName,
            provider: extractProvider(profile.inferenceProfileName),
            source: 'inference-profile',
          });
        }
      }
      nextToken = resp.nextToken;
    } while (nextToken);
  } catch (err) {
    console.warn('ListInferenceProfiles failed:', err);
  }

  return models;
}

function extractProvider(profileName: string): string {
  // Profile names are typically like "Anthropic Claude Sonnet 4.5"
  const parts = profileName.split(' ');
  return parts[0] ?? 'Unknown';
}

export function setModelId(modelId: string): void {
  selectedModelId = modelId;
}

export function getModelId(): string {
  if (selectedModelId) return selectedModelId;
  const region = getRegion();
  return region ? getDefaultModelId(region) : getDefaultModelId('us-gov-west-1');
}

export function resetBedrockClient(): void {
  runtimeClient?.destroy();
  runtimeClient = null;
  controlClient?.destroy();
  controlClient = null;
  selectedModelId = null;
}
