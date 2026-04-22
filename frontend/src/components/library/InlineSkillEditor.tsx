import { useEffect, useState } from "react";
import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  Spinner,
  Textarea,
} from "@heroui/react";
import { listLibrarySkills } from "../../lib/api";
import { toast } from "../../lib/toast";
import type { InlineSkill, LibrarySkill } from "../../types";

interface Props {
  value: InlineSkill[];
  onChange: (entries: InlineSkill[]) => void;
}

const EMPTY: InlineSkill = { name: "", description: "", content: "" };

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="w-4 h-4"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function LibraryPickerModal({
  isOpen,
  onClose,
  onPick,
}: {
  isOpen: boolean;
  onClose: () => void;
  onPick: (skill: LibrarySkill) => void;
}) {
  const [items, setItems] = useState<LibrarySkill[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [q, setQ] = useState("");

  const load = () => {
    if (fetched) return;
    setLoading(true);
    listLibrarySkills()
      .then((data) => {
        setItems(data);
        setFetched(true);
      })
      .catch(() => toast.error("Failed to load library skills"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isOpen) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const filtered = items.filter(
    (s) =>
      !q ||
      s.name.toLowerCase().includes(q.toLowerCase()) ||
      s.description.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => { if (!open) onClose(); }}
      size="lg"
      scrollBehavior="inside"
    >
      <ModalContent>
        {() => (
          <>
            <ModalHeader>Pick from Library</ModalHeader>
            <ModalBody className="pb-6 flex flex-col gap-3">
              <Input
                placeholder="Search…"
                value={q}
                onValueChange={setQ}
                isClearable
                onClear={() => setQ("")}
                autoFocus
              />
              {loading ? (
                <div className="flex justify-center py-8">
                  <Spinner />
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-default-400 text-center py-8">
                  {fetched ? "No skills found." : "Loading…"}
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {filtered.map((skill) => (
                    <button
                      key={skill.id}
                      onClick={() => {
                        onPick(skill);
                        onClose();
                      }}
                      className="flex flex-col gap-0.5 p-3 rounded-lg border border-divider hover:bg-default-100 text-left transition-colors"
                    >
                      <span className="font-medium text-sm">{skill.name}</span>
                      {skill.description && (
                        <p className="text-xs text-default-500">{skill.description}</p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </ModalBody>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}

/**
 * Inline editor for an array of InlineSkill entries.
 * Includes "Add from Library" picker that snapshots a LibrarySkill's content.
 */
export default function InlineSkillEditor({ value, onChange }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const update = (index: number, patch: Partial<InlineSkill>) =>
    onChange(value.map((e, i) => (i === index ? { ...e, ...patch } : e)));

  const remove = (index: number) => onChange(value.filter((_, i) => i !== index));

  const addCustom = () => onChange([...value, { ...EMPTY }]);

  const addFromLibrary = (skill: LibrarySkill) => {
    const entry: InlineSkill = {
      name: skill.name,
      description: skill.description,
      content: skill.content,
    };
    onChange([...value, entry]);
  };

  return (
    <div className="flex flex-col gap-3">
      {value.length === 0 && (
        <p className="text-xs text-default-400 italic">No skills configured.</p>
      )}

      {value.map((entry, i) => (
        <div
          key={i}
          className="flex flex-col gap-2 p-3 rounded-lg border border-divider bg-default-50"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-default-500">Skill #{i + 1}</span>
            <Button
              isIconOnly
              size="sm"
              variant="light"
              color="danger"
              aria-label={`Remove skill ${i + 1}`}
              onPress={() => remove(i)}
            >
              <TrashIcon />
            </Button>
          </div>

          <Input
            size="sm"
            label="Name"
            placeholder="e.g. code-review"
            value={entry.name}
            onValueChange={(v) => update(i, { name: v })}
          />
          <Input
            size="sm"
            label="Description"
            placeholder="What this skill does…"
            value={entry.description}
            onValueChange={(v) => update(i, { description: v })}
          />
          <Textarea
            size="sm"
            label="Content (SKILL.md)"
            placeholder="Paste or write the skill instructions…"
            value={entry.content}
            onValueChange={(v) => update(i, { content: v })}
            minRows={4}
            maxRows={12}
            classNames={{ input: "font-mono text-xs" }}
          />
        </div>
      ))}

      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant="flat" onPress={() => setPickerOpen(true)}>
          + From Library
        </Button>
        <Button size="sm" variant="flat" onPress={addCustom}>
          + Custom skill
        </Button>
      </div>

      <LibraryPickerModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={addFromLibrary}
      />
    </div>
  );
}
