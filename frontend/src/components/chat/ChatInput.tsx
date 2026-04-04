import { useState, type KeyboardEvent } from "react";
import { Button, Textarea } from "@heroui/react";

interface Props {
  onSend: (content: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function ChatInput({ onSend, disabled, placeholder }: Props) {
  const [value, setValue] = useState("");

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  };

  const handleKeyDown = (e: KeyboardEvent<Element>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex gap-2 items-end">
      <Textarea
        className="flex-1"
        placeholder={placeholder ?? "Type a message… (Enter to send, Shift+Enter for newline)"}
        value={value}
        onValueChange={setValue}
        onKeyDown={handleKeyDown}
        minRows={1}
        maxRows={5}
        isDisabled={disabled}
      />
      <Button
        color="primary"
        onPress={handleSend}
        isDisabled={!value.trim() || disabled}
        className="shrink-0 mb-0.5"
      >
        Send
      </Button>
    </div>
  );
}
