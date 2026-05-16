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

  return (
    <div className="flex flex-col gap-4">
      {/* Basic fields */}
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

      <Textarea
        isRequired
        label="SKILL.md body"
        placeholder="Paste the full skill instructions in markdown… (frontmatter is generated automatically)"
        value={content}
        onValueChange={(v) => { setContent(v); setContentTouched(true); }}
        onBlur={() => setContentTouched(true)}
        isInvalid={contentTouched && !content.trim()}
        errorMessage={contentTouched && !content.trim() ? "SKILL.md body is required" : undefined}
        isDisabled={disabled}
        minRows={8}
        maxRows={20}
        classNames={{ input: "font-mono text-xs" }}
      />

      {/* Tags + Version */}
      <div className="flex gap-3">
        <Input
          label="Tags"
          placeholder="Comma-separated, e.g. review, quality"
          value={tagsRaw}
          onValueChange={setTagsRaw}
          isDisabled={disabled}
          className="flex-1"
        />
        <Input
          label="Version"
          placeholder="1.0.0"
          value={version}
          onValueChange={setVersion}
          isDisabled={disabled}
          className="w-32"
        />
      </div>

      {/* Package metadata */}
      <div className="flex gap-3">
        <Input
          label="License"
          placeholder="MIT"
          value={license}
          onValueChange={setLicense}
          isDisabled={disabled}
          className="flex-1"
        />
        <Input
          label="Compatibility"
          placeholder="claude-code, opencode"
          value={compatibility}
          onValueChange={setCompatibility}
          isDisabled={disabled}
          className="flex-1"
        />
      </div>

      {/* Skill metadata key-value pairs */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-default-600">Metadata</span>
          {!disabled && (
            <Button size="sm" variant="flat" onPress={addMetaEntry}>
              + Add entry
            </Button>
          )}
        </div>
        {metaEntries.length === 0 && (
          <p className="text-xs text-default-400">
            No metadata entries. Key-value pairs are included in the SKILL.md frontmatter.
          </p>
        )}
        {metaEntries.map((entry, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              size="sm"
              placeholder="key"
              value={entry.key}
              onValueChange={(v) => updateMetaEntry(i, { key: v })}
              isDisabled={disabled}
              classNames={{ input: "font-mono text-xs" }}
              className="flex-1"
            />
            <Input
              size="sm"
              placeholder="value"
              value={entry.value}
              onValueChange={(v) => updateMetaEntry(i, { value: v })}
              isDisabled={disabled}
              classNames={{ input: "font-mono text-xs" }}
              className="flex-1"
            />
            {!disabled && (
              <Button
                isIconOnly
                size="sm"
                variant="light"
                color="danger"
                aria-label={`Remove metadata entry ${i + 1}`}
                onPress={() => removeMetaEntry(i)}
              >
                ×
              </Button>
            )}
          </div>
        ))}
      </div>

      {/* Supporting files */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-default-600">Supporting files</span>
        {loadingFiles ? (
          <div className="flex justify-center py-4">
            <Spinner size="sm" label="Loading files…" />
          </div>
        ) : (
          <SkillFilePanel value={files} onChange={setFiles} disabled={disabled} />
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between gap-2 pt-2">
        {isEdit ? (
          <Button
            size="sm"
            variant="flat"
            onPress={handleExport}
            isLoading={exporting}
            isDisabled={saving || loadingFiles}
          >
            Download .zip
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
