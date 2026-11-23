import { useTheme } from "@/modules/theme";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedMode } = useTheme();

  return (
    <Sonner
      theme={resolvedMode}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "8px",
        } as React.CSSProperties
      }
      // The design's toast: 8 px corners and its own shadow, not sonner's.
      toastOptions={{ style: { boxShadow: "0 8px 28px rgba(0, 0, 0, 0.35)" } }}
      {...props}
    />
  );
};

export { Toaster };
