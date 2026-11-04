import type { Activity } from "@/types";
import { mockActivities } from "@/mocks/dashboard";
import { createRepository } from "./storage";

export const activityService = createRepository<Activity>("activities", mockActivities);
