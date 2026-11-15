type Props = {
  title: string;
  description?: string;
};

export function SectionHeader({ title, description }: Props) {
  return (
    <div>
      <h1 className="text-[20px] leading-7 font-semibold">{title}</h1>
      {description ? <p className="mt-0.5 text-[13px] leading-[18px] text-muted-foreground">{description}</p> : null}
    </div>
  );
}
