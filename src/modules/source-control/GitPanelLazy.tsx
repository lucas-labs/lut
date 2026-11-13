import type { ComponentProps } from 'react';
import { lazy, Suspense } from 'react';
import type { GitPanel as GitPanelType } from './GitPanel';

const GitPanelInner = lazy(() =>
  import('./GitPanel').then((m) => ({
    default: m.GitPanel,
  })),
);

type Props = ComponentProps<typeof GitPanelType>;

export function GitPanel(props: Props) {
  return (
    <Suspense fallback={null}>
      <GitPanelInner {...props} />
    </Suspense>
  );
}
