import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { IDEShell } from "@/components/layout/IDEShell";
import { Spinner, Button } from "@heroui/react";
import { AlertTriangle, Loader2 } from "lucide-react";

export function IDEPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const openWorkspace = useWorkspaceStore((s) => s.openWorkspace);
  const fetchWorkspaces = useWorkspaceStore((s) => s.fetchWorkspaces);
  const isLoading = useWorkspaceStore((s) => s.isLoading);
  const storeError = useWorkspaceStore((s) => s.error);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      navigate("/");
      return;
    }

    async function init() {
      await fetchWorkspaces();
      const ws = useWorkspaceStore.getState().workspaces.find((w) => w.id === id);
      if (!ws) {
        navigate("/");
        return;
      }
      if (useWorkspaceStore.getState().activeWorkspace?.id !== id) {
        await openWorkspace(id!);
      }
    }

    init().catch((err: unknown) => {
      setInitError(err instanceof Error ? err.message : "Failed to start workspace");
    });
  }, [id]);

  // Show error if init threw or the store recorded an error while activeWorkspace is still null
  const errorMessage = initError ?? ((!activeWorkspace && !isLoading) ? storeError : null);

  if (errorMessage) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0a0a0c] relative overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[500px] h-[500px] bg-red-500/10 rounded-full blur-[120px]" />
        </div>

        <div className="bg-white/[0.02] backdrop-blur-xl border border-red-500/20 rounded-2xl p-10 max-w-md w-full text-center shadow-2xl flex flex-col items-center relative z-10">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mb-6 shadow-inner border border-red-500/20">
            <AlertTriangle className="text-red-400 drop-shadow-[0_0_10px_rgba(248,113,113,0.5)]" size={32} />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Workspace Error</h2>
          <p className="text-zinc-400 text-sm mb-8">{errorMessage}</p>
          <Button 
            className="w-full bg-white/[0.05] hover:bg-white/[0.1] text-white border border-white/[0.05]" 
            onPress={() => navigate("/")}
          >
            Back to workspaces
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading || !activeWorkspace) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0a0a0c] relative overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[120px]" />
          <div className="w-[400px] h-[400px] bg-violet-500/10 rounded-full blur-[100px] absolute mix-blend-screen" />
        </div>

        <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.05] rounded-2xl p-12 max-w-sm w-full text-center shadow-2xl flex flex-col items-center relative z-10">
          <div className="relative mb-8">
            <div className="absolute inset-0 bg-gradient-to-tr from-violet-500 to-cyan-500 rounded-full blur-xl opacity-50 animate-pulse" />
            <div className="relative bg-[#0a0a0c] p-4 rounded-full border border-white/10">
              <Loader2 className="text-cyan-400 animate-spin" size={32} />
            </div>
          </div>
          <h2 className="text-lg font-medium text-white mb-2">Starting Workspace</h2>
          <p className="text-zinc-400 text-sm">Please wait while we prepare your environment...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#0a0a0c]">
      <IDEShell />
    </div>
  );
}