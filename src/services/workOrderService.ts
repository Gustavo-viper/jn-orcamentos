import type { WorkOrder } from "@/types";
import { mockWorkOrders } from "@/mocks/orders";
import { createRepository } from "./storage";

export const workOrderService = createRepository<WorkOrder>("work_orders", mockWorkOrders);
