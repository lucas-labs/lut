// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarkdownCode } from './markdown-code';
import { MermaidDiagram } from './MermaidDiagram';

const mermaid = vi.hoisted(() => ({ initialize: vi.fn(), render: vi.fn() }));
vi.mock('mermaid', () => ({ default: mermaid }));

const theme = vi.hoisted(() => ({ resolvedMode: 'dark' as 'dark' | 'light', activeTheme: { id: 'lut' } }));
vi.mock('@/modules/theme', () => ({ useTheme: () => theme }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FLOW = 'flowchart LR\n  A --> B';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mermaid.initialize.mockReset();
  mermaid.render.mockReset();
  theme.resolvedMode = 'dark';
  theme.activeTheme = { id: 'lut' };
  document.documentElement.style.setProperty('--background', '#0f1211');
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

/** Lets the frame callback, the dynamic import and mermaid's render settle. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

async function draw(code: string) {
  act(() => root.render(createElement(MermaidDiagram, { code })));
  await settle();
}

describe('MermaidDiagram', () => {
  it('draws a valid diagram as SVG with strict security and the app theme', async () => {
    mermaid.render.mockResolvedValue({ svg: '<svg data-testid="diagram"><g></g></svg>' });

    await draw(FLOW);

    expect(host.querySelector('svg[data-testid="diagram"]')).not.toBeNull();
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(mermaid.render).toHaveBeenCalledWith(expect.stringMatching(/^mermaid-/), FLOW);
    const config = mermaid.initialize.mock.calls[0]?.[0];
    expect(config).toMatchObject({ securityLevel: 'strict', theme: 'base', startOnLoad: false });
    expect(config.themeVariables).toMatchObject({ darkMode: true, background: '#0f1211' });
  });

  it('opens the diagram enlarged on click, as an image', async () => {
    mermaid.render.mockResolvedValue({ svg: '<svg data-testid="diagram" style="max-width: 320px;"></svg>' });
    await draw(FLOW);

    const open = host.querySelector<HTMLButtonElement>('button[aria-label="Enlarge diagram"]');
    expect(open?.style.width).toBe('320px');
    expect(open?.closest('.rounded-lg.border')).toBeNull();
    act(() => open?.click());

    expect(document.querySelectorAll('[role="dialog"] svg[data-testid="diagram"]')).toHaveLength(1);
  });

  it('shows the error over the source for an invalid diagram', async () => {
    mermaid.render.mockResolvedValueOnce({ svg: '<svg data-testid="diagram"></svg>' });
    await draw(FLOW);
    mermaid.render.mockRejectedValueOnce(new Error('Parse error on line 2'));

    await draw('flowchart LR\n  A -->');

    expect(host.querySelector('[role="alert"]')?.textContent).toBe('Parse error on line 2');
    expect(host.querySelector('pre')?.textContent).toBe('flowchart LR\n  A -->');
    expect(host.querySelector('svg[data-testid="diagram"]')).toBeNull();
  });

  it('draws again in the new colours when the theme changes', async () => {
    mermaid.render.mockResolvedValue({ svg: '<svg></svg>' });
    await draw(FLOW);

    theme.resolvedMode = 'light';
    theme.activeTheme = { id: 'lut' };
    await draw(FLOW);

    expect(mermaid.render).toHaveBeenCalledTimes(2);
    expect(mermaid.initialize.mock.calls[1]?.[0].themeVariables).toMatchObject({ darkMode: false });
  });
});

describe('MarkdownCode', () => {
  it('hands a mermaid fence to the diagram', async () => {
    mermaid.render.mockResolvedValue({ svg: '<svg data-testid="diagram"></svg>' });

    act(() =>
      root.render(
        createElement(MarkdownCode, { className: 'language-mermaid', 'data-block': 'true', children: `${FLOW}\n` }),
      ),
    );
    await settle();

    expect(mermaid.render).toHaveBeenCalledWith(expect.any(String), FLOW);
    expect(host.querySelector('svg[data-testid="diagram"]')).not.toBeNull();
  });
});
