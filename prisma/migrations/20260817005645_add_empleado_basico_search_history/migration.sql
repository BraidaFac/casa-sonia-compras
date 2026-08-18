-- AlterTable
ALTER TABLE `employees` MODIFY `role` ENUM('ADMIN', 'MANAGER', 'EMPLEADO', 'EMPLEADO_BASICO') NOT NULL DEFAULT 'EMPLEADO';

-- CreateTable
CREATE TABLE `search_history` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_id` INTEGER NOT NULL,
    `product_template_id` INTEGER NOT NULL,
    `product_name` VARCHAR(191) NOT NULL,
    `product_ref` VARCHAR(191) NULL,
    `thumb_url` TEXT NULL,
    `searched_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `search_history_employee_id_searched_at_idx`(`employee_id`, `searched_at` DESC),
    UNIQUE INDEX `search_history_employee_id_product_template_id_key`(`employee_id`, `product_template_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `search_history` ADD CONSTRAINT `search_history_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
