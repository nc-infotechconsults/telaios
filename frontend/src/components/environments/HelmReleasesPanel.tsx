import { useEffect, useState } from "react";
import {
  Button,
  Chip,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Spinner,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Tooltip,
  useDisclosure,
} from "../ui";
import { listHelmReleases, uninstallHelmRelease } from "../../lib/api";
import { toast } from "../../lib/toast";
import type { HelmRelease } from "../../types";
import HelmInstallModal from "./HelmInstallModal";
import HelmUpgradeModal from "./HelmUpgradeModal";

interface Props {
  environmentId: string;
  projectId: string;
}

const RELEASE_STATUS_COLOR: Record<string, "success" | "warning" | "danger" | "default"> = {
  deployed: "success",
  pending: "warning",
  failed: "danger",
  uninstalled: "default",
};

export default function HelmReleasesPanel({ environmentId }: Props) {
  const [releases, setReleases] = useState<HelmRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [releaseToUninstall, setReleaseToUninstall] = useState<HelmRelease | null>(null);
  const [uninstalling, setUninstalling] = useState(false);
  const [releaseToUpgrade, setReleaseToUpgrade] = useState<HelmRelease | null>(null);

  const { isOpen: isInstallOpen, onOpen: onInstallOpen, onOpenChange: onInstallOpenChange } = useDisclosure();
  const { isOpen: isUninstallOpen, onOpen: onUninstallOpen, onOpenChange: onUninstallOpenChange } = useDisclosure();
  const { isOpen: isUpgradeOpen, onOpen: onUpgradeOpen, onOpenChange: onUpgradeOpenChange } = useDisclosure();

  const load = async () => {
    try {
      const data = await listHelmReleases(environmentId);
      setReleases(data);
    } catch {
      toast.error("Failed to load Helm releases");
    }
  };

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [environmentId]);

  const handleInstall = (release: HelmRelease) => {
    setReleases((prev) => [release, ...prev]);
  };

  const handleUpgrade = (updated: HelmRelease) => {
    setReleases((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  };

  const handleUninstall = async () => {
    if (!releaseToUninstall) return;
    setUninstalling(true);
    try {
      await uninstallHelmRelease(environmentId, releaseToUninstall.name);
      setReleases((prev) =>
        prev.map((r) =>
          r.id === releaseToUninstall.id ? { ...r, status: "uninstalled" as const } : r,
        ),
      );
      toast.success("Helm release uninstalled", releaseToUninstall.name);
      onUninstallOpenChange(false);
      setReleaseToUninstall(null);
    } catch {
      toast.error("Failed to uninstall Helm release");
    } finally {
      setUninstalling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" label="Loading releases…" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-default-500">{releases.length} release{releases.length !== 1 ? "s" : ""}</p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="flat" onPress={load}>
            Refresh
          </Button>
          <Button size="sm" color="primary" onPress={onInstallOpen}>
            + Install Chart
          </Button>
        </div>
      </div>

      {releases.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-default-400">
          <p className="text-sm">No Helm releases yet</p>
          <Button size="sm" color="primary" variant="flat" onPress={onInstallOpen}>
            Install your first chart
          </Button>
        </div>
      ) : (
        <Table aria-label="Helm releases" removeWrapper>
          <TableHeader>
            <TableColumn>NAME</TableColumn>
            <TableColumn>CHART</TableColumn>
            <TableColumn>NAMESPACE</TableColumn>
            <TableColumn>STATUS</TableColumn>
            <TableColumn>DEPLOYED</TableColumn>
            <TableColumn>ACTIONS</TableColumn>
          </TableHeader>
          <TableBody>
            {releases.map((rel) => (
              <TableRow key={rel.id}>
                <TableCell>
                  <p className="text-sm font-medium truncate max-w-[200px]">{rel.name}</p>
                </TableCell>
                <TableCell>
                  <span className="text-xs font-mono">
                    {rel.chart_name}{rel.chart_version ? `@${rel.chart_version}` : ""}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-xs text-default-400">{rel.namespace ?? "-"}</span>
                </TableCell>
                <TableCell>
                  <Chip size="sm" variant="flat" color={RELEASE_STATUS_COLOR[rel.status] ?? "default"}>
                    {rel.status}
                  </Chip>
                </TableCell>
                <TableCell>
                  <span className="text-xs text-default-400">
                    {rel.deployed_at ? new Date(rel.deployed_at).toLocaleDateString() : "-"}
                  </span>
                </TableCell>
                <TableCell>
                  {rel.status !== "uninstalled" ? (
                    <div className="flex items-center gap-2">
                      <Tooltip content="Upgrade release">
                        <Button
                          size="sm"
                          variant="flat"
                          color="primary"
                          onPress={() => {
                            setReleaseToUpgrade(rel);
                            onUpgradeOpen();
                          }}
                        >
                          Upgrade
                        </Button>
                      </Tooltip>
                      <Tooltip content="Uninstall release" color="danger">
                        <Button
                          size="sm"
                          variant="flat"
                          color="danger"
                          onPress={() => {
                            setReleaseToUninstall(rel);
                            onUninstallOpen();
                          }}
                        >
                          Uninstall
                        </Button>
                      </Tooltip>
                    </div>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Install modal */}
      <HelmInstallModal
        isOpen={isInstallOpen}
        onOpenChange={onInstallOpenChange}
        environmentId={environmentId}
        onInstall={handleInstall}
      />

      {/* Upgrade modal */}
      <HelmUpgradeModal
        isOpen={isUpgradeOpen}
        onOpenChange={onUpgradeOpenChange}
        environmentId={environmentId}
        release={releaseToUpgrade}
        onUpgrade={handleUpgrade}
      />

      {/* Uninstall confirmation */}
      <Modal isOpen={isUninstallOpen} onOpenChange={onUninstallOpenChange} size="sm">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Uninstall Helm Release</ModalHeader>
              <ModalBody>
                <p className="text-sm text-default-600">
                  Uninstall <span className="font-semibold">{releaseToUninstall?.name}</span>? This will remove the release from the cluster.
                </p>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose} isDisabled={uninstalling}>
                  Cancel
                </Button>
                <Button color="danger" onPress={handleUninstall} isLoading={uninstalling}>
                  Uninstall
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
