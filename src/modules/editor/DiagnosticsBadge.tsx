import { AlertIcon, CancelCircleIcon } from '@lut/lut-icons';
import { useDiagnosticsStore } from './lib/diagnosticsStore';

type Props = {
  filePath: string | null;
};

export function DiagnosticsBadge({ filePath }: Props) {
  const counts = useDiagnosticsStore((s) => (filePath ? s.byPath[filePath] : undefined));
  if (!counts || (counts.errors === 0 && counts.warnings === 0)) return null;

  return (
    <span className="lut-pill-in flex shrink-0 cursor-default items-center gap-2 tabular-nums">
      {counts.errors > 0 ? (
        <span className="flex items-center gap-0.5 text-destructive">
          <CancelCircleIcon size="xs" />
          {counts.errors}
        </span>
      ) : null}
      {counts.warnings > 0 ? (
        <span className="flex items-center gap-0.5 text-warning">
          <AlertIcon size="xs" />
          {counts.warnings}
        </span>
      ) : null}
    </span>
  );
}
