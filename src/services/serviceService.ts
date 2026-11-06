import type { Service } from "@/types";
import { createRepository } from "./storage";

// O catálogo de produção é composto somente pelos serviços cadastrados pela empresa.
// Não reinstala presets de demonstração após exclusões ou reinicializações.
export const serviceService = createRepository<Service>("services", []);
