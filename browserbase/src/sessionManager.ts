import {
  chromium,
  Browser,
  Page,
  errors as PlaywrightErrors,
} from "playwright-core";
import { Browserbase } from "@browserbasehq/sdk";
import type { Config } from "./config.js"; // Import Config type
import { Writable } from "stream"; // Import Writable for process.stderr

// Define the type for a session object
export type BrowserSession = { browser: Browser; page: Page };

// Global state for managing browser sessions
const browsers = new Map<string, BrowserSession>();
// Keep track of the default session explicitly
let defaultBrowserSession: BrowserSession | null = null;
// Change from "default" to a more specific ID
export const defaultSessionId = "browser_session_main";

// Keep track of the active session ID. Defaults to the main session.
let activeSessionId: string = defaultSessionId; // Changed 'private' to 'let'

/**
 * Sets the active session ID.
 * @param id The ID of the session to set as active.
 */
export function setActiveSessionId(id: string): void {
  // const logPrefix = `[SessionManager] ${new Date().toISOString()}:`;
  if (browsers.has(id) || id === defaultSessionId) {
    activeSessionId = id;
    // Change stdout to stderr for logging
    process.stderr.write(`[SessionManager] Active session set: ${id}\n`);
  } else {
    // Use process.stderr.write for warnings too
    process.stderr.write(
      `[SessionManager] WARN - Set active session failed for non-existent ID: ${id}\n`
    ); // Keep WARN
  }
}

/**
 * Gets the active session ID.
 * @returns The active session ID.
 */
export function getActiveSessionId(): string {
  return activeSessionId;
}

// Function to create a new Browserbase session and connect Playwright
export async function createNewBrowserSession(
  newSessionId: string,
  config: Config, // Accept config object
  options?: {
    contextId?: string;
    persistContext?: boolean;
  }
): Promise<BrowserSession> {
  // const logPrefix = `[SessionManager.createNew ${newSessionId}] ${new Date().toISOString()}:`;
  if (!config.browserbaseApiKey) {
    throw new Error("Browserbase API Key is missing in the configuration.");
  }
  if (!config.browserbaseProjectId) {
    throw new Error("Browserbase Project ID is missing in the configuration.");
  }

  const bb = new Browserbase({
    // Use non-null assertion after check
    apiKey: config.browserbaseApiKey!,
  });

  // Prepare session creation options
  const sessionOptions: any = {
    // Use non-null assertion after check
    projectId: config.browserbaseProjectId!,
    proxies: true, // Consider making this configurable via Config
  };

  // Add context settings if provided
  if (options?.contextId) {
    sessionOptions.browserSettings = {
      context: {
        id: options.contextId,
        persist: options.persistContext !== false, // Default to true if not specified
      },
    };
  }

  try {
    // Added top-level try-catch for create session
    // Change stdout to stderr for logging
    process.stderr.write(
      `[SessionManager] Creating session ${newSessionId}...\n`
    );
    const session = await bb.sessions.create(sessionOptions);
    // Change stdout to stderr for logging
    process.stderr.write(
      `[SessionManager] Browserbase session created: ${session.id}\n`
    ); // Use the actual ID returned

    const browser = await chromium.connectOverCDP(session.connectUrl);

    // Handle unexpected disconnects
    browser.on("disconnected", () => {
      // Change stdout to stderr for logging
      process.stderr.write(`[SessionManager] Disconnected: ${newSessionId}\n`);
      browsers.delete(newSessionId);
      // If the disconnected browser was the default one, clear the global reference
      if (defaultBrowserSession && defaultBrowserSession.browser === browser) {
        // Change stdout to stderr for logging
        process.stderr.write(
          `[SessionManager] Disconnected (default): ${newSessionId}\n`
        );
        defaultBrowserSession = null;
        // If the default session disconnects, maybe reset activeId? Or let ensure handle it?
        // For now, we won't reset activeSessionId here, ensureDefaultSessionInternal will handle creating a new default.
      }
      // If a non-default active session disconnects, reset to default
      if (
        activeSessionId === newSessionId &&
        newSessionId !== defaultSessionId
      ) {
        process.stderr.write(
          `[SessionManager] WARN - Active session disconnected, resetting to default: ${newSessionId}\n`
        ); // Keep WARN
        setActiveSessionId(defaultSessionId);
      }
    });

    let context = browser.contexts()[0];
    if (!context) {
      context = await browser.newContext();
    }
    let page = context.pages()[0];
    if (!page) {
      page = await context.newPage();
    }

    const sessionObj: BrowserSession = { browser, page };

    // Store the session
    browsers.set(newSessionId, sessionObj);

    // If this is the default session, update the global reference
    if (newSessionId === defaultSessionId) {
      defaultBrowserSession = sessionObj;
    }

    // Set the newly created session as active
    setActiveSessionId(newSessionId); // Added this call
    // Log session creation success to stderr
    // process.stderr.write(`${logPrefix} Created and set active session ID to: ${newSessionId}\\n`);
    // Change stdout to stderr for logging
    process.stderr.write(
      `[SessionManager] Session created and active: ${newSessionId}\n`
    );

    return sessionObj;
  } catch (creationError) {
    // Log the raw creation/connection error to stderr  
    process.stderr.write(
      `[SessionManager] Creating session ${newSessionId} failed: ${
        creationError instanceof Error
          ? creationError.message
          : String(creationError)
      }
`
    ); // Keep ERROR comment if useful, but removed from output
    // Attempt to clean up partially created resources if possible (e.g., close browser if connection succeeded but context/page failed)
    // This part is complex, might need more state tracking. For now, just log and re-throw.
    throw new Error(
      `Failed to create/connect session ${newSessionId}: ${
        creationError instanceof Error
          ? creationError.message
          : String(creationError)
      }`
    );
  }
}

