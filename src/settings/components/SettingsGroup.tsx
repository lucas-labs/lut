import type { ReactNode } from 'react';

type Props = {
  title: string;
  /** Buttons on the heading's right, e.g. Create and Import on Themes. */
  actions?: ReactNode;
  children: ReactNode;
};

/** A titled group of setting rows: the heading in muted text, then the rows 8 px apart. */
export function SettingsGroup({ title, actions, children }: Props) {
  return (
    <section className="flex flex-col" aria-label={title}>
      <div className="mt-7 mb-1.5 flex min-h-4 items-center gap-2 text-[12px] leading-4 text-muted-foreground">
        <h2 className="flex-1 font-normal">{title}</h2>
        {actions}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}
