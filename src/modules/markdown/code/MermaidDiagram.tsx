import { cn } from '@/lib/utils';
import { useTheme } from '@/modules/theme';
import { useEffect, useId, useRef, useState } from 'react';
import { Enlargeable, ENLARGED_SIZE } from '../Enlargeable';
import { BlockChrome, CODE_BODY } from './chat-code';
import { mermaidThemeVariables, type ThemeToken, toHexColor } from './mermaidTheme';

type Drawn = { kind: 'pending' } | { kind: 'diagram'; svg: string } | { kind: 'error'; message: string };

/**
 * A ```mermaid block drawn as its diagram, which opens enlarged on click like an image. `mermaid` loads only when a
 * document has one. An invalid diagram shows mermaid's error over its source, in the code block's frame.
 */
export function MermaidDiagram({ code }: { code: string }) {
  const id = `mermaid-${useId().replace(/[^\w-]/g, '')}`;
  const { resolvedMode, activeTheme } = useTheme();
  const hostRef = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState<Drawn>({ kind: 'pending' });

  useEffect(() => {
    void activeTheme;
    let cancelled = false;
    // The provider writes the theme's variables in its own effect, after this one: read them on the next frame.
    const frame = requestAnimationFrame(() => {
      const root = getComputedStyle(document.documentElement);
      const token = (name: ThemeToken) => toHexColor(root.getPropertyValue(`--${name}`).trim());
      const fontFamily = hostRef.current ? getComputedStyle(hostRef.current).fontFamily : 'sans-serif';
      const themeVariables = mermaidThemeVariables(token, resolvedMode === 'dark', fontFamily);
      void loadMermaid()
        .then(async (mermaid) => {
          mermaid.initialize({
            startOnLoad: false,
            // Labels go through DOMPurify and `click` directives are ignored: the SVG lands in the app's own page.
            securityLevel: 'strict',
            suppressErrorRendering: true,
            theme: 'base',
            themeVariables,
            fontFamily,
          });
          const { svg } = await mermaid.render(id, code);
          if (!cancelled) setDrawn({ kind: 'diagram', svg });
        })
        .catch((error: unknown) => {
          if (!cancelled) setDrawn({ kind: 'error', message: errorText(error) });
        });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [id, code, resolvedMode, activeTheme]);

  return (
    <div ref={hostRef} className="my-4 font-sans">
      {drawn.kind === 'diagram' ? (
        <Enlargeable
          label="Enlarge diagram"
          title="Diagram"
          description="The diagram at full size."
          className="mx-auto block"
          style={{ width: diagramWidth(drawn.svg) }}
          enlarged={
            <SvgMarkup svg={drawn.svg} className={cn(ENLARGED_SIZE, '[&>svg]:size-full [&>svg]:max-w-none!')} />
          }
        >
          <SvgMarkup svg={drawn.svg} className="[&>svg]:mx-auto [&>svg]:h-auto [&>svg]:w-full" />
        </Enlargeable>
      ) : drawn.kind === 'error' ? (
        <BlockChrome label="mermaid" code={code}>
          <p
            role="alert"
            className="m-0 border-b border-border px-3.5 py-2 font-mono text-[11px] leading-4 whitespace-pre-wrap text-destructive"
          >
            {drawn.message}
          </p>
          <pre className={CODE_BODY}>{code}</pre>
        </BlockChrome>
      ) : (
        <p className="text-[12px] text-muted-foreground">Drawing diagram…</p>
      )}
    </div>
  );
}

/** Mermaid's SVG, as it drew it: strict mode output, sanitized by its DOMPurify pass. */
function SvgMarkup({ svg, className }: { svg: string; className?: string }) {
  return <span className={cn('block', className)} dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** The width mermaid drew the diagram at (its `max-width`), so the zoom button is exactly the diagram. */
function diagramWidth(svg: string): string {
  const width = /max-width:\s*([\d.]+)px/.exec(svg)?.[1];
  return width ? `${width}px` : '100%';
}

/** Outside the component: the React Compiler does not handle `import()` expressions. */
function loadMermaid() {
  return import('mermaid').then((m) => m.default);
}

function errorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.trim() || 'Invalid diagram.';
}
