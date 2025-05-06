/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { z } from "zod";
// Removed playwright import as it's no longer directly used in handles
// import type * as playwright from "playwright";
import type {
  TextContent,
  ImageContent,
} from "@modelcontextprotocol/sdk/types.js";

import { defineTool, type ToolResult, type ToolSchema } from "./tool.js";
import type { Context, ToolActionResult } from "../context.js"; // Assuming Context provides callBrowserbaseTool
import type { Page, Locator, FrameLocator } from "playwright-core"; // <-- ADDED Import Page and Locator
import { PageSnapshot } from "../pageSnapshot.js"; // Adjust path if needed
import { Writable } from "stream"; // Import Writable for process.stderr
// Assuming this utility exists
// Removed outputFile import as it's likely not used now
import { outputFile } from '../config.js'; // Import outputFile

// --- Tool: Snapshot ---
const SnapshotInputSchema = z.object({});
type SnapshotInput = z.infer<typeof SnapshotInputSchema>;

const snapshot = defineTool<typeof SnapshotInputSchema>({
  capability: "core",
  schema: {
    name: "browserbase_snapshot",
    description:
      "Capture a new accessibility snapshot of the current page state.",
    inputSchema: SnapshotInputSchema,
  },

  handle: async (
    context: Context,
    params: SnapshotInput
  ): Promise<ToolResult> => {
    const action = async (): Promise<ToolActionResult> => {
      return { content: [{ type: "text", text: "Snapshot requested." }] };
    };
    return {
      action,
      code: [`// Request accessibility snapshot capture`],
      captureSnapshot: true,
      waitForNetwork: false,
      resultOverride: {
        content: [{ type: "text", text: "Snapshot capture requested." }],
      },
    };
  },
});

// --- Element Schema & Types ---
const elementSchema = z.object({
  element: z.string().describe("Human-readable element description"),
  ref: z
    .string()
    .describe("Exact target element reference from the page snapshot"),
});
type ElementInput = z.infer<typeof elementSchema>;

// Placeholder for generateLocator function (as seen in the Playwright MCP example)
// We'll define it properly at the end of the file.

// --- Tool: Click (Adapted Handle, Example Action) ---
const click = defineTool({
  capability: "core",
  schema: {
    name: "browserbase_click",
    description: "Perform click on a web page using ref",
    inputSchema: elementSchema,
  },
  handle: async (
    context: Context,
    params: ElementInput
  ): Promise<ToolResult> => {
    // Get locator directly from snapshot
    const snapshot = context.snapshotOrDie();
    const locator = snapshot.refLocator(params.ref);

    const code = [
      `// Click ${params.element}`,
      // Use generateLocator for code string
      `// await page.${await generateLocator(locator)}.click();`,
    ];

    const action = async (): Promise<ToolActionResult> => {
      try {
        // Use the locator directly for the action
        await locator.click({ force: true, timeout: 30000 }); // Increased timeout like logs
      } catch (actionError) {
        const errorMessage =
          actionError instanceof Error
            ? actionError.message
            : String(actionError);
        throw new Error(
          `Failed to click element '${params.element}'. Error: ${errorMessage}`
        );
      }
      return {
        content: [{ type: "text", text: `Clicked ${params.element}` }],
      };
    };

    return {
      code,
      action,
      captureSnapshot: true,
      waitForNetwork: true,
    };
  },
});

// --- Tool: Drag (Adapted Handle, Example Action) ---
const dragInputSchema = z.object({
  startElement: z.string().describe("Source element description"),
  startRef: z
    .string()
    .describe("Exact source element reference from the page snapshot"),
  endElement: z.string().describe("Target element description"),
  endRef: z
    .string()
    .describe("Exact target element reference from the page snapshot"),
});
type DragInput = z.infer<typeof dragInputSchema>;

const drag = defineTool<typeof dragInputSchema>({
  capability: "core",
  schema: {
    name: "browserbase_drag",
    description: "Perform drag and drop between two elements using ref.",
    inputSchema: dragInputSchema,
  },
  handle: async (context: Context, params: DragInput): Promise<ToolResult> => {
    // Get locators directly from snapshot
    const snapshot = context.snapshotOrDie();
    const startLocator = snapshot.refLocator(params.startRef);
    const endLocator = snapshot.refLocator(params.endRef);

    const code = [
      `// Drag ${params.startElement} to ${params.endElement}`,
      // Use generateLocator for code string
      `// await page.${await generateLocator(startLocator)}.dragTo(page.${await generateLocator(endLocator)});`,
    ];

    const action = async (): Promise<ToolActionResult> => {
      try {
        // Use locators directly for the action
        await startLocator.dragTo(endLocator, { timeout: 5000 });
      } catch (dragError) {
        const errorMsg =
          dragError instanceof Error ? dragError.message : String(dragError);
        throw new Error(
          `Failed to drag '${params.startElement}' to '${params.endElement}'. Error: ${errorMsg}`
        );
      }
      return {
        content: [
          {
            type: "text",
            text: `Dragged ${params.startElement} to ${params.endElement}`,
          },
        ],
      };
    };

    return { action, code, captureSnapshot: true, waitForNetwork: true };
  },
});

