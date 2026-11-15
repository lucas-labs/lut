import { cva, type VariantProps } from 'class-variance-authority';
import { createContext, type ReactNode, useContext, useId } from 'react';

/** Spread on a row's control so it is named by the row's title and described by its description. */
export type SettingRowA11y = {
  'aria-labelledby': string;
  'aria-describedby': string | undefined;
};

/**
 * `card` stands alone; `listed` is a row of a `SettingRowList`, which draws the border around all of them; `expander`
 * is the switch row of a `SettingExpander` and `nested` one of the rows it opens, indented under a line.
 * `stacked` puts the row's `details` under its title and control.
 */
const settingRowVariants = cva('group/row flex gap-4 px-4', {
  variants: {
    variant: {
      card: 'rounded-lg border border-border bg-card py-3',
      listed: 'bg-card py-2.5',
      expander: 'bg-card py-3',
      nested: 'border-t border-border bg-transparent py-3 pl-11',
    },
    stacked: {
      true: 'flex-col items-stretch gap-2.5',
      false: 'items-center',
    },
  },
  defaultVariants: { variant: 'card', stacked: false },
});

type RowVariant = NonNullable<VariantProps<typeof settingRowVariants>['variant']>;

/** The variant of the rows inside a container, so its rows take it without each one asking. */
const RowVariantContext = createContext<RowVariant>('card');

type Props = {
  title: ReactNode;
  description?: ReactNode;
  /** The control, or a function that receives the ids naming it, for a row whose control has no name of its own. */
  children: ReactNode | ((a11y: SettingRowA11y) => ReactNode);
  /** Content under the title and control, inside the row, like the language overrides of the formatter. */
  details?: ReactNode;
};

/** One setting: its name and what it does on the left, the control on the right. */
export function SettingRow({ title, description, children, details }: Props) {
  const variant = useContext(RowVariantContext);
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = description ? `${id}-description` : undefined;
  const line = (
    <>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span id={titleId} className="font-medium">
          {title}
        </span>
        {description ? (
          <span id={descriptionId} className="text-[12px] leading-4 text-muted-foreground">
            {description}
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center">
        {typeof children === 'function'
          ? children({ 'aria-labelledby': titleId, 'aria-describedby': descriptionId })
          : children}
      </div>
    </>
  );
  const stacked = details !== undefined;
  return (
    <div data-slot="setting-row" data-variant={variant} className={settingRowVariants({ variant, stacked })}>
      {stacked ? (
        <>
          <div className="flex items-center gap-4">{line}</div>
          {details}
        </>
      ) : (
        line
      )}
    </div>
  );
}

/** Rows joined into one bordered list with a line between them, like the shortcuts of a group. */
export function SettingRowList({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
      <RowVariantContext.Provider value="listed">{children}</RowVariantContext.Provider>
    </div>
  );
}

type ExpanderProps = {
  /** Whether the dependent settings show, usually the value of the setting's switch. */
  open: boolean;
  /** The row with the switch. */
  setting: ReactNode;
  /** The rows that only apply while the switch is on. */
  children: ReactNode;
};

/**
 * A setting with the settings that depend on it: they slide open under it while `open`, indented, and are inert
 * (hidden from focus and screen readers) while closed.
 */
export function SettingExpander({ open, setting, children }: ExpanderProps) {
  const state = open ? 'open' : 'closed';
  return (
    <div data-slot="setting-expander" data-state={state} className="overflow-hidden rounded-lg border border-border">
      <RowVariantContext.Provider value="expander">{setting}</RowVariantContext.Provider>
      <div
        data-slot="setting-expander-body"
        data-state={state}
        inert={!open}
        className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none data-[state=open]:grid-rows-[1fr]"
      >
        <div className="min-h-0 overflow-hidden bg-card/75">
          <RowVariantContext.Provider value="nested">{children}</RowVariantContext.Provider>
        </div>
      </div>
    </div>
  );
}
