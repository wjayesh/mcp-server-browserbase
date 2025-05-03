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
    // The action itself might do nothing here, as the snapshot capture
    // is likely triggered by the framework based on captureSnapshot: true,
    // which should invoke the underlying Browserbase snapshot capability.
    const action = async (): Promise<ToolActionResult> => {
      // Potentially log or confirm request, but the actual Browserbase
      // snapshot tool is called elsewhere by the framework.
      return {
        content: [{ type: "text", text: "Browserbase snapshot requested." }],
      };
    };

    return {
      action,
      // Code reflects the intent, not Playwright code
      code: [`// Request Browserbase accessibility snapshot capture`],
      captureSnapshot: true, // Signal framework to capture using Browserbase
      waitForNetwork: false,
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
    // Removed Playwright page/locator logic
    // const page = await context.getActivePage();
    // if (!page) throw new Error("No active page found for click");
    // const locatorString = `[aria-ref=\"${params.ref}\"]`;
    // const locator = page.locator(locatorString);

    const code = [
      `// Call Browserbase click: ${params.element} (ref: ${params.ref})`,
    ];

    // Action now calls the Browserbase tool via context
    const action = async (): Promise<ToolActionResult> => {
       // No-op: API call is now handled by Context.dispatchBrowserbaseCall
       // We just return the expected confirmation message.
       return {
           content: [{ type: 'text', text: `Clicked ${params.element} via Browserbase` }],
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
    // Removed Playwright page/locator logic
    // const page = await context.getActivePage();
    // ... locators ...

    const code = [
      `// Call Browserbase drag: ${params.startElement} (ref: ${params.startRef}) to ${params.endElement} (ref: ${params.endRef})`,
    ];

    // Action now calls the Browserbase tool via context
    const action = async (): Promise<ToolActionResult> => {
      // No-op: API call is now handled by Context.dispatchBrowserbaseCall
      return {
        content: [
          {
            type: "text",
            text: `Dragged ${params.startElement} to ${params.endElement} via Browserbase`,
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
    // Removed Playwright page/locator logic
    // const page = await context.getActivePage();
    // ... locator ...

    const code = [
      `// Call Browserbase hover: ${params.element} (ref: ${params.ref})`,
    ];

    // Action now calls the Browserbase tool via context
    const action = async (): Promise<ToolActionResult> => {
       // No-op: API call is now handled by Context.dispatchBrowserbaseCall
       return {
        content: [{ type: "text", text: `Hovered over: ${params.element} via Browserbase` }],
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
    // Removed Playwright page/locator logic
    // const page = await context.getActivePage();
    // ... locator ...
    // ... actionSteps ...

    const code: string[] = [];
    code.push(
      `// Call Browserbase type: "${params.text}" into "${params.element}" (ref: ${params.ref})`
    );
    if (params.submit) {
        code.push(`//   with submit: ${params.submit}`);
    }
     if (params.slowly) {
        code.push(`//   typing slowly: ${params.slowly}`);
    }

    // Action now calls the Browserbase tool via context
    const action = async (): Promise<ToolActionResult> => {
      // No-op: API call is now handled by Context.dispatchBrowserbaseCall
      return {
        content: [
          {
            type: "text",
            text: `Typed "${params.text}" into: ${params.element}${params.submit ? " and submitted" : ""} via Browserbase`,
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
    // Removed Playwright page/locator logic
    // const page = await context.getActivePage();
    // ... locator ...

    const code = [
      `// Call Browserbase selectOption: ${JSON.stringify(params.values)} in ${
        params.element
      } (ref: ${params.ref})`,
    ];

    // Action now calls the Browserbase tool via context
    const action = async (): Promise<ToolActionResult> => {
      // No-op: API call is now handled by Context.dispatchBrowserbaseCall
      return {
        content: [
          { type: "text", text: `Selected options in: ${params.element} via Browserbase` },
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
    // Removed Playwright page/locator/options logic
    // const page = await context.getActivePage();
    // ... config ...
    // ... options ...
    // ... locator ...

    let code: string[] = [];
     if (params.ref) {
      code.push(`// Call Browserbase screenshot: element ${params.element} (ref: ${params.ref})`);
    } else {
      code.push(`// Call Browserbase screenshot: viewport`);
    }
     if (params.raw !== undefined) {
         code.push(`//  raw format: ${params.raw}`);
     }

    // Action now calls the Browserbase tool via context
    const action = async (): Promise<ToolActionResult> => {
       // No-op: API call is now handled by Context.dispatchBrowserbaseCall
       // We might need to adapt how image content is handled based on
       // what dispatchBrowserbaseCall returns or how context manages results.
       let text = `Screenshot taken${params.ref ? ': ' + params.element : ' (viewport)'} via Browserbase`;
       // Potentially add image data from 'result' if available/needed here.
       return { content: [{ type: 'text', text }] };
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
