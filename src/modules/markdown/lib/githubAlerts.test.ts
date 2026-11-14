import { describe, expect, it } from 'vitest';
import { ALERT_KINDS, rehypeGithubAlerts } from './githubAlerts';

type Node = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: Node[];
};

const text = (value: string): Node => ({ type: 'text', value });
const el = (tagName: string, children: Node[] = []): Node => ({
  type: 'element',
  tagName,
  properties: {},
  children,
});

/** A blockquote as remark-rehype builds it: line breaks between paragraphs and around them. */
const quote = (...paragraphs: Node[][]): Node =>
  el('blockquote', [text('\n'), ...paragraphs.flatMap((p) => [el('p', p), text('\n')])]);

const run = (node: Node) => {
  rehypeGithubAlerts()({ type: 'root', children: [node] });
  return node;
};

const paragraphs = (node: Node) => (node.children ?? []).filter((c) => c.tagName === 'p');

describe('rehypeGithubAlerts', () => {
  it.each(ALERT_KINDS)('marks a [!%s] quote as that alert and drops the marker', (kind) => {
    const node = run(quote([text(`[!${kind.toUpperCase()}]\nBody text.`)]));
    expect(node.properties?.dataAlert).toBe(kind);
    expect(paragraphs(node)[0].children).toEqual([text('Body text.')]);
  });

  it('reads the marker in any case', () => {
    expect(run(quote([text('[!Warning]\nCareful.')])).properties?.dataAlert).toBe('warning');
  });

  it('keeps the rest of a marker line', () => {
    const node = run(quote([text('[!TIP] Use the palette.')]));
    expect(paragraphs(node)[0].children).toEqual([text('Use the palette.')]);
  });

  it('drops a paragraph that held only the marker', () => {
    const node = run(quote([text('[!NOTE]')], [text('Second paragraph.')]));
    expect(node.properties?.dataAlert).toBe('note');
    expect(paragraphs(node).map((p) => p.children)).toEqual([[text('Second paragraph.')]]);
  });

  it('drops the line break after a marker alone on its line', () => {
    const node = run(quote([text('[!NOTE]'), el('br'), text('\nBody.')]));
    expect(paragraphs(node)[0].children).toEqual([text('\nBody.')]);
  });

  it('leaves a plain quote and an unknown kind alone', () => {
    const plain = run(quote([text('Restoring is a promise.')]));
    expect(plain.properties?.dataAlert).toBeUndefined();
    const unknown = run(quote([text('[!FOO]\nNot an alert.')]));
    expect(unknown.properties?.dataAlert).toBeUndefined();
    expect(paragraphs(unknown)[0].children).toEqual([text('[!FOO]\nNot an alert.')]);
  });
});
