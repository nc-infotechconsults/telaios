import type { CSSProperties } from "react";

type IconName =
  | "home" | "folder" | "folder-open" | "folder-plus"
  | "code" | "book" | "bot" | "sparkle" | "search"
  | "bell" | "settings" | "plus" | "chev" | "chevd"
  | "git" | "branch" | "file" | "chat" | "send"
  | "play" | "paperclip" | "cube" | "users" | "check"
  | "cmd" | "moon" | "sun" | "panel" | "play2" | "pause"
  | "star" | "eye" | "layers" | "terminal" | "sandbox"
  | "upload" | "arrow" | "spark" | "workflow" | "sliders"
  | "inbox" | "pr" | "issue" | "bot2" | "key" | "globe"
  | "lock" | "cpu" | "zap" | "refresh" | "trash" | "edit"
  | "copy" | "external" | "menu" | "close" | "info";

interface Props {
  name: IconName | string;
  size?: "sm" | "md" | "lg";
  className?: string;
  style?: CSSProperties;
}

const PATHS: Record<string, React.ReactNode> = {
  home: <path d="M3 12 12 3l9 9M5 10v10h14V10" />,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  "folder-open": <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1" /><path d="M3 9h18l-2 9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>,
  "folder-plus": <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><line x1="12" y1="11" x2="12" y2="17" /><line x1="9" y1="14" x2="15" y2="14" /></>,
  code: <><polyline points="8 7 3 12 8 17" /><polyline points="16 7 21 12 16 17" /><line x1="14" y1="5" x2="10" y2="19" /></>,
  book: <><path d="M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2z" /><path d="M4 17.5h15" /></>,
  bot: <><rect x="4" y="8" width="16" height="12" rx="3" /><circle cx="9" cy="14" r="1" /><circle cx="15" cy="14" r="1" /><path d="M12 4v4M8 4h8" /></>,
  sparkle: <><path d="M12 3v6M12 15v6M3 12h6M15 12h6M5.5 5.5l4 4M14.5 14.5l4 4M18.5 5.5l-4 4M9.5 14.5l-4 4" /></>,
  search: <><circle cx="11" cy="11" r="7" /><line x1="20" y1="20" x2="16.5" y2="16.5" /></>,
  bell: <><path d="M6 10a6 6 0 0 1 12 0c0 7 3 7 3 7H3s3 0 3-7" /><path d="M10 21a2 2 0 0 0 4 0" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14 3h-4l-.6 2.6a7 7 0 0 0-2 1.2L5 6l-2 3.4 2 1.5A7 7 0 0 0 5 12a7 7 0 0 0 .1 1.2l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2L10 21h4l.6-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z" /></>,
  plus: <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
  chev: <polyline points="9 6 15 12 9 18" />,
  chevd: <polyline points="6 9 12 15 18 9" />,
  git: <><circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="12" r="2.5" /><path d="M6 8.5v7M8 6c5 0 8 2 8 6" /></>,
  branch: <><line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9c0 3-3 5-6 5h-3" /></>,
  file: <><path d="M6 3h8l5 5v13H6z" /><polyline points="14 3 14 8 19 8" /></>,
  chat: <path d="M20 4H4a1 1 0 0 0-1 1v13l4-3h13a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1z" />,
  send: <><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></>,
  play: <polygon points="6 4 20 12 6 20 6 4" />,
  paperclip: <path d="M21 12.5 12.5 21a5 5 0 1 1-7-7L14 5.5a3.5 3.5 0 1 1 5 5L11 19a2 2 0 1 1-3-3l7-7" />,
  cube: <><path d="M21 8 12 3 3 8l9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><line x1="12" y1="13" x2="12" y2="21" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M3 21a6 6 0 0 1 12 0" /><circle cx="17" cy="9" r="2.5" /><path d="M16 21a4 4 0 0 1 5-4" /></>,
  check: <polyline points="5 12 10 17 19 7" />,
  cmd: <path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z" />,
  moon: <path d="M21 14a9 9 0 1 1-12-12 7 7 0 0 0 12 12z" />,
  sun: <><circle cx="12" cy="12" r="4" /><line x1="12" y1="2" x2="12" y2="5" /><line x1="12" y1="19" x2="12" y2="22" /><line x1="2" y1="12" x2="5" y2="12" /><line x1="19" y1="12" x2="22" y2="12" /><line x1="5" y1="5" x2="7" y2="7" /><line x1="17" y1="17" x2="19" y2="19" /><line x1="5" y1="19" x2="7" y2="17" /><line x1="17" y1="7" x2="19" y2="5" /></>,
  panel: <><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="15" y1="4" x2="15" y2="20" /></>,
  play2: <polygon points="8 5 19 12 8 19 8 5" />,
  pause: <><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></>,
  star: <polygon points="12 3 14.5 9 21 9.5 16 14 17.5 21 12 17.5 6.5 21 8 14 3 9.5 9.5 9" />,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  layers: <><polygon points="12 3 22 9 12 15 2 9" /><polyline points="2 14 12 20 22 14" /></>,
  terminal: <><polyline points="5 8 9 12 5 16" /><line x1="12" y1="16" x2="19" y2="16" /></>,
  sandbox: <><rect x="3" y="3" width="18" height="18" rx="3" strokeDasharray="3 2" /><path d="M9 12h6M12 9v6" /></>,
  upload: <><line x1="12" y1="3" x2="12" y2="15" /><polyline points="6 9 12 3 18 9" /><path d="M3 15v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4" /></>,
  arrow: <><line x1="5" y1="12" x2="19" y2="12" /><polyline points="13 6 19 12 13 18" /></>,
  spark: <><path d="M12 3 13.5 9.5 20 11l-6.5 1.5L12 19l-1.5-6.5L4 11l6.5-1.5z" /><path d="M19 4l.5 2L21 6.5 19.5 7 19 9l-.5-2L17 6.5 18.5 6z" /></>,
  workflow: <><rect x="3" y="4" width="6" height="6" rx="1" /><rect x="15" y="4" width="6" height="6" rx="1" /><rect x="9" y="14" width="6" height="6" rx="1" /><path d="M6 10v2a2 2 0 0 0 2 2h1M18 10v2a2 2 0 0 1-2 2h-1" /></>,
  sliders: <><line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" /><circle cx="8" cy="6" r="2" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" /><circle cx="10" cy="18" r="2" fill="currentColor" stroke="none" /></>,
  inbox: <><polyline points="3 13 9 13 11 16 13 16 15 13 21 13" /><path d="M5 5h14l2 8v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6z" /></>,
  pr: <><circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M6 8.5v7M18 6V16M14 6h2a2 2 0 0 1 2 2v0" /></>,
  issue: <><circle cx="12" cy="12" r="9" /><line x1="12" y1="7" x2="12" y2="13" /><circle cx="12" cy="17" r="1" fill="currentColor" /></>,
  key: <><circle cx="8" cy="12" r="4" /><path d="M14 12h6M17 9v6" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c-2 3-3 6-3 9s1 6 3 9M12 3c2 3 3 6 3 9s-1 6-3 9" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  cpu: <><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M20 9h2M2 15h2M20 15h2" /></>,
  zap: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
  refresh: <><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></>,
  trash: <><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></>,
  edit: <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" /></>,
  copy: <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  external: <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></>,
  menu: <><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>,
  close: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
  info: <><circle cx="12" cy="12" r="9" /><line x1="12" y1="7" x2="12" y2="8" /><line x1="12" y1="11" x2="12" y2="17" /></>,
};

export function Icon({ name, size, className = "", style }: Props) {
  const sizeClass = size === "sm" ? "icon-sm" : size === "lg" ? "icon-lg" : "";
  return (
    <svg
      viewBox="0 0 24 24"
      className={`icon ${sizeClass} ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      style={style}
    >
      {PATHS[name] ?? null}
    </svg>
  );
}

export default Icon;
