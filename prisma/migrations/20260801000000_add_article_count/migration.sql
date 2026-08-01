-- Add article_count column with default 0
ALTER TABLE `inventories` ADD COLUMN `article_count` INTEGER NOT NULL DEFAULT 0;

-- Backfill from existing articles JSON arrays
UPDATE `inventories`
SET `article_count` = JSON_LENGTH(`articles`)
WHERE JSON_VALID(`articles`) AND `articles` IS NOT NULL AND `articles` != 'null';
