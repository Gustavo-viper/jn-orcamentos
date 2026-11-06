import type { Client } from "@/types";
import { createRepository } from "./storage";

// Produção começa sem clientes de demonstração.
// Dados já salvos no IndexedDB/localStorage continuam sendo lidos normalmente.
export const clientService = createRepository<Client>("clients", []);
