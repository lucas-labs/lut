import { readFile } from 'node:fs/promises';
import { LutGhostty } from '@lut/ghostty-core/adapted';
import { beforeAll, describe, expect, it } from 'vitest';
import { AdaptedGhosttyTerminalModel } from './AdaptedGhosttyTerminalModel';

const encoder = new TextEncoder();
const ROWS = 6;
const PROMPT = '> ';
const START = '\x1b]133;A\x1b\\';
const END = '\x1b]133;B\x1b\\';

// nushell (reedline) prints its whole prompt again on every keystroke, OSC 133;A included. Through
// the Windows console (ConPTY) the marker can arrive before the cursor move back to the prompt's
// first column, so it lands at the end of the typed text (E14-20).
describe.each(['ghostty-vt', 'ghostty-vt-scalar'])('a prompt drawn again (%s)', (artifact) => {
  let core: LutGhostty;
  beforeAll(async () => {
    const file = await readFile(
      new URL(`../../../../packages/ghostty-core/adapted/${artifact}.wasm`, import.meta.url),
    );
    core = await LutGhostty.loadBytes(Uint8Array.from(file).buffer);
  });

  /** A screen full of output with the prompt on its last row. */
  function atPromptOnLastRow() {
    const model = new AdaptedGhosttyTerminalModel(core, {
      backend: 'ghostty-webgpu',
      cols: 40,
      rows: ROWS,
    });
    const write = (text: string) => model.write(encoder.encode(text));
    for (let line = 1; line < ROWS; line++) write(`output ${line}\r\n`);
    write(`${START}${PROMPT}${END}`);
    return { model, write, screen: () => model.readText(ROWS).split('\n') };
  }

  it('stays put when the marker of a redraw arrives before the cursor moves back', () => {
    const { model, write, screen } = atPromptOnLastRow();
    try {
      let typed = '';
      for (const key of 'ls -la') {
        typed += key;
        write(`${START}\x1b[${ROWS};1H${PROMPT}${END}${typed}\x1b[K`);
      }
      expect(screen()[0]).toBe('output 1');
      expect(screen()[ROWS - 1]).toBe(`${PROMPT}ls -la`);
    } finally {
      model.dispose();
    }
  });

  it('still starts a new prompt on its own line after output without a newline', () => {
    const { model, write, screen } = atPromptOnLastRow();
    try {
      write('\r\n\x1b]133;C\x1b\\partial');
      write(`\x1b]133;D;0\x1b\\${START}${PROMPT}${END}`);
      expect(screen().slice(-2)).toEqual(['partial', PROMPT.trimEnd()]);
    } finally {
      model.dispose();
    }
  });

  it('keeps the options a redraw marker sets, such as no redraw on resize', () => {
    const { model, write, screen } = atPromptOnLastRow();
    try {
      // redraw=0: the shell does not draw its prompt again after a resize, so the prompt stays.
      write(`\x1b]133;A;redraw=0\x1b\\\x1b[${ROWS};1H${PROMPT}${END}typed`);
      model.resize(30, ROWS);
      expect(screen()).toContain(`${PROMPT}typed`);
    } finally {
      model.dispose();
    }
  });

  it('starts the first prompt after a full reset on its own line', () => {
    const { model, write, screen } = atPromptOnLastRow();
    try {
      write(`\x1bcpartial${START}${PROMPT}${END}`);
      expect(screen().slice(0, 2)).toEqual(['partial', PROMPT.trimEnd()]);
    } finally {
      model.dispose();
    }
  });
});
