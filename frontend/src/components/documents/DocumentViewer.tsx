/**
 * DocumentViewer — inline preview for all supported document types.
 *
 * PDF        → <embed> / <iframe> with presigned URL
 * Markdown   → react-markdown with GFM
 * DOCX       → mammoth.js DOCX-to-HTML (loaded dynamically)
 * XLSX       → read-excel-file renders spreadsheets as interactive tables with sheet tabs
 * Images     → <img> with zoom controls
 * Code files → Monaco Editor (read-only)
 */

import { useEffect, useState } from "react";
import { Button, Spinner } from "../ui";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import type { DocumentFileType } from "../../types";

interface Props {
  /** Presigned S3 URL pointing to the document */
  url: string;
  /** MIME type of the document */
  mimeType: string;
  /** File type tag from the Document entity */
  fileType: DocumentFileType;
  /** File name (used for code-language detection) */
  fileName: string;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

async function fetchBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.arrayBuffer();
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function langFromFileName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    json: "json",
    csv: "plaintext",
    txt: "plaintext",
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    go: "go",
    rs: "rust",
    md: "markdown",
    yaml: "yaml",
    yml: "yaml",
    sh: "shell",
    sql: "sql",
  };
  return map[ext] ?? "plaintext";
}

function safeHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  try {
    const parsed = new URL(href, window.location.origin);
    return ["http:", "https:", "mailto:"].includes(parsed.protocol) ? href : undefined;
  } catch {
    return undefined;
  }
}

const MARKDOWN_COMPONENTS: Components = {
  a: ({ href, children }) => {
    const safe = safeHref(href);
    if (!safe) return <>{children}</>;
    return <a href={safe} target="_blank" rel="noreferrer">{children}</a>;
  },
};

function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, iframe, object, embed, link, meta, style").forEach((node) => node.remove());
  doc.querySelectorAll("*").forEach((node) => {
    for (const attr of Array.from(node.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim();
      if (name.startsWith("on")) node.removeAttribute(attr.name);
      if ((name === "href" || name === "src") && !safeHref(value)) node.removeAttribute(attr.name);
    }
  });
  return doc.body.innerHTML;
}

// ─── Sub-viewers ──────────────────────────────────────────────────────────────

function PdfViewer({ url }: { url: string }) {
  return (
    <div className="w-full h-full min-h-[600px]">
      <embed
        src={url}
        type="application/pdf"
        className="w-full h-full rounded-lg"
        title="PDF document preview"
      />
    </div>
  );
}

function MarkdownViewer({ url }: { url: string }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchText(url).then(setText).catch((e: Error) => setError(e.message));
  }, [url]);

  if (error) return <ErrorState message={error} />;
  if (text === null) return <Loading />;

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none p-6 overflow-auto">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>{text}</ReactMarkdown>
    </div>
  );
}

function ImageViewer({ url, fileName }: { url: string; fileName: string }) {
  const [zoom, setZoom] = useState(1);
  return (
    <div className="flex flex-col items-center gap-3 p-4 overflow-auto">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="flat" onPress={() => setZoom((z) => Math.max(0.25, z - 0.25))} aria-label="Zoom out">−</Button>
        <span className="text-xs text-default-500 w-12 text-center">{Math.round(zoom * 100)}%</span>
        <Button size="sm" variant="flat" onPress={() => setZoom((z) => Math.min(4, z + 0.25))} aria-label="Zoom in">+</Button>
        <Button size="sm" variant="flat" onPress={() => setZoom(1)} aria-label="Reset zoom">Reset</Button>
      </div>
      <img
        src={url}
        alt={fileName}
        style={{ transform: `scale(${zoom})`, transformOrigin: "top center", transition: "transform 0.2s" }}
        className="max-w-full rounded-lg shadow-md"
      />
    </div>
  );
}

