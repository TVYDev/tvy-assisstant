import {
  addDeposit,
  applyDepositTowardPayment,
  getDepositBalanceByShortcode,
} from "./deposit";

export type PaymentSettlementMode = "mark_only" | "use_deposit" | "received_cash";

export interface ParsedPaymentTail {
  mode: PaymentSettlementMode;
  received?: number;
}

const MONTH_PATTERN = /^\d{4}-\d{2}$/;

export function isMonthToken(token: string): boolean {
  return MONTH_PATTERN.test(token);
}

export function isAmountToken(token: string): boolean {
  return /^\d+(\.\d+)?$/.test(token) && !isMonthToken(token);
}

/** Parse optional trailing `deposit` or cash amount from command args. */
export function parsePaymentTail(tokens: string[]): {
  leading: string[];
  tail: ParsedPaymentTail;
} {
  if (tokens.length === 0) {
    return { leading: [], tail: { mode: "mark_only" } };
  }

  const last = tokens[tokens.length - 1];
  if (last.toLowerCase() === "deposit") {
    return {
      leading: tokens.slice(0, -1),
      tail: { mode: "use_deposit" },
    };
  }

  if (isAmountToken(last)) {
    const received = parseFloat(last);
    return {
      leading: tokens.slice(0, -1),
      tail: { mode: "received_cash", received },
    };
  }

  return { leading: tokens, tail: { mode: "mark_only" } };
}

export async function settlePayment(
  shortcode: string,
  paymentAmount: number,
  tail: ParsedPaymentTail,
  note: string,
): Promise<{ added: number; applied: number; balance: number }> {
  const code = shortcode.toUpperCase();
  let balance = await getDepositBalanceByShortcode(code);
  let added = 0;
  let applied = 0;

  if (tail.mode === "received_cash") {
    const received = tail.received ?? 0;
    if (received <= 0) {
      throw new Error("Received amount must be a positive number.");
    }
    balance = await addDeposit(code, received, `${note}: received`);
    added = received;
  }

  if (tail.mode === "use_deposit" || tail.mode === "received_cash") {
    if (paymentAmount > 0) {
      const result = await applyDepositTowardPayment(code, paymentAmount, note);
      applied = result.applied;
      balance = result.balance;
    }
  }

  return { added, applied, balance };
}

export function formatPaymentSettlement(
  added: number,
  applied: number,
  balance: number,
): string {
  const lines: string[] = [];
  if (added > 0) {
    lines.push(`💵 $${added.toFixed(2)} received → deposit`);
  }
  if (applied > 0) {
    lines.push(
      `💰 $${applied.toFixed(2)} from deposit — $${balance.toFixed(2)} left`,
    );
  }
  return lines.length ? `\n${lines.join("\n")}` : "";
}
