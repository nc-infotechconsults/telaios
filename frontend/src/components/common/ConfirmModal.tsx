import {
  Button,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "../ui";

interface Props {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  isLoading?: boolean;
}

/**
 * A reusable delete / destructive-action confirmation modal.
 * Replaces native window.confirm() calls for a consistent HeroUI experience.
 */
export default function ConfirmModal({
  isOpen,
  onOpenChange,
  title = "Are you sure?",
  message,
  confirmLabel = "Delete",
  onConfirm,
  isLoading,
}: Props) {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="sm">
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader>{title}</ModalHeader>
            <ModalBody>
              <p className="text-sm text-default-600">{message}</p>
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onClose} isDisabled={isLoading}>
                Cancel
              </Button>
              <Button
                color="danger"
                isLoading={isLoading}
                onPress={onConfirm}
              >
                {confirmLabel}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
