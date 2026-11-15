import { supabase } from "@/integrations/supabase/client";

export const RAFFLE_IMAGES_BUCKET = "raffle-images";
export const RAFFLE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const RAFFLE_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Devuelve el mensaje de error si el archivo no sirve como imagen del premio, o null si está bien. */
export function validateRaffleImage(file: File): string | null {
  if (!IMAGE_EXTENSIONS[file.type]) {
    return "La imagen debe ser JPG, PNG o WebP";
  }
  if (file.size > RAFFLE_IMAGE_MAX_BYTES) {
    return "La imagen no puede pesar más de 5 MB";
  }
  return null;
}

/**
 * Sube la imagen del premio a la carpeta del usuario y devuelve su URL pública.
 * Las políticas de Storage solo permiten escribir en `<user_id>/...`.
 */
export async function uploadRaffleImage(userId: string, file: File): Promise<string> {
  const validationError = validateRaffleImage(file);
  if (validationError) throw new Error(validationError);

  const path = `${userId}/${crypto.randomUUID()}.${IMAGE_EXTENSIONS[file.type]}`;
  const { error } = await supabase.storage
    .from(RAFFLE_IMAGES_BUCKET)
    .upload(path, file, { contentType: file.type, cacheControl: "31536000" });

  if (error) throw new Error("No se pudo subir la imagen. Probá de nuevo.");

  return supabase.storage.from(RAFFLE_IMAGES_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Borra una imagen subida antes (si era de nuestro bucket). No falla si no puede. */
export async function removeRaffleImage(imageUrl: string | null | undefined) {
  const marker = `/object/public/${RAFFLE_IMAGES_BUCKET}/`;
  const index = imageUrl ? imageUrl.indexOf(marker) : -1;
  if (index === -1) return;

  try {
    const path = decodeURIComponent(imageUrl.slice(index + marker.length).split("?")[0]);
    await supabase.storage.from(RAFFLE_IMAGES_BUCKET).remove([path]);
  } catch (error) {
    console.error("No se pudo borrar la imagen anterior:", error);
  }
}

/** Fecha de hoy en formato YYYY-MM-DD (hora local), para comparar con `draw_date`. */
export function todayDateString(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/**
 * "2026-12-24" -> "24 de diciembre de 2026". `draw_date` es una fecha sin hora:
 * se arma en hora local para que no se corra un día por la zona horaria.
 */
export function formatDrawDate(value: string | null | undefined): string {
  if (!value || !isValidDateString(value.slice(0, 10))) return "";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Fecha y hora en que se hizo el sorteo (`drawn_at`). */
export function formatDrawnAt(value: string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toLocaleString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
