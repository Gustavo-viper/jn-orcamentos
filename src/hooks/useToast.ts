import { create } from "zustand";

export type ToastType = "success" | "error" | "info" | "warning";
export interface Toast {
  id: number;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => void;
  remove: (id: number) => void;
}

let counter = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push(t) {
    const id = ++counter;
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 4200);
  },
  remove(id) {
    set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
  },
}));

export const toast = {
  success: (title: string, message?: string) => useToastStore.getState().push({ type: "success", title, message }),
  error: (title: string, message?: string) => useToastStore.getState().push({ type: "error", title, message }),
  info: (title: string, message?: string) => useToastStore.getState().push({ type: "info", title, message }),
  warning: (title: string, message?: string) => useToastStore.getState().push({ type: "warning", title, message }),
};
