/**
 * @fileoverview Bedrock Converse API streaming. Sends messages to the model
 * and forwards token-level stream events to the renderer via IPC. Each active
 * stream is tracked by request ID so it can be individually aborted.
 */

import {
  ConverseStreamCommand,
  type Message,
  type ContentBlock as SdkContentBlock,
  type SystemContentBlock,
  type Tool,
} from '@aws-sdk/client-bedrock-runtime';
import { BrowserWindow } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { getBedrockClient, getModelId } from './bedrock-client';
import { MAX_TOKENS } from '../shared/constants';
import { IPC } from '../shared/ipc-channels';
import type { SendMessageParams, ContentBlock, ToolDefinition } from '../shared/types';
import { getToolDefinitions } from './tool-executor';

/** Abort controllers keyed by request ID for in-flight streams. */
const activeStreams = new Map<string, AbortController>();

/** Sanitize a document name for the Bedrock Converse API:
 *  - strip the file extension (format is sent separately)
 *  - keep only alphanumeric, whitespace, hyphens, parens, square brackets
 *  - collapse consecutive whitespace
 *  - fallback to "document" if nothing remains */
function sanitizeDocName(raw: string): string {
  const noExt = raw.replace(/\.[^.]+$/, '');
  const cleaned = noExt
    .replace(/[^a-zA-Z0-9\s\-\(\)\[\]]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned || 'document';
}

/** Converts an application-level content block to the AWS SDK representation. */
function contentBlockToSdk(
  block: ContentBlock,
  docNames: Map<string, number>
): SdkContentBlock {
  switch (block.type) {
    case 'text':
      return { text: block.text } as SdkContentBlock;
    case 'image':
      return {
        image: {
          format: block.format,
          source: { bytes: block.bytes },
        },
      } as SdkContentBlock;
    case 'document': {
      let name = sanitizeDocName(block.name);
      const count = docNames.get(name) ?? 0;
      docNames.set(name, count + 1);
      if (count > 0) name = `${name} (${count})`;
      return {
        document: {
          format: block.format,
          name,
          source: { bytes: block.bytes },
        },
      } as SdkContentBlock;
    }
    case 'toolUse':
      return {
        toolUse: {
          toolUseId: block.toolUseId,
          name: block.name,
          input: block.input,
        },
      } as SdkContentBlock;
    case 'toolResult':
      return {
        toolResult: {
          toolUseId: block.toolUseId,
          content: [{ text: block.content }],
          status: block.status,
        },
      } as SdkContentBlock;
    default:
      throw new Error(`Unknown content block type: ${(block as ContentBlock).type}`);
  }
}

/** Transforms the renderer's message array into SDK-compatible messages. */
function buildMessages(params: SendMessageParams): Message[] {
  const docNames = new Map<string, number>();
  return params.messages.map((msg) => ({
    role: msg.role,
    content: msg.content.map((block) => contentBlockToSdk(block, docNames)),
  }));
}

/** Builds the Converse API tool configuration from registered tool definitions. */
function buildToolConfig(): { tools: Tool[] } | undefined {
  const defs: ToolDefinition[] = getToolDefinitions();
  if (defs.length === 0) return undefined;
  return {
    tools: defs.map((d) => ({
      toolSpec: {
        name: d.name,
        description: d.description,
        inputSchema: { json: d.inputSchema },
      },
    } as Tool)),
  };
}

/**
 * Sends a message to Bedrock via the Converse Streaming API and forwards
 * each stream event to the renderer. Streaming runs in the background;
 * the returned request ID can be used with {@link abortStream} to cancel.
 * @param params Conversation messages and optional system prompt.
 * @param window The BrowserWindow to push stream events to.
 * @returns A unique request ID for this stream.
 */
export async function sendMessage(
  params: SendMessageParams,
  window: BrowserWindow
): Promise<string> {
  const requestId = uuidv4();
  const abortController = new AbortController();
  activeStreams.set(requestId, abortController);

  const modelId = getModelId();
  const client = getBedrockClient();

  const messages = buildMessages(params);

  const systemContent: SystemContentBlock[] | undefined = params.system
    ? [{ text: params.system }]
    : undefined;

  const toolConfig = buildToolConfig();

  const command = new ConverseStreamCommand({
    modelId,
    messages,
    system: systemContent,
    inferenceConfig: {
      maxTokens: MAX_TOKENS,
    },
    ...(toolConfig ? { toolConfig } : {}),
  });

  // Run streaming in background
  (async () => {
    try {
      const response = await client.send(command, {
        abortSignal: abortController.signal,
      });

      if (!response.stream) {
        throw new Error('No stream in response');
      }

      for await (const event of response.stream) {
        if (abortController.signal.aborted) break;

        if (event.messageStart) {
          window.webContents.send(IPC.CHAT_STREAM_EVENT, {
            requestId,
            type: 'messageStart',
            data: { role: event.messageStart.role },
          });
        } else if (event.contentBlockStart) {
          window.webContents.send(IPC.CHAT_STREAM_EVENT, {
            requestId,
            type: 'contentBlockStart',
            data: {
              contentBlockIndex: event.contentBlockStart.contentBlockIndex,
              start: event.contentBlockStart.start,
            },
          });
        } else if (event.contentBlockDelta) {
          window.webContents.send(IPC.CHAT_STREAM_EVENT, {
            requestId,
            type: 'contentBlockDelta',
            data: {
              contentBlockIndex: event.contentBlockDelta.contentBlockIndex,
              delta: event.contentBlockDelta.delta,
            },
          });
        } else if (event.contentBlockStop) {
          window.webContents.send(IPC.CHAT_STREAM_EVENT, {
            requestId,
            type: 'contentBlockStop',
            data: {
              contentBlockIndex: event.contentBlockStop.contentBlockIndex,
            },
          });
        } else if (event.messageStop) {
          window.webContents.send(IPC.CHAT_STREAM_EVENT, {
            requestId,
            type: 'messageStop',
            data: {
              stopReason: event.messageStop.stopReason,
            },
          });
        } else if (event.metadata) {
          window.webContents.send(IPC.CHAT_STREAM_EVENT, {
            requestId,
            type: 'metadata',
            data: {
              usage: event.metadata.usage,
            },
          });
        }
      }
    } catch (err: unknown) {
      if (abortController.signal.aborted) return;
      const message = err instanceof Error ? err.message : 'Unknown streaming error';
      window.webContents.send(IPC.CHAT_STREAM_EVENT, {
        requestId,
        type: 'error',
        data: { message },
      });
    } finally {
      activeStreams.delete(requestId);
    }
  })();

  return requestId;
}

/**
 * Cancels an in-flight stream by its request ID.
 * @returns `true` if the stream was found and aborted, `false` if already finished.
 */
export function abortStream(requestId: string): boolean {
  const controller = activeStreams.get(requestId);
  if (controller) {
    controller.abort();
    activeStreams.delete(requestId);
    return true;
  }
  return false;
}