// --- Tool: Hover (Adapted Handle, Example Action) ---
const hover = defineTool<typeof elementSchema>({
  capability: "core",
  schema: {
    name: "browserbase_hover",
    description: "Hover over element on page using ref.",
    inputSchema: elementSchema,
  },
  handle: async (
    context: Context,
    params: ElementInput
  ): Promise<ToolResult> => {
    // Get locator directly from snapshot
    const snapshot = context.snapshotOrDie();
    const locator = snapshot.refLocator(params.ref);

    const code = [
      `// Hover over ${params.element}`,
      // Use generateLocator for code string
      `// await page.${await generateLocator(locator)}.hover();`,
    ];

    const action = async (): Promise<ToolActionResult> => {
      try {
        // Use locator directly for the action
        await locator.hover({ timeout: 5000 });
      } catch (hoverError) {
        const errorMsg =
          hoverError instanceof Error ? hoverError.message : String(hoverError);
        throw new Error(
          `Failed to hover over element '${params.element}'. Error: ${errorMsg}`
        );
      }
      return {
        content: [{ type: "text", text: `Hovered over: ${params.element}` }],
      };
    };

    return { action, code, captureSnapshot: true, waitForNetwork: true };
  },
});

// --- Tool: Type (Adapted Handle, Example Action) ---
const typeSchema = elementSchema.extend({
  text: z.string().describe("Text to type into the element"),
  submit: z
    .boolean()
    .optional()
    .describe("Whether to submit entered text (press Enter after)"),
  slowly: z
    .boolean()
    .optional()
    .describe("Whether to type one character at a time."),
});
type TypeInput = z.infer<typeof typeSchema>;

const type = defineTool<typeof typeSchema>({
  capability: "core",
  schema: {
    name: "browserbase_type",
    description: "Type text into editable element using ref.",
    inputSchema: typeSchema,
  },
  handle: async (context: Context, params: TypeInput): Promise<ToolResult> => {
    // Get locator directly from snapshot
    const snapshot = context.snapshotOrDie();
    const locator = snapshot.refLocator(params.ref);

    const code: string[] = [];
    const steps: (() => Promise<void>)[] = [];

    if (params.slowly) {
      code.push(`// Press "${params.text}" sequentially into "${params.element}"`);
      code.push(`// await page.${await generateLocator(locator)}.pressSequentially('${params.text.replace(/'/g, "\\'")}');`);
      steps.push(() => locator.pressSequentially(params.text, { delay: 100, timeout: 5000 }));
    } else {
       code.push(`// Fill "${params.text}" into "${params.element}"`);
       code.push(`// await page.${await generateLocator(locator)}.fill('${params.text.replace(/'/g, "\\'")}');`);
       steps.push(async () => {
         await locator.waitFor({ state: "visible", timeout: 5000 });
         if (!(await locator.isEditable({ timeout: 2000 }))) {
            throw new Error(`Element '${params.element}' was visible but not editable.`);
         }
         await locator.fill("", { force: true, timeout: 5000 }); // Force empty fill first
         await locator.fill(params.text, { force: true, timeout: 5000 }); // Force fill with text
       });
    }

    if (params.submit) {
      code.push(`// Submit text`);
      code.push(`// await page.${await generateLocator(locator)}.press('Enter');`);
      steps.push(() => locator.press("Enter", { timeout: 5000 }));
    }

    const action = async (): Promise<ToolActionResult> => {
      try {
        // Execute the steps sequentially
        await steps.reduce((acc, step) => acc.then(step), Promise.resolve());
      } catch (typeError) {
        const errorMsg =
          typeError instanceof Error ? typeError.message : String(typeError);
        throw new Error(
          `Failed to type into or submit element '${params.element}'. Error: ${errorMsg}`
        );
      }
      return {
        content: [
          {
            type: "text",
            text: `Typed "${params.text}" into: ${params.element}${params.submit ? " and submitted" : ""}`,
          },
        ],
      };
    };

    return { action, code, captureSnapshot: true, waitForNetwork: true };
  },
});

// --- Tool: Select Option (Adapted Handle, Example Action) ---
const selectOptionSchema = elementSchema.extend({
  values: z
    .array(z.string())
    .describe("Array of values to select in the dropdown."),
});
type SelectOptionInput = z.infer<typeof selectOptionSchema>;

