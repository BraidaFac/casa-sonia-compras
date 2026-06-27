import { writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";

const TEMP_BASE = join(process.cwd(), "public", "uploads", "temp");

export function getTempDir(orderId: number): string {
  return join(TEMP_BASE, String(orderId));
}

export function getTempPublicPath(orderId: number, filename: string): string {
  return `/uploads/temp/${orderId}/${filename}`;
}

/**
 * Save a single image file to /uploads/temp/[orderId]/[filename].
 * Returns the server path stored in LocalProductImage.tempPath.
 */
export async function saveTempImage(
  orderId: number,
  filename: string,
  buffer: Buffer,
): Promise<string> {
  const dir = getTempDir(orderId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), buffer);
  return getTempPublicPath(orderId, filename);
}

/**
 * Delete the entire temp folder for an order (called after successful confirm).
 */
export async function deleteTempFolder(orderId: number): Promise<void> {
  try {
    await rm(getTempDir(orderId), { recursive: true, force: true });
  } catch {
    // best-effort: log but don't throw
    console.error(`Failed to delete temp folder for order ${orderId}`);
  }
}
