import type { DocumentFileType } from "../../types";

interface Props {
  fileType: DocumentFileType;
  size?: "sm" | "md" | "lg";
}

const SIZE_MAP = { sm: "w-5 h-5", md: "w-8 h-8", lg: "w-12 h-12" } as const;

const ICON_CONFIG: Record<DocumentFileType, { color: string; label: string }> = {
  pdf: { color: "#EF4444", label: "PDF" },
  docx: { color: "#3B82F6", label: "DOC" },
  xlsx: { color: "#22C55E", label: "XLS" },
  md: { color: "#9CA3AF", label: "MD" },
  txt: { color: "#9CA3AF", label: "TXT" },
  csv: { color: "#14B8A6", label: "CSV" },
  json: { color: "#F59E0B", label: "{ }" },
  other: { color: "#6B7280", label: "FILE" },
};

export default function FileTypeIcon({ fileType, size = "md" }: Props) {
  const { color, label } = ICON_CONFIG[fileType] ?? ICON_CONFIG.other;

  return (
    <div className={`${SIZE_MAP[size]} flex-shrink-0`}>
      <svg viewBox="0 0 40 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="w-full h-full">
        {/* Document body */}
        <path
          d="M4 4C4 1.79 5.79 0 8 0H26L36 10V44C36 46.21 34.21 48 32 48H8C5.79 48 4 46.21 4 44V4Z"
          fill={color}
          opacity={0.15}
        />
        {/* Folded corner */}
        <path d="M26 0L36 10H30C27.79 10 26 8.21 26 6V0Z" fill={color} opacity={0.3} />
        {/* Border */}
        <path
          d="M8 1H25.5L35 10.5V44C35 45.66 33.66 47 32 47H8C6.34 47 5 45.66 5 44V4C5 2.34 6.34 1 8 1Z"
          stroke={color}
          strokeWidth="1.5"
          fill="none"
        />
        {/* Label text */}
        <text
          x="20"
          y="33"
          textAnchor="middle"
          fill={color}
          fontSize={label.length > 3 ? "8" : "10"}
          fontWeight="700"
          fontFamily="system-ui, sans-serif"
        >
          {label}
        </text>
      </svg>
    </div>
  );
}
