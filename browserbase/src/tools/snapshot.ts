import { Page } from "playwright-core";
import { CallToolResult, TextContent, ImageContent } from "@modelcontextprotocol/sdk/types.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { screenshots } from "../resources/handlers.js";
import { latestSnapshots } from "./common.js";
import { errors as PlaywrightErrors } from "playwright-core";

// Snapshot handler
export async function handleSnapshot(page: Page, targetSessionId: string): Promise<CallToolResult> {
  try {
    console.error(`Taking accessibility snapshot for session ${targetSessionId}`);
    latestSnapshots.delete(targetSessionId);

    const snapshot = await page.accessibility.snapshot({
      interestingOnly: false,
    });

    if (!snapshot) {
      console.error(`Snapshot returned null for session ${targetSessionId}`);
      return {
        content: [{ type: "text", text: "Failed to capture snapshot (returned null)." }],
        isError: true,
      };
    }

    latestSnapshots.set(targetSessionId, snapshot);
    console.error(`Accessibility snapshot taken and stored for session ${targetSessionId}.`);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(snapshot, null, 2),
        },
      ],
      isError: false,
    };
  } catch (error) {
    console.error(
      `Failed to take accessibility snapshot for session ${targetSessionId}: ${ (error as Error).message }`,
    );
    return {
      content: [
        {
          type: "text",
          text: `Failed to take accessibility snapshot: ${ (error as Error).message }`,
        },
      ],
      isError: true,
    };
  }
}

// --- Screenshot Handler (Moved from screenshot.ts) ---
export async function handleTakeScreenshot(page: Page, args: any, targetSessionId: string, serverInstance: Server | null): Promise<CallToolResult> {
  const screenshotName = `screenshot_${Date.now()}.png`;
  const usePNG = args.raw === true;
  const screenshotType = usePNG ? "png" : "jpeg";
  console.error(
    `Taking screenshot for session ${targetSessionId} as ${screenshotType} (element/ref ignored for now)`,
  );
  if (args.element || args.ref) {
    console.warn(
      `Element/ref arguments provided to browserbase_take_screenshot, but element-specific screenshots are not yet implemented. Taking full page screenshot.`,
    );
    // TODO: Implement element screenshot logic using args.ref (find node, get locator, screenshot locator)
  }

  const screenshotBuffer = await page.screenshot({
    fullPage: false, // Consider making this an option?
    type: screenshotType,
    timeout: 30000,
  });
  if (!screenshotBuffer || screenshotBuffer.length === 0) {
    console.error(
      `Screenshot failed for session ${targetSessionId} - buffer empty.`,
    );
    return {
      content: [
        {
          type: "text",
          text: "Screenshot failed: Empty buffer returned.",
        },
      ],
      isError: true,
    };
  }
  const screenshotBase64 = screenshotBuffer.toString("base64");
  screenshots.set(screenshotName, screenshotBase64); // Assuming screenshots map is accessible via import
  if (serverInstance) {
    serverInstance.notification({
      method: "notifications/resources/list_changed",
    });
  } else {
    console.warn("Server instance not set, cannot send notification.");
  }
  console.error(
    `Screenshot taken and saved in memory as '${screenshotName}' for session ${targetSessionId}.`,
  );
  return {
    content: [
      {
        type: "text",
        text: `Screenshot taken for session ${targetSessionId} and saved as '${screenshotName}'`,
      } as TextContent,
      {
        type: "image",
        data: screenshotBase64,
        mimeType: usePNG ? "image/png" : "image/jpeg",
      } as ImageContent,
    ],
    isError: false,
  };
}

// --- Click Handler (Moved from click.ts) ---
export async function handleClick(page: Page, args: any, targetSessionId: string): Promise<CallToolResult> {
  if (!args.element || !args.ref) {
    return {
      content: [
        {
          type: "text",
          text: "Missing required argument: element and/or ref",
        },
      ],
      isError: true,
    };
  }
  try {
    const refToFind = args.ref;
    const elementDesc = args.element;
    console.error(
      `Attempting to click element '${elementDesc}' using ref '${refToFind}' in session ${targetSessionId}`,
    );

    const locator = page.locator(`aria-ref=${refToFind}`);
    console.log(`Attempting click using locator: aria-ref=${refToFind}`);

    await locator.waitFor({ state: "visible", timeout: 15000 });
    await locator.click({ timeout: 10000 });

    console.error(
      `Clicked element with ref '${refToFind}' successfully in session ${targetSessionId}.`,
    );
    return {
      content: [
        {
          type: "text",
          text: `Clicked element with ref: ${refToFind} in session ${targetSessionId}`,
        },
      ],
      isError: false,
    };
  } catch (error) {
    const refToFind = args.ref;
    console.error(
      `Failed to click element with ref ${refToFind} in session ${targetSessionId}: ${ (error as Error).message }`,
    );
    let errorMessage = `Failed to click element with ref "${refToFind}" in session ${targetSessionId}.`;
    if (error instanceof PlaywrightErrors.TimeoutError) {
      errorMessage +=
        " Reason: Timeout waiting for element or click action.";
    } else {
      errorMessage += ` Reason: ${(error as Error).message}`;
    }
    return {
      content: [{ type: "text", text: errorMessage }],
      isError: true,
    };
  }
}

