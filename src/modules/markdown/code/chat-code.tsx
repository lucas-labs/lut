'use client';

import { cn } from '@/lib/utils';
import { CheckmarkCircle01Icon, CopyIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { memo, useEffect, useRef, useState } from 'react';
import { highlight, type HighlightedNode, isHighlightable } from './chat-code-lezer';

const POSIX_SHELL = new Set(['bash', 'sh', 'zsh', 'shell', 'console', 'shellscript']);
const WINDOWS_SHELL = new Set(['powershell', 'pwsh', 'ps1', 'ps', 'cmd', 'bat', 'batch']);
const SHELL_LANGS = new Set([...POSIX_SHELL, ...WINDOWS_SHELL]);

function shellPrompt(lang: string): string {
  if (WINDOWS_SHELL.has(lang)) return lang === 'cmd' || lang === 'bat' || lang === 'batch' ? '>' : 'PS>';
  return '$';
}

function normalizeLangLabel(raw: string): string {
  const lower = raw.toLowerCase();
  if (POSIX_SHELL.has(lower)) return 'bash';
  if (lower === 'pwsh' || lower === 'ps1' || lower === 'ps') return 'powershell';
  if (lower === 'bat' || lower === 'batch') return 'cmd';
  return lower || 'text';
}

export type ChatCodeBlockProps = {
  code: string;
  lang: string | null;
};

export function ChatCodeBlock({ code, lang }: ChatCodeBlockProps) {
  const label = normalizeLangLabel(lang ?? '');

  if (SHELL_LANGS.has(label)) {
    return <CommandCard code={code} lang={label} />;
  }

  return <FinalizedCodeBlock code={code} lang={label} />;
}

export const CODE_BODY = 'm-0 px-3.5 py-2.5 font-mono text-[12.5px] leading-5 text-foreground';

/** Every code block's frame: the language and a Copy button over the code. */
export function BlockChrome({ label, code, children }: { label: string; code: string; children: React.ReactNode }) {
  return (
    <div className="not-prose mt-2 mb-3.5 overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex h-7 items-center justify-between gap-2 border-b border-border pr-2 pl-3.5 text-[11px] text-muted-foreground">
        <span>{label}</span>
        <CopyButton text={code} />
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

function FinalizedCodeBlock({ code, lang }: { code: string; lang: string }) {
  if (!isHighlightable(lang)) {
    return (
      <BlockChrome label={lang} code={code}>
        <pre className={CODE_BODY}>{code}</pre>
      </BlockChrome>
    );
  }
  return (
    <BlockChrome label={lang} code={code}>
      <HighlightedPre code={code} lang={lang} />
    </BlockChrome>
  );
}

const HighlightedPre = memo(function HighlightedPre({ code, lang }: { code: string; lang: string }) {
  const [nodes, setNodes] = useState<HighlightedNode[] | null>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    cancelRef.current = false;
    let cancelled = false;
    highlight(code, lang)
      .then((result) => {
        if (cancelled || cancelRef.current) return;
        setNodes(result);
      })
      .catch(() => {
        if (cancelled) return;
        setNodes(null);
      });
    return () => {
      cancelled = true;
      cancelRef.current = true;
    };
  }, [code, lang]);

  if (!nodes) {
    return <pre className={CODE_BODY}>{code}</pre>;
  }

  return (
    <pre className={CODE_BODY}>
      {nodes.map((node, i) =>
        node.kind === 'break' ? (
          // eslint-disable-next-line react/no-array-index-key
          <span key={i}>{'\n'}</span>
        ) : (
          // eslint-disable-next-line react/no-array-index-key
          <span key={i} className={node.cls || undefined}>
            {node.value}
          </span>
        ),
      )}
    </pre>
  );
});

/** A shell block: the same frame, with the shell's prompt before each line. */
function CommandCard({ code, lang }: { code: string; lang: string }) {
  const isMultiline = code.includes('\n');
  const prompt = shellPrompt(lang);
  return (
    <BlockChrome label={normalizeLangLabel(lang)} code={code}>
      <pre className={cn(CODE_BODY, isMultiline ? 'whitespace-pre' : 'whitespace-pre-wrap')}>
        {code.split('\n').map((line, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <span key={i} className="flex">
            <span className="mr-2 select-none text-muted-foreground/70">{prompt}</span>
            <span>{line}</span>
          </span>
        ))}
      </pre>
    </BlockChrome>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const tRef = useRef<number>(0);

  useEffect(() => () => window.clearTimeout(tRef.current), []);

  const onCopy = async () => {
    if (!navigator?.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      tRef.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* swallow */
    }
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      className="flex h-5 shrink-0 items-center gap-1 rounded-[4px] px-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      <HugeiconsIcon icon={copied ? CheckmarkCircle01Icon : CopyIcon} size={12} strokeWidth={1.5} aria-hidden />
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}
