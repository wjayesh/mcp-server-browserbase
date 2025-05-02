import { Page, errors as PlaywrightErrors, PageScreenshotOptions, Locator } from "playwright-core";
import { CallToolResult, TextContent, ImageContent } from "@modelcontextprotocol/sdk/types.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
// import { screenshots } from "../resources/handlers.js"; // TODO: Remove this if context handles screenshots fully
import type { Tool, ToolContext, ToolSchema } from "./tool.js";
import { createErrorResult, createSuccessResult } from "./toolUtils.js";
import { z } from 'zod';
import { type InputType } from "./tool.js";
// import { defineTool, type ToolActionResult } from "./tool.js";
// import type { Context } from "../context.js"; // Not needed directly here

// --- Helper: Generate simple code representation ---
// Basic placeholder for generateLocator and javascript.quote/formatObject
// function formatCode(locatorString: string, method: string, args: any): string {
//     const argsString = JSON.stringify(args); // Simple JSON stringify for args
//     return `await page.locator('${locatorString}').${method}(${argsString});`;
// }

// --- Tool: browserbase_snapshot ---
const SnapshotInputSchema = z.object({ sessionId: z.string().optional() });
type SnapshotInput = z.infer<typeof SnapshotInputSchema>;
const snapshotSchema: ToolSchema<typeof SnapshotInputSchema> = {
    name: "browserbase_snapshot",
    description: "Capture accessibility snapshot of the current page. Used to get 'ref' values for other actions.",
    inputSchema: SnapshotInputSchema,
};

// Use run, return CallToolResult
async function runSnapshot(context: ToolContext, args: SnapshotInput): Promise<CallToolResult> {
    const { page, sessionId, context: appContext } = context;
    const toolName = snapshotSchema.name;
    if (!page) return createErrorResult("No active page for snapshot", toolName);
    try {
        appContext.clearLatestSnapshot(sessionId);
        const snapshot = await page.accessibility.snapshot({ interestingOnly: false });
        if (!snapshot) return createErrorResult("Snapshot null.", toolName);
        appContext.setLatestSnapshot(sessionId, snapshot);
        return { content: [{ type: "text", text: JSON.stringify(snapshot, null, 2) }], isError: false };
    } catch (error) { return createErrorResult(`Snapshot failed: ${(error as Error).message}`, toolName); }
}

// Define Tool with run
const snapshotTool: Tool<typeof SnapshotInputSchema> = { schema: snapshotSchema, run: runSnapshot };

// --- Common Schema for Element Interaction ---
const elementSchema = {
    type: "object",
    properties: {
        element: { type: "string", description: "Human-readable element description (obtained from snapshot)." },
        ref: { type: "string", description: "Exact target element reference from browserbase_snapshot." },
        sessionId: { type: "string", description: "Target session ID (optional, defaults to 'default')" },
    },
    required: ["element", "ref"],
};

// --- Tool: browserbase_click ---
const ClickInputSchema = z.object({ 
    element: z.string(), 
    ref: z.string(), 
    sessionId: z.string().optional() 
});
type ClickInput = z.infer<typeof ClickInputSchema>;
const clickSchema: ToolSchema<typeof ClickInputSchema> = {
    name: "browserbase_click",
    description: "Click an element on the page using its reference from browserbase_snapshot.",
    inputSchema: ClickInputSchema,
};

// Use run, return CallToolResult
async function runClick(context: ToolContext, args: ClickInput): Promise<CallToolResult> {
    const { ref, element, sessionId } = args;
    const page = await context.context.getActivePage();
    const refToFind = ref;

    if (!page) return createErrorResult("No active page", clickSchema.name);

    try {
        const locator = page.locator(`[aria-ref="${refToFind}"]`);
        await locator.click({ timeout: 15000 });
        return createSuccessResult(`Clicked element with ref: ${refToFind} in session ${sessionId}`, clickSchema.name);
    } catch (error) {
        let errorMessage = `Failed to click element with ref "${refToFind}" in session ${sessionId}.`;
        if (error instanceof PlaywrightErrors.TimeoutError) errorMessage += " Reason: Timeout waiting for element or click action.";
        else errorMessage += ` Reason: ${(error as Error).message}`;
        return createErrorResult(errorMessage, clickSchema.name);
    }
}

