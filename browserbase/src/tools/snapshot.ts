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

import { defineTool } from "./tool.js";
// Removed outputFile import if it was Playwright specific
// import { outputFile } from "../config.js";
import type { Context } from "../context.js"; // Assuming Context provides callBrowserbaseTool
import type { ToolActionResult } from "../context.js";
import { Page } from "playwright-core"; // <-- ADDED Import Page

// --- Tool: Snapshot ---
const SnapshotInputSchema = z.object({});
type SnapshotInput = z.infer<typeof SnapshotInputSchema>;

const snapshot = defineTool<typeof SnapshotInputSchema>({
  capability: "core",
  schema: {
    name: "browserbase_snapshot",
    description:
      "Capture a new accessibility snapshot of the current page state using Browserbase.", // Clarified description
    inputSchema: SnapshotInputSchema,
  },

  handle: async (context: Context, params: SnapshotInput): Promise</* ToolResult from ./tool.js */ any> => {
    // The snapshot action is slightly different - it signals the framework.
    // The action itself can remain minimal, as Context.run doesn't directly execute it for snapshots.
    const action = async (): Promise<ToolActionResult> => {
      return {
        content: [{ type: "text", text: "Browserbase snapshot requested." }],
      };
    };

    return {
      action,
      code: [`// Request Browserbase accessibility snapshot capture`],
      captureSnapshot: true, // Signal framework to capture using Browserbase
      waitForNetwork: false,
      // ADD resultOverride for compatibility with Context.run default case logic
      resultOverride: {
        content: [{ type: "text", text: "Browserbase snapshot requested." }],
      },
    };
  },
});

// --- Element Schema & Types ---
const elementSchema = z.object({
  element: z.string().describe("Human-readable element description"),
  ref: z
    .string()
    .describe("Exact target element reference from the Browserbase page snapshot"), // Clarified source of ref
});
type ElementInput = z.infer<typeof elementSchema>;

// --- Tool: Click ---
const click = defineTool({
  capability: 'core',
  schema: {
    name: 'browserbase_click',
    description: 'Perform click on a web page using Browserbase', // Clarified
    inputSchema: elementSchema,
  },

  handle: async (context: Context, params: ElementInput): Promise</* ToolResult */ any> => {
    const code = [
      `// Perform Playwright click: ${params.element} (ref: ${params.ref})`, // Updated comment
    ];

    // Action now performs the Playwright click
    const action = async (): Promise<ToolActionResult> => {
      const page = await context.getActivePage(); // Get the active page
      if (!page) throw new Error("No active page found for click");
      const locatorString = `[aria-ref="${params.ref}"]`; // Construct locator string
      const locator = page.locator(locatorString);
      await locator.click({ timeout: 15000 }); // Perform the click with timeout
      return {
        content: [
          {
            type: "text",
            text: `Clicked ${params.element} (ref: ${params.ref})`, // Updated text
          },
        ],
      };
    };

    return {
      code,
      action,
      captureSnapshot: true, // Request new Browserbase snapshot after action
      waitForNetwork: true,  // Assume clicks might cause network activity
    };
  },
});
; // Keep semicolon if it was intentional

// --- Tool: Drag ---
const dragInputSchema = z.object({
  startElement: z.string().describe("Source element description"),
  startRef: z
    .string()
    .describe("Exact source element reference from the Browserbase page snapshot"), // Clarified
  endElement: z.string().describe("Target element description"),
  endRef: z
    .string()
    .describe("Exact target element reference from the Browserbase page snapshot"), // Clarified
});
type DragInput = z.infer<typeof dragInputSchema>;

const drag = defineTool<typeof dragInputSchema>({
  capability: "core",
  schema: {
    name: "browserbase_drag",
    description: "Perform drag and drop between two elements using Browserbase.", // Clarified
    inputSchema: dragInputSchema,
  },

  handle: async (context: Context, params: DragInput): Promise</* ToolResult */ any> => {
    const code = [
      `// Perform Playwright drag: ${params.startElement} (ref: ${params.startRef}) to ${params.endElement} (ref: ${params.endRef})`, // Updated comment
    ];

    // Action now performs the Playwright drag
    const action = async (): Promise<ToolActionResult> => {
      const page = await context.getActivePage();
      if (!page) throw new Error("No active page found for drag");
      const startLocator = page.locator(`[aria-ref="${params.startRef}"]`);
      const endLocator = page.locator(`[aria-ref="${params.endRef}"]`);
      await startLocator.dragTo(endLocator, { timeout: 15000 }); // Perform drag
      return {
        content: [
          {
            type: "text",
            text: `Dragged ${params.startElement} to ${params.endElement}`, // Updated text
          },
        ],
      };
    };

    return {
      action,
      code,
      captureSnapshot: true, // Request new Browserbase snapshot
      waitForNetwork: true,
    };
  },
});

