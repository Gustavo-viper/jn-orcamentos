import type { FinanceEntry } from "@/types";
import { createRepository } from "./storage";

export const financeService = createRepository<FinanceEntry>("finance", []);
