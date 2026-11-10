import type { PreviewStack as PreviewStackType } from '@/modules/preview/PreviewStack';
import type { ComponentProps } from 'react';
import { lazy, Suspense } from 'react';

const PreviewStackInner = lazy(() =>
  import('@/modules/preview/PreviewStack').then((m) => ({
    default: m.PreviewStack,
  })),
);

type Props = ComponentProps<typeof PreviewStackType>;

export function PreviewStack(props: Props) {
  if (!props.tabs.some((tab) => tab.kind === 'preview' && !tab.cold)) return null;
  return (
    <Suspense fallback={null}>
      <PreviewStackInner {...props} />
    </Suspense>
  );
}
