import { useState } from "react";
import {
  Button,
  Input,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/react";
import { pullDockerImage } from "../../lib/api";
import { toast } from "../../lib/toast";

interface Props {
  environmentId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onPulled: () => void;
}

export default function DockerPullImageModal({
  environmentId,
  isOpen,
  onOpenChange,
  onPulled,
}: Props) {
  const [image, setImage] = useState("");
  const [tag, setTag] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setImage("");
    setTag("");
    setUsername("");
    setPassword("");
  };

  const handlePull = async (onClose: () => void) => {
    if (!image.trim()) {
      toast.error("Image name is required");
      return;
    }
    setLoading(true);
    try {
      await pullDockerImage(environmentId, {
        image: image.trim(),
        ...(tag.trim() && { tag: tag.trim() }),
        ...(username.trim() && { username: username.trim() }),
        ...(password && { password }),
      });
      toast.success("Image pulled", `${image.trim()}${tag.trim() ? `:${tag.trim()}` : ""}`);
      reset();
      onClose();
      onPulled();
    } catch {
      toast.error("Failed to pull image");
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
            <ModalHeader>Pull Image</ModalHeader>
            <ModalBody className="gap-4">
              <div className="flex gap-3">
                <Input
                  label="Image"
                  placeholder="nginx"
                  value={image}
                  onValueChange={setImage}
                  isRequired
                  size="sm"
                  className="flex-1"
                />
                <Input
                  label="Tag"
                  placeholder="latest"
                  value={tag}
                  onValueChange={setTag}
                  size="sm"
                  className="w-32"
                />
              </div>
              <p className="text-xs text-default-400 -mt-2">
                Private registry credentials (optional)
              </p>
              <div className="flex gap-3">
                <Input
                  label="Username"
                  value={username}
                  onValueChange={setUsername}
                  size="sm"
                  className="flex-1"
                />
                <Input
                  label="Password"
                  type="password"
                  value={password}
                  onValueChange={setPassword}
                  size="sm"
                  className="flex-1"
                />
              </div>
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onClose} isDisabled={loading}>
                Cancel
              </Button>
              <Button color="primary" isLoading={loading} onPress={() => handlePull(onClose)}>
                Pull
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
