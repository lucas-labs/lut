import { cva, type VariantProps } from 'class-variance-authority';
import { createContext, type ReactNode, useContext, useId } from 'react';

/** Spread on a row's control so it is named by the row's title and described by its description. */
export type SettingRowA11y = {
  'aria-labelledby': string;
  'aria-describedby': string | undefined;
};

/** `card` stands alone; `listed` is a row of a `SettingRowList`, which draws the border around all of them. */
const settingRowVariants = cva('group/row flex items-center gap-4 bg-card px-4', {
  variants: {
    variant: {
      card: 'rounded-lg border border-border py-3',
      listed: 'py-2.5',
    },
  },
  defaultVariants: { variant: 'card' },
});

type RowVariant = NonNullable<VariantProps<typeof settingRowVariants>['variant']>;

/** The variant of the rows inside a container, so its rows take it without each one asking. */
const RowVariantContext = createContext<RowVariant>('card');

type Props = {
  title: ReactNode;
  description?: string;
  /** The control, or a function that receives the ids naming it, for a row whose control has no name of its own. */
  children: ReactNode | ((a11y: SettingRowA11y) => ReactNode);
};

/** One setting: its name and what it does on the left, the control on the right. */
export function SettingRow({ title, description, children }: Props) {
  const variant = useContext(RowVariantContext);
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = description ? `${id}-description` : undefined;
  return (
    <div data-slot="setting-row" data-variant={variant} className={settingRowVariants({ variant })}>
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