// --- Type Handler (Moved from type.ts) ---
export async function handleType(page: Page, args: any, targetSessionId: string): Promise<CallToolResult> {
  if (!args.element || !args.ref) {
    return {
      content: [
        {
          type: "text",
          text: "Missing required argument: element and/or ref",
        },
      ],
      isError: true,
    };
  }
  if (typeof args.text !== "string") {
    return {
      content: [
        {
          type: "text",
          text: "Missing or invalid required argument: text (must be a string)",
        },
      ],
      isError: true,
    };
  }
  try {
    const textToType = args.text;
    const pressEnter = args.submit === true;
    const typeSlowly = args.slowly === true;
    const refToFind = args.ref;
    const elementDesc = args.element;

    console.error(
      `Attempting to type into element '${elementDesc}' using ref '${refToFind}' in session ${targetSessionId} (slowly: ${typeSlowly}, submit: ${pressEnter})`,
    );

    const locator = page.locator(`aria-ref=${refToFind}`);
    console.log(`Attempting type using locator: aria-ref=${refToFind}`);

    await locator.waitFor({ state: "visible", timeout: 15000 });

    if (typeSlowly) {
      await locator.pressSequentially(textToType, {
        timeout: 10000 + textToType.length * 100,
        delay: 50,
      });
    } else {
      await locator.fill(textToType, { timeout: 10000 });
    }

    if (pressEnter) {
      console.error(`Pressing Enter after typing into element with ref '${refToFind}'`);
      await locator.press("Enter", { timeout: 5000 });
    }

    console.error(
      `Typed into element with ref '${refToFind}' successfully in session ${targetSessionId}.`,
    );
    return {
      content: [
        {
          type: "text",
          text: `Typed into element described as ${ elementDesc } (ref: ${refToFind}) in session ${targetSessionId}. ${ pressEnter ? "Enter pressed." : "Enter NOT pressed." }`,
        },
      ],
      isError: false,
    };
  } catch (error) {
    console.error(
      `Failed to type into element with ref '${args.ref}' in session ${targetSessionId}: ${ (error as Error).message }`,
    );
    let errorMessage = `Failed to type into element with ref "${args.ref}" in session ${targetSessionId}.`;
    if (error instanceof PlaywrightErrors.TimeoutError) {
      errorMessage +=
        " Reason: Timeout waiting for element or type action.";
    } else {
      errorMessage += ` Reason: ${(error as Error).message}`;
    }
    return {
      content: [{ type: "text", text: errorMessage }],
      isError: true,
    };
  }
}

// --- Hover Handler (Moved from hover.ts) ---
export async function handleHover(page: Page, args: any, targetSessionId: string): Promise<CallToolResult> {
  if (!args.element || !args.ref) {
    return { content: [{ type: "text", text: "Missing required argument: element and/or ref" }], isError: true };
  }
  try {
    const refToFind = args.ref;
    const elementDesc = args.element;
    console.error(`Attempting to hover over element '${elementDesc}' using ref '${refToFind}' in session ${targetSessionId}`);

    const locator = page.locator(`aria-ref=${refToFind}`);
    console.log(`Attempting hover using locator: aria-ref=${refToFind}`);

    await locator.waitFor({ state: "visible", timeout: 15000 });
    await locator.hover({ timeout: 10000 });

    console.error(`Hovered over element with ref '${refToFind}' successfully.`);
    return { content: [{ type: "text", text: `Hovered over element with ref: ${refToFind}` }], isError: false };
  } catch (error) {
    const refToFind = args.ref;
    console.error(`Failed to hover over element with ref ${refToFind}: ${(error as Error).message}`);
    let errorMessage = `Failed to hover over element with ref "${refToFind}".`;
    if (error instanceof PlaywrightErrors.TimeoutError) errorMessage += " Reason: Timeout.";
    else errorMessage += ` Reason: ${(error as Error).message}`;
    return { content: [{ type: "text", text: errorMessage }], isError: true };
  }
}

