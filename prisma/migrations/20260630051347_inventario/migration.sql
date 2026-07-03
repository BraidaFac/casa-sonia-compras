-- CreateTable
CREATE TABLE `inventories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `status` ENUM('BORRADOR', 'EN_REVISION', 'CONFIRMADO') NOT NULL DEFAULT 'BORRADOR',
    `warehouse_id` INTEGER NOT NULL,
    `warehouse_name` VARCHAR(191) NOT NULL,
    `category_id` INTEGER NOT NULL,
    `category_name` VARCHAR(191) NOT NULL,
    `articles` JSON NOT NULL,
    `odoo_ref` VARCHAR(191) NULL,
    `error_detail` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
