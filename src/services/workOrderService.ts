import type { WorkOrder } from "@/types";
import { createRepository } from "./storage";

export const workOrderService = createRepository<WorkOrder>("work_orders", []);
