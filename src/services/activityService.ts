import type { Activity } from "@/types";
import { createRepository } from "./storage";

export const activityService = createRepository<Activity>("activities", []);