const selectOption = defineTool<typeof selectOptionSchema>({
  capability: "core",
  schema: {
    name: "browserbase_select_option",
    description: "Select an option in a dropdown using ref.",
    inputSchema: selectOptionSchema,
  },
  handle: async (
    context: Context,
    params: SelectOptionInput
  ): Promise<ToolResult> => {
    // Get locator directly from snapshot
    const snapshot = context.snapshotOrDie();
    const locator = snapshot.refLocator(params.ref);

    const code = [
      `// Select options [${params.values.join(", ")}] in ${params.element}`,
      // Remove javascript.formatObject, use simple JSON.stringify for code comment
      `// await page.${await generateLocator(locator)}.selectOption(${JSON.stringify(params.values)});`,
    ];

    const action = async (): Promise<ToolActionResult> => {
      try {
         // Use locator directly for the action
        await locator.waitFor({ state: "visible", timeout: 5000 });
        await locator.selectOption(params.values, { timeout: 5000 });
      } catch (selectError) {
        const errorMsg =
          selectError instanceof Error
            ? selectError.message
            : String(selectError);
        throw new Error(
          `Failed to select option(s) in element '${params.element}'. Error: ${errorMsg}`
        );
      }
      return {
        content: [
          { type: "text", text: `Selected options in: ${params.element}` },
        ],
      };
    };

    return { action, code, captureSnapshot: true, waitForNetwork: true };
  },
});

// --- Tool: Screenshot (Adapted Handle, Example Action) ---
const screenshotSchema = z
  .object({
    raw: z
      .boolean()
      .optional()
      .describe(
        "Whether to return without compression (PNG). Default is false (JPEG)."
      ),
    element: z
      .string()
      .optional()
      .describe("Human-readable element description."),
    ref: z
      .string()
      .optional()
      .describe("Exact target element reference from the page snapshot."),
  })
  .refine((data) => !!data.element === !!data.ref, {
    message: "Both element and ref must be provided or neither.",
    path: ["ref", "element"],
  });
type ScreenshotInput = z.infer<typeof screenshotSchema>;

const screenshot = defineTool<typeof screenshotSchema>({
  capability: "core",
  schema: {
    name: "browserbase_take_screenshot",
    description: `Take a screenshot of the current page or element using ref.`,
    inputSchema: screenshotSchema,
  },
  handle: async (
    context: Context,
    params: ScreenshotInput
  ): Promise<ToolResult> => {
    const page = await context.getActivePage();
    if (!page) throw new Error("No active page found for screenshot");

    const format = params.raw ? "png" : "jpeg";
    const name = `screenshot-${Date.now()}.${format}`;
    const isElementScreenshot = params.element && params.ref;
    const snapshot = context.snapshotOrDie();
    const locator = params.ref ? snapshot.refLocator(params.ref) : null;

    // Revert to using outputFile with context['config'] as a workaround
    // NOTE: This might fail if config is truly private at runtime.
    // You should add a public method like getOutputPath to Context.
    const outputPath = await outputFile((context as any)['config'], name);

    const screenshotOptions: Parameters<Page["screenshot"]>[0] = {
      type: format,
      quality: format === "png" ? undefined : 50,
      scale: "css",
      timeout: 15000,
      path: outputPath // Use obtained path
    };

    let code: string[] = [];
    code.push(`// Screenshot ${isElementScreenshot ? params.element : 'viewport'} and save it as ${screenshotOptions.path}`);
    const optionsString = JSON.stringify(screenshotOptions).replace(/"/g, '\"');
    if (locator)
      code.push(`// await page.${await generateLocator(locator)}.screenshot(${optionsString});`);
    else
      code.push(`// await page.screenshot(${optionsString});`);

    const action = async (): Promise<ToolActionResult> => {
      let buffer: Buffer;
      const actionLogPrefix = `[browserbase_take_screenshot action] ${new Date().toISOString()}:`;

      try {
        // Use locator directly for action
        buffer = locator ? await locator.screenshot(screenshotOptions) : await page.screenshot(screenshotOptions);

      } catch (screenshotError) {
         // Keep existing error handling
        const errorMsg =
          screenshotError instanceof Error
            ? screenshotError.message
            : String(screenshotError);
        throw new Error(`Failed to take screenshot. Error: ${errorMsg}`);
      }

      const base64 = buffer.toString("base64");
      context.addScreenshot(name, format, base64);

      const imageContent: ImageContent = {
        type: "image",
        format: format,
        mimeType: `image/${format}`,
        data: "",
        detail: "low",
        uri: `mcp://screenshots/${name}`,
      };

      return {
        content: [
          {
            type: "text",
            text: `Screenshot taken${params.element ? ": " + params.element : " (viewport)"} and saved as resource '${name}'.`,
          },
          imageContent,
        ],
      };
    };

    return { action, code, captureSnapshot: false, waitForNetwork: false };
  },
});

// Ensure all defined tools are exported
// --- Replace generateLocator function with Playwright MCP version ---
export async function generateLocator(locator: Locator): Promise<string> {
  // Use Playwright's internal method (requires cast)
  return (locator as any)._generateLocatorString();
}

export default [snapshot, click, drag, hover, type, selectOption, screenshot];

// ---> DELETE HELPER FUNCTION START <---
// Deleted the getLocator function
// ---> DELETE HELPER FUNCTION END <---
