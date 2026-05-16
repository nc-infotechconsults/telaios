import { useState } from "react";
import {
  Button,
  Checkbox,
  Input,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "../ui";
import { createDockerNetwork } from "../../lib/api";
import { toast } from "../../lib/toast";

interface Props {
  environmentId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export default function DockerCreateNetworkModal({
  environmentId,
  isOpen,
  onOpenChange,
  onCreated,
}: Props) {
  const [name, setName] = useState("");
  const [driver, setDriver] = useState("");
  const [subnet, setSubnet] = useState("");
  const [gateway, setGateway] = useState("");
  const [internal, setInternal] = useState(false);
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setName("");
    setDriver("");
    setSubnet("");
    setGateway("");
    setInternal(false);
  };

  const handleCreate = async (onClose: () => void) => {
    if (!name.trim()) {
      toast.error("Network name is required");
      return;
    }

    setLoading(true);
    try {
      const result = await createDockerNetwork(environmentId, {
        name: name.trim(),
        ...(driver.trim() && { driver: driver.trim() }),
        ...(subnet.trim() && { subnet: subnet.trim() }),
        ...(gateway.trim() && { gateway: gateway.trim() }),
        internal,
      });
      toast.success("Network created", result.id.slice(0, 12));
      reset();
      onClose();
      onCreated();
    } catch {
      toast.error("Failed to create network");
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
            <ModalHeader>Create Network</ModalHeader>
            <ModalBody className="gap-4">
              <Input
                label="Name"
                placeholder="my-network"
                value={name}
                onValueChange={setName}
                isRequired
                size="sm"
              />
              <Input
                label="Driver"
                placeholder="bridge (optional)"
                value={driver}
                onValueChange={setDriver}
                size="sm"
              />
              <div className="flex gap-3">
                <Input
                  label="Subnet"
                  placeholder="172.20.0.0/16 (optional)"
                  value={subnet}
                  onValueChange={setSubnet}
                  size="sm"
                  className="flex-1"
                />
                <Input
                  label="Gateway"
                  placeholder="172.20.0.1 (optional)"
                  value={gateway}
                  onValueChange={setGateway}
                  size="sm"
                  className="flex-1"
                />
              </div>
              <Checkbox isSelected={internal} onValueChange={setInternal} size="sm">
                Internal (no external connectivity)
              </Checkbox>
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
