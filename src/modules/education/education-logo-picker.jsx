import { useId, useRef } from "react";
import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export function EducationLogoPicker({ children, label, uploading, disabled, error, onFileSelect }) {
  const fileInput = useRef(null);
  const errorId = useId();

  function selectFile(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (file) void onFileSelect(file);
  }

  return <div className="flex flex-col items-start gap-2">
    <Button data-content-control=""
      className="group relative size-20 shrink-0 cursor-pointer overflow-hidden rounded-xl p-0"
      variant="ghost"
      size="icon"
      type="button"
      disabled={disabled || uploading}
      aria-label={label}
      aria-busy={uploading || undefined}
      aria-describedby={error ? errorId : undefined}
      onClick={() => fileInput.current?.click()}
    >
      {children}
      <span
        className={`pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-black/60 text-white transition-opacity ${uploading ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"}`}
        aria-hidden="true"
      >
        {uploading ? <Spinner /> : <ImagePlus className="size-6" />}
      </span>
    </Button>
    <Input
      className="hidden"
      ref={fileInput}
      type="file"
      accept="image/jpeg,image/png,image/webp"
      disabled={disabled || uploading}
      onChange={selectFile}
    />
    {uploading && <span className="sr-only" role="status">Загружаем логотип…</span>}
    {error && <FieldError id={errorId}>{error}</FieldError>}
  </div>;
}
