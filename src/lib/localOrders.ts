import type { Article, LocalArticle, LocalProductImage, ProductImage } from "@/types";

/**
 * Strip base64 and previewUrl from ProductImage before saving to DB.
 * Preserves isFromOdoo, odooId, tempPath, fileName, mimeType, id.
 */
export function stripImagesForDB(articles: Article[]): LocalArticle[] {
  return articles.map((article) => ({
    ...article,
    colorImages: Object.fromEntries(
      Object.entries(article.colorImages).map(([colorName, images]) => [
        colorName,
        images.map(
          (img): LocalProductImage => ({
            id: img.id,
            fileName: img.fileName,
            mimeType: img.mimeType,
            isFromOdoo: img.isFromOdoo ?? false,
            odooId: img.odooId,
            tempPath: img.tempPath,
          }),
        ),
      ]),
    ),
  }));
}

/**
 * Restore previewUrl for isFromOdoo images using their odooId.
 * New images (not isFromOdoo, no tempPath) have no preview until re-uploaded.
 * This runs client-side or in GET handler — no Odoo calls here.
 */
export function restorePreviewUrls(articles: LocalArticle[]): Article[] {
  return articles.map((article) => ({
    ...article,
    colorImages: Object.fromEntries(
      Object.entries(article.colorImages).map(([colorName, images]) => [
        colorName,
        images.map(
          (img): ProductImage => ({
            id: img.id,
            fileName: img.fileName,
            mimeType: img.mimeType,
            isFromOdoo: img.isFromOdoo,
            odooId: img.odooId,
            tempPath: img.tempPath,
            base64: "",        // empty — UI will show placeholder
            previewUrl: img.tempPath
              ? `/uploads/${img.tempPath.replace(/^\/uploads\//, "")}`
              : "",
          }),
        ),
      ]),
    ),
  }));
}
