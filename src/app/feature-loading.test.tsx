import { EditorStack } from '@/modules/editor/EditorStackLazy';
import { GitDiffStack } from '@/modules/editor/GitDiffStackLazy';
import { GitHistoryStack } from '@/modules/git-history/GitHistoryStackLazy';
import { MarkdownStack } from '@/modules/markdown/MarkdownStackLazy';
import { PreviewStack } from '@/modules/preview/PreviewStackLazy';
import { type ComponentType, createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

const loads = vi.hoisted(() => ({
  editor: vi.fn(),
  git: vi.fn(),
  markdown: vi.fn(),
  history: vi.fn(),
  preview: vi.fn(),
}));
vi.mock('@/modules/editor/EditorStack', () => {
  loads.editor();
  return { EditorStack: () => null };
});
vi.mock('@/modules/editor/GitDiffStack', () => {
  loads.git();
  return { GitDiffStack: () => null };
});
vi.mock('@/modules/markdown/MarkdownStack', () => {
  loads.markdown();
  return { MarkdownStack: () => null };
});
vi.mock('@/modules/preview/PreviewStack', () => {
  loads.preview();
  return { PreviewStack: () => null };
});
vi.mock('@/modules/git-history/GitHistoryStack', () => {
  loads.history();
  return { GitHistoryStack: () => null };
});

const stacks = [EditorStack, GitDiffStack, MarkdownStack, GitHistoryStack, PreviewStack];
function render(stack: (typeof stacks)[number], tabs: unknown[], activeId = 1) {
  return renderToString(
    createElement(stack as ComponentType<{ tabs: unknown[]; activeId: number }>, { tabs, activeId }),
  );
}

it('does not import unused features when rendering a terminal or cold restored tabs', async () => {
  const tabs = [
    { id: 1, kind: 'terminal' },
    { id: 2, kind: 'editor', cold: true },
    { id: 3, kind: 'markdown', cold: true },
    { id: 5, kind: 'git-diff' },
    { id: 6, kind: 'git-history' },
    { id: 7, kind: 'preview', cold: true },
  ];
  for (const stack of stacks) expect(render(stack, tabs)).toBe('');
  await new Promise<void>((resolve) => setImmediate(resolve));
  for (const load of Object.values(loads)) expect(load).not.toHaveBeenCalled();
});

it('loads each feature when its first live surface is needed', async () => {
  const kinds = ['editor', 'git-commit-file', 'markdown', 'git-history', 'preview'];
  stacks.forEach((stack, index) => {
    render(stack, [{ id: 1, kind: kinds[index] }]);
  });
  await vi.waitFor(() => {
    for (const load of Object.values(loads)) expect(load).toHaveBeenCalledOnce();
  });
});
