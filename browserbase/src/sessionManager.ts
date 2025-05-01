import {
  chromium,
  Browser,
  Page,
  errors as PlaywrightErrors,
} from "playwright-core";
import { Browserbase } from "@browserbasehq/sdk";
import { BrowserSession } from "./types.js";

// Global State specific to sessions
const browsers = new Map<string, BrowserSession>();
let defaultBrowserSession: BrowserSession | null = null;
const defaultSessionId = "default"; // Consistent ID for the default session

// Helper Functions

// Function to create a new browser session
async function createNewBrowserSession(
  newSessionId: string,
): Promise<BrowserSession> {
  console.error(`Creating new browser session with ID: ${newSessionId}`);
  const bb = new Browserbase({
    apiKey: process.env.BROWSERBASE_API_KEY!,
  });

  const session = await bb.sessions.create({
    projectId: process.env.BROWSERBASE_PROJECT_ID!,
    proxies: true, // Consider making configurable
  });
  console.error("Browserbase session created:", session.id);

  const browser = await chromium.connectOverCDP(session.connectUrl);
  console.error("Connected to Playwright via CDP.");

  // Handle unexpected disconnects
  browser.on("disconnected", () => {
    console.warn(
      `Browser disconnected unexpectedly for session ID: ${newSessionId}`,
    );
    browsers.delete(newSessionId);
    if (defaultBrowserSession && defaultBrowserSession.browser === browser) {
      console.warn("Default browser session disconnected.");
      defaultBrowserSession = null;
    }
  });

  // Use or create context/page
  let context = browser.contexts()[0];
  if (!context) {
    console.error("No existing context found, creating new context.");
    context = await browser.newContext();
  }
  let page = context.pages()[0];
  if (!page) {
    console.error("No existing page found in context, creating new page.");
    page = await context.newPage();
  }
  console.error(`Using page: ${page.url()}`);

  const sessionData: BrowserSession = { browser, page };
  browsers.set(newSessionId, sessionData);
  console.error(`Session ${newSessionId} stored.`);
  return sessionData;
}

// Function to ensure the default browser session is valid
async function ensureBrowserSession(): Promise<BrowserSession> {
  try {
    if (!defaultBrowserSession) {
      console.error("No default session found, creating new one...");
      defaultBrowserSession = await createNewBrowserSession(defaultSessionId);
      return defaultBrowserSession;
    }

    if (
      !defaultBrowserSession.browser.isConnected() ||
      defaultBrowserSession.page.isClosed()
    ) {
      console.warn(
        `Default session browser disconnected (${!defaultBrowserSession.browser.isConnected()}) or page closed (${defaultBrowserSession.page.isClosed()}). Recreating...`,
      );
      try {
        await defaultBrowserSession.browser.close();
      } catch (closeError) {
        console.error(
          `Error closing potentially defunct browser: ${
            (closeError as Error).message
          }`,
        );
      } finally {
        defaultBrowserSession = null;
        browsers.delete(defaultSessionId);
      }
      defaultBrowserSession = await createNewBrowserSession(defaultSessionId);
      return defaultBrowserSession;
    }

    try {
      await defaultBrowserSession.page.title();
      console.error("Default session validated successfully.");
      return defaultBrowserSession;
    } catch (error) {
      console.warn(
        `Error validating session with page.title: ${
          (error as Error).message
        }. Assuming session invalid.`,
      );
      const isDisconnectedError =
        error instanceof Error &&
        (error.message.includes("Target closed") ||
          error.message.includes("Browser has been closed") ||
          error.message.includes("connect ECONNREFUSED") ||
          error.message.includes("Page is closed"));
      const isTimeoutError = error instanceof PlaywrightErrors.TimeoutError;

      if (isDisconnectedError || isTimeoutError) {
        console.warn(
          `Browser session invalid, attempting to recreate: ${
            (error as Error).message
          }`,
        );
        try {
          if (
            defaultBrowserSession &&
            defaultBrowserSession.browser.isConnected()
          ) {
            await defaultBrowserSession.browser.close();
          }
        } catch (e) {
          console.error(
            `Error closing potentially defunct default browser: ${
              (e as Error).message
            }`,
          );
        } finally {
          defaultBrowserSession = null;
          browsers.delete(defaultSessionId);
        }
        // Cleanup all sessions
        console.error("Cleaning up all known browser sessions...");
        for (const [id, sessionObj] of browsers.entries()) {
          try {
            if (sessionObj.browser.isConnected()) {
              await sessionObj.browser.close();
            }
          } catch (e) {
            console.error(
              `Error closing browser session ${id}: ${(e as Error).message}`,
            );
          }
          browsers.delete(id);
        }
        browsers.clear();
        console.error("Recreating default browser session after delay...");
        await new Promise((resolve) => setTimeout(resolve, 1000));
        defaultBrowserSession = await createNewBrowserSession(defaultSessionId);
        console.error("New default browser session created.");
        return defaultBrowserSession;
      }
      console.error(
        `Unhandled validation error, re-throwing: ${(error as Error).message}`,
      );
      throw error;
    }
  } catch (error) {
    console.error(
      `Unhandled error in ensureBrowserSession: ${(error as Error).message}`,
    );
    if (
      error instanceof Error &&
      (error.message.includes("Target closed") ||
        error.message.includes("connect ECONNREFUSED") ||
        error.message.includes("Page is closed"))
    ) {
      console.error("Attempting aggressive recovery...");
      browsers.clear();
      defaultBrowserSession = null;
      await new Promise((resolve) => setTimeout(resolve, 2000));
      try {
        defaultBrowserSession = await createNewBrowserSession(defaultSessionId);
        console.error(
          "Aggressive recovery successful, new default session created.",
        );
        return defaultBrowserSession;
      } catch (retryError) {
        console.error(
          `Aggressive recovery failed: ${(retryError as Error).message}`,
        );
        throw retryError;
      }
    }
    throw error;
  }
}