// Internal function to ensure default session, passes config down
export async function ensureDefaultSessionInternal(
  config: Config
): Promise<BrowserSession> {
  const sessionId = defaultSessionId;
  let sessionNeedsUpdate = false;
  try {
    // Check if default session exists
    if (!defaultBrowserSession) {
      // Change stdout to stderr for logging
      process.stderr.write(
        `[SessionManager] Ensuring default session (creating): ${sessionId}\n`
      );
      sessionNeedsUpdate = true;
      // Check if browser disconnected or page closed
    } else if (
      !defaultBrowserSession.browser.isConnected() ||
      defaultBrowserSession.page.isClosed()
    ) {
      // Change stdout to stderr for logging
      process.stderr.write(
        `[SessionManager] Ensuring default session (recreating): ${sessionId}\n`
      );
      try {
        // Attempt to close the old browser instance cleanly
        // Change stdout to stderr for logging
        process.stderr.write(
          `[SessionManager] Closing stale default session: ${sessionId}\n`
        );
        await defaultBrowserSession.browser.close();
      } catch (closeError) {
        process.stderr.write(
          `[SessionManager] WARN - Error closing stale default session ${sessionId}: ${
            closeError instanceof Error
              ? closeError.message
              : String(closeError)
          }\\n`
        ); // Keep WARN
      } finally {
        // Clear references regardless of close success
        defaultBrowserSession = null;
        browsers.delete(sessionId);
        sessionNeedsUpdate = true;
      }
    }

    // If needed, create a new session
    if (sessionNeedsUpdate) {
      defaultBrowserSession = await createNewBrowserSession(sessionId, config); // createNew sets it active
      return defaultBrowserSession;
    }

    // If we reached here, the existing default session seems okay initially.
    // Change stdout to stderr for logging
    process.stderr.write(
      `[SessionManager] Ensuring default session (using existing): ${sessionId}\\n`
    );
    setActiveSessionId(defaultSessionId); // Ensure default is marked active if we are using it
    return defaultBrowserSession!; // Non-null assertion as it's checked/created above
  } catch (error) {
    process.stderr.write(
      `[SessionManager] Ensuring default session ${defaultSessionId} failed: ${
        error instanceof Error ? error.message : String(error)
      }\n`
    ); // Keep ERROR comment if useful, but removed from output

    // More robust error handling: attempt to close browser if it exists
    const problematicSession = browsers.get(defaultSessionId);
    if (problematicSession?.browser?.isConnected()) {
      try {
        // Change stdout to stderr for logging
        process.stderr.write(
          `[SessionManager] Closing problematic default session during error handling: ${defaultSessionId}\\n`
        );
        await problematicSession.browser.close();
        browsers.delete(defaultSessionId); // Clean up map if close succeeds
      } catch (e) {
        process.stderr.write(
          `[SessionManager] WARN - Error closing problematic default session ${defaultSessionId} during error handling: ${
            e instanceof Error ? e.message : String(e)
          }\\n`
        ); // Keep WARN
      }
    } else {
      // Ensure cleanup even if browser wasn't connected or session didn't exist
      // Change stdout to stderr for logging
      process.stderr.write(
        `[SessionManager] Problematic default session ${defaultSessionId} not connected or not found during error handling.\\n`
      );
      browsers.delete(defaultSessionId);
    }

    // Re-throw the error after attempting cleanup? Or try recreating?
    // Let's try recreating once.
    // Change stdout to stderr for logging
    process.stderr.write(
      `[SessionManager] Attempting recreation of default session ${defaultSessionId} after error.\\n`
    );
    try {
      const newSession = await createNewBrowserSession(
        defaultSessionId,
        config
      );
      browsers.set(defaultSessionId, newSession);
      activeSessionId = defaultSessionId; // Set as active
      return newSession;
    } catch (retryError) {
      process.stderr.write(
        `[SessionManager] Failed to recreate default session ${defaultSessionId} after error: ${
          retryError instanceof Error ? retryError.message : String(retryError)
        }\n`
      ); // Keep ERROR comment if useful, but removed from output
      throw new Error(
        `Failed to ensure default session after initial error and retry: ${
          retryError instanceof Error ? retryError.message : String(retryError)
        }`
      );
    }
  }
}

