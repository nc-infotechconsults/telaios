import { useState } from "react";
import {
  Button,
  Input,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Textarea,
} from "@heroui/react";
import { createDockerVolume } from "../../lib/api";
import { toast } from "../../lib/toast";

interface Props {
  environmentId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export default function DockerCreateVolumeModal({
  environmentId,
  isOpen,
  onOpenChange,
  onCreated,
}: Props) {
  const [name, setName] = useState("");
  const [driver, setDriver] = useState("");
  const [driverOptsText, setDriverOptsText] = useState("");
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setName("");
    setDriver("");
    setDriverOptsText("");
  };

  const handleCreate = async (onClose: () => void) => {
    if (!name.trim()) {
      toast.error("Volume name is required");
      return;
    }

    const driverOpts: Record<string, string> = {};
    for (const line of driverOptsText.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      driverOpts[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
    }

    setLoading(true);
    try {
      const result = await createDockerVolume(environmentId, {
        name: name.trim(),
        ...(driver.trim() && { driver: driver.trim() }),
        ...(Object.keys(driverOpts).length > 0 && { driver_opts: driverOpts }),
      });
      toast.success("Volume created", result.name);
      reset();
      onClose();
      onCreated();
    } catch {
      toast.error("Failed to create volume");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) reset();
        onOpenChange(open);
      }}
      size="md"
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader>Create Volume</ModalHeader>
            <ModalBody className="gap-4">
              <Input
                label="Name"
                placeholder="my-volume"
                value={name}
                onValueChange={setName}
                isRequired
                size="sm"
              />
              <Input
                label="Driver"
                placeholder="local (optional)"
                value={driver}
                onValueChange={setDriver}
                size="sm"
              />
              <Textarea
                label="Driver Options"
                placeholder={"type=tmpfs\ndevice=tmpfs"}
                value={driverOptsText}
                onValueChange={setDriverOptsText}
                minRows={2}
                size="sm"
                description="key=value pairs, one per line"
              />
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onClose} isDisabled={loading}>
                Cancel
              </Button>
              <Button color="primary" isLoading={loading} onPress={() => handleCreate(onClose)}>
                Create
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
