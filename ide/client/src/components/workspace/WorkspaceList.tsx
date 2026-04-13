import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Spinner,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  useDisclosure,
} from "@heroui/react";
import { notify } from "@/stores/notificationStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import type { Workspace } from "@/types";
import { motion } from "framer-motion";
import {
  FolderGit2,
  Cloud,
  ArrowRight,
  Activity,
  AlertCircle,
  Play,
  Pause,
  Trash2,
} from "lucide-react";

const STATUS_CONFIG: Record<
  Workspace["status"],
  { color: string; icon: React.ReactNode; glow: string; text: string }
> = {
  idle: {
    color: "text-zinc-400",
    glow: "shadow-zinc-500/20",
    icon: <Pause size={12} />,
    text: "bg-zinc-500/10 border-zinc-500/20",
  },
  cloning: {
    color: "text-yellow-400",
    glow: "shadow-yellow-500/30",
    icon: <Activity size={12} className="animate-pulse" />,
    text: "bg-yellow-500/10 border-yellow-500/20",
  },
  starting: {
    color: "text-yellow-400",
    glow: "shadow-yellow-500/30",
    icon: <Activity size={12} className="animate-pulse" />,
    text: "bg-yellow-500/10 border-yellow-500/20",
  },
  running: {
    color: "text-emerald-400",
    glow: "shadow-emerald-500/30",
    icon: <Play size={12} />,
    text: "bg-emerald-500/10 border-emerald-500/20",
  },
  sleeping: {
    color: "text-blue-400",
    glow: "shadow-blue-500/30",
    icon: <Pause size={12} />,
    text: "bg-blue-500/10 border-blue-500/20",
  },
  error: {
    color: "text-red-400",
    glow: "shadow-red-500/30",
    icon: <AlertCircle size={12} />,
    text: "bg-red-500/10 border-red-500/20",
  },
};

export function WorkspaceList() {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const isLoading = useWorkspaceStore((s) => s.isLoading);
  const fetchWorkspaces = useWorkspaceStore((s) => s.fetchWorkspaces);
  const openWorkspace = useWorkspaceStore((s) => s.openWorkspace);
  const deleteWorkspace = useWorkspaceStore((s) => s.deleteWorkspace);
  const navigate = useNavigate();

  const { isOpen, onOpen, onClose } = useDisclosure();
  const [pendingDelete, setPendingDelete] = useState<Workspace | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchWorkspaces();
  }, []);

  async function handleOpen(ws: Workspace) {
    await openWorkspace(ws.id);
    navigate(`/ide/${ws.id}`);
  }

  function handleDeleteClick(e: React.MouseEvent, ws: Workspace) {
    e.stopPropagation();
    setPendingDelete(ws);
    onOpen();
  }

  async function handleConfirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteWorkspace(pendingDelete.id);
      notify({
        title: "Workspace deleted",
        description: `"${pendingDelete.name}" has been removed`,
        type: "success",
      });
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to delete workspace";
      notify({ title: "Delete failed", description: msg, type: "error" });
    } finally {
      setDeleting(false);
      setPendingDelete(null);
      onClose();
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" color="secondary" />
      </div>
    );
  }

  if (workspaces.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-white/[0.02] border border-white/5 rounded-xl p-8 text-center"
      >
        <p className="text-zinc-400 text-sm">
          No workspaces yet. Create one above to get started.
        </p>
      </motion.div>
    );
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    show: {
      opacity: 1,
      y: 0,
      transition: { type: "spring", bounce: 0, duration: 0.5 },
    },
  };

  return (
    <>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="space-y-3"
      >
        {workspaces.map((ws) => {
          const config = STATUS_CONFIG[ws.status];

          return (
            <motion.button
              variants={itemVariants}
              key={ws.id}
              onClick={() => handleOpen(ws)}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className={[
                "w-full flex items-center gap-4 p-4 rounded-xl text-left relative overflow-hidden",
                "bg-white/[0.03] hover:bg-white/[0.06] backdrop-blur-md",
                "border border-white/10 hover:border-violet-500/30 hover:shadow-[0_0_20px_rgba(139,92,246,0.15)]",
                "transition-all duration-300 group",
              ].join(" ")}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-violet-500/0 via-violet-500/5 to-cyan-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-zinc-400 group-hover:text-violet-400 transition-colors">
                {ws.source.type === "git" ? (
                  <FolderGit2 size={18} />
                ) : (
                  <Cloud size={18} />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-zinc-100 truncate flex items-center gap-2">
                  {ws.name}
                </p>
                <p className="text-xs text-zinc-500 truncate mt-0.5 group-hover:text-zinc-400 transition-colors">
                  {ws.source.type === "git"
                    ? ws.source.url
                    : `s3://${ws.source.bucket}`}
                </p>
              </div>

              <div
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${config.text} ${config.glow} shadow-lg shrink-0`}
              >
                <span className={config.color}>{config.icon}</span>
                <span
                  className={`text-[10px] font-medium uppercase tracking-wider ${config.color}`}
                >
                  {ws.status}
                </span>
              </div>

              <div
                role="button"
                tabIndex={0}
                onClick={(e) => handleDeleteClick(e, ws)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    setPendingDelete(ws);
                    onOpen();
                  }
                }}
                className="relative z-10 p-2 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
              >
                <Trash2 size={16} />
              </div>

              <div className="text-zinc-600 group-hover:text-cyan-400 transition-colors shrink-0">
                <ArrowRight size={18} />
              </div>
            </motion.button>
          );
        })}
      </motion.div>

      <Modal
        isOpen={isOpen}
        onClose={onClose}
        classNames={{
          base: "bg-[#1a1a1f] border border-white/10 backdrop-blur-2xl",
          header: "border-b border-white/5",
          footer: "border-t border-white/5",
        }}
      >
        <ModalContent>
          <ModalHeader className="text-zinc-100">Delete workspace</ModalHeader>
          <ModalBody>
            <p className="text-zinc-300 text-sm">
              Are you sure you want to delete{" "}
              <span className="font-semibold text-zinc-100">
                {pendingDelete?.name}
              </span>
              ? This will remove all workspace files and cannot be undone.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="flat"
              onPress={onClose}
              className="bg-white/5 text-zinc-300 hover:bg-white/10"
            >
              Cancel
            </Button>
            <Button
              color="danger"
              isLoading={deleting}
              onPress={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-500"
            >
              Delete
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
