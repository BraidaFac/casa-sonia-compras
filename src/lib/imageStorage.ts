import { writeFile, mkdir, rm, unlink } from "fs/promises";
import { join, dirname } from "path";

const TEMP_BASE = join(process.cwd(), "public", "uploads", "temp");

export function getTempDir(orderId: number): string {
  return join(TEMP_BASE, String(orderId));
}

export function getTempPublicPath(
  orderId: number,
  articleId: string,
  colorName: string,
  filename: string,
): string {
  const safeColor = colorName.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `/uploads/temp/${orderId}/${articleId}/${safeColor}/${filename}`;
}

/**
 * Save a single image file to /uploads/temp/[orderId]/[articleId]/[colorName]/[filename].
 * Returns the server path stored in LocalProductImage.tempPath.
 */
export async function saveTempImage(
  orderId: number,
  articleId: string,
  colorName: string,
  filename: string,
  buffer: Buffer,
): Promise<string> {
  const publicPath = getTempPublicPath(orderId, articleId, colorName, filename);
  const absPath = join(process.cwd(), "public", publicPath.replace(/^\//, ""));
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, buffer);
  return publicPath;
}

/**
 * Delete a single temp image file by its public path.
 */
export async function deleteTempImage(tempPath: string): Promise<void> {
  try {
    const absPath = join(process.cwd(), "public", tempPath.replace(/^\//, ""));
    await unlink(absPath);
  } catch {
    // best-effort
  }
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