// Get a specific session by ID, needs config to create/recover default
export async function getSession(
  sessionId: string,
  config: Config
): Promise<BrowserSession | null> {
  const logPrefix = `[SessionManager.getSession ${sessionId}] ${new Date().toISOString()}:`;
  if (sessionId === defaultSessionId) {
    try {
      // ensureDefaultSessionInternal handles creation and setting active ID
      return await ensureDefaultSessionInternal(config);
    } catch (error) {
      process.stderr.write(
        `[SessionManager] Failed ensureDefaultSessionInternal call for ${sessionId}: ${
          error instanceof Error ? error.message : String(error)
        }\n`
      ); // Keep ERROR comment if useful, but removed from output
      return null;
    }
  }

  // For non-default sessions
  // Change stdout to stderr for logging
  process.stderr.write(`[SessionManager] Getting session: ${sessionId}\\n`);
  let sessionObj = browsers.get(sessionId);
  if (!sessionObj) {
    process.stderr.write(
      `[SessionManager] WARN - Session not found: ${sessionId}\\n`
    ); // Keep WARN
    return null;
  }

  // Validate the found session
  try {
    if (!sessionObj.browser.isConnected() || sessionObj.page.isClosed()) {
      try {
        await sessionObj.browser.close();
      } catch (e) {
        /* Ignore close error */
      }
      browsers.delete(sessionId);
      // If the invalidated session was the active one, reset active to default
      if (activeSessionId === sessionId) {
        process.stderr.write(
          `[SessionManager] WARN - Invalidated active session, resetting to default: ${sessionId}\\n`
        ); // Keep WARN
        setActiveSessionId(defaultSessionId);
      }
      return null;
    }
    // Session appears valid, make it active
    setActiveSessionId(sessionId); // Set valid retrieved session as active
    return sessionObj;
  } catch (validationError) {
    // Log the raw validation error to stderr
    process.stderr.write(
      `[SessionManager] Session validation failed for ${sessionId}: ${
        validationError instanceof Error
          ? validationError.message
          : String(validationError)
      }\n`
    ); // Keep ERROR comment if useful, but removed from output
    try {
      await sessionObj.browser.close();
    } catch (e) {
      /* Ignore close error */
    }
    browsers.delete(sessionId);
    // If the invalidated session was the active one, reset active to default
    if (activeSessionId === sessionId) {
      process.stderr.write(
        `[SessionManager] WARN - Invalidated active session during validation error, resetting to default: ${sessionId}\\n`
      ); // Keep WARN
      setActiveSessionId(defaultSessionId);
    }
    return null;
  }
}

// Function to close all managed browser sessions gracefully
export async function closeAllSessions(): Promise<void> {
  // Change stdout to stderr for logging
  process.stderr.write(`[SessionManager] Closing all sessions...\\n`);
  const closePromises: Promise<void>[] = [];
  for (const [id, session] of browsers.entries()) {
    if (session.browser) {
      // Change stdout to stderr for logging
      process.stderr.write(`[SessionManager] Closing session: ${id}\\n`);
      closePromises.push(
        session.browser.close().catch((e) => {
          process.stderr.write(
            `[SessionManager] WARN - Error closing session ${id}: ${
              e instanceof Error ? e.message : String(e)
            }\\n`
          ); // Keep WARN
        })
      );
    }
  }
  await Promise.all(closePromises); // Wait for all closes to attempt
  browsers.clear();
  defaultBrowserSession = null; // Ensure default session reference is cleared
  setActiveSessionId(defaultSessionId); // Reset active session to default after closing all
  // Change stdout to stderr for logging
  process.stderr.write(`[SessionManager] All sessions closed and cleared.\\n`);
}
