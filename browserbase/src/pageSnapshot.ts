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

// Use types from playwright-core consistent with the project
import type { Page, FrameLocator, Locator } from 'playwright-core';
import yaml from 'yaml';
// Import specific YAML types, remove Scalar from type-only
// Removed YAML types no longer needed by this version
import { Writable } from 'stream'; // Import Writable for process.stderr - KEEPING this as it might be used elsewhere implicitly, though not directly in this class version

type PageOrFrameLocator = Page | FrameLocator;

export class PageSnapshot {
  private _frameLocators: PageOrFrameLocator[] = [];
  private _text!: string;
  // Removed _snapshotDoc as it's not used in this version

  constructor() {
  }

  static async create(page: Page): Promise<PageSnapshot> {
    const snapshot = new PageSnapshot();
    await snapshot._build(page);
    return snapshot;
  }

  text(): string {
    return this._text;
  }

  private async _build(page: Page) {
    // Removed storing to _snapshotDoc
    const yamlDocument = await this._snapshotFrame(page);
    this._text = [
      `- Page Snapshot`,
      '```yaml',
      // Generate text directly from the returned document
      yamlDocument.toString({ indentSeq: false }).trim(),
      '```',
    ].join('\n');
  }

  // Reverted _snapshotFrame to match the provided example exactly
  private async _snapshotFrame(frame: Page | FrameLocator) {
    const frameIndex = this._frameLocators.push(frame) - 1;
    // Removed logging from this version
    let snapshotString = '';
    try {
        snapshotString = await (frame.locator('body') as any).ariaSnapshot({ ref: true, emitGeneric: true });
    } catch (e) {
        // Simple error string, removed logging
        snapshotString = `error: Could not take snapshot. Error: ${e instanceof Error ? e.message : String(e)}`;
    }

    const snapshot = yaml.parseDocument(snapshotString);

    const visit = async (node: any): Promise<unknown> => {
      if (yaml.isPair(node)) {
        await Promise.all([
          visit(node.key).then(k => node.key = k),
          visit(node.value).then(v => node.value = v)
        ]);
      } else if (yaml.isSeq(node) || yaml.isMap(node)) {
        const items = [...node.items];
        node.items = await Promise.all(items.map(visit));
      } else if (yaml.isScalar(node)) {
        if (typeof node.value === 'string') {
          const value = node.value;
          // Simplified frame prefixing logic from example
          if (frameIndex > 0)
            node.value = value.replace('[ref=', `[ref=f${frameIndex}`);

          if (value.startsWith('iframe ')) {
            const ref = value.match(/\[ref=(.*)\]/)?.[1]; // Original regex from example
            if (ref) {
              try {
                // Original iframe locator strategy from example
                const childFrameLocator = frame.frameLocator(`aria-ref=${ref}`);
                const childSnapshot = await this._snapshotFrame(childFrameLocator);
                // Original createPair structure
                return snapshot.createPair(node.value, childSnapshot);
              } catch (error) {
                 // Original error handling
                return snapshot.createPair(node.value, '<could not take iframe snapshot>');
              }
            }
          }
        }
      }
      return node;
    };


    if (snapshot.contents) {
        await visit(snapshot.contents);
    } else {
        // Handle empty snapshot doc contents like original
        const emptyMapDoc = yaml.parseDocument('{}');
        snapshot.contents = emptyMapDoc.contents;
    }
    // Removed logging
    return snapshot; // Return the processed document
  }

  // Removed findNodeByRef helper

  // Removed extractRoleAndName helper


  // Reverted refLocator to match the provided example exactly
  refLocator(ref: string): Locator {
    let frameIndex = 0;
    let frame: PageOrFrameLocator;
    let targetRef = ref;

    const match = ref.match(/^f(\d+)(.*)/);
    if (match) {
      frameIndex = parseInt(match[1], 10);
      targetRef = match[2];
    }

    if (this._frameLocators.length === 0) {
        throw new Error(`Frame locators not initialized. Cannot find frame for ref '${ref}'.`);
    }

     if (frameIndex < 0 || frameIndex >= this._frameLocators.length) {
        throw new Error(`Validation Error: Frame index ${frameIndex} derived from ref '${ref}' is out of bounds (found ${this._frameLocators.length} frames).`);
     }
     frame = this._frameLocators[frameIndex];

    if (!frame)
      throw new Error(`Frame (index ${frameIndex}) could not be determined. Provide ref from the most current snapshot.`);

    // Removed console warnings and complex strategy
    // Use the exact locator strategy from the Playwright MCP example
    return frame.locator(`aria-ref=${targetRef}`);
  }
}
