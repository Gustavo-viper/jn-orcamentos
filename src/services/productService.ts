import type { Product } from "@/types";
import { createRepository } from "./storage";

export const productService = createRepository<Product>("products", []);
