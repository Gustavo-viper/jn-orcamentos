import { checkApiConnection, getLastSyncAt, getPendingSyncCount, startSyncEngine, syncPending } from "./storage";

export interface OfflineStatus {
  online: boolean;
  pending: number;
  lastSyncAt: string | null;
  apiConfigured: boolean;
  apiOnline: boolean;
}

const API_CONFIGURED = Boolean((import.meta.env.VITE_API_URL as string | undefined)?.trim());

export async function getOfflineStatus(): Promise<OfflineStatus> {
  const apiOnline = API_CONFIGURED && await checkApiConnection();
  return {
    // navigator.onLine is only a local Chromium hint and can be false for a
    // custom Electron protocol even while HTTPS requests to the API work.
    online: (typeof navigator === "undefined" ? true : navigator.onLine) || apiOnline,
    pending: await getPendingSyncCount(),
    lastSyncAt: await getLastSyncAt(),
    apiConfigured: API_CONFIGURED,
    apiOnline,
  };
}

export { startSyncEngine, syncPending };
