import { z } from 'zod';
// Import ToolResult and adjust Tool type usage
import type { Tool, ToolSchema, ToolContext, ToolResult } from "./tool.js";
import { createSuccessResult, createErrorResult } from "./toolUtils.js"; // Assuming these exist
import type { Context } from '../context.js'; // For handle signature
import type { ToolActionResult } from '../context.js'; // For action return type

// --- Tool: Get Text ---
const GetTextInputSchema = z.object({
    selector: z.string().optional().describe("Optional CSS selector to get text from. If omitted, gets text from the whole body."),
    sessionId: z.string().optional(), // Keep for schema consistency if needed elsewhere
});
type GetTextInput = z.infer<typeof GetTextInputSchema>;

const getTextSchema: ToolSchema<typeof GetTextInputSchema> = {
    name: "browserbase_get_text",
    description: "Extract text content from the page or a specific element.",
    inputSchema: GetTextInputSchema,
};

// Handle function for GetText
async function handleGetText(context: Context, params: GetTextInput): Promise<ToolResult> {
    const action = async (): Promise<ToolActionResult> => {
        const page = await context.getActivePage();
        if (!page) {
            throw new Error('No active page found for getText');
        }
        try {
            let textContent: string | null;
            if (params.selector) {
                textContent = await page.textContent(params.selector, { timeout: 10000 });
            } else {
                textContent = await page.textContent('body', { timeout: 10000 });
            }
            return { content: [{ type: 'text', text: textContent ?? "" }] };
        } catch (error) {
            // Log error? Throw? Action results don't easily convey errors back to Context.run
            console.error(`GetText action failed: ${error}`);
            throw error; // Rethrow to be caught by Context.run's try/catch around handle/action
        }
    };

    return {
        action,
        code: [],
        captureSnapshot: false,
        waitForNetwork: false,
    };
}

// Define tool using handle
const getTextTool: Tool<typeof GetTextInputSchema> = {
    capability: 'core', // Add capability
    schema: getTextSchema,
    handle: handleGetText,
};

// Export the single tool object as default
export default [getTextTool]; // Export as an array containing the tool 