// --- Tool: Hover ---
const hover = defineTool<typeof elementSchema>({
  capability: "core",
  schema: {
    name: "browserbase_hover",
    description: "Hover over element on page using Browserbase.", // Clarified
    inputSchema: elementSchema,
  },

  handle: async (context: Context, params: ElementInput): Promise</* ToolResult */ any> => {
    const code = [
      `// Perform Playwright hover: ${params.element} (ref: ${params.ref})`, // Updated comment
    ];

    // Action now performs the Playwright hover
    const action = async (): Promise<ToolActionResult> => {
      const page = await context.getActivePage();
      if (!page) throw new Error("No active page found for hover");
      const locator = page.locator(`[aria-ref="${params.ref}"]`);
      await locator.hover({ timeout: 15000 }); // Perform hover
      return {
        content: [
          { type: "text", text: `Hovered over: ${params.element}` }, // Updated text
        ],
      };
    };

    return {
      action,
      code,
      captureSnapshot: true, // Request new Browserbase snapshot
      waitForNetwork: true, // Hover might trigger updates
    };
  },
});

// --- Tool: Type ---
const typeSchema = elementSchema.extend({
  text: z.string().describe("Text to type"),
  submit: z.boolean().optional().describe("Press Enter after typing"),
  slowly: z.boolean().optional().describe("Type character by character"),
});
type TypeInput = z.infer<typeof typeSchema>;

const type = defineTool<typeof typeSchema>({
  capability: "core",
  schema: {
    name: "browserbase_type",
    description: "Type text into an editable element using Browserbase.", // Clarified
    inputSchema: typeSchema,
  },

  handle: async (context: Context, params: TypeInput): Promise</* ToolResult */ any> => {
    const code: string[] = [];
    code.push(
      `// Perform Playwright type: "${params.text}" into "${params.element}" (ref: ${params.ref})` // Updated comment
    );
    if (params.submit) {
      code.push(`//   with submit: ${params.submit}`);
    }
    if (params.slowly) {
      code.push(`//   typing slowly: ${params.slowly}`);
    }

    // Action now performs the Playwright type
    const action = async (): Promise<ToolActionResult> => {
      const page = await context.getActivePage();
      if (!page) throw new Error("No active page found for type");
      const locatorString = `[aria-ref="${params.ref}"]`;
      const locator = page.locator(locatorString);

      // Wait for the element to be visible and enabled before interacting
      try {
        await locator.waitFor({ state: 'visible', timeout: 10000 }); // Wait up to 10s for visible
      } catch (waitError) {
          console.error(`[browserbase_type] Wait for locator ${locatorString} visible failed: ${waitError instanceof Error ? waitError.message : String(waitError)}`);
          // Provide a slightly more specific error message
          throw new Error(`Element '${params.element}' (ref: ${params.ref}) not visible within timeout.`);
      }

      // Check if editable right before typing
      if (!await locator.isEditable({timeout: 1000})) { // Check if editable (1s timeout)
          console.error(`[browserbase_type] Locator ${locatorString} is not editable.`);
          throw new Error(`Element '${params.element}' (ref: ${params.ref}) was visible but not editable.`);
      }

      const typeOptions: { delay?: number; timeout?: number } = { timeout: 15000 }; // Keep original type timeout
      if (params.slowly) {
        typeOptions.delay = 100; // Add delay if slowly is true
      }
      await locator.type(params.text, typeOptions); // Pass combined options
      if (params.submit) {
        await locator.press("Enter", { timeout: 5000 }); // Press Enter if submit is true
      }
      return {
        content: [
          {
            type: "text",
            text: `Typed "${params.text}" into: ${params.element}${
              params.submit ? " and submitted" : ""
            }`, // Updated text
          },
        ],
      };
    };

    return {
      action,
      code,
      captureSnapshot: true, // Request new Browserbase snapshot
      waitForNetwork: true,
    };
  },
});

// --- Tool: Select Option ---
const selectOptionSchema = elementSchema.extend({
  values: z.array(z.string()).describe("Values to select"),
});
type SelectOptionInput = z.infer<typeof selectOptionSchema>;

