import { MiniAppProvider } from "@/components/mini/provider";
import { MiniAppShell } from "@/components/mini/shell";

export default function MiniLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MiniAppProvider>
      <MiniAppShell>{children}</MiniAppShell>
    </MiniAppProvider>
  );
}
