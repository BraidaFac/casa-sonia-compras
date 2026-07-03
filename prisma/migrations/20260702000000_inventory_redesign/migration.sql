-- AlterTable
ALTER TABLE `inventories`
  DROP COLUMN `category_id`,
  DROP COLUMN `category_name`,
  CHANGE `inventory_date` `count_date` VARCHAR(191) NULL,
  ADD COLUMN `accounting_date` VARCHAR(191) NULL;