const selectOption = defineTool<typeof selectOptionSchema>({
  capability: "core",
  schema: {
    name: "browserbase_select_option",
    description: "Select option(s) in a dropdown using Browserbase.", // Clarified
    inputSchema: selectOptionSchema,
  },

  handle: async (context: Context, params: SelectOptionInput): Promise</* ToolResult */ any> => {
    const code = [
      `// Perform Playwright selectOption: ${JSON.stringify(
        params.values
      )} in ${params.element} (ref: ${params.ref})`, // Updated comment
    ];

    // Action now performs the Playwright selectOption
    const action = async (): Promise<ToolActionResult> => {
      const page = await context.getActivePage();
      if (!page) throw new Error("No active page found for selectOption");
      const locator = page.locator(`[aria-ref="${params.ref}"]`);
      await locator.selectOption(params.values, { timeout: 15000 }); // Perform selectOption
      return {
        content: [
          {
            type: "text",
            text: `Selected options in: ${params.element}`, // Updated text
          },
        ],
      };
    };

    return {
      action,
      code,
      captureSnapshot: true, // Request new Browserbase snapshot
      waitForNetwork: true,
    };
  },
});

// --- Tool: Screenshot ---
const screenshotSchema = z
  .object({
    raw: z
      .boolean()
      .optional()
      .describe("True for PNG, false (default) for JPEG"),
    element: z
      .string()
      .optional()
      .describe("Element description (if screenshotting element)"),
    ref: z
      .string()
      .optional()
      .describe(
        "Exact target element reference from the Browserbase page snapshot (if screenshotting element)" // Clarified
      ),
  })
  .refine((data) => !!data.element === !!data.ref, {
    message: "Both element and ref must be provided or neither.",
  });
type ScreenshotInput = z.infer<typeof screenshotSchema>;

const screenshot = defineTool<typeof screenshotSchema>({
  capability: "core",
  schema: {
    name: "browserbase_take_screenshot",
    description:
      "Take a screenshot of the viewport or a specific element using Browserbase.", // Clarified
    inputSchema: screenshotSchema,
  },

  handle: async (context: Context, params: ScreenshotInput): Promise</* ToolResult */ any> => {
    let code: string[] = [];
    if (params.ref) {
      code.push(
        `// Perform Playwright screenshot: element ${params.element} (ref: ${params.ref})` // Updated comment
      );
    } else {
      code.push(`// Perform Playwright screenshot: viewport`); // Updated comment
    }
    if (params.raw !== undefined) {
      code.push(`//  format: ${params.raw ? "png" : "jpeg"}`);
    }

    // Action now performs the Playwright screenshot and adds resource
    const action = async (): Promise<ToolActionResult> => {
      const page = await context.getActivePage();
      if (!page) throw new Error("No active page found for screenshot");

      const format = params.raw ? "png" : "jpeg";
      const screenshotOptions: Parameters<Page['screenshot']>[0] = {
          type: format,
          timeout: 15000,
      };

      let buffer: Buffer;
      if (params.ref) {
        const locator = page.locator(`[aria-ref="${params.ref}"]`);
        screenshotOptions.clip = await locator.boundingBox() ?? undefined; // Get bounding box for element screenshot
        if (!screenshotOptions.clip) {
            console.warn(`[Screenshot Tool] Could not get bounding box for element ref ${params.ref}. Taking viewport screenshot instead.`);
            delete screenshotOptions.clip; // Fallback to viewport if no bounding box
            buffer = await page.screenshot(screenshotOptions);
        } else {
             buffer = await page.screenshot(screenshotOptions);
        }

      } else {
        buffer = await page.screenshot(screenshotOptions);
      }


      const base64 = buffer.toString("base64");
      const name = `screenshot-${Date.now()}.${format}`;
      context.addScreenshot(name, format, base64); // Use context to add resource

      const imageContent: ImageContent = {
        type: "image",
        format: format,
        mimeType: `image/${format}`, // Add mimeType
        data: "", // Add empty data field to satisfy type, client uses URI
        detail: "low",
        uri: `mcp://screenshots/${name}`, // Construct URI directly
      };


      return {
        content: [
          {
            type: "text",
            text: `Screenshot taken${
              params.ref ? ": " + params.element : " (viewport)"
            } and saved as resource '${name}'.`,
          },
          imageContent, // Include image content reference
        ],
      };
    };

    return {
      action,
      code,
      captureSnapshot: false, // Taking a screenshot doesn't usually change page state
      waitForNetwork: false,
    };
  },
});

// Ensure all defined tools are exported
export default [snapshot, click, drag, hover, type, selectOption, screenshot];
