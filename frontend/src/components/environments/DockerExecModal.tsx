import { useState } from "react";
import {
  Button,
  Chip,
  Input,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Spinner,
} from "../ui";
import { execDockerContainer } from "../../lib/api";
import { toast } from "../../lib/toast";
import type { DockerContainer, DockerExecResult } from "../../types";

interface Props {
  environmentId: string;
  container: DockerContainer;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function DockerExecModal({
  environmentId,
  container,
  isOpen,
  onOpenChange,
}: Props) {
  const [cmdText, setCmdText] = useState("");
  const [workingDir, setWorkingDir] = useState("");
  const [user, setUser] = useState("");
  const [timeoutSec, setTimeoutSec] = useState("30");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DockerExecResult | null>(null);

  const reset = () => {
    setCmdText("");
    setWorkingDir("");
    setUser("");
    setTimeoutSec("30");
    setResult(null);
  };

  const handleClose = (onClose: () => void) => {
    reset();
    onClose();
  };

  const handleExec = async () => {
    const trimmed = cmdText.trim();
    if (!trimmed) {
      toast.error("Command is required");
      return;
    }
    const cmd = trimmed.split(/\s+/);
    const timeoutMs = (parseInt(timeoutSec, 10) || 30) * 1000;

    setLoading(true);
    setResult(null);
    try {
      const res = await execDockerContainer(environmentId, container.id, {
        cmd,
        ...(workingDir.trim() && { working_dir: workingDir.trim() }),
        ...(user.trim() && { user: user.trim() }),
        timeout_ms: timeoutMs,
      });
      setResult(res);
    } catch {
      toast.error("Exec failed");
    } finally {
      setLoading(false);
    }
  };

  const exitColor =
    result === null
      ? "default"
      : result.exit_code === 0
        ? "success"
        : "danger";

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) reset();
        onOpenChange(open);
      }}
      size="2xl"
      scrollBehavior="inside"
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader>
              <span>Exec Command</span>
              <span className="ml-2 text-xs font-mono text-default-400">{container.name}</span>
            </ModalHeader>
            <ModalBody className="gap-4">
              <Input
                label="Command"
                placeholder="ls -la /app"
                value={cmdText}
                onValueChange={setCmdText}
                isRequired
                size="sm"
                description="Space-separated arguments"
              />
              <div className="flex gap-3">
                <Input
                  label="Working Directory"
                  placeholder="/app (optional)"
                  value={workingDir}
                  onValueChange={setWorkingDir}
                  size="sm"
                  className="flex-1"
                />
                <Input
                  label="User"
                  placeholder="root (optional)"
                  value={user}
                  onValueChange={setUser}
                  size="sm"
                  className="w-32"
                />
                <Input
                  label="Timeout (s)"
                  type="number"
                  value={timeoutSec}
                  onValueChange={setTimeoutSec}
                  size="sm"
                  className="w-28"
                  min={1}
                  max={300}
                />
              </div>

              {loading && (
                <div className="flex items-center justify-center py-6">
                  <Spinner size="sm" label="Running…" />
                </div>
              )}

              {result !== null && !loading && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-default-500">Exit code</span>
                    <Chip size="sm" color={exitColor} variant="flat">
                      {result.exit_code}
                    </Chip>
                  </div>

                  {result.stdout && (
                    <div>
                      <p className="text-xs font-semibold text-default-500 mb-1">stdout</p>
                      <pre className="text-xs bg-default-50 rounded p-3 overflow-auto max-h-48 whitespace-pre-wrap break-all border border-divider">
                        {result.stdout}
                      </pre>
                    </div>
                  )}

                  {result.stderr && (
                    <div>
                      <p className="text-xs font-semibold text-danger-500 mb-1">stderr</p>
                      <pre className="text-xs bg-danger-50 rounded p-3 overflow-auto max-h-48 whitespace-pre-wrap break-all border border-danger-200">
                        {result.stderr}
                      </pre>
                    </div>
                  )}

                  {!result.stdout && !result.stderr && (
                    <p className="text-xs text-default-400 italic">No output.</p>
                  )}
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={() => handleClose(onClose)} isDisabled={loading}>
                Close
              </Button>
              <Button color="primary" isLoading={loading} onPress={handleExec}>
                Run
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
