import type { Product } from "@/types";
import { mockProducts } from "@/mocks/products";
import { createRepository } from "./storage";

export const productService = createRepository<Product>("products", mockProducts);
