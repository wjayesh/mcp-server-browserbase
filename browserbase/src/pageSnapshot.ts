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
import { Writable } from 'stream'; // Import Writable for process.stderr

type PageOrFrameLocator = Page | FrameLocator;

export class PageSnapshot {
  private _frameLocators: PageOrFrameLocator[] = [];
  private _text!: string;

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
    const yamlDocument = await this._snapshotFrame(page);
    this._text = [
      `- Page Snapshot`,
      '```yaml',
      yamlDocument.toString({ indentSeq: false }).trim(),
      '```',
    ].join('\n');
  }

  private async _snapshotFrame(frame: PageOrFrameLocator) {
    const frameIndex = this._frameLocators.push(frame) - 1;
    const logPrefix = `[PageSnapshot Frame ${frameIndex}] ${new Date().toISOString()}:`; // Added for logging
    let snapshotString = '';
    try {
        // process.stderr.write(`${logPrefix} Attempting frame.locator('body').ariaSnapshot({ ref: true, emitGeneric: true })\\n`);
        snapshotString = await (frame.locator('body') as any).ariaSnapshot({ ref: true, emitGeneric: true });
        // process.stderr.write(`${logPrefix} Raw ariaSnapshot output:\\nSTART>>>\\n${snapshotString}\\n<<<END\\n`);
    } catch (e) {
        // process.stderr.write(`${logPrefix} ERROR during ariaSnapshot call: ${e}\\n`);
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
        node.items = await Promise.all(node.items.map(visit));
      } else if (yaml.isScalar(node)) {
        if (typeof node.value === 'string') {
          const value = node.value;
          if (frameIndex > 0) {
            node.value = value.replace('[ref=', `[ref=f${frameIndex}`);
          }
          if (value.startsWith('iframe ')) {
            const refMatch = value.match(/\[ref=(.*)\]/)?.[1]; // Use different var name
            if (refMatch) {
              try {
                // Use the original example's frameLocator logic, adjusted for potential name collision
                const childFrameLocator = frame.frameLocator(`[aria-ref="${refMatch}"]`); // Assuming ref is simple ID
                const childSnapshot = await this._snapshotFrame(childFrameLocator);
                return snapshot.createPair(node.value, childSnapshot);
              } catch (error) {
                // process.stderr.write(`${logPrefix} ERROR snapshotting iframe ref ${refMatch}: ${error}\\n`);
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
        // process.stderr.write(`${logPrefix} WARN - Snapshot resulted in empty contents.\\n`);
        const emptyMapDoc = yaml.parseDocument('{}');
        snapshot.contents = emptyMapDoc.contents;
    }
    return snapshot;
  }


  refLocator(ref: string): Locator {
    let frameIndex = 0;
    let frame = this._frameLocators[0];
    const match = ref.match(/^f(\d+)(.*)/);
    if (match) {
      frameIndex = parseInt(match[1], 10);
      // Add boundary check
      if (frameIndex < 0 || frameIndex >= this._frameLocators.length) {
          throw new Error(`Validation Error: Frame index ${frameIndex} derived from ref '${ref}' is out of bounds (found ${this._frameLocators.length} frames).`);
      }
      frame = this._frameLocators[frameIndex];
      ref = match[2]; // Use the ref part *after* the frame index
    }

    if (!frame)
      throw new Error(`Frame (index ${frameIndex}) does not exist. Provide ref from the most current snapshot.`);

    // Use the final ref part (potentially stripped of frame prefix) for the locator
    return frame.locator(`[aria-ref="${ref}"]`);
  }
}
