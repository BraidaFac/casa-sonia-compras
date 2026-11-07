-- CreateTable
CREATE TABLE `tesoreria_adjuntos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `operacion_id` INTEGER NOT NULL,
    `diario_id` INTEGER NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `mimetype` VARCHAR(191) NOT NULL,
    `contenido` LONGBLOB NOT NULL,
    `creado_por_id` INTEGER NOT NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `tesoreria_adjuntos_operacion_id_idx`(`operacion_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `tesoreria_adjuntos` ADD CONSTRAINT `tesoreria_adjuntos_operacion_id_fkey` FOREIGN KEY (`operacion_id`) REFERENCES `tesoreria_operaciones`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tesoreria_adjuntos` ADD CONSTRAINT `tesoreria_adjuntos_creado_por_id_fkey` FOREIGN KEY (`creado_por_id`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
