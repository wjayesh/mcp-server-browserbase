import {
  chromium,
  Browser,
  Page,
  errors as PlaywrightErrors,
} from "playwright-core";
import { Browserbase } from "@browserbasehq/sdk";
import type { Config } from "./config.js"; // Import Config type
import { Writable } from 'stream'; // Import Writable for process.stderr

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
export function setActiveSessionId(id: string): void { // Added 'export function'
  const logPrefix = `[SessionManager] ${new Date().toISOString()}:`;
  // process.stderr.write(`${logPrefix} Attempting to set active session ID to: ${id}\\n`);
  if (browsers.has(id) || id === defaultSessionId) {
    activeSessionId = id;
    // process.stderr.write(`${logPrefix} Successfully set active session ID to: ${id}\\n`);
  } else {
    // Use process.stderr.write for warnings too
    // process.stderr.write(`${logPrefix} WARN - Attempted to set active session ID to non-existent session: ${id}. Keeping current: ${activeSessionId}\\n`);
  }
}

/**
 * Gets the active session ID.
 * @returns The active session ID.
 */
export function getActiveSessionId(): string { // Added 'export function'
  const logPrefix = `[SessionManager] ${new Date().toISOString()}:`;
  // process.stderr.write(`${logPrefix} Getting active session ID. Current value: ${activeSessionId}\\n`);
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
  const logPrefix = `[SessionManager.createNew ${newSessionId}] ${new Date().toISOString()}:`;
  // Add runtime checks here (SHOULD ALREADY EXIST from manual edit)
  if (!config.browserbaseApiKey) {
    throw new Error('Browserbase API Key is missing in the configuration.');
  }
  if (!config.browserbaseProjectId) {
      throw new Error('Browserbase Project ID is missing in the configuration.');
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
    // Log context usage to stderr
    // process.stderr.write(`${logPrefix} Using context: ${options.contextId} with persist: ${options.persistContext !== false}\\n`);
  }

  try { // Added top-level try-catch for create session
    // process.stderr.write(`${logPrefix} Attempting Browserbase session create with options: ${JSON.stringify(sessionOptions)}\\n`);
    const session = await bb.sessions.create(sessionOptions);
    // process.stderr.write(`${logPrefix} Browserbase session created: ${session.id}\\n`);

    // process.stderr.write(`${logPrefix} Connecting Playwright over CDP: ${session.connectUrl}\\n`);
    const browser = await chromium.connectOverCDP(session.connectUrl);
    // process.stderr.write(`${logPrefix} Playwright connected successfully.\\n`);

    // Handle unexpected disconnects
    browser.on("disconnected", () => {
      const disconnectLogPrefix = `[SessionManager Disconnect] ${new Date().toISOString()}:`;
      // process.stderr.write(`${disconnectLogPrefix} Browser disconnected for session: ${newSessionId}\\n`);
      browsers.delete(newSessionId);
      // If the disconnected browser was the default one, clear the global reference
      if (defaultBrowserSession && defaultBrowserSession.browser === browser) {
        // process.stderr.write(`${disconnectLogPrefix} Disconnected browser was the default session. Clearing reference.\\n`);
        defaultBrowserSession = null;
        // If the default session disconnects, maybe reset activeId? Or let ensure handle it?
        // For now, we won't reset activeSessionId here, ensureDefaultSessionInternal will handle creating a new default.
      }
      // If a non-default active session disconnects, reset to default
      if (activeSessionId === newSessionId && newSessionId !== defaultSessionId) {
        // process.stderr.write(`${disconnectLogPrefix} WARN - Active session ${newSessionId} disconnected. Resetting active session ID to default.\\n`);
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

    return sessionObj;
  } catch (creationError) {
      // Log the raw creation/connection error to stderr
      // process.stderr.write(`${logPrefix} Raw session creation/connection error: ${creationError}\\n`);
      // process.stderr.write(`${logPrefix} Failed during session creation or CDP connection for ID ${newSessionId}: ${creationError instanceof Error ? creationError.message : String(creationError)}\\n`);
      // Log stack trace
      // process.stderr.write(`${logPrefix} Creation Error Stack: ${creationError instanceof Error ? creationError.stack : 'N/A'}\\n`);
      // Attempt to clean up partially created resources if possible (e.g., close browser if connection succeeded but context/page failed)
      // This part is complex, might need more state tracking. For now, just log and re-throw.
      throw new Error(`Failed to create/connect session ${newSessionId}: ${creationError instanceof Error ? creationError.message : String(creationError)}`);
  }
}

// Internal function to ensure default session, passes config down
export async function ensureDefaultSessionInternal(config: Config): Promise<BrowserSession> {
  const sessionId = defaultSessionId;
  let sessionNeedsUpdate = false;
  try {
    const logPrefix = `[SessionManager.ensureDefault] ${new Date().toISOString()}:`;
    // Check if default session exists
    if (!defaultBrowserSession) {
      // process.stderr.write(`${logPrefix} Default session object not found, creating a new one.\\n`);
      sessionNeedsUpdate = true;
    // Check if browser disconnected or page closed
    } else if (!defaultBrowserSession.browser.isConnected() || defaultBrowserSession.page.isClosed()) {
      // process.stderr.write(`${logPrefix} Default session browser disconnected or page closed, recreating.\\n`);
      try {
        // Attempt to close the old browser instance cleanly
        // process.stderr.write(`${logPrefix} Attempting to close disconnected/closed session: ${sessionId}\\n`);
        await defaultBrowserSession.browser.close();
      } catch (closeError) {
        // process.stderr.write(`${logPrefix} Error closing disconnected/closed session: ${closeError instanceof Error ? closeError.message : String(closeError)}\\n`);
      } finally {
        // Clear references regardless of close success
        // process.stderr.write(`${logPrefix} Clearing stale default session references.\\n`);
        defaultBrowserSession = null;
        browsers.delete(sessionId);
         sessionNeedsUpdate = true;
      }
    }

    // If needed, create a new session
    if (sessionNeedsUpdate) {
      defaultBrowserSession = await createNewBrowserSession(sessionId, config); // createNew sets it active
      // process.stderr.write(`${logPrefix} New default session created.\\n`);
       // No need to call setActiveSessionId here, createNewBrowserSession does it.
       return defaultBrowserSession;
    }

    // If we reached here, the existing default session seems okay initially.
    // process.stderr.write(`${logPrefix} Existing default session seems connected.\\n`);
    setActiveSessionId(defaultSessionId); // Ensure default is marked active if we are using it
    return defaultBrowserSession!; // Non-null assertion as it's checked/created above

  } catch (error) {
     // Log the raw error from the ensuring process to stderr
     const logPrefix = `[SessionManager.ensureDefault Error] ${new Date().toISOString()}:`;
     // process.stderr.write(`${logPrefix} Raw error during ensuring process: ${error}\\n`);
     // process.stderr.write(`${logPrefix} Error during default session ensuring process: ${error instanceof Error ? error.message : String(error)}\\n`);
     // process.stderr.write(`${logPrefix} Error Stack: ${error instanceof Error ? error.stack : 'N/A'}\\n`);

    // More robust error handling: attempt to close browser if it exists
    const problematicSession = browsers.get(defaultSessionId);
    if (problematicSession?.browser?.isConnected()) {
      try {
        // process.stderr.write(`${logPrefix} Attempting to close problematic browser during error handling.\\n`);
        await problematicSession.browser.close();
        browsers.delete(defaultSessionId); // Clean up map if close succeeds
      } catch (e) {
        // process.stderr.write(`${logPrefix} Error closing browser during error handling: ${e instanceof Error ? e.message : String(e)}\\n`);
      }
    } else {
      // Ensure cleanup even if browser wasn't connected or session didn't exist
      // process.stderr.write(`${logPrefix} Problematic browser not connected or session not found. Ensuring map cleanup.\\n`);
      browsers.delete(defaultSessionId);
    }

    // Re-throw the error after attempting cleanup? Or try recreating?
    // Let's try recreating once.
    // process.stderr.write(`${logPrefix} Recreating session after critical error or timeout.\\n`);
    try {
      const newSession = await createNewBrowserSession(defaultSessionId, config);
      browsers.set(defaultSessionId, newSession);
      activeSessionId = defaultSessionId; // Set as active
      return newSession;
    } catch (retryError) {
      // process.stderr.write(`${logPrefix} Raw error during session recreation attempt: ${retryError}\\n`);
      // process.stderr.write(`${logPrefix} Failed to recreate session after error: ${retryError instanceof Error ? retryError.message : String(retryError)}\\n`);
      throw new Error(
        `Failed to ensure default session after initial error and retry: ${
          retryError instanceof Error ? retryError.message : String(retryError)
        }`
      );
    }
  }
}

// Get a specific session by ID, needs config to create/recover default
export async function getSession(sessionId: string, config: Config): Promise<BrowserSession | null> {
    const logPrefix = `[SessionManager.getSession ${sessionId}] ${new Date().toISOString()}:`;
    if (sessionId === defaultSessionId) {
        try {
            // ensureDefaultSessionInternal handles creation and setting active ID
            // process.stderr.write(`${logPrefix} Requested default session. Ensuring internal...\\n`);
            return await ensureDefaultSessionInternal(config); 
        } catch (error) {
            // process.stderr.write(`${logPrefix} Error ensuring default session: ${error}\\n`);
            return null;
        }
    }

    // For non-default sessions
    // process.stderr.write(`${logPrefix} Attempting to retrieve non-default session.\\n`);
    let sessionObj = browsers.get(sessionId);
    if (!sessionObj) {
        // process.stderr.write(`${logPrefix} WARN - Session not found in map.\\n`);
        return null;
    }

    // Validate the found session
    try {
        // process.stderr.write(`${logPrefix} Validating retrieved session...\\n`);
        if (!sessionObj.browser.isConnected() || sessionObj.page.isClosed()) {
            // process.stderr.write(`${logPrefix} WARN - Session browser disconnected or page closed. Cleaning up.\\n`);
            try { await sessionObj.browser.close(); } catch (e) { /* Ignore close error */ }
            browsers.delete(sessionId);
             // If the invalidated session was the active one, reset active to default
            if(activeSessionId === sessionId) {
                // process.stderr.write(`${logPrefix} WARN - Invalidated session was active. Resetting active session to default.\\n`);
                setActiveSessionId(defaultSessionId);
            }
            return null;
        }
        // Session appears valid, make it active
        // process.stderr.write(`${logPrefix} Session validated. Setting as active.\\n`);
        setActiveSessionId(sessionId); // Set valid retrieved session as active
        return sessionObj;
    } catch (validationError) {
        // Log the raw validation error to stderr
        // process.stderr.write(`${logPrefix} Raw session validation error: ${validationError}\\n`);
        // process.stderr.write(`${logPrefix} Session validation error: ${validationError instanceof Error ? validationError.message : String(validationError)}\\n`);
        // process.stderr.write(`${logPrefix} Validation Error Stack: ${validationError instanceof Error ? validationError.stack : 'N/A'}\\n`);
        try { await sessionObj.browser.close(); } catch (e) { /* Ignore close error */ }
        browsers.delete(sessionId);
         // If the invalidated session was the active one, reset active to default
        if(activeSessionId === sessionId) {
            // process.stderr.write(`${logPrefix} WARN - Invalidated session was active during validation error. Resetting active session to default.\\n`);
            setActiveSessionId(defaultSessionId);
        }
        return null;
    }
}

// Function to close all managed browser sessions gracefully
export async function closeAllSessions(): Promise<void> {
  const logPrefix = `[SessionManager] ${new Date().toISOString()}:`;
  // process.stderr.write(`${logPrefix} Closing all sessions.\\n`);
  const closePromises: Promise<void>[] = [];
  for (const [id, session] of browsers.entries()) {
    if (session.browser) {
      // process.stderr.write(`${logPrefix} Closing session ${id}\\n`);
      closePromises.push(
        session.browser.close().catch(e => {
          // process.stderr.write(`${logPrefix} Error closing session ${id}: ${e instanceof Error ? e.message : String(e)}\\n`);
        })
      );
    }
  }
  await Promise.all(closePromises); // Wait for all closes to attempt
  browsers.clear();
  defaultBrowserSession = null; // Ensure default session reference is cleared
  setActiveSessionId(defaultSessionId); // Reset active session to default after closing all
  // process.stderr.write(`${logPrefix} All sessions closed and cleared.\\n`);
}
