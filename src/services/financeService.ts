import type { FinanceEntry } from "@/types";
import { mockFinance } from "@/mocks/finance";
import { createRepository } from "./storage";

export const financeService = createRepository<FinanceEntry>("finance", mockFinance);
