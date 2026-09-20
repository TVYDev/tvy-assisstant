import { formatMoney } from "@/lib/mini-app/format";

export function Money({
  amount,
  className = "",
}: {
  amount: number;
  className?: string;
}) {
  return <span className={className}>{formatMoney(amount)}</span>;
}
