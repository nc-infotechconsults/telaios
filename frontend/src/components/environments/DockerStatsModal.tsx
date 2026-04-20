import { useState } from "react";
import {
  Button,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Spinner,
} from "@heroui/react";
import { getDockerContainerStats } from "../../lib/api";
import { toast } from "../../lib/toast";
import type { DockerContainer, DockerContainerStats } from "../../types";

interface Props {
  environmentId: string;
  container: DockerContainer;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-divider last:border-0">
      <span className="text-xs text-default-500">{label}</span>
      <span className="text-xs font-mono text-default-700">{value}</span>
    </div>
  );
}

export default function DockerStatsModal({
  environmentId,
  container,
  isOpen,
  onOpenChange,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<DockerContainerStats | null>(null);

  const fetchStats = async () => {
    setLoading(true);
    setStats(null);
    try {
      const s = await getDockerContainerStats(environmentId, container.id);
      setStats(s);
    } catch {
      toast.error("Failed to fetch stats");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (open) fetchStats();
    else setStats(null);
    onOpenChange(open);
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={handleOpenChange} size="md">
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader>
              <span>Resource Stats</span>
              <span className="ml-2 text-xs font-mono text-default-400">{container.name}</span>
            </ModalHeader>
            <ModalBody>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Spinner size="sm" label="Fetching stats…" />
                </div>
              ) : stats ? (
                <div className="flex flex-col">
                  <StatRow label="CPU" value={`${stats.cpu_percent.toFixed(2)}%`} />
                  <StatRow
                    label="Memory"
                    value={`${formatBytes(stats.memory_usage)} / ${formatBytes(stats.memory_limit)} (${stats.memory_percent.toFixed(1)}%)`}
                  />
                  <StatRow label="Net RX" value={formatBytes(stats.network_rx)} />
                  <StatRow label="Net TX" value={formatBytes(stats.network_tx)} />
                  <StatRow label="Block Read" value={formatBytes(stats.block_read)} />
                  <StatRow label="Block Write" value={formatBytes(stats.block_write)} />
                  <StatRow label="PIDs" value={String(stats.pids)} />
                </div>
              ) : (
                <p className="text-sm text-default-400 text-center py-4">No data.</p>
              )}
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onClose}>
                Close
              </Button>
              <Button variant="flat" isLoading={loading} onPress={fetchStats}>
                Refresh
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
