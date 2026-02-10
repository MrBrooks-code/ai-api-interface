/**
 * @fileoverview Chat hook that manages message sending, stream event handling,
 * and the automatic tool-use loop. Subscribes to stream events from the main
 * process and accumulates response tokens into the Zustand store.
 */

import { useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useChatStore } from '../stores/chat-store';
import { ipc } from '../lib/ipc-client';
import { buildUserContent, buildToolResultBlock } from '../lib/message-builder';
import type { ChatMessage, ContentBlock, StreamEvent, UploadedFile } from '../../shared/types';

export function useChat() {
  const store = useChatStore();
  const cleanupRef = useRef<(() => void) | null>(null);

  // Set up stream event listener
  useEffect(() => {
    const cleanup = ipc.onStreamEvent((event: StreamEvent) => {
      const state = useChatStore.getState();
      if (event.requestId !== state.activeRequestId) return;

      switch (event.type) {
        case 'messageStart':
          // Message already created in sendMessage
          break;

        case 'contentBlockStart':
          state.startContentBlock(
            event.data.contentBlockIndex as number,
            event.data.start as Record<string, unknown>
          );
          break;

        case 'contentBlockDelta':
          state.appendToStreamingMessage(
            event.data.contentBlockIndex as number,
            event.data.delta as Record<string, unknown>
          );
          break;

        case 'contentBlockStop':
          // Nothing to do here; finalization happens on messageStop
          break;

        case 'messageStop': {
          const stopReason = event.data.stopReason as string;
          state.finalizeStreamingMessage(stopReason);

          // After finalizing, check if we need tool execution
          const updatedState = useChatStore.getState();
          const lastMsg = updatedState.messages[updatedState.messages.length - 1];

          if (stopReason === 'tool_use' && lastMsg) {
            handleToolUseLoop(lastMsg);
          } else if (lastMsg) {
            // Save completed message
            ipc.saveMessage(lastMsg);
          }
          break;
        }

        case 'metadata':
          // Could display token usage
          break;

        case 'error': {
          const errMsg = (event.data.message as string) ?? 'Unknown error';
          state.setStreaming(false);
          // Surface error as a visible message in the chat
          const errState = useChatStore.getState();
          const streamingId = state.streamingMessageId;
          if (streamingId) {
            errState.updateMessage(streamingId, {
              content: [{ type: 'text', text: `**Error:** ${errMsg}` }],
              stopReason: 'error',
            });
          }
          break;
        }
      }
    });

    cleanupRef.current = cleanup;
    return cleanup;
  }, []);

  const handleToolUseLoop = useCallback(async (assistantMessage: ChatMessage) => {
    // Save assistant message first
    await ipc.saveMessage(assistantMessage);

    // Find tool use blocks and execute them
    const toolUseBlocks = assistantMessage.content.filter((b) => b.type === 'toolUse');
    const toolResults: ContentBlock[] = [];

    for (const block of toolUseBlocks) {
      if (block.type !== 'toolUse') continue;
      const result = await ipc.executeTool(block.name, block.input);
      toolResults.push(
        buildToolResultBlock(
          block.toolUseId,
          result.content,
          result.success ? 'success' : 'error'
        )
      );
    }

    if (toolResults.length === 0) return;

    // Create user message with tool results
    const state = useChatStore.getState();
    const toolResultMessage = state.createMessage(
      assistantMessage.conversationId,
      'user',
      toolResults
    );
    state.addMessage(toolResultMessage);
    await ipc.saveMessage(toolResultMessage);

    // Build message history for Bedrock BEFORE adding the placeholder.
    // Only include real messages (exclude any empty placeholders).
    const messagesForApi = useChatStore.getState().messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Now create placeholder assistant message for streaming into
    const updatedState = useChatStore.getState();
    const newAssistantMsg = updatedState.createMessage(
      assistantMessage.conversationId,
      'assistant',
      [{ type: 'text', text: '' }]
    );
    useChatStore.getState().addMessage(newAssistantMsg);

    // Start new stream with history that does NOT include the placeholder
    const { requestId } = await ipc.sendMessage({
      conversationId: assistantMessage.conversationId,
      messages: messagesForApi,
    });

    useChatStore.getState().setStreaming(true, requestId, newAssistantMsg.id);
  }, []);

  const sendMessage = useCallback(
    async (text: string, files: UploadedFile[] = []) => {
      const state = useChatStore.getState();
      let conversationId = state.activeConversationId;

      // Create conversation if none active
      if (!conversationId) {
        conversationId = uuidv4();
        const title = text.slice(0, 50) + (text.length > 50 ? '...' : '');
        const convo = await ipc.createConversation(conversationId, title);
        state.addConversation(convo);
        state.setActiveConversation(conversationId);
      }

      // Build user message
      const userContent = buildUserContent(text, files);
      const userMessage = state.createMessage(conversationId, 'user', userContent);
      state.addMessage(userMessage);
      await ipc.saveMessage(userMessage);

      // Build message history for Bedrock BEFORE adding the placeholder.
      // This ensures the last message sent to the API is the user message.
      const messagesForApi = useChatStore.getState().messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Now create placeholder assistant message for streaming text into
      const currentState = useChatStore.getState();
      const assistantMessage = currentState.createMessage(conversationId, 'assistant', [
        { type: 'text', text: '' },
      ]);
      useChatStore.getState().addMessage(assistantMessage);

      // Start streaming — send only the real messages, not the placeholder
      const { requestId } = await ipc.sendMessage({
        conversationId,
        messages: messagesForApi,
      });

      useChatStore.getState().setStreaming(true, requestId, assistantMessage.id);
    },
    []
  );

  const abortStream = useCallback(async () => {
    const state = useChatStore.getState();
    if (state.activeRequestId) {
      await ipc.abortStream(state.activeRequestId);
      state.setStreaming(false);
    }
  }, []);

  return {
    messages: store.messages,
    isStreaming: store.isStreaming,
    sendMessage,
    abortStream,
  };
}
