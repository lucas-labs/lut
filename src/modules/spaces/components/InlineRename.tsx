import { Input } from '@/components/ui/input';
import { useEffect, useRef } from 'react';

type Props = {
  initial: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
  className?: string;
};

export function InlineRename({ initial, onCommit, onCancel, className }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.select();
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const finish = (fn: () => void) => {
    if (done.current) return;
    done.current = true;
    fn();
  };

  return (
    <Input
      ref={ref}
      size="xs"
      defaultValue={initial}
      aria-label="Rename space"
      className={className}
      onKeyDown={(e) => {
        e.stopPropagation();
        // Enter that confirms an IME candidate is part of the typing, not the end of the edit.
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) finish(() => onCommit(e.currentTarget.value));
        else if (e.key === 'Escape') finish(onCancel);
      }}
      onBlur={(e) => {
        if (!document.hasFocus()) return;
        finish(() => onCommit(e.currentTarget.value));
      }}
    />
  );
}
