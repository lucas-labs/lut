import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { ArrowDown01Icon, ArrowReloadHorizontalIcon, Globe02Icon, LinkSquare02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

type PortPreset = {
  port: number;
  label: string;
  hint: string;
};

// Curated dev-server ports. Ordered by frontend frequency, then backend.
const PORT_PRESETS: readonly PortPreset[] = [
  { port: 5173, label: 'Vite', hint: 'vite, sveltekit' },
  { port: 5174, label: 'Vite (alt)', hint: 'second vite instance' },
  { port: 3000, label: 'Next.js', hint: 'next, express, rails' },
  { port: 3001, label: 'Next.js (alt)', hint: 'second next instance' },
  { port: 4173, label: 'Vite preview', hint: 'vite preview' },
  { port: 4200, label: 'Angular', hint: 'angular cli' },
  { port: 4321, label: 'Astro', hint: 'astro' },
  { port: 5500, label: 'Live Server', hint: 'vscode live server' },
  { port: 6006, label: 'Storybook', hint: 'storybook' },
  { port: 8080, label: 'Webpack', hint: 'webpack, vue cli' },
  { port: 8081, label: 'Metro', hint: 'react native metro' },
  { port: 8000, label: 'Django / FastAPI', hint: 'django, fastapi' },
  { port: 8888, label: 'Jupyter', hint: 'jupyter notebook' },
  { port: 5000, label: 'Flask', hint: 'flask' },
  { port: 7860, label: 'Gradio', hint: 'gradio' },
  { port: 11434, label: 'Ollama', hint: 'ollama api' },
];

/** The toolbar controls of the redesigned tools (as the git history toolbar). */
const TOOL =
  'flex h-[26px] shrink-0 items-center gap-1.5 rounded-md border border-border px-2 text-xs whitespace-nowrap text-foreground outline-none hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50';
const ICON_TOOL = `${TOOL} w-[26px] justify-center px-0`;

export type PreviewAddressBarHandle = {
  focus: () => void;
};

type Props = {
  url: string;
  onSubmit: (url: string) => void;
  onReload: () => void;
};

export const PreviewAddressBar = forwardRef<PreviewAddressBarHandle, Props>(function PreviewAddressBar(
  { url, onSubmit, onReload },
  ref,
) {
  const [draft, setDraft] = useState(url);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep draft in sync when the parent updates the URL externally
  // (AI tool, detected localhost chip, etc.).
  useEffect(() => {
    setDraft(url);
  }, [url]);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        el.select();
      },
    }),
    [],
  );

  const [notice, setNotice] = useState<string | null>(null);
  const [checkingPort, setCheckingPort] = useState<number | null>(null);

  const submit = () => {
    const next = normalizeUrl(draft);
    if (!next) {
      setNotice('Enter a URL or pick a port preset.');
      return;
    }
    setNotice(null);
    if (next !== url) onSubmit(next);
    else onReload();
  };

  const tryPort = async (port: number) => {
    setNotice(null);
    setCheckingPort(port);
    const url = `http://localhost:${port}`;
    const ok = await probeUrl(url);
    setCheckingPort(null);
    if (!ok) {
      setNotice(`No server listening on :${port}.`);
      return;
    }
    setDraft(url);
    onSubmit(url);
  };

  return (
    <div className="shrink-0 border-b border-border">
      <div className="flex h-11 items-center gap-2 px-4">
        <button type="button" onClick={onReload} title="Reload" aria-label="Reload" className={ICON_TOOL}>
          <HugeiconsIcon icon={ArrowReloadHorizontalIcon} size={13} strokeWidth={1.5} />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" title="Common dev-server ports" className={TOOL}>
              <HugeiconsIcon icon={Globe02Icon} size={13} strokeWidth={1.5} className="shrink-0" />
              <span className="hidden sm:inline">Ports</span>
              <HugeiconsIcon icon={ArrowDown01Icon} size={12} strokeWidth={1.75} className="shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-80 min-w-56 overflow-y-auto">
            {PORT_PRESETS.map((p) => (
              <DropdownMenuItem
                key={p.port}
                onSelect={(e) => {
                  e.preventDefault();
                  void tryPort(p.port);
                }}
              >
                <span className="flex-1">{p.label}</span>
                <span className="text-xs text-muted-foreground">
                  {checkingPort === p.port ? 'checking…' : `:${p.port}`}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Input
          ref={inputRef}
          value={draft}
          placeholder="http://localhost:3000"
          aria-label="Preview URL"
          spellCheck={false}
          autoComplete="off"
          className="h-[26px] min-w-0 flex-1 border-border"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setDraft(url);
              inputRef.current?.blur();
            }
          }}
        />
        <button
          type="button"
          onClick={() => {
            if (url) void openUrl(url).catch(console.error);
          }}
          title="Open in system browser"
          aria-label="Open in system browser"
          className={ICON_TOOL}
          disabled={!url}
        >
          <HugeiconsIcon icon={LinkSquare02Icon} size={13} strokeWidth={1.5} />
        </button>
      </div>
      {notice ? (
        <div className="flex items-center gap-1.5 border-t border-border bg-warning/10 px-4 py-1 text-[11px] text-warning">
          <span className="truncate">{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="ml-auto rounded px-1 text-[11px] opacity-80 hover:bg-warning/15 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      ) : null}
    </div>
  );
});

async function probeUrl(url: string): Promise<boolean> {
  try {
    await fetch(url, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      signal: AbortSignal.timeout(900),
    });
    return true;
  } catch {
    return false;
  }
}

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^localhost(:|\/|$)/i.test(trimmed)) return `http://${trimmed}`;
  if (/^\d{1,3}(\.\d{1,3}){3}(:|\/|$)/.test(trimmed)) return `http://${trimmed}`;
  if (/^[\w.-]+\.[a-z]{2,}/i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}
