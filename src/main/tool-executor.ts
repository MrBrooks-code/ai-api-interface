import { Parser } from 'expr-eval';
import type { ToolDefinition, ToolResult } from '../shared/types';

const mathParser = new Parser();

interface ToolHandler {
  definition: ToolDefinition;
  execute: (input: Record<string, unknown>) => Promise<ToolResult>;
}

const toolRegistry = new Map<string, ToolHandler>();

// --- Built-in Tools ---

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

function register(handler: ToolHandler) {
  toolRegistry.set(handler.definition.name, handler);
}

export function getToolDefinitions(): ToolDefinition[] {
  return Array.from(toolRegistry.values()).map((h) => h.definition);
}

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
