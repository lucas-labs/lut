import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { errorMessage, type ProfileErrorCode } from '@/modules/profiles';
import { type ReactNode, useState } from 'react';
import { SettingRow } from '../../components/SettingRow';

/** Why native refused a field, under it. */
export function FieldError({ code }: { code: ProfileErrorCode | undefined }) {
  if (!code) return null;
  return (
    <p role="alert" className="text-[12px] leading-4 text-destructive">
      {errorMessage(code)}
    </p>
  );
}

/**
 * A text field kept as a draft while typed, saved on blur or Enter. A value saved elsewhere replaces the draft; a
 * refused one stays in the field, with its error, until it is corrected.
 */
function useDraft(value: string, onCommit: (value: string) => void) {
  const [draft, setDraft] = useState(value);
  const [draftOf, setDraftOf] = useState(value);
  if (value !== draftOf) {
    setDraftOf(value);
    setDraft(value);
  }
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  return {
    value: draft,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => setDraft(event.target.value),
    onBlur: commit,
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') event.currentTarget.blur();
    },
  };
}

type TextSettingProps = {
  title: string;
  description?: ReactNode;
  value: string;
  onCommit: (value: string) => void;
  error?: ProfileErrorCode;
  placeholder?: string;
  mono?: boolean;
};

/** A setting typed as text, saved when the field is left. */
export function TextSetting({ title, description, value, onCommit, error, placeholder, mono }: TextSettingProps) {
  const draft = useDraft(value, onCommit);
  return (
    <SettingRow title={title} description={description} details={error ? <FieldError code={error} /> : undefined}>
      {(a11y) => (
        <Input
          {...a11y}
          {...draft}
          type="text"
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          className={cn('w-55', mono && 'font-mono')}
        />
      )}
    </SettingRow>
  );
}

/** A setting a detected profile takes from the machine: shown, not edited. */
export function ReadOnlySetting({ title, description, value }: { title: string; description?: string; value: string }) {
  return (
    <SettingRow title={title} description={description}>
      <span className="max-w-60 truncate font-mono text-[12px] text-muted-foreground" title={value}>
        {value}
      </span>
    </SettingRow>
  );
}
