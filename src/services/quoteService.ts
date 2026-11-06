import type { Quote } from "@/types";
import { createRepository } from "./storage";

// Orçamentos de demonstração não podem ser recriados a cada inicialização.
export const quoteService = createRepository<Quote>("quotes", []);
