import {
  chromium,
  Browser,
  Page,
  errors as PlaywrightErrors,
} from "playwright-core";
import { Browserbase } from "@browserbasehq/sdk";
import type { Config } from "./config.js"; // Import Config type

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
  console.log(`[SessionManager] Attempting to set active session ID to: ${id}`); // Replaced logger.info
  if (browsers.has(id) || id === defaultSessionId) {
    activeSessionId = id;
    console.log(`[SessionManager] Successfully set active session ID to: ${id}`); // Replaced logger.info
  } else {
    console.warn( // Replaced logger.warn
      `[SessionManager] Attempted to set active session ID to non-existent session: ${id}. Keeping current: ${activeSessionId}`,
    );
  }
}

/**
 * Gets the active session ID.
 * @returns The active session ID.
 */
export function getActiveSessionId(): string { // Added 'export function'
  console.log(`[SessionManager] Getting active session ID. Current value: ${activeSessionId}`); // Replaced logger.info
  return activeSessionId;
}

// Function to create a new Browserbase session and connect Playwright
export async function createNewBrowserSession(
  newSessionId: string,
  config: Config // Accept config object
): Promise<BrowserSession> {
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

  const session = await bb.sessions.create({
    // Use non-null assertion after check
    projectId: config.browserbaseProjectId!,
    proxies: true, // Consider making this configurable via Config
  });

  const browser = await chromium.connectOverCDP(session.connectUrl);

  // Handle unexpected disconnects
  browser.on("disconnected", () => {
    browsers.delete(newSessionId);
    // If the disconnected browser was the default one, clear the global reference
    if (defaultBrowserSession && defaultBrowserSession.browser === browser) {
      defaultBrowserSession = null;
      // If the default session disconnects, maybe reset activeId? Or let ensure handle it?
      // For now, we won't reset activeSessionId here, ensureDefaultSessionInternal will handle creating a new default.
    }
    // If a non-default active session disconnects, reset to default
    if (activeSessionId === newSessionId && newSessionId !== defaultSessionId) {
      console.warn(`[SessionManager] Active session ${newSessionId} disconnected. Resetting active session ID to default.`); // Replaced logger.warn
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
  console.log(`[SessionManager.createNew] Created and set active session ID to: ${newSessionId}`); // Replaced logger.info

  return sessionObj;
}

// Internal function to ensure default session, passes config down
export async function ensureDefaultSessionInternal(config: Config): Promise<BrowserSession> {
  const sessionId = defaultSessionId;
  let sessionNeedsUpdate = false;
  try {
    // Check if default session exists
    if (!defaultBrowserSession) {
      console.log("[SessionManager.ensureDefault] Default session object not found, creating a new one."); // Replaced logger.info
      sessionNeedsUpdate = true;
    // Check if browser disconnected or page closed
    } else if (!defaultBrowserSession.browser.isConnected() || defaultBrowserSession.page.isClosed()) {
       console.log("[SessionManager.ensureDefault] Default session browser disconnected or page closed, recreating."); // Replaced logger.info
      try {
        // Attempt to close the old browser instance cleanly
        await defaultBrowserSession.browser.close();
      } catch (closeError) {
        console.error(`[SessionManager.ensureDefault] Error closing disconnected/closed session: ${closeError instanceof Error ? closeError.message : String(closeError)}`); // Replaced logger.error
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
       console.log("[SessionManager.ensureDefault] New default session created."); // Replaced logger.info
       // No need to call setActiveSessionId here, createNewBrowserSession does it.
       return defaultBrowserSession;
    }

    // If we reached here, the existing default session seems okay initially.
    console.log("[SessionManager.ensureDefault] Existing default session seems connected."); // Replaced logger.info
    setActiveSessionId(defaultSessionId); // Ensure default is marked active if we are using it
    return defaultBrowserSession!; // Non-null assertion as it's checked/created above

  } catch (error) {
    console.error(`[SessionManager.ensureDefault] Error during default session ensuring process: ${error instanceof Error ? error.message : String(error)}`); // Replaced logger.error

    // More robust error handling: attempt to close browser if it exists
    const problematicSession = browsers.get(defaultSessionId);
    if (problematicSession?.browser?.isConnected()) {
      try {
        await problematicSession.browser.close();
        browsers.delete(defaultSessionId); // Clean up map if close succeeds
      } catch (e) {
        console.error(`[SessionManager.ensureDefault] Error closing browser during error handling: ${e instanceof Error ? e.message : String(e)}`); // Replaced logger.error
      }
    } else {
      // Ensure cleanup even if browser wasn't connected or session didn't exist
      browsers.delete(defaultSessionId);
    }

    // Re-throw the error after attempting cleanup? Or try recreating?
    // Let's try recreating once.
    console.log("[SessionManager.ensureDefault] Recreating session after critical error or timeout."); // Replaced logger.info
    try {
      const newSession = await createNewBrowserSession(defaultSessionId, config);
      browsers.set(defaultSessionId, newSession);
      activeSessionId = defaultSessionId; // Set as active
      return newSession;
    } catch (retryError) {
      console.error(`[SessionManager.ensureDefault] Failed to recreate session after error: ${retryError instanceof Error ? retryError.message : String(retryError)}`); // Replaced logger.error
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
    if (sessionId === defaultSessionId) {
        try {
            // ensureDefaultSessionInternal handles creation and setting active ID
            return await ensureDefaultSessionInternal(config); 
        } catch (error) {
            console.error(`[SessionManager.getSession] Error ensuring default session: ${error}`); // Replaced logger.error
            return null;
        }
    }

    // For non-default sessions
    console.log(`[SessionManager.getSession] Attempting to retrieve non-default session: ${sessionId}`); // Replaced logger.info
    let sessionObj = browsers.get(sessionId);
    if (!sessionObj) {
        console.warn(`[SessionManager.getSession] Session ${sessionId} not found in map.`); // Replaced logger.warn
        return null;
    }

    // Validate the found session
    try {
        if (!sessionObj.browser.isConnected() || sessionObj.page.isClosed()) {
            console.warn(`[SessionManager.getSession] Session ${sessionId} browser disconnected or page closed. Cleaning up.`); // Replaced logger.warn
            try { await sessionObj.browser.close(); } catch (e) { /* Ignore close error */ }
            browsers.delete(sessionId);
             // If the invalidated session was the active one, reset active to default
            if(activeSessionId === sessionId) {
                console.warn(`[SessionManager.getSession] Invalidated session ${sessionId} was active. Resetting active session to default.`); // Replaced logger.warn
                setActiveSessionId(defaultSessionId);
            }
            return null;
        }
        // Session appears valid, make it active
        console.log(`[SessionManager.getSession] Session ${sessionId} validated. Setting as active.`); // Replaced logger.info
        setActiveSessionId(sessionId); // Set valid retrieved session as active
        return sessionObj;
    } catch (validationError) {
        console.error(`[SessionManager.getSession] Session validation error for ${sessionId}: ${validationError instanceof Error ? validationError.message : String(validationError)}`); // Replaced logger.error
        try { await sessionObj.browser.close(); } catch (e) { /* Ignore close error */ }
        browsers.delete(sessionId);
         // If the invalidated session was the active one, reset active to default
        if(activeSessionId === sessionId) {
            console.warn(`[SessionManager.getSession] Invalidated session ${sessionId} was active during validation error. Resetting active session to default.`); // Replaced logger.warn
            setActiveSessionId(defaultSessionId);
        }
        return null;
    }
}

// Function to close all managed browser sessions gracefully
export async function closeAllSessions(): Promise<void> {
  console.log("[SessionManager] Closing all sessions."); // Replaced logger.info
  const closePromises: Promise<void>[] = [];
  for (const [id, session] of browsers.entries()) {
    if (session.browser) {
      console.log(`[SessionManager] Closing session ${id}`); // Replaced logger.info
      closePromises.push(
        session.browser.close().catch(e => {
           console.error(`[SessionManager] Error closing session ${id}: ${e instanceof Error ? e.message : String(e)}`); // Replaced logger.error
        })
      );
    }
  }
  await Promise.all(closePromises); // Wait for all closes to attempt
  browsers.clear();
  defaultBrowserSession = null; // Ensure default session reference is cleared
  setActiveSessionId(defaultSessionId); // Reset active session to default after closing all
  console.log("[SessionManager] All sessions closed and cleared."); // Replaced logger.info
}
