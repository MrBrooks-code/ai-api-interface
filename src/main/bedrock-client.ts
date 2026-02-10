/**
 * @fileoverview Factory and lifecycle management for AWS Bedrock SDK clients.
 * Clients are lazily created on first use and destroyed on disconnect or
 * credential change via {@link resetBedrockClient}.
 */

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

/** Returns the Bedrock Runtime client, creating it lazily from the current credentials. */
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

/** Returns the Bedrock control-plane client for model discovery. */
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

/**
 * Lists inference profiles available in the connected region.
 * Only inference profiles are returned because raw foundation model IDs cannot
 * be used with the Converse API for on-demand throughput.
 */
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

/** Extracts the provider name (first word) from an inference profile name. */
function extractProvider(profileName: string): string {
  // Profile names are typically like "Anthropic Claude Sonnet 4.5"
  const parts = profileName.split(' ');
  return parts[0] ?? 'Unknown';
}

/** Overrides the active model ID used for subsequent Converse API calls. */
export function setModelId(modelId: string): void {
  selectedModelId = modelId;
}

/** Returns the active model ID, falling back to the region-appropriate default. */
export function getModelId(): string {
  if (selectedModelId) return selectedModelId;
  const region = getRegion();
  return region ? getDefaultModelId(region) : getDefaultModelId('us-gov-west-1');
}

/** Destroys existing SDK clients and clears the selected model. Called on disconnect or credential change. */
export function resetBedrockClient(): void {
  runtimeClient?.destroy();
  runtimeClient = null;
  controlClient?.destroy();
  controlClient = null;
  selectedModelId = null;
}
