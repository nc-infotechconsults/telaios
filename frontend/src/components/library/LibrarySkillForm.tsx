import { useEffect, useState } from "react";
import { Button, Input, Spinner, Textarea } from "../ui";
import {
  createLibrarySkill,
  exportLibrarySkill,
  getLibrarySkill,
  updateLibrarySkill,
} from "../../lib/api";
import { toast } from "../../lib/toast";
import type { LibrarySkill } from "../../types";
import SkillFilePanel, { type FileEntry } from "./SkillFilePanel";

interface MetaEntry {
  key: string;
  value: string;
}

interface Props {
  initialData?: LibrarySkill;
  onSaved: (skill: LibrarySkill) => void;
  onCancel: () => void;
}

// ─── Form section wrapper ────────────────────────────────────────────────────

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description && (
          <p className="text-[11px] text-default-400 mt-0.5">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * Create / edit form for a LibrarySkill catalog entry.
 *
 * - `content` holds the SKILL.md body (frontmatter is synthesised server-side).
 * - `files` holds supporting files (scripts, references, …).
 * - `license`, `compatibility`, `skill_metadata` are optional package metadata.
 */
export default function LibrarySkillForm({ initialData, onSaved, onCancel }: Props) {
  const isEdit = !!initialData;

  /* ── core fields ── */
  const [name, setName] = useState(initialData?.name ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [content, setContent] = useState(initialData?.content ?? "");
  const [tagsRaw, setTagsRaw] = useState((initialData?.tags ?? []).join(", "));
  const [version, setVersion] = useState(initialData?.version ?? "1.0.0");

  /* ── package metadata ── */
  const [license, setLicense] = useState(initialData?.license ?? "");
  const [compatibility, setCompatibility] = useState(initialData?.compatibility ?? "");
  const [metaEntries, setMetaEntries] = useState<MetaEntry[]>(() =>
    Object.entries(initialData?.skill_metadata ?? {}).map(([key, value]) => ({ key, value })),
  );

  /* ── supporting files ── */
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  /* ── form state ── */
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  const [contentTouched, setContentTouched] = useState(false);

  /* Fetch full skill (with files) when editing */
  useEffect(() => {
    if (!isEdit || !initialData?.id) return;
    setLoadingFiles(true);
    getLibrarySkill(initialData.id)
      .then((full) => {
        setFiles(
          (full.files ?? []).map((f) => ({ path: f.path, content: f.content })),
        );
        /* backfill metadata fields that may not be on the list payload */
        if (full.license) setLicense(full.license);
        if (full.compatibility) setCompatibility(full.compatibility);
        if (full.skill_metadata) {
          setMetaEntries(
            Object.entries(full.skill_metadata).map(([key, value]) => ({ key, value })),
          );
        }
      })
      .catch(() => toast.error("Failed to load skill files"))
      .finally(() => setLoadingFiles(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── helpers ── */
  const toSlug = (s: string) =>
    s.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-");

  const addMetaEntry = () => setMetaEntries((prev) => [...prev, { key: "", value: "" }]);

  const updateMetaEntry = (i: number, patch: Partial<MetaEntry>) =>
    setMetaEntries((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));

  const removeMetaEntry = (i: number) =>
    setMetaEntries((prev) => prev.filter((_, idx) => idx !== i));

  const buildMetadata = (): Record<string, string> | undefined => {
    const valid = metaEntries.filter((e) => e.key.trim());
    return valid.length > 0
      ? Object.fromEntries(valid.map((e) => [e.key.trim(), e.value.trim()]))
      : undefined;
  };

  /* ── save ── */
  const handleSave = async () => {
    setNameTouched(true);
    setContentTouched(true);
    if (!name.trim() || !content.trim()) return;
    setSaving(true);
    try {
      const tags = tagsRaw.split(",").map((t) => t.trim()).filter(Boolean);

      const payload: Omit<Partial<LibrarySkill>, "files"> & { files?: FileEntry[] } = {
        name: name.trim(),
        ...(!isEdit ? { slug: toSlug(name) } : {}),
        description: description.trim(),
        content: content.trim(),
        tags,
        version: version.trim() || "1.0.0",
        license: license.trim() || undefined,
        compatibility: compatibility.trim() || undefined,
        skill_metadata: buildMetadata(),
        files,
      };

      const saved = isEdit
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? await updateLibrarySkill(initialData.id, payload as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        : await createLibrarySkill(payload as any);

      toast.success(isEdit ? "Skill updated" : "Skill created", saved.name);
      onSaved(saved);
    } catch {
      toast.error(isEdit ? "Failed to update skill" : "Failed to create skill");
    } finally {
      setSaving(false);
    }
  };

  /* ── export ── */
  const handleExport = async () => {
    if (!initialData?.id) return;
    setExporting(true);
    try {
      await exportLibrarySkill(initialData.id, initialData.slug ?? toSlug(name));
    } catch {
      toast.error("Failed to export skill");
    } finally {
      setExporting(false);
    }
  };

  const disabled = saving || loadingFiles;
  const charCount = content.length;

  return (
    <div className="flex flex-col gap-6">
      {/* ── Identity ──────────────────────────────────────────────────────── */}
      <FormSection
        title="Identity"
        description="How this skill appears in the workspace library."
      >
        <Input
          autoFocus
          isRequired
          label="Name"
          placeholder="e.g. code-review"
          value={name}
          onValueChange={(v) => { setName(v); setNameTouched(true); }}
          onBlur={() => setNameTouched(true)}
          isInvalid={nameTouched && !name.trim()}
          errorMessage={nameTouched && !name.trim() ? "Name is required" : undefined}
          isDisabled={disabled}
        />
        <Textarea
          label="Description"
          placeholder="When should this skill be used?"
          value={description}
          onValueChange={setDescription}
          isDisabled={disabled}
          minRows={2}
        />
      </FormSection>

      {/* ── Skill body ────────────────────────────────────────────────────── */}
      <FormSection
        title="SKILL.md body"
        description="Full skill instructions in markdown — frontmatter is generated for you on save."
      >
        <Textarea
          isRequired
          aria-label="SKILL.md body"
          placeholder="# What this skill does&#10;&#10;## When to use it&#10;&#10;## Steps"
          value={content}
          onValueChange={(v) => { setContent(v); setContentTouched(true); }}
          onBlur={() => setContentTouched(true)}
          isInvalid={contentTouched && !content.trim()}
          errorMessage={contentTouched && !content.trim() ? "SKILL.md body is required" : undefined}
          isDisabled={disabled}
          minRows={10}
          maxRows={24}
          classNames={{ input: "font-mono text-xs" }}
          description={charCount > 0 ? `${charCount.toLocaleString()} characters` : undefined}
        />
      </FormSection>

      {/* ── Supporting files ──────────────────────────────────────────────── */}
      <FormSection
        title="Supporting files"
        description="Scripts, references, or other files shipped alongside SKILL.md."
      >
        {loadingFiles ? (
          <div className="flex justify-center py-4">
            <Spinner size="sm" label="Loading files…" />
          </div>
        ) : (
          <SkillFilePanel value={files} onChange={setFiles} disabled={disabled} />
        )}
      </FormSection>

      {/* ── Catalog metadata ──────────────────────────────────────────────── */}
      <FormSection
        title="Catalog metadata"
        description="Surfaced in the library and packaged into the skill's frontmatter."
      >
        <div className="grid grid-cols-[1fr_8rem] gap-3">
          <Input
            label="Tags"
            placeholder="review, quality"
            value={tagsRaw}
            onValueChange={setTagsRaw}
            isDisabled={disabled}
            description="Comma-separated."
          />
          <Input
            label="Version"
            placeholder="1.0.0"
            value={version}
            onValueChange={setVersion}
            isDisabled={disabled}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="License"
            placeholder="MIT"
            value={license}
            onValueChange={setLicense}
            isDisabled={disabled}
          />
          <Input
            label="Compatibility"
            placeholder="claude-code, opencode"
            value={compatibility}
            onValueChange={setCompatibility}
            isDisabled={disabled}
            description="Runtimes this skill targets."
          />
        </div>

        {/* Custom metadata KV editor */}
        <div className="rounded-xl border border-divider bg-default-50/50 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground">Custom metadata</p>
              <p className="text-[11px] text-default-400 mt-0.5">
                Extra key-value pairs merged into the SKILL.md frontmatter.
              </p>
            </div>
            <Button
              size="sm"
              variant="flat"
              onPress={addMetaEntry}
              isDisabled={disabled}
              className="h-7 px-2.5 text-[11px] shrink-0"
            >
              <i className="fa-solid fa-plus" aria-hidden="true" /> Add
            </Button>
          </div>
          {metaEntries.length === 0 ? (
            <p className="text-[11px] text-default-400 italic px-1 py-1">
              None — click <b>Add</b> to define one.
            </p>
          ) : (
            <div className="space-y-1.5">
              {metaEntries.map((entry, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_1fr_28px] gap-1.5 items-center">
                  <Input
                    size="sm"
                    placeholder="key"
                    value={entry.key}
                    onValueChange={(v) => updateMetaEntry(i, { key: v })}
                    isDisabled={disabled}
                    classNames={{ input: "font-mono text-xs" }}
                    aria-label="Metadata key"
                  />
                  <span className="text-default-300 text-xs">=</span>
                  <Input
                    size="sm"
                    placeholder="value"
                    value={entry.value}
                    onValueChange={(v) => updateMetaEntry(i, { value: v })}
                    isDisabled={disabled}
                    classNames={{ input: "font-mono text-xs" }}
                    aria-label="Metadata value"
                  />
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    color="danger"
                    aria-label={`Remove metadata entry ${i + 1}`}
                    onPress={() => removeMetaEntry(i)}
                    isDisabled={disabled}
                    className="h-7 w-7 min-w-7"
                  >
                    <i className="fa-solid fa-xmark" aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </FormSection>

      {/* ── Actions ──────────────────────────────────────────────────────── */}
      <div className="modal-actions" data-align="between">
        {isEdit ? (
          <Button
            size="sm"
            variant="flat"
            onPress={handleExport}
            isLoading={exporting}
            isDisabled={saving || loadingFiles}
          >
            <i className="fa-solid fa-download" aria-hidden="true" /> Download .zip
          </Button>
        ) : (
          <span />
        )}

        <div className="flex gap-2">
          <Button variant="light" onPress={onCancel} isDisabled={disabled}>
            Cancel
          </Button>
          <Button
            color="primary"
            onPress={handleSave}
            isLoading={saving}
            isDisabled={!name.trim() || !content.trim() || loadingFiles}
          >
            {isEdit ? "Save changes" : "Create skill"}
          </Button>
        </div>
      </div>
    </div>
  );
}
