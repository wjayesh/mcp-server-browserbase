import { z } from 'zod'; 
// import type { ToolSchema, ToolResult } from "./tool.js";
// import type { Context } from '../context.js'; 
// import type { ToolActionResult } from '../context.js'; 
import { defineTool, type ToolFactory } from './tool.js'; 

// --- Tool: Press Key ---
// const PressKeyInputSchema = z.object({
//     key: z.string().describe("Key to press (e.g., 'Enter', 'Tab', 'a', 'Shift+A')"),
//     selector: z.string().optional().describe("Optional CSS selector for target element"),
//     sessionId: z.string().optional(),
// });
// type PressKeyInput = z.infer<typeof PressKeyInputSchema>;

// const pressKeySchema: ToolSchema<typeof PressKeyInputSchema> = {
//     name: "browserbase_press_key",
//     description: "Press a specific key on a selected element or globally.",
//     inputSchema: PressKeyInputSchema,
// };

// // Handle function for PressKey
// async function handlePressKey(context: Context, params: PressKeyInput): Promise<ToolResult> {
//     const action = async (): Promise<ToolActionResult> => {
//         const page = await context.getActivePage();
//         if (!page) {
//             throw new Error('No active page found for pressKey');
//         }
//         try {
//             if (params.selector) {
//                 await page.press(params.selector, params.key, { timeout: 10000 });
//             } else {
//                 await page.keyboard.press(params.key);
//             }
//             return { content: [{ type: 'text', text: `Pressed key: ${params.key}${params.selector ? ' on ' + params.selector : ' globally'}` }] };
//         } catch (error) {
//             console.error(`PressKey action failed: ${error}`);
//             throw error; // Rethrow
//         }
//     };

//     return {
//         action,
//         code: [], // Add code property
//         captureSnapshot: true, // Pressing key might change state
//         waitForNetwork: true, // Pressing key might trigger navigation/requests
//     };
// }

const pressKey: ToolFactory = captureSnapshot => defineTool({
  capability: 'core',

  schema: {
    name: 'browserbase_press_key',
    description: 'Press a key on the keyboard',
    inputSchema: z.object({
      key: z.string().describe('Name of the key to press or a character to generate, such as `ArrowLeft` or `a`'),
    }),
  },

  handle: async (context, params) => {
    const page = await context.getActivePage();
    if (!page) {
      throw new Error('No active page found for pressKey');
    }

    const code = [
      `// Press ${params.key}`,
      `await page.keyboard.press('${params.key.replace(/'/g, "\\'")}');`, 
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