// Define Tool with run
const clickTool: Tool<typeof ClickInputSchema> = {
    schema: clickSchema,
    run: runClick,
    };

// --- Tool: browserbase_drag (Placeholder) ---
const DragInputSchema = z.object({ startRef: z.string(), endRef: z.string(), sessionId: z.string().optional() });
const dragSchema: ToolSchema<typeof DragInputSchema> = { name: "browserbase_drag", description: "Drag (Not Implemented)", inputSchema: DragInputSchema };
async function runDrag(c: ToolContext, a: any): Promise<CallToolResult> { 
    const toolName = dragSchema.name;
    // Create error result, then modify isError
    const result = createErrorResult("Tool not implemented", toolName);
    result.isError = false; // Indicate known limitation
    return result; 
}
export const dragTool: Tool<typeof DragInputSchema> = { schema: dragSchema, run: runDrag };

// --- Tool: browserbase_hover (Placeholder) ---
const HoverInputSchema = z.object({ ref: z.string(), sessionId: z.string().optional() });
const hoverSchema: ToolSchema<typeof HoverInputSchema> = { name: "browserbase_hover", description: "Hover (Not Implemented)", inputSchema: HoverInputSchema };
async function runHover(c: ToolContext, a: any): Promise<CallToolResult> { 
    const toolName = hoverSchema.name;
    const result = createErrorResult("Tool not implemented", toolName);
    result.isError = false; 
    return result; 
}
export const hoverTool: Tool<typeof HoverInputSchema> = { schema: hoverSchema, run: runHover };

// --- Tool: browserbase_type ---
const TypeInputSchema = z.object({ 
    element: z.string(), 
    ref: z.string(), 
    text: z.string(), 
    submit: z.boolean().optional(), 
    slowly: z.boolean().optional(), 
    sessionId: z.string().optional() 
});
type TypeInput = z.infer<typeof TypeInputSchema>;
const typeSchema: ToolSchema<typeof TypeInputSchema> = {
    name: "browserbase_type",
    description: "Type text into an element using its reference from browserbase_snapshot.",
    inputSchema: TypeInputSchema,
};

// Use run, return CallToolResult
async function runType(context: ToolContext, args: TypeInput): Promise<CallToolResult> {
    const { ref, element, text, submit: pressEnter = false, slowly: typeSlowly = false, sessionId } = args;
    const page = await context.context.getActivePage();
    const refToFind = ref;

    if (!page) return createErrorResult("No active page", typeSchema.name);

    try {
        const locator = page.locator(`[aria-ref="${refToFind}"]`);
        await locator.waitFor({ state: 'visible', timeout: 15000 });
        await locator.click({ timeout: 5000 }); // Click to focus

        if (typeSlowly) {
            await locator.pressSequentially(text, { timeout: 10000 + text.length * 100, delay: 50 });
        } else {
            await locator.fill(text, { timeout: 10000 });
        }

        if (pressEnter) {
            await locator.press('Enter', { delay: 100 }); // Small delay before Enter
        }

        return createSuccessResult(`Typed into element described as ${element} (ref: ${refToFind}). ${pressEnter ? "Enter pressed." : "Enter NOT pressed."}`, typeSchema.name);
    } catch (error) {
        let errorMessage = `Failed to type into element with ref "${refToFind}" in session ${sessionId}.`;
        if (error instanceof PlaywrightErrors.TimeoutError) errorMessage += " Reason: Timeout waiting for element or type action.";
        else errorMessage += ` Reason: ${(error as Error).message}`;
        return createErrorResult(errorMessage, typeSchema.name);
    }
}

// Define Tool with run
export const typeTool: Tool<typeof TypeInputSchema> = {
    schema: typeSchema,
    run: runType,
    };

