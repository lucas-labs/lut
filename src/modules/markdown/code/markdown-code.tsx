'use client';

import { isValidElement, type ReactNode } from 'react';
import { ChatCodeBlock } from './chat-code';
import { MermaidDiagram } from './MermaidDiagram';

export function markdownCodeText(children?: ReactNode): string {
  if (children == null || typeof children === 'boolean') return '';
  if (typeof children === 'string' || typeof children === 'number') {
    return String(children);
  }
  if (Array.isArray(children)) {
    return children.map((child) => markdownCodeText(child)).join('');
  }
  if (isValidElement<{ children?: ReactNode }>(children)) {
    return markdownCodeText(children.props.children);
  }
  return '';
}

/**
 * Streamdown `components.code` override. Handles both inline (`code`) and fenced blocks: Streamdown's `pre` marks the
 * code inside it with `data-block`, with or without a language ("language-X"). Fenced blocks delegate to the
 * Lezer-based renderer (plain text without a language); inline stays a plain pill.
 */
export function MarkdownCode({
  className,
  children,
  node: _node,
  ...rest
}: {
  className?: string;
  children?: ReactNode;
  node?: unknown;
  'data-block'?: string;
}) {
  const match = className?.match(/language-([\w+#.-]+)/);
  const { 'data-block': block, ...props } = rest;
  if (!match && block === undefined) {
    return (
      <code
        className="rounded-[4px] border border-border bg-card px-[5px] py-px font-mono text-[12.5px] text-foreground"
        {...props}
      >
        {children}
      </code>
    );
  }

  const code = markdownCodeText(children).replace(/\n$/, '');
  if (match?.[1] === 'mermaid') return <MermaidDiagram code={code} />;
  return <ChatCodeBlock code={code} lang={match?.[1] ?? null} />;
}