// --- Select Option Handler (Moved from selectOption.ts) ---
export async function handleSelectOption(page: Page, args: any, targetSessionId: string): Promise<CallToolResult> {
  if (!args.element || !args.ref || !args.values || !Array.isArray(args.values) || args.values.length === 0) {
    return { content: [{ type: "text", text: "Missing or invalid required arguments: element, ref, values (non-empty array)" }], isError: true };
  }
  try {
    const refToFind = args.ref;
    const elementDesc = args.element;
    const valuesToSelect = args.values as string[];
    console.error(`Attempting to select options [${valuesToSelect.join(", ")}] for element '${elementDesc}' using ref '${refToFind}' in session ${targetSessionId}`);

    const locator = page.locator(`aria-ref=${refToFind}`);
    console.log(`Attempting selectOption using locator: aria-ref=${refToFind}`);

    await locator.waitFor({ state: "visible", timeout: 15000 });
    await locator.selectOption(valuesToSelect, { timeout: 10000 });

    console.error(`Selected options [${valuesToSelect.join(", ")}] for element with ref '${refToFind}' successfully.`);
    return { content: [{ type: "text", text: `Selected options for element with ref: ${refToFind}` }], isError: false };
  } catch (error) {
    const refToFind = args.ref;
    console.error(`Failed to select options for element with ref ${refToFind}: ${(error as Error).message}`);
    let errorMessage = `Failed to select options for element with ref "${refToFind}".`;
    if (error instanceof PlaywrightErrors.TimeoutError) errorMessage += " Reason: Timeout.";
    else errorMessage += ` Reason: ${(error as Error).message}`;
    return { content: [{ type: "text", text: errorMessage }], isError: true };
  }
}

// --- Drag Handler (Moved from drag.ts) ---
export async function handleDrag(page: Page, args: any, targetSessionId: string): Promise<CallToolResult> {
  if (!args.startElement || !args.startRef || !args.endElement || !args.endRef) {
    return { content: [{ type: "text", text: "Missing required arguments: startElement, startRef, endElement, endRef" }], isError: true };
  }
  try {
    const startRef = args.startRef;
    const startElementDesc = args.startElement;
    const endRef = args.endRef;
    const endElementDesc = args.endElement;

    console.error(`Attempting to drag '${startElementDesc}' (ref: ${startRef}) to '${endElementDesc}' (ref: ${endRef}) in session ${targetSessionId}`);

    const startLocator = page.locator(`aria-ref=${startRef}`);
    const endLocator = page.locator(`aria-ref=${endRef}`);
    console.log(`Attempting drag using locators: aria-ref=${startRef} -> aria-ref=${endRef}`);

    await startLocator.waitFor({ state: "visible", timeout: 15000 });
    await endLocator.waitFor({ state: "visible", timeout: 15000 });

    await startLocator.dragTo(endLocator, { timeout: 20000 });

    console.error(`Dragged element with ref '${startRef}' to element with ref '${endRef}' successfully.`);
    return { content: [{ type: "text", text: `Dragged element ${startRef} to ${endRef}` }], isError: false };
  } catch (error) {
    console.error(`Failed to drag element ${args.startRef} to ${args.endRef}: ${(error as Error).message}`);
    let errorMessage = `Failed to drag element ${args.startRef} to ${args.endRef}.`;
    if (error instanceof PlaywrightErrors.TimeoutError) errorMessage += " Reason: Timeout.";
    else errorMessage += ` Reason: ${(error as Error).message}`;
    return { content: [{ type: "text", text: errorMessage }], isError: true };
  }
}

// --- Get Text Handler (Moved from getText.ts) ---
export async function handleGetText(page: Page, args: any, targetSessionId: string): Promise<CallToolResult> {
  try {
    console.error(
      `Getting text content from session ${targetSessionId} (selector: ${ args.selector || "body" })`,
    );
    let textContent: string;
    const targetLocator = args.selector
      ? page.locator(args.selector)
      : page.locator("body");
    await targetLocator
      .first()
      .waitFor({ state: "attached", timeout: 15000 });
    if (args.selector) {
      textContent = await targetLocator
        .first()
        .innerText({ timeout: 10000 });
    } else {
      textContent = await targetLocator.innerText({ timeout: 10000 });
    }
    console.error(
      `Successfully retrieved raw text content from session ${targetSessionId}. Length: ${textContent.length}`,
    );
    const cleanedContent = textContent
      .split("\n")
      .map((line) => line.trim())
      .filter(
        (line) =>
          line &&
          !/\{.*\}/.test(line) &&
          !/@keyframes/.test(line) &&
          !/^[\.#]/.test(line),
      )
      .join("\n");
    console.error(
      `Cleaned text content length: ${cleanedContent.length}`,
    );
    const MAX_TEXT_LENGTH = 5000;
    const truncatedContent =
      cleanedContent.length > MAX_TEXT_LENGTH
        ? cleanedContent.substring(0, MAX_TEXT_LENGTH) + "... (truncated)"
        : cleanedContent;
    return {
      content: [
        {
          type: "text",
          text: `Extracted content from session ${targetSessionId}:
${truncatedContent}`,
        },
      ],
      isError: false,
    };
  } catch (error) {
    console.error(
      `Failed to extract content from session ${targetSessionId}: ${ (error as Error).message }`,
    );
    let errorMessage = `Failed to extract text content from session ${targetSessionId} (selector: ${ args.selector || "body" }).`;
    if (error instanceof PlaywrightErrors.TimeoutError) {
      errorMessage +=
        " Reason: Timeout waiting for element or text extraction.";
    } else {
      errorMessage += ` Reason: ${(error as Error).message}`;
    }
    return {
      content: [{ type: "text", text: errorMessage }],
      isError: true,
    };
  }
} 