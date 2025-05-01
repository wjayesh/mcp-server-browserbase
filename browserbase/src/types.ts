import { Browser, Page } from "playwright-core";

export interface BrowserSession {
  browser: Browser;
  page: Page;
} 