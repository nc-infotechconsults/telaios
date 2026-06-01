import { useEffect, useRef, useState } from "react";
import {
  Button,
  Input,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Spinner,
} from "../ui";
import { getResourceLogs } from "../../lib/api";
import { toast } from "../../lib/toast";

interface Props {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  environmentId: string;
  podName: string;
  namespace: string;
}

export default function PodLogViewer({
  isOpen,
  onOpenChange,
  environmentId,
  podName,
  namespace,
}: Props) {
  const [logs, setLogs] = useState("");
  const [loading, setLoading] = useState(false);
  const [container, setContainer] = useState("");
  const logRef = useRef<HTMLPreElement>(null);

  async function fetchLogs() {
    setLoading(true);
    try {
      const data = await getResourceLogs(
        environmentId,
        podName,
        namespace,
        container.trim() || undefined,
      );
      setLogs(data);
      // Auto-scroll to bottom
      setTimeout(() => {
        if (logRef.current) {
          logRef.current.scrollTop = logRef.current.scrollHeight;
        }
      }, 50);
    } catch {
      toast.error("Failed to fetch logs");
      setLogs("");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchLogs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, podName, namespace]);

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="4xl" scrollBehavior="inside">
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex items-center gap-2">
              <span>Logs: {podName}</span>
              <span className="text-xs text-default-400 font-normal">({namespace})</span>
            </ModalHeader>
            <ModalBody>
              <div className="flex items-center gap-3 mb-3">
                <Input
                  size="sm"
                  label="Container (optional)"
                  placeholder="container-name"
                  value={container}
                  onValueChange={setContainer}
                  className="w-64"
                />
                <Button size="sm" variant="flat" onPress={fetchLogs} isLoading={loading}>
                  Refresh
                </Button>
              </div>
              {loading && !logs ? (
                <div className="flex items-center justify-center py-12">
                  <Spinner size="lg" label="Fetching logs…" />
                </div>
              ) : (
                <pre
                  ref={logRef}
                  className="text-xs font-mono bg-default-50 rounded-lg p-4 overflow-auto max-h-[60vh] whitespace-pre-wrap break-all"
                >
                  {logs || "No logs available"}
                </pre>
              )}
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onClose}>
                Close
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
