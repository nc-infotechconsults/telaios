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
} from "../ui";
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
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
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