// Function to get a specific session, validating it
async function getSession(sessionId: string): Promise<BrowserSession> {
  if (sessionId === defaultSessionId) {
    console.error("Default session requested, ensuring validity...");
    return ensureBrowserSession();
  }

  if (!browsers.has(sessionId)) {
    console.error(`Session with ID '${sessionId}' does not exist.`);
    throw new Error(
      `Session with ID '${sessionId}' does not exist. Please create it first using browserbase_create_session or use the default session.`,
    );
  }

  console.error(`Found specific session ${sessionId} in map.`);
  let sessionObj = browsers.get(sessionId)!;

  // Validate this specific session
  if (!sessionObj.browser.isConnected() || sessionObj.page.isClosed()) {
    console.warn(
      `Specific session ${sessionId} is disconnected or page closed. Attempting to recreate...`,
    );
    try {
      await sessionObj.browser.close();
    } catch (e) {
      console.error(
        `Error closing defunct session ${sessionId}: ${(e as Error).message}`,
      );
    }
    browsers.delete(sessionId);
    try {
      sessionObj = await createNewBrowserSession(sessionId); // Recreate with the same ID
      console.error(`Successfully recreated session ${sessionId}.`);
      return sessionObj;
    } catch (recreateError) {
      console.error(
        `Failed to recreate session ${sessionId}: ${
          (recreateError as Error).message
        }`,
      );
      throw new Error(
        `Session '${sessionId}' is invalid and could not be recreated: ${
          (recreateError as Error).message
        }`,
      );
    }
  } else {
    // Perform a quick check
    try {
      await sessionObj.page.title();
      console.error(`Specific session ${sessionId} validated.`);
      return sessionObj;
    } catch (validationError) {
      console.warn(
        `Validation check failed for session ${sessionId}: ${
          (validationError as Error).message
        }. Assuming invalid.`,
      );
      try {
        await sessionObj.browser.close();
      } catch (e) {}
      browsers.delete(sessionId);
      throw new Error(
        `Session '${sessionId}' failed validation check: ${
          (validationError as Error).message
        }`,
      );
    }
  }
}

// Function to close all sessions (used during shutdown)
async function closeAllSessions() {
  console.error("Closing active browser sessions...");
  for (const [id, sessionObj] of browsers.entries()) {
    try {
      if (sessionObj.browser.isConnected()) {
        await sessionObj.browser.close();
        console.error(`Closed browser session ${id}.`);
      }
    } catch (e) {
      console.error(
        `Error closing browser session ${id}: ${(e as Error).message}`,
      );
    }
  }
  browsers.clear();
  defaultBrowserSession = null;
  console.error("Browser sessions closed.");
}

export {
  browsers,
  defaultSessionId,
  createNewBrowserSession,
  ensureBrowserSession,
  getSession,
  closeAllSessions,
}; 