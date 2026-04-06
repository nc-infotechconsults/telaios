import { addToast } from "@heroui/toast";

const DEFAULT_TIMEOUT = 4000;

export const toast = {
  success(title: string, description?: string) {
    addToast({ title, description, severity: "success", timeout: DEFAULT_TIMEOUT });
  },
  error(title: string, description?: string) {
    addToast({ title, description, severity: "danger", timeout: 6000 });
  },
  info(title: string, description?: string) {
    addToast({ title, description, severity: "primary", timeout: DEFAULT_TIMEOUT });
  },
  warning(title: string, description?: string) {
    addToast({ title, description, severity: "warning", timeout: DEFAULT_TIMEOUT });
  },
};
