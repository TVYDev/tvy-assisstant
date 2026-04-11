import fs from "fs";
import path from "path";

export interface DebtItem {
  description: string;
  amount: number;
  date: string;
}

export interface DebtRecord {
  name: string;
  owes_me: number;
  i_owe: number;
  items: DebtItem[];
}

type DebtData = Record<string, DebtRecord>;

function readDebts(): DebtData {
  const filePath = path.join(process.cwd(), "data", "debts.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as DebtData;
}

export function getDebtByUsername(username: string): DebtRecord | null {
  const data = readDebts();
  const key = username.startsWith("@") ? username : `@${username}`;
  return data[key] ?? null;
}
