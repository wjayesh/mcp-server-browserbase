import { z } from 'zod'; // Ensure Zod is imported
import { Page, errors as PlaywrightErrors } from "playwright-core";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { InputType, Tool, ToolContext, ToolSchema, ToolResult } from "./tool.js";
import { createErrorResult, createSuccessResult } from "./toolUtils.js";
import type { Context } from '../context.js'; // For handle signature
import type { ToolActionResult } from '../context.js'; // For action return type
import { defineTool, type ToolFactory } from './tool.js'; // Assuming tool.js path is correct relative to keyboard.ts

// Helper function to map common key names (basic implementation)
function mapPlaywrightKey(key: string): string {
    // Add mappings if needed, e.g., { 'Return': 'Enter', 'Esc': 'Escape' }
    return key;
}

// --- Tool: Press Key ---
const PressKeyInputSchema = z.object({
    key: z.string().describe("Key to press (e.g., 'Enter', 'Tab', 'a', 'Shift+A')"),
    selector: z.string().optional().describe("Optional CSS selector for target element"),
    sessionId: z.string().optional(),
});
type PressKeyInput = z.infer<typeof PressKeyInputSchema>;

const pressKeySchema: ToolSchema<typeof PressKeyInputSchema> = {
    name: "browserbase_press_key",
    description: "Press a specific key on a selected element or globally.",
    inputSchema: PressKeyInputSchema,
};

// Handle function for PressKey
async function handlePressKey(context: Context, params: PressKeyInput): Promise<ToolResult> {
    const action = async (): Promise<ToolActionResult> => {
        const page = await context.getActivePage();
        if (!page) {
            throw new Error('No active page found for pressKey');
        }
        try {
            if (params.selector) {
                await page.press(params.selector, params.key, { timeout: 10000 });
            } else {
                await page.keyboard.press(params.key);
            }
            return { content: [{ type: 'text', text: `Pressed key: ${params.key}${params.selector ? ' on ' + params.selector : ' globally'}` }] };
        } catch (error) {
            console.error(`PressKey action failed: ${error}`);
            throw error; // Rethrow
        }
    };

    return {
        action,
        code: [], // Add code property
        captureSnapshot: true, // Pressing key might change state
        waitForNetwork: true, // Pressing key might trigger navigation/requests
    };
}

// Define tool using handle
// const pressKeyTool: Tool<typeof PressKeyInputSchema> = {
//     capability: 'core', // Add capability
//     schema: pressKeySchema,
//     handle: handlePressKey,
// };

// Export the single tool object as default
// export default pressKeyTool; // <-- REMOVE THIS LINE

// Original handler (logic now in runPressKey)
// export async function handlePressKey(...) { ... } 

const pressKey: ToolFactory = captureSnapshot => defineTool({
  capability: 'core',

  schema: {
    name: 'browserbase_press_key',
    description: 'Press a key on the keyboard',
    inputSchema: z.object({
      key: z.string().describe('Name of the key to press or a character to generate, such as `ArrowLeft` or `a`'),
      // NOTE: Removed selector and sessionId from original file based on user's code
    }),
  },

  handle: async (context, params) => {
    // Using context.getActivePage() assuming it's the correct way to get the page
    const page = await context.getActivePage();
    if (!page) {
      throw new Error('No active page found for pressKey');
    }

    // Changed from tab.page to page based on search results context
    const code = [
      `// Press ${params.key}`,
      `await page.keyboard.press('${params.key.replace(/'/g, "\\'")}');`, // Added escaping for key
    ];

    const action = () => page.keyboard.press(params.key); // Changed from tab.page to page

    return {
      code,
      action,
      captureSnapshot, // Passed from factory
      waitForNetwork: true // Kept from user's code
    };
  },
});

const captureSnapshotValue = true;

export default [
  pressKey(captureSnapshotValue),
]; 