// --- Tool: browserbase_select_option (Placeholder) ---
const SelectOptionInputSchema = z.object({ ref: z.string(), values: z.array(z.string()), sessionId: z.string().optional() });
const selectOptionSchema: ToolSchema<typeof SelectOptionInputSchema> = { name: "browserbase_select_option", description: "Select Option (Not Implemented)", inputSchema: SelectOptionInputSchema };
async function runSelectOption(c: ToolContext, a: any): Promise<CallToolResult> { 
    const toolName = selectOptionSchema.name;
    const result = createErrorResult("Tool not implemented", toolName);
    result.isError = false; 
    return result; 
}
export const selectOptionTool: Tool<typeof SelectOptionInputSchema> = { schema: selectOptionSchema, run: runSelectOption };

// --- Tool: browserbase_take_screenshot ---
const ScreenshotInputSchema = z.object({ 
    raw: z.boolean().optional(), 
    element: z.string().optional(), 
    ref: z.string().optional(), 
    sessionId: z.string().optional() 
});
type ScreenshotInput = z.infer<typeof ScreenshotInputSchema>;
const screenshotSchema: ToolSchema<typeof ScreenshotInputSchema> = {
    name: "browserbase_take_screenshot",
    description: "Take screenshot...",
    inputSchema: ScreenshotInputSchema,
};

async function runTakeScreenshot(context: ToolContext, args: ScreenshotInput): Promise<CallToolResult> { 
    const { page, sessionId, context: appContext } = context;
    const toolName = screenshotSchema.name;
    if (!page) return createErrorResult("No active page", toolName);

    // Manual validation previously done by .refine()
    if (!!args.element !== !!args.ref) {
        return createErrorResult("Both element and ref must be provided together, or neither.", toolName);
    }

    const usePNG = args.raw === true;
    const screenshotType = usePNG ? "png" : "jpeg";
    try {
        let screenshotBuffer: Buffer;
        const options: PageScreenshotOptions = { type: screenshotType, fullPage: false, timeout: 30000 };
        if (args.ref && args.element) {
             // No need for the refine check here anymore
             const locator = page.locator(`aria-ref=${args.ref}`);
             await locator.waitFor({ state: "visible", timeout: 15000 });
             screenshotBuffer = await locator.screenshot(options);
        } else {
             screenshotBuffer = await page.screenshot(options);
        }
        if (!screenshotBuffer) return createErrorResult("Screenshot buffer empty", toolName);
        const base64 = screenshotBuffer.toString("base64");
        const name = `screenshot_${Date.now()}.${screenshotType}`;
        appContext.addScreenshot(name, screenshotType, base64);
        return { content: [ { type: "text", text: `Screenshot saved: ${name}` }, { type: 'image', data: base64, mimeType: screenshotType === 'png' ? 'image/png' : 'image/jpeg' } ], isError: false };
    } catch (error) { return createErrorResult(`Screenshot failed: ${(error as Error).message}`, toolName); }
}
const screenshotTool: Tool<typeof ScreenshotInputSchema> = { schema: screenshotSchema, run: runTakeScreenshot };

// Export factory function returning the array of tools
export function snapshot(captureSnapshot: boolean): Tool<any>[] {
    // The captureSnapshot flag isn't used directly here, 
    // but could be used to modify tool behavior if needed.
    return [
        snapshotTool,
        screenshotTool,
        clickTool,
        typeTool,
        dragTool, // placeholder
        hoverTool, // placeholder
        selectOptionTool, // placeholder
    ];
}
export default snapshot;



// --- Placeholder Handlers from original file (REMOVED) ---
// Logic should be moved into dedicated Tool objects (e.g., hoverTool, selectOptionTool, dragTool, getTextTool)

// export async function handleHover(...) { ... } // REMOVED

// export async function handleSelectOption(...) { ... } // REMOVED

// export async function handleDrag(...) { ... } // REMOVED

// export async function handleGetText(...) { ... } // REMOVED 