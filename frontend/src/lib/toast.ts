import { toast as heroToast } from "@heroui/react";

export const toast = {
  success(title: string, description?: string) {
    heroToast.success(title, { description });
  },
  error(title: string, description?: string) {
    heroToast.danger(title, { description });
  },
  info(title: string, description?: string) {
    heroToast.info(title, { description });
  },
  warning(title: string, description?: string) {
    heroToast.warning(title, { description });
  },
};
