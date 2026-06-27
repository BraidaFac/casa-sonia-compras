-- CreateTable
CREATE TABLE `orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `status` ENUM('DRAFT', 'CONFIRMED', 'ERROR') NOT NULL DEFAULT 'DRAFT',
    `odoo_order_id` INTEGER NULL,
    `odoo_order_name` VARCHAR(191) NULL,
    `error_detail` TEXT NULL,
    `supplier_id` INTEGER NOT NULL,
    `supplier_name` VARCHAR(191) NOT NULL,
    `date` VARCHAR(191) NOT NULL,
    `warehouse_ids` JSON NOT NULL,
    `articles` JSON NOT NULL,
    `print_columns` JSON NOT NULL,
    `print_values` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
