/**
 * @fileoverview Built-in tool definitions and execution. Tools are registered
 * at import time and made available to the Bedrock Converse API via
 * {@link getToolDefinitions}. Expression evaluation uses a sandboxed parser
 * (expr-eval) — no `Function()` or `eval()` is used (see SI-F01).
 */

import { Parser } from 'expr-eval';
import type { ToolDefinition, ToolResult } from '../shared/types';

/** Sandboxed math expression parser shared by the calculator tool. */
const mathParser = new Parser();

/** Internal registration entry pairing a tool schema with its executor. */
interface ToolHandler {
  definition: ToolDefinition;
  execute: (input: Record<string, unknown>) => Promise<ToolResult>;
}

/** Registry of available tools, keyed by tool name. */
const toolRegistry = new Map<string, ToolHandler>();

// --- Built-in Tools ---

/** Registers the default tools (current time, calculator) into the registry. */
function registerBuiltinTools() {
  // Current date/time tool
  register({
    definition: {
      name: 'get_current_time',
      description: 'Get the current date and time in ISO format',
      inputSchema: {
        type: 'object',
        properties: {
          timezone: {
            type: 'string',
            description: 'IANA timezone name (e.g. "America/New_York"). Defaults to UTC.',
          },
        },
        required: [],
      },
    },
    execute: async (input) => {
      const tz = (input.timezone as string) || 'UTC';
      try {
        const now = new Date();
        const formatted = now.toLocaleString('en-US', { timeZone: tz });
        return { success: true, content: `Current time (${tz}): ${formatted}` };
      } catch {
        return { success: false, content: `Invalid timezone: ${tz}` };
      }
    },
  });

  // Calculator tool
  register({
    definition: {
      name: 'calculator',
      description: 'Evaluate a mathematical expression. Supports basic arithmetic and functions like sqrt(), abs(), ceil(), floor(), round(), pow(), log(), sin(), cos(), tan(), min(), max().',
      inputSchema: {
        type: 'object',
        properties: {
          expression: {
            type: 'string',
            description: 'Mathematical expression to evaluate (e.g. "2 + 2", "sqrt(16)", "pow(2, 10)")',
          },
        },
        required: ['expression'],
      },
    },
    execute: async (input) => {
      const expr = input.expression as string;
      try {
        const result = mathParser.evaluate(expr);
        return { success: true, content: `Result: ${result}` };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Evaluation error';
        return { success: false, content: message };
      }
    },
  });
}

/** Adds a tool handler to the registry. */
function register(handler: ToolHandler) {
  toolRegistry.set(handler.definition.name, handler);
}

/** Returns the schema definitions for all registered tools. */
export function getToolDefinitions(): ToolDefinition[] {
  return Array.from(toolRegistry.values()).map((h) => h.definition);
}

/**
 * Executes a registered tool by name.
 * @param name The tool name as defined in its schema.
 * @param input The input object matching the tool's JSON Schema.
 */
export async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const handler = toolRegistry.get(name);
  if (!handler) {
    return { success: false, content: `Unknown tool: ${name}` };
  }
  try {
    return await handler.execute(input);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Tool execution error';
    return { success: false, content: message };
  }
}

// Initialize on import
registerBuiltinTools();
