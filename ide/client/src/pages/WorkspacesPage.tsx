import { WorkspaceOpen } from "@/components/workspace/WorkspaceOpen";
import { WorkspaceList } from "@/components/workspace/WorkspaceList";
import { motion } from "framer-motion";
import { Hexagon } from "lucide-react";

export function WorkspacesPage() {
  return (
    <div className="min-h-screen bg-[#0d0d0f] relative overflow-hidden flex items-start justify-center px-4 pt-20 pb-16">
      <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-violet-600/20 blur-[120px] pointer-events-none" />
      <div className="fixed bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-cyan-600/20 blur-[120px] pointer-events-none" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-2xl space-y-10 relative z-10"
      >
        {/* Logo / title */}
        <div className="text-center space-y-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, type: "spring", bounce: 0.5 }}
            className="inline-flex items-center justify-center p-3 rounded-2xl bg-white/[0.03] ring-1 ring-white/10 backdrop-blur-md mb-2 shadow-[0_0_30px_rgba(139,92,246,0.15)]"
          >
            <div className="bg-gradient-to-br from-violet-500 to-cyan-500 text-transparent bg-clip-text">
               <Hexagon size={36} className="text-violet-400 stroke-[1.5]" />
            </div>
          </motion.div>
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-zinc-100 via-zinc-200 to-zinc-500">
              AgentScope IDE
            </h1>
            <p className="text-sm text-zinc-400 font-medium">
              Container-native, AI-transparent workspace
            </p>
          </div>
        </div>

        {/* Create new */}
        <div className="grid gap-8">
          <motion.section 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white/[0.02] backdrop-blur-xl border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden group"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
            <h2 className="text-sm font-semibold text-zinc-200 mb-6 flex items-center gap-2">
              <span className="w-1.5 h-4 rounded-full bg-gradient-to-b from-violet-500 to-cyan-500 shadow-[0_0_10px_rgba(139,92,246,0.5)]"></span>
              Open a new workspace
            </h2>
            <div className="relative z-10">
              <WorkspaceOpen />
            </div>
          </motion.section>

          {/* Existing */}
          <motion.section 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="space-y-4"
          >
            <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest px-2">
              Recent workspaces
            </h2>
            <WorkspaceList />
          </motion.section>
        </div>
      </motion.div>
    </div>
  );
}

