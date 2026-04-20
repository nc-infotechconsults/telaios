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
  Textarea,
} from "@heroui/react";
import { createDockerContainer } from "../../lib/api";
import { toast } from "../../lib/toast";
import type { DockerCreateContainerOptions, DockerPortMapping, DockerVolumeMount } from "../../types";

interface Props {
  environmentId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

/** Parse "host:container[/proto]" → DockerPortMapping */
function parsePort(line: string): DockerPortMapping | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const [ports, proto = "tcp"] = trimmed.split("/");
  const parts = ports.split(":");
  if (parts.length < 2) return null;
  const host = parseInt(parts[0], 10);
  const container = parseInt(parts[1], 10);
  if (isNaN(host) || isNaN(container)) return null;
  return { host, container, protocol: proto };
}

/** Parse "source:container_path[:ro]" → DockerVolumeMount */
function parseVolume(line: string): DockerVolumeMount | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(":");
  if (parts.length < 2) return null;
  return {
    source: parts[0] || undefined,
    container_path: parts[1],
    read_only: parts[2] === "ro",
  };
}

export default function DockerCreateContainerModal({
  environmentId,
  isOpen,
  onOpenChange,
  onCreated,
}: Props) {
  const [image, setImage] = useState("");
  const [name, setName] = useState("");
  const [cmd, setCmd] = useState("");
  const [envText, setEnvText] = useState("");
  const [portsText, setPortsText] = useState("");
  const [volumesText, setVolumesText] = useState("");
  const [network, setNetwork] = useState("");
  const [autoRemove, setAutoRemove] = useState(false);
  const [start, setStart] = useState(true);
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setImage("");
    setName("");
    setCmd("");
    setEnvText("");
    setPortsText("");
    setVolumesText("");
    setNetwork("");
    setAutoRemove(false);
    setStart(true);
  };

  const handleCreate = async (onClose: () => void) => {
    if (!image.trim()) {
      toast.error("Image is required");
      return;
    }

    const envRecord: Record<string, string> = {};
    for (const line of envText.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) { envRecord[trimmed] = ""; continue; }
      envRecord[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
    }

    const ports: DockerPortMapping[] = portsText
      .split("\n")
      .map(parsePort)
      .filter((p): p is DockerPortMapping => p !== null);

    const volumes: DockerVolumeMount[] = volumesText
      .split("\n")
      .map(parseVolume)
      .filter((v): v is DockerVolumeMount => v !== null);

    const opts: DockerCreateContainerOptions = {
      image: image.trim(),
      ...(name.trim() && { name: name.trim() }),
      ...(cmd.trim() && { cmd: cmd.trim().split(/\s+/) }),
      ...(Object.keys(envRecord).length > 0 && { env: envRecord }),
      ...(ports.length > 0 && { ports }),
      ...(volumes.length > 0 && { volumes }),
      ...(network.trim() && { network: network.trim() }),
      auto_remove: autoRemove,
      start,
    };

    setLoading(true);
    try {
      const result = await createDockerContainer(environmentId, opts);
      toast.success("Container created", result.id.slice(0, 12));
      reset();
      onClose();
      onCreated();
    } catch {
      toast.error("Failed to create container");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="lg" scrollBehavior="inside">
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader>Create Container</ModalHeader>
            <ModalBody className="gap-4">
              <Input
                label="Image"
                placeholder="nginx:latest"
                value={image}
                onValueChange={setImage}
                isRequired
                size="sm"
              />
              <Input
                label="Name"
                placeholder="my-container (optional)"
                value={name}
                onValueChange={setName}
                size="sm"
              />
              <Input
                label="Command"
                placeholder="nginx -g daemon off; (optional, space-separated)"
                value={cmd}
                onValueChange={setCmd}
                size="sm"
              />
              <Textarea
                label="Environment Variables"
                placeholder={"KEY=value\nANOTHER=123"}
                value={envText}
                onValueChange={setEnvText}
                minRows={2}
                size="sm"
              />
              <Textarea
                label="Port Mappings"
                placeholder={"8080:80\n5432:5432/tcp"}
                value={portsText}
                onValueChange={setPortsText}
                minRows={2}
                size="sm"
              />
              <Textarea
                label="Volume Mounts"
                placeholder={"/host/path:/container/path\nmy-vol:/data:ro"}
                value={volumesText}
                onValueChange={setVolumesText}
                minRows={2}
                size="sm"
              />
              <Input
                label="Network"
                placeholder="bridge (optional)"
                value={network}
                onValueChange={setNetwork}
                size="sm"
              />
              <div className="flex gap-6">
                <Checkbox isSelected={start} onValueChange={setStart} size="sm">
                  Start after create
                </Checkbox>
                <Checkbox isSelected={autoRemove} onValueChange={setAutoRemove} size="sm">
                  Auto-remove on exit
                </Checkbox>
              </div>
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
