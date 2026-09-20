export function PageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="mb-4">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {subtitle ? <p className="text-sm opacity-70 mt-1">{subtitle}</p> : null}
    </header>
  );
}

export function LoadingBlock() {
  return (
    <div className="flex flex-col gap-3">
      <div className="skeleton h-28 w-full" />
      <div className="skeleton h-16 w-full" />
      <div className="skeleton h-16 w-3/4" />
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="alert alert-error mb-4">
      <span>{message}</span>
    </div>
  );
}
