import type { GitHistoryStack as GitHistoryStackType } from '@/modules/git-history/GitHistoryStack';
import type { ComponentProps } from 'react';
import { lazy, Suspense } from 'react';

const GitHistoryStackInner = lazy(() =>
  import('@/modules/git-history/GitHistoryStack').then((m) => ({
    default: m.GitHistoryStack,
  })),
);

type Props = ComponentProps<typeof GitHistoryStackType>;

export function GitHistoryStack(props: Props) {
  if (!props.tabs.some((tab) => tab.kind === 'git-history' && tab.id === props.activeId)) return null;
  return (
    <Suspense fallback={null}>
      <GitHistoryStackInner {...props} />
    </Suspense>
  );
}
