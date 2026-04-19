import { useEffect, useState, useCallback } from "react";
import {
  Button,
  Chip,
  Spinner,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from "@heroui/react";
import { listDockerNetworks } from "../../lib/api";
import { toast } from "../../lib/toast";
import type { DockerNetwork } from "../../types";
import DockerNetworkDetail from "./DockerNetworkDetail";

interface Props {
  environmentId: string;
}

export default function DockerNetworkList({ environmentId }: Props) {
  const [networks, setNetworks] = useState<DockerNetwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setNetworks(await listDockerNetworks(environmentId));
    } catch {
      toast.error("Failed to load networks");
      setNetworks([]);
    } finally {
      setLoading(false);
    }
  }, [environmentId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" label="Loading networks…" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-default-500">{networks.length} network{networks.length !== 1 ? "s" : ""}</p>
        <Button size="sm" variant="flat" onPress={load}>Refresh</Button>
      </div>

      {networks.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-default-400">
          <p className="text-sm">No networks found</p>
        </div>
      ) : (
        <div className="flex gap-4">
          {/* Table side */}
          <div className={`min-w-0 overflow-auto ${selectedId ? "flex-1" : "w-full"}`}>
            <Table aria-label="Docker networks" removeWrapper>
              <TableHeader>
                <TableColumn>NAME</TableColumn>
                <TableColumn>NETWORK ID</TableColumn>
                <TableColumn>DRIVER</TableColumn>
                <TableColumn>SCOPE</TableColumn>
                <TableColumn>SUBNET</TableColumn>
                <TableColumn>CONTAINERS</TableColumn>
              </TableHeader>
              <TableBody>
                {networks.map((net) => (
                  <TableRow
                    key={net.id}
                    className={`cursor-pointer ${selectedId === net.id ? "bg-default-100" : ""}`}
                    onClick={() => setSelectedId((prev) => (prev === net.id ? null : net.id))}
                  >
                    <TableCell>
                      <p className="text-sm font-medium">{net.name}</p>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs font-mono text-default-400">{net.id.slice(0, 12)}</span>
                    </TableCell>
                    <TableCell>
                      <Chip size="sm" variant="flat">{net.driver}</Chip>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-default-400">{net.scope}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs font-mono text-default-400">{net.ipam?.subnet ?? "-"}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs">{net.containers}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Detail panel */}
          {selectedId && (() => {
            const selected = networks.find((n) => n.id === selectedId);
            return selected ? (
              <div className="w-[400px] flex-shrink-0 border-l border-divider pl-4 overflow-y-auto">
                <DockerNetworkDetail
                  environmentId={environmentId}
                  network={selected}
                  onClose={() => setSelectedId(null)}
                />
              </div>
            ) : null;
          })()}
        </div>
      )}
    </div>
  );
}
