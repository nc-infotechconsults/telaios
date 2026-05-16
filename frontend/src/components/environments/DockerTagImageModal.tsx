import { useState } from "react";
import {
  Button,
  Input,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "../ui";
import { tagDockerImage } from "../../lib/api";
import { toast } from "../../lib/toast";
import type { DockerImage } from "../../types";

interface Props {
  environmentId: string;
  image: DockerImage;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onTagged: () => void;
}

export default function DockerTagImageModal({
  environmentId,
  image,
  isOpen,
  onOpenChange,
  onTagged,
}: Props) {
  const [repo, setRepo] = useState("");
  const [tag, setTag] = useState("latest");
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setRepo("");
    setTag("latest");
  };

  const handleTag = async (onClose: () => void) => {
    if (!repo.trim()) {
      toast.error("Repository is required");
      return;
    }
    setLoading(true);
    try {
      await tagDockerImage(environmentId, image.id, {
        repo: repo.trim(),
        tag: tag.trim() || "latest",
      });
      toast.success("Image tagged", `${repo.trim()}:${tag.trim() || "latest"}`);
      reset();
      onClose();
      onTagged();
    } catch {
      toast.error("Failed to tag image");
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
            <ModalHeader>
              <span>Tag Image</span>
              <span className="ml-2 text-xs font-mono text-default-400">
                {image.id.slice(7, 19)}
              </span>
            </ModalHeader>
            <ModalBody className="gap-4">
              <div className="flex gap-3">
                <Input
                  label="Repository"
                  placeholder="my-registry/my-image"
                  value={repo}
                  onValueChange={setRepo}
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
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onClose} isDisabled={loading}>
                Cancel
              </Button>
              <Button color="primary" isLoading={loading} onPress={() => handleTag(onClose)}>
                Tag
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
