import { readFile } from 'node:fs/promises';
import { LutGhostty } from '@lut/ghostty-core/adapted';
import { beforeAll, describe, expect, it } from 'vitest';
import { AdaptedGhosttyTerminalModel } from './AdaptedGhosttyTerminalModel';

const encoder = new TextEncoder();

// A pane's padding goes while a full-screen program runs (E14-21): the model says when the terminal
// enters and leaves the alternate screen.
describe('the alternate screen', () => {
  let core: LutGhostty;
  beforeAll(async () => {
    const file = await readFile(
      new URL('../../../../packages/ghostty-core/adapted/ghostty-vt.wasm', import.meta.url),
    );
    core = await LutGhostty.loadBytes(Uint8Array.from(file).buffer);
  });

  it('is reported once on entering and once on leaving, as the output that switches it is written', () => {
    const model = new AdaptedGhosttyTerminalModel(core, {
      backend: 'ghostty-webgpu',
      cols: 40,
      rows: 6,
    });
    try {
      const seen: boolean[] = [];
      model.subscribeAlternateScreen((active) => seen.push(active));
      const write = (text: string) => model.write(encoder.encode(text));

      write('prompt> ');
      write('\x1b[?1049h');
      write('a full-screen program draws\x1b[2;1Hmore');
      expect(seen).toEqual([true]);
      expect(model.modes().alternateScreen).toBe(true);
      write('\x1b[?1049l');
      write('prompt> ');
      expect(seen).toEqual([true, false]);
    } finally {
      model.dispose();
    }
  });

  it('stops reporting once unsubscribed', () => {
    const model = new AdaptedGhosttyTerminalModel(core, {
      backend: 'ghostty-webgpu',
      cols: 40,
      rows: 6,
    });
    try {
      const seen: boolean[] = [];
      const unsubscribe = model.subscribeAlternateScreen((active) => seen.push(active));
      unsubscribe();
      model.write(encoder.encode('\x1b[?1049h'));
      expect(seen).toEqual([]);
    } finally {
      model.dispose();
    }
  });
});
