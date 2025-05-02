import { z } from 'zod'; // Ensure Zod is imported
import { Page, errors as PlaywrightErrors } from "playwright-core";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { InputType, Tool, ToolContext, ToolSchema } from "./tool.js";
import { createErrorResult, createSuccessResult } from "./toolUtils.js";

// Helper function to map common key names (basic implementation)
function mapPlaywrightKey(key: string): string {
    // Add mappings if needed, e.g., { 'Return': 'Enter', 'Esc': 'Escape' }
    return key;
}

// --- Tool: browserbase_press_key ---

// 1. Define Zod Schema
const PressKeyInputSchema = z.object({
    key: z.string().describe("The key to press (e.g., 'Enter', 'Tab', 'a', 'Shift+A')."),
    selector: z.string().optional().describe("Optional selector for target element."),
    sessionId: z.string().optional().describe("Session ID"),
});
// 2. Infer TS Type
type PressKeyInput = z.infer<typeof PressKeyInputSchema>;

// 3. Define ToolSchema using generic
const pressKeySchema: ToolSchema<typeof PressKeyInputSchema> = {
    name: "browserbase_press_key",
    description: "Press a specific key on a selected element or globally.",
    inputSchema: PressKeyInputSchema, // Assign Zod schema
};

// 4. Implement run function using inferred type
async function runPressKey(context: ToolContext, args: PressKeyInput): Promise<CallToolResult> {
    const toolName = pressKeySchema.name;
    const { key, selector, sessionId } = args;
    
    const delayMs = 50;

    const page = await context.context.getActivePage();
    
    if (!page) return createErrorResult("No active page", toolName);

    const mappedKey = mapPlaywrightKey(key);
    
    try {
        if (selector) {
            const locator = page.locator(selector);
            await locator.press(mappedKey, { delay: delayMs });
            return createSuccessResult(`Pressed '${key}' on element ${selector}`, toolName);
        } else {
            await page.keyboard.press(mappedKey, { delay: delayMs });
            return createSuccessResult(`Pressed '${key}' globally`, toolName);
        }
    } catch (error) {
        let errorMessage = `Failed to press key "${key}".`;
        if (error instanceof PlaywrightErrors.TimeoutError) errorMessage += " Timeout.";
        else errorMessage += ` ${(error as Error).message}`;
        return createErrorResult(errorMessage, toolName);
    }
}

// 5. Define Tool using generic
const pressKeyTool: Tool<typeof PressKeyInputSchema> = {
    schema: pressKeySchema,
    run: runPressKey,
};

// Export factory function
export function keyboard(captureSnapshot: boolean): Tool<any>[] {
    // captureSnapshot flag currently ignored
    return [pressKeyTool];
}
export default keyboard;

// Original handler (logic now in runPressKey)
// export async function handlePressKey(...) { ... } 