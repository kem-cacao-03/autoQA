import { useState, useEffect, useRef } from "react";
import { Download, X } from "lucide-react";

interface Props {
  defaultName: string;
  extension: string; // "json" or "xlsx"
  onConfirm: (filename: string) => void;
  onClose: () => void;
}

export function FilenameDialog({ defaultName, extension, onConfirm, onClose }: Props) {
  const [name, setName] = useState(defaultName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Select all text so user can immediately type a new name
    inputRef.current?.select();
  }, []);

  const handleConfirm = () => {
    const trimmed = name.trim() || defaultName;
    onConfirm(`${trimmed}.${extension}`);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-6 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Save as
          </h3>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filename input + extension suffix */}
        <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-brand-500 transition-all">
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleConfirm();
              if (e.key === "Escape") onClose();
            }}
            className="flex-1 px-3 py-2.5 text-sm bg-transparent outline-none text-slate-800 dark:text-slate-200 min-w-0"
          />
          <span className="px-3 py-2.5 text-sm text-slate-400 bg-slate-50 dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700 shrink-0">
            .{extension}
          </span>
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-4 justify-end">
          <button className="btn-secondary text-sm" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary text-sm" onClick={handleConfirm}>
            <Download className="w-3.5 h-3.5" /> Download
          </button>
        </div>
      </div>
    </div>
  );
}