function DocxViewer({ url }: { url: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const buf = await fetchBuffer(url);
        // Dynamic import so the bundle remains clean when mammoth isn't installed yet
        const mammoth = await import("mammoth");
        const result = await mammoth.convertToHtml({ arrayBuffer: buf });
        if (!cancelled) setHtml(sanitizeHtml(result.value));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to render DOCX");
      }
    })();
    return () => { cancelled = true; };
  }, [url]);

  if (error) return <ErrorState message={error} />;
  if (html === null) return <Loading label="Converting DOCX…" />;

  return (
    <div
      className="prose prose-sm dark:prose-invert max-w-none p-6 overflow-auto"
      // DOCX files are user-controlled; sanitize converted HTML before rendering.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// read-excel-file returns rows as Cell[][] where Cell = string | number | boolean | Date | null
type ExcelCell = string | number | boolean | Date | null;

interface ParsedSheet {
  name: string;
  /** header row (first row) as strings */
  headers: string[];
  /** data rows, each row is a parallel array to headers */
  rows: ExcelCell[][];
}

function XlsxViewer({ url }: { url: string }) {
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const buf = await fetchBuffer(url);
        // Dynamic import — read-excel-file works natively in the browser with ArrayBuffer
        const readXlsxFile = (await import("read-excel-file")).default as (
          input: ArrayBuffer,
          opts: { sheet: number },
        ) => Promise<ExcelCell[][]>;

        // read-excel-file doesn't expose sheet names from ArrayBuffer in its base API,
        // so we read sheet 1 first and detect multiple sheets by trying until it throws.
        const parsed: ParsedSheet[] = [];
        let sheetIndex = 1;
        while (sheetIndex <= 50) {
          try {
            const rawRows: ExcelCell[][] = await readXlsxFile(buf, { sheet: sheetIndex });
            if (rawRows.length === 0) { sheetIndex++; continue; }
            const headerRow = rawRows[0].map((c) => (c === null ? "" : String(c)));
            const dataRows = rawRows.slice(1);
            parsed.push({ name: `Sheet ${sheetIndex}`, headers: headerRow, rows: dataRows });
            sheetIndex++;
          } catch {
            // No more sheets
            break;
          }
        }

        if (!cancelled) {
          setSheets(parsed.length > 0 ? parsed : [{ name: "Sheet 1", headers: [], rows: [] }]);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to render spreadsheet");
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [url]);

  if (error) return <ErrorState message={error} />;
  if (loading) return <Loading label="Parsing spreadsheet…" />;
  if (!sheets.length) return <ErrorState message="Empty spreadsheet" />;

  const current = sheets[activeSheet];

  function cellValue(cell: ExcelCell): string {
    if (cell === null || cell === undefined) return "";
    if (cell instanceof Date) return cell.toLocaleDateString();
    return String(cell);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sheet tabs */}
      {sheets.length > 1 && (
        <div className="flex gap-1 px-4 pt-3 border-b border-divider flex-shrink-0 overflow-x-auto">
          {sheets.map((s, i) => (
            <button
              key={s.name}
              onClick={() => setActiveSheet(i)}
              className={`px-3 py-1.5 text-xs rounded-t-md border-b-2 transition-colors whitespace-nowrap ${
                i === activeSheet
                  ? "border-primary text-primary bg-primary/5 font-medium"
                  : "border-transparent text-default-400 hover:text-foreground"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      {/* Table */}
      <div className="flex-1 overflow-auto p-2">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-default-100 sticky top-0">
              {current.headers.map((col, ci) => (
                <th
                  key={ci}
                  className="px-3 py-2 text-left font-semibold text-default-600 border border-divider whitespace-nowrap"
                >
                  {col || `Column ${ci + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {current.rows.map((row, ri) => (
              <tr key={ri} className={ri % 2 === 0 ? "bg-content1" : "bg-default-50"}>
                {current.headers.map((_col, ci) => (
                  <td key={ci} className="px-3 py-1.5 border border-divider text-default-700 whitespace-nowrap max-w-xs truncate">
                    {cellValue(row[ci] ?? null)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {current.rows.length === 0 && (
          <p className="text-center text-default-400 text-xs py-8">Sheet is empty</p>
        )}
      </div>
    </div>
  );
}

type MonacoEditorComponent = React.ComponentType<{
  value: string;
  language: string;
  theme: string;
  options: Record<string, unknown>;
  height: string;
}>;

function CodeViewer({ url, fileName }: { url: string; fileName: string }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [MonacoEditor, setMonaco] = useState<MonacoEditorComponent | null>(null);

  useEffect(() => {
    fetchText(url).then(setText).catch((e: Error) => setError(e.message));
    import("@monaco-editor/react").then((mod) => {
      setMonaco(() => mod.default as MonacoEditorComponent);
    }).catch((e: Error) => setError(`Failed to load editor: ${e.message}`));
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <ErrorState message={error} />;
  if (text === null || !MonacoEditor) return <Loading />;

  return (
    <div className="h-full min-h-[500px]">
      <MonacoEditor
        height="100%"
        language={langFromFileName(fileName)}
        value={text}
        theme="vs-dark"
        options={{
          readOnly: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontSize: 13,
          lineNumbers: "on",
          wordWrap: "on",
          folding: true,
          renderLineHighlight: "none",
          overviewRulerLanes: 0,
        }}
      />
    </div>
  );
}

// ─── Utility components ───────────────────────────────────────────────────────

function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-20 gap-3">
      <Spinner size="md" />
      <span className="text-sm text-default-400">{label}</span>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 text-default-400">
      <svg className="w-10 h-10 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
      <p className="text-sm font-medium text-danger">Preview failed</p>
      <p className="text-xs text-center max-w-xs">{message}</p>
    </div>
  );
}

function UnsupportedPreview({ mimeType, url }: { mimeType: string; url: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-default-400">
      <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">Preview not available</p>
        <p className="text-xs mt-1">{mimeType}</p>
      </div>
      <Button
        size="sm"
        variant="flat"
        color="primary"
        as="a"
        href={url}
        target="_blank"
        rel="noopener noreferrer"
      >
        Open in new tab
      </Button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DocumentViewer({ url, mimeType, fileType, fileName }: Props) {
  const isImage = mimeType.startsWith("image/");

  if (fileType === "pdf" || mimeType === "application/pdf") {
    return <PdfViewer url={url} />;
  }
  if (fileType === "md" || mimeType === "text/markdown") {
    return <MarkdownViewer url={url} />;
  }
  if (fileType === "docx" || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return <DocxViewer url={url} />;
  }
  if (fileType === "xlsx" || mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
    return <XlsxViewer url={url} />;
  }
  if (isImage) {
    return <ImageViewer url={url} fileName={fileName} />;
  }
  // Code / text files — JSON, CSV, TXT + anything else with text MIME
  if (
    fileType === "json" ||
    fileType === "csv" ||
    fileType === "txt" ||
    mimeType.startsWith("text/")
  ) {
    return <CodeViewer url={url} fileName={fileName} />;
  }

  return <UnsupportedPreview mimeType={mimeType} url={url} />;
}
