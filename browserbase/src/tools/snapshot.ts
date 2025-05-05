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
// Removed outputFile import if it was Playwright specific
// import { outputFile } from "../config.js";
import type { Context, ToolActionResult } from "../context.js"; // Assuming Context provides callBrowserbaseTool
import type { Page, Locator, FrameLocator } from "playwright-core"; // <-- ADDED Import Page and Locator
import { PageSnapshot } from "../pageSnapshot.js"; // Adjust path if needed
import { Writable } from 'stream'; // Import Writable for process.stderr
// Assuming this utility exists
// Removed outputFile import as it's likely not used now

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

  handle: async (context: Context, params: SnapshotInput): Promise<ToolResult> => {
    const action = async (): Promise<ToolActionResult> => {
        return { content: [{ type: 'text', text: 'Snapshot requested.' }] };
    };
    return {
      action,
      code: [`// Request accessibility snapshot capture`],
      captureSnapshot: true,
      waitForNetwork: false,
      resultOverride: { content: [{ type: 'text', text: 'Snapshot capture requested.' }] }
    };
  },
});

// --- Element Schema & Types ---
const elementSchema = z.object({
  element: z.string().describe('Human-readable element description'),
  ref: z.string().describe('Exact target element reference from the page snapshot'),
});
type ElementInput = z.infer<typeof elementSchema>;

// Placeholder for generateLocator function (as seen in the Playwright MCP example)
// We'll define it properly at the end of the file.

