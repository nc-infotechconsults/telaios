import { useState } from "react";
import { Button, Input, Select, SelectItem } from "@heroui/react";
import { notify } from "@/stores/notificationStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { FolderGit2, Cloud, GitBranch, Plus, Loader2 } from "lucide-react";

type SourceType = "git" | "s3";

const inputWrapperViolet =
  "border-white/10 hover:border-white/20 focus-within:!border-violet-500/50 focus-within:ring-1 focus-within:ring-violet-500/20 transition-all bg-white/[0.02]";

const inputWrapperCyan =
  "border-white/10 hover:border-white/20 focus-within:!border-cyan-500/50 focus-within:ring-1 focus-within:ring-cyan-500/20 transition-all bg-white/[0.02]";

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="text-zinc-400 text-sm font-medium block mb-1.5">
      {children}
      {required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  );
}

export function WorkspaceOpen() {
  const [name, setName] = useState("");
  const [sourceType, setSourceType] = useState<SourceType>("git");
  const [gitUrl, setGitUrl] = useState("");
  const [gitBranch, setGitBranch] = useState("");
  const [s3Bucket, setS3Bucket] = useState("");
  const [s3Prefix, setS3Prefix] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace);
  const openWorkspace = useWorkspaceStore((s) => s.openWorkspace);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const source =
        sourceType === "git"
          ? { type: "git" as const, url: gitUrl, branch: gitBranch || undefined }
          : { type: "s3" as const, bucket: s3Bucket, prefix: s3Prefix || undefined };

      const ws = await createWorkspace({ name, source });
      notify({
        title: "Workspace created",
        description: `"${ws.name}" is ready`,
        type: "success",
      });
      await openWorkspace(ws.id);
      navigate(`/ide/${ws.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create workspace";
      setError(msg);
      notify({
        title: "Creation failed",
        description: msg,
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <FieldLabel required>Workspace name</FieldLabel>
        <Input
          placeholder="my-project"
          value={name}
          onValueChange={setName}
          isRequired
          variant="bordered"
          classNames={{
            input: "bg-transparent text-zinc-100",
            inputWrapper: inputWrapperViolet,
          }}
        />
      </div>

      <div>
        <FieldLabel>Source type</FieldLabel>
        <Select
          selectedKeys={[sourceType]}
          disallowEmptySelection
          onSelectionChange={(keys) => {
            const next = [...keys][0] as SourceType | undefined;
            if (next) setSourceType(next);
          }}
          variant="bordered"
          classNames={{
            trigger: inputWrapperViolet,
            value: "text-zinc-100",
          }}
          popoverProps={{
            classNames: {
              content: "bg-[#131316] border border-white/10 text-zinc-200 backdrop-blur-xl",
            }
          }}
        >
          <SelectItem key="git" startContent={<FolderGit2 size={16} className="text-zinc-400" />}>
            Git repository
          </SelectItem>
          <SelectItem key="s3" startContent={<Cloud size={16} className="text-zinc-400" />}>
            S3 bucket
          </SelectItem>
        </Select>
      </div>

      <div className="relative overflow-hidden">
        <AnimatePresence mode="wait">
          {sourceType === "git" ? (
            <motion.div
              key="git"
              initial={{ opacity: 0, height: 0, y: -10 }}
              animate={{ opacity: 1, height: "auto", y: 0 }}
              exit={{ opacity: 0, height: 0, y: -10 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="space-y-5"
            >
              <div>
                <FieldLabel required>Git URL</FieldLabel>
                <Input
                  placeholder="https://github.com/org/repo.git"
                  value={gitUrl}
                  onValueChange={setGitUrl}
                  isRequired
                  variant="bordered"
                  startContent={<FolderGit2 size={16} className="text-zinc-500" />}
                  classNames={{
                    input: "bg-transparent text-zinc-100",
                    inputWrapper: inputWrapperViolet,
                  }}
                />
              </div>
              <div>
                <FieldLabel>Branch (optional)</FieldLabel>
                <Input
                  placeholder="main"
                  value={gitBranch}
                  onValueChange={setGitBranch}
                  variant="bordered"
                  startContent={<GitBranch size={16} className="text-zinc-500" />}
                  classNames={{
                    input: "bg-transparent text-zinc-100",
                    inputWrapper: inputWrapperViolet,
                  }}
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="s3"
              initial={{ opacity: 0, height: 0, y: -10 }}
              animate={{ opacity: 1, height: "auto", y: 0 }}
              exit={{ opacity: 0, height: 0, y: -10 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="space-y-5"
            >
              <div>
                <FieldLabel required>S3 bucket</FieldLabel>
                <Input
                  placeholder="my-bucket"
                  value={s3Bucket}
                  onValueChange={setS3Bucket}
                  isRequired
                  variant="bordered"
                  startContent={<Cloud size={16} className="text-zinc-500" />}
                  classNames={{
                    input: "bg-transparent text-zinc-100",
                    inputWrapper: inputWrapperCyan,
                  }}
                />
              </div>
              <div>
                <FieldLabel>Prefix (optional)</FieldLabel>
                <Input
                  placeholder="projects/my-project/"
                  value={s3Prefix}
                  onValueChange={setS3Prefix}
                  variant="bordered"
                  classNames={{
                    input: "bg-transparent text-zinc-100",
                    inputWrapper: inputWrapperCyan,
                  }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {error && (
        <motion.p 
          initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
          className="text-red-400 text-sm bg-red-500/10 p-3 rounded-lg border border-red-500/20"
        >
          {error}
        </motion.p>
      )}

      <Button
        type="submit"
        color="primary"
        isLoading={loading}
        isDisabled={!name || (sourceType === "git" ? !gitUrl : !s3Bucket)}
        className="w-full bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white shadow-[0_0_20px_rgba(139,92,246,0.3)] hover:shadow-[0_0_25px_rgba(139,92,246,0.5)] border-0 transition-all data-[disabled=true]:opacity-50 data-[disabled=true]:shadow-none font-medium h-12 relative overflow-hidden group"
      >
        <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
        {loading ? (
          <Loader2 className="animate-spin mr-2" size={18} />
        ) : (
          <Plus size={18} className="mr-2" />
        )}
        Create & Open Workspace
      </Button>
    </form>
  );
}
