import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ImagePlus, Trash2 } from "lucide-react";
import { RAFFLE_IMAGE_ACCEPT, validateRaffleImage } from "@/lib/raffles";

interface RaffleImageInputProps {
  id: string;
  /** Imagen ya guardada (al editar). */
  currentUrl?: string | null;
  /** Archivo nuevo elegido, todavía sin subir. */
  file: File | null;
  onFileChange: (file: File | null) => void;
  /** Quitar la imagen ya guardada. */
  onRemoveCurrent?: () => void;
  error?: string;
  onError: (message: string) => void;
  disabled?: boolean;
}

export const RaffleImageInput = ({
  id,
  currentUrl,
  file,
  onFileChange,
  onRemoveCurrent,
  error,
  onError,
  disabled,
}: RaffleImageInputProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [filePreview, setFilePreview] = useState<string>("");

  useEffect(() => {
    if (!file) {
      setFilePreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const previewUrl = filePreview || currentUrl || "";

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo
    if (!selected) return;

    const validationError = validateRaffleImage(selected);
    if (validationError) {
      onError(validationError);
      return;
    }

    onError("");
    onFileChange(selected);
  };

  const handleRemove = () => {
    onError("");
    if (file) {
      onFileChange(null);
    } else {
      onRemoveCurrent?.();
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Foto del premio (opcional)</Label>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={RAFFLE_IMAGE_ACCEPT}
        className="hidden"
        onChange={handleSelect}
        disabled={disabled}
      />

      {previewUrl && (
        <div className="rounded-lg border overflow-hidden bg-muted">
          <img src={previewUrl} alt="Foto del premio" className="w-full max-h-64 object-contain" />
        </div>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
        >
          <ImagePlus className="w-4 h-4" />
          {previewUrl ? "Cambiar foto" : "Subir foto"}
        </Button>
        {previewUrl && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-2"
            onClick={handleRemove}
            disabled={disabled}
          >
            <Trash2 className="w-4 h-4" />
            Quitar
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">JPG, PNG o WebP, hasta 5 MB</p>
      {error && <p className="text-sm text-destructive mt-1">{error}</p>}
    </div>
  );
};