// --- Tool: Click (Adapted Handle, Example Action) ---
const click = defineTool({
  capability: 'core',
  schema: {
    name: 'browserbase_click',
    description: 'Perform click on a web page using ref',
    inputSchema: elementSchema,
  },
  handle: async (context: Context, params: ElementInput): Promise<ToolResult> => {
    // Get the snapshot that's current *at the beginning* of this handle function.
    // This might be the one implicitly captured right before the handle was called.
    const snapshotForRef = context.snapshotOrDie();
    const locator = await getLocator(context, params.ref, params.element, snapshotForRef);
    const locatorStringForError = `locator for '${params.element}' (source: '${params.ref}')`;

    const code = [
      `// Click ${params.element} (selector/ref: ${params.ref})`,
      `// await page.locator('${params.ref.replace(/'/g, "\\'")}').click();`
    ];

    const action = async (): Promise<ToolActionResult> => {
      try {
        const actionLogPrefix = `[browserbase_click action] ${new Date().toISOString()}:`;
        const targetLocator = locator.first();
        // process.stderr.write(`${actionLogPrefix} Using .first() on ${locatorStringForError}\\n`);

        // process.stderr.write(`${actionLogPrefix} Explicitly waiting for locator.first() to be visible (max 20s)...\\n`);
        await targetLocator.waitFor({ state: 'visible', timeout: 5000 });
        // process.stderr.write(`${actionLogPrefix} locator.first() is visible.\\n`);

        // process.stderr.write(`${actionLogPrefix} Checking if locator.first() is enabled...\\n`);
        if (!await targetLocator.isEnabled({ timeout: 2000 })) {
            // process.stderr.write(`${actionLogPrefix} ERROR - Element '${params.element}' (${locatorStringForError}) was visible but not enabled.\\n`);
            throw new Error(`Element '${params.element}' (${locatorStringForError}) was visible but not enabled.`);
        }
        // process.stderr.write(`${actionLogPrefix} locator.first() is enabled. Proceeding with click.\\n`);

        await targetLocator.click({ timeout: 30000 });
      } catch (actionError) {
        const errorMessage = actionError instanceof Error ? actionError.message : String(actionError);
        const actionLogPrefix = `[browserbase_click action Error] ${new Date().toISOString()}:`;
        // process.stderr.write(`${actionLogPrefix} Raw action error: ${actionError}\\n`);
        // process.stderr.write(`${actionLogPrefix} Click sequence failed for ${locatorStringForError}: ${errorMessage}\\n`);
        // process.stderr.write(`${actionLogPrefix} Error Stack: ${actionError instanceof Error ? actionError.stack : 'N/A'}\\n`);
        throw new Error(`Failed to click element '${params.element}'. Error: ${errorMessage}`);
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
    startElement: z.string().describe('Source element description'),
    startRef: z.string().describe('Exact source element reference from the page snapshot'),
    endElement: z.string().describe('Target element description'),
    endRef: z.string().describe('Exact target element reference from the page snapshot'),
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
        // Get the snapshot that's current *at the beginning* of this handle function.
        const snapshotForRef = context.snapshotOrDie();
        const startLocator = await getLocator(context, params.startRef, params.startElement, snapshotForRef);
        const endLocator = await getLocator(context, params.endRef, params.endElement, snapshotForRef);
        const startLocatorString = `start locator for '${params.startElement}' (source: '${params.startRef}')`;
        const endLocatorString = `end locator for '${params.endElement}' (source: '${params.endRef}')`;

        const code = [
            `// Drag ${params.startElement} to ${params.endElement} (selectors/refs: ${params.startRef} -> ${params.endRef})`,
            `// await page.locator('${params.startRef.replace(/'/g, "\\'")}').dragTo(page.locator('${params.endRef.replace(/'/g, "\\'")}'));`
        ];

        const action = async (): Promise<ToolActionResult> => {
            try {
                const actionLogPrefix = `[browserbase_drag action] ${new Date().toISOString()}:`;
                const targetStartLocator = startLocator.first();
                const targetEndLocator = endLocator.first();
                // process.stderr.write(`${actionLogPrefix} Using .first() on ${startLocatorString} and ${endLocatorString}\\n`);

                // process.stderr.write(`${actionLogPrefix} Waiting for start/end elements.first() to be visible...\\n`);
                await targetStartLocator.waitFor({ state: 'visible', timeout: 5000 });
                await targetEndLocator.waitFor({ state: 'visible', timeout: 5000 });

                // process.stderr.write(`${actionLogPrefix} Dragging...\\n`);
                await targetStartLocator.dragTo(targetEndLocator, { timeout: 30000 });
            } catch (dragError) {
                const errorMsg = dragError instanceof Error ? dragError.message : String(dragError);
                const actionLogPrefix = `[browserbase_drag action Error] ${new Date().toISOString()}:`;
                // process.stderr.write(`${actionLogPrefix} Raw drag error: ${dragError}\\n`);
                // process.stderr.write(`${actionLogPrefix} Drag failed using ${startLocatorString} -> ${endLocatorString}: ${errorMsg}\\n`);
                // process.stderr.write(`${actionLogPrefix} Error Stack: ${dragError instanceof Error ? dragError.stack : 'N/A'}\\n`);
                throw new Error(`Failed to drag '${params.startElement}' to '${params.endElement}'. Error: ${errorMsg}`);
            }
            return {
                content: [{ type: "text", text: `Dragged ${params.startElement} to ${params.endElement}` }],
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
    handle: async (context: Context, params: ElementInput): Promise<ToolResult> => {
        // Get the snapshot that's current *at the beginning* of this handle function.
        const snapshotForRef = context.snapshotOrDie();
        const locator = await getLocator(context, params.ref, params.element, snapshotForRef);
        const locatorStringForError = `locator for '${params.element}' (source: '${params.ref}')`;

        const code = [
            `// Hover over ${params.element} (selector/ref: ${params.ref})`,
            `// await page.locator('${params.ref.replace(/'/g, "\\'")}').hover();`
        ];

        const action = async (): Promise<ToolActionResult> => {
            try {
                const actionLogPrefix = `[browserbase_hover action] ${new Date().toISOString()}:`;
                const targetLocator = locator.first();
                // process.stderr.write(`${actionLogPrefix} Using .first() on ${locatorStringForError} for hover\\n`);

                // process.stderr.write(`${actionLogPrefix} Waiting for locator.first() to be visible...\\n`);
                await targetLocator.waitFor({ state: 'visible', timeout: 5000 });

                // process.stderr.write(`${actionLogPrefix} Hovering over locator.first() ${locatorStringForError}...\\n`);
                await targetLocator.hover({ timeout: 30000 });
            } catch (hoverError) {
                const errorMsg = hoverError instanceof Error ? hoverError.message : String(hoverError);
                const actionLogPrefix = `[browserbase_hover action Error] ${new Date().toISOString()}:`;
                // process.stderr.write(`${actionLogPrefix} Raw hover error: ${hoverError}\\n`);
                // process.stderr.write(`${actionLogPrefix} Hover failed for ${locatorStringForError}: ${errorMsg}\\n`);
                // process.stderr.write(`${actionLogPrefix} Error Stack: ${hoverError instanceof Error ? hoverError.stack : 'N/A'}\\n`);
                throw new Error(`Failed to hover over element '${params.element}'. Error: ${errorMsg}`);
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
  text: z.string().describe('Text to type into the element'),
  submit: z.boolean().optional().describe('Whether to submit entered text (press Enter after)'),
  slowly: z.boolean().optional().describe('Whether to type one character at a time.'),
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
        // Get the snapshot that's current *at the beginning* of this handle function.
        const snapshotForRef = context.snapshotOrDie();
        const locator = await getLocator(context, params.ref, params.element, snapshotForRef);
        const locatorStringForError = `locator for '${params.element}' (source: '${params.ref}')`;

        const code: string[] = [];
        const steps: (() => Promise<void>)[] = [];
        if (params.slowly) {
            code.push(`// Press "${params.text}" sequentially into "${params.element}" (selector/ref: ${params.ref})`);
            steps.push(() => locator.first().pressSequentially(params.text, { delay: 100, timeout: 30000 }));
        } else {
            code.push(`// Fill "${params.text}" into "${params.element}" (selector/ref: ${params.ref})`);
            steps.push(() => locator.first().fill(params.text, { timeout: 30000 }));
        }
        if (params.submit) {
            code.push(`// Submit text (press Enter)`);
            steps.push(() => locator.first().press('Enter', { timeout: 10000 }));
        }

        const action = async (): Promise<ToolActionResult> => {
            try {
                const actionLogPrefix = `[browserbase_type action] ${new Date().toISOString()}:`;
                const targetLocator = locator.first();
                // process.stderr.write(`${actionLogPrefix} Using .first() on ${locatorStringForError} for type/press\\n`);

                // process.stderr.write(`${actionLogPrefix} Waiting for locator.first() to be visible...\\n`);
                await targetLocator.waitFor({ state: 'visible', timeout: 5000 });

                // process.stderr.write(`${actionLogPrefix} Checking if locator.first() is editable...\\n`);
                if (!await targetLocator.isEditable({ timeout: 2000 })) {
                    // process.stderr.write(`${actionLogPrefix} ERROR - Locator ${locatorStringForError} is not editable.\\n`);
                    throw new Error(`Element '${params.element}' (${locatorStringForError}) was visible but not editable.`);
                }

                // process.stderr.write(`${actionLogPrefix} Executing type sequence for locator.first() ${locatorStringForError}...\\n`);
                await steps.reduce((acc, step) => acc.then(step), Promise.resolve());
            } catch (typeError) {
                 const errorMsg = typeError instanceof Error ? typeError.message : String(typeError);
                 const actionLogPrefix = `[browserbase_type action Error] ${new Date().toISOString()}:`;
                 // process.stderr.write(`${actionLogPrefix} Raw type/press error: ${typeError}\\n`);
                 // process.stderr.write(`${actionLogPrefix} Type/press failed for ${locatorStringForError}: ${errorMsg}\\n`);
                 // process.stderr.write(`${actionLogPrefix} Error Stack: ${typeError instanceof Error ? typeError.stack : 'N/A'}\\n`);
                 throw new Error(`Failed to type into or submit element '${params.element}'. Error: ${errorMsg}`);
            }
            return {
                content: [{ type: "text", text: `Typed "${params.text}" into: ${params.element}${params.submit ? " and submitted" : ""}` }],
            };
        };

        return { action, code, captureSnapshot: true, waitForNetwork: true };
    },
});

// --- Tool: Select Option (Adapted Handle, Example Action) ---
const selectOptionSchema = elementSchema.extend({
  values: z.array(z.string()).describe('Array of values to select in the dropdown.'),
});
type SelectOptionInput = z.infer<typeof selectOptionSchema>;

const selectOption = defineTool<typeof selectOptionSchema>({
    capability: "core",
    schema: {
        name: "browserbase_select_option",
        description: "Select an option in a dropdown using ref.",
        inputSchema: selectOptionSchema,
    },
    handle: async (context: Context, params: SelectOptionInput): Promise<ToolResult> => {
        // Get the snapshot that's current *at the beginning* of this handle function.
        const snapshotForRef = context.snapshotOrDie();
        const locator = await getLocator(context, params.ref, params.element, snapshotForRef);
        const locatorStringForError = `locator for '${params.element}' (source: '${params.ref}')`;

        const code = [
            `// Select options [${params.values.join(', ')}] in ${params.element} (selector/ref: ${params.ref})`,
            `// await page.locator(...).selectOption(...)`
        ];

        const action = async (): Promise<ToolActionResult> => {
            try {
                const actionLogPrefix = `[browserbase_select_option action] ${new Date().toISOString()}:`;
                const targetLocator = locator.first();
                // process.stderr.write(`${actionLogPrefix} Using .first() on ${locatorStringForError} for selectOption\\n`);

                // process.stderr.write(`${actionLogPrefix} Waiting for locator.first() to be visible...\\n`);
                await targetLocator.waitFor({ state: 'visible', timeout: 5000 });

                // process.stderr.write(`${actionLogPrefix} Selecting options in locator.first() ${locatorStringForError}...\\n`);
                await targetLocator.selectOption(params.values, { timeout: 5000 });
            } catch (selectError) {
                 const errorMsg = selectError instanceof Error ? selectError.message : String(selectError);
                 const actionLogPrefix = `[browserbase_select_option action Error] ${new Date().toISOString()}:`;
                 // process.stderr.write(`${actionLogPrefix} Raw selectOption error: ${selectError}\\n`);
                 // process.stderr.write(`${actionLogPrefix} SelectOption failed for ${locatorStringForError}: ${errorMsg}\\n`);
                 // process.stderr.write(`${actionLogPrefix} Error Stack: ${selectError instanceof Error ? selectError.stack : 'N/A'}\\n`);
                 throw new Error(`Failed to select option(s) in element '${params.element}'. Error: ${errorMsg}`);
            }
            return {
                content: [{ type: "text", text: `Selected options in: ${params.element}` }],
            };
        };

        return { action, code, captureSnapshot: true, waitForNetwork: true };
    },
});

// --- Tool: Screenshot (Adapted Handle, Example Action) ---
const screenshotSchema = z.object({
  raw: z.boolean().optional().describe('Whether to return without compression (PNG). Default is false (JPEG).'),
  element: z.string().optional().describe('Human-readable element description.'),
  ref: z.string().optional().describe('Exact target element reference from the page snapshot.'),
}).refine(data => !!data.element === !!data.ref, {
  message: 'Both element and ref must be provided or neither.',
  path: ['ref', 'element']
});
type ScreenshotInput = z.infer<typeof screenshotSchema>;

const screenshot = defineTool<typeof screenshotSchema>({
    capability: "core",
    schema: {
        name: "browserbase_take_screenshot",
        description:
        `Take a screenshot of the current page or element using ref.`,
        inputSchema: screenshotSchema,
    },
    handle: async (context: Context, params: ScreenshotInput): Promise<ToolResult> => {
        const page = await context.getActivePage();
        if (!page) throw new Error("No active page found for screenshot");

        const format = params.raw ? "png" : "jpeg";
        const screenshotOptions: Parameters<Page['screenshot']>[0] = {
            type: format,
            quality: format === 'png' ? undefined : 50,
            scale: 'css',
            timeout: 15000,
        };

        let code: string[] = [];
        let targetLocator: Locator | null = null;

        if (params.ref && params.element) {
            // Get the snapshot that's current *at the beginning* of this handle function.
            const snapshotForRef = context.snapshotOrDie();
            targetLocator = await getLocator(context, params.ref, params.element, snapshotForRef);
            code.push(`// Screenshot element ${params.element} (selector/ref: ${params.ref})`);
        } else {
            code.push(`// Screenshot viewport`);
        }

        const action = async (): Promise<ToolActionResult> => {
            let buffer: Buffer;
            const currentScreenshotOptions: typeof screenshotOptions = { ...screenshotOptions };
            const actionLogPrefix = `[browserbase_take_screenshot action] ${new Date().toISOString()}:`;

            try {
                if (targetLocator) {
                    try {
                         // process.stderr.write(`${actionLogPrefix} Getting bounding box for element locator (source: '${params.ref}')...\\n`);
                         const targetElement = targetLocator.first();
                         const boundingBox = await targetElement.boundingBox({ timeout: 5000 });
                         if (boundingBox) {
                              // process.stderr.write(`${actionLogPrefix} Taking clipped page screenshot for element.\\n`);
                              currentScreenshotOptions.clip = boundingBox;
                              buffer = await page.screenshot(currentScreenshotOptions);
                         } else {
                              // process.stderr.write(`${actionLogPrefix} WARN - Could not get bounding box for element. Taking viewport screenshot instead.\\n`);
                              buffer = await page.screenshot(currentScreenshotOptions);
                         }
                    } catch (boundingBoxError) {
                         const errorMsg = boundingBoxError instanceof Error ? boundingBoxError.message : String(boundingBoxError);
                         // process.stderr.write(`${actionLogPrefix} Raw boundingBox error: ${boundingBoxError}\\n`);
                         // process.stderr.write(`${actionLogPrefix} WARN - Error getting bounding box for element (source: '${params.ref}'): ${errorMsg}. Taking viewport screenshot instead.\\n`);
                         buffer = await page.screenshot(currentScreenshotOptions);
                    }
                } else {
                    // process.stderr.write(`${actionLogPrefix} Taking viewport screenshot.\\n`);
                    buffer = await page.screenshot(currentScreenshotOptions);
                }
            } catch (screenshotError) {
                const errorMsg = screenshotError instanceof Error ? screenshotError.message : String(screenshotError);
                // process.stderr.write(`${actionLogPrefix} Raw screenshot error: ${screenshotError}\\n`);
                // process.stderr.write(`${actionLogPrefix} Screenshot failed: ${errorMsg}\\n`);
                // process.stderr.write(`${actionLogPrefix} Screenshot Error Stack: ${screenshotError instanceof Error ? screenshotError.stack : 'N/A'}\\n`);
                throw new Error(`Failed to take screenshot. Error: ${errorMsg}`);
            }

            const base64 = buffer.toString("base64");
            const name = `screenshot-${Date.now()}.${format}`;
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
                    { type: "text", text: `Screenshot taken${params.element ? ": " + params.element : " (viewport)"} and saved as resource '${name}'.` },
                    imageContent,
                ],
            };
        };

        return { action, code, captureSnapshot: false, waitForNetwork: false };
    },
});

// Ensure all defined tools are exported
// --- Add generateLocator function ---
// This function needs refinement. Playwright's internal _generateLocatorString is ideal
// but might not be stable or available. Using toString() and regex is a fallback.
// We might need a more robust way provided by the Context/Snapshot potentially.
export async function generateLocator(locator: Locator): Promise<string> {
    // Prefer Playwright's internal method if available (requires check/cast)
    if ((locator as any)._generateLocatorString) {
        try {
             return await (locator as any)._generateLocatorString();
        } catch (e) {
            console.warn("Failed to use _generateLocatorString:", e);
        }
    }

    // Fallback based on toString() - less reliable
    console.warn("Falling back to locator.toString() for code generation. This might be inaccurate.");
    const locatorString = locator.toString();
    // Example: Playwright.Locator@frameLocator('iframe[name="preview"]').getByRole('button', { name: 'Submit' })
    // Example: Playwright.Locator@[aria-ref="f1abc"]
    // Try to extract the core selector part
    const toStringMatch = locatorString.match(/^.*Locator@(.*)$/);
    if (toStringMatch && toStringMatch[1]) {
        // Basic sanitization: wrap in locator() if it doesn't look like a frameLocator call
         if (toStringMatch[1].startsWith('frameLocator')) {
            return toStringMatch[1]; // Assume it's already a valid chain start
         } else {
             // Attempt to quote appropriately if it looks like a simple selector
             // This is highly heuristic!
              if (/^[a-zA-Z0-9#\.>\s\\[\\]\"\'=-]+$/.test(toStringMatch[1])) {
                 return `locator(${JSON.stringify(toStringMatch[1])})`;
              } else {
                  // Fallback for complex chains derived from toString()
                  return toStringMatch[1];
              }
         }
    }

    // Ultimate fallback if toString() is weird
    console.error("Ultimate fallback for generateLocator: Cannot determine selector from:", locatorString);
    return `locator('UNKNOWN_SELECTOR_FROM_SNAPSHOT')`;
}

// Ensure all defined tools are exported
export default [
  snapshot,
  click,
  drag,
  hover,
  type,
  selectOption,
  screenshot,
];

// ---> HELPER FUNCTION START <---
async function getLocator(context: Context, ref: string, elementDescription: string, snapshotToUse?: PageSnapshot): Promise<Locator> {
    const logPrefix = `[getLocator] ${new Date().toISOString()}:`;
    // const snapshotRefPattern = /^s\d+e\d+$/; // Removed pattern check

    // process.stderr.write(`${logPrefix} Testing ref: '${ref}' against pattern ${snapshotRefPattern}\n`); // Removed log

    // Removed the entire if/else block that checked snapshotRefPattern

    // Always treat ref as a direct selector (CSS, XPath, etc.)
    // process.stderr.write(`${logPrefix} Using page.locator directly for element '${elementDescription}' with selector '${ref}'.\n`); // Adjusted log
    const page = await context.getActivePage();
    if (!page) {
        throw new Error(`Cannot locate element "${elementDescription}" using selector "${ref}": No active page found.`);
    }
    try {
        // Return the locator directly. The action handler will wait for it.
        const locator = page.locator(ref);
        // Optional: Minimal check just for logging, doesn't affect return
        // if (await locator.count() > 0) {
        //      // process.stderr.write(`${logPrefix} page.locator('${ref}') initially found > 0 elements.\n`);
        // } else {
        //      // process.stderr.write(`${logPrefix} page.locator('${ref}') initially found 0 elements. Action will wait.\n`);
        // }
        return locator;
    } catch (e) {
         const errorMsg = e instanceof Error ? e.message : String(e);
         // process.stderr.write(`${logPrefix} Error using page.locator('${ref}'): ${errorMsg}.\n`);
         // Throw a more specific error indicating the selector failed
         throw new Error(`Failed to locate element "${elementDescription}" using selector "${ref}": ${errorMsg}`); // Adjusted error message
    }
}
// ---> HELPER FUNCTION END <---
