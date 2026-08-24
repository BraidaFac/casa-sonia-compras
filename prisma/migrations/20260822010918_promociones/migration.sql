-- CreateTable
CREATE TABLE `medios_pago` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(191) NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `creado_por_id` INTEGER NOT NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL,

    UNIQUE INDEX `medios_pago_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bancos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(191) NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `creado_por_id` INTEGER NOT NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL,

    UNIQUE INDEX `bancos_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `descuentos_especiales` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(191) NULL,
    `medio_pago_id` INTEGER NOT NULL,
    `tipo` VARCHAR(191) NOT NULL,
    `valor` DECIMAL(10, 4) NOT NULL,
    `alcance` VARCHAR(191) NOT NULL DEFAULT 'global',
    `categoria_odoo_id` INTEGER NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `vigencia_desde` DATETIME(3) NULL,
    `vigencia_hasta` DATETIME(3) NULL,
    `creado_por_id` INTEGER NOT NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `promociones_bancarias` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `titulo` VARCHAR(191) NOT NULL,
    `banco_id` INTEGER NOT NULL,
    `marca_tarjeta` VARCHAR(191) NULL,
    `tipo_beneficio` VARCHAR(191) NOT NULL,
    `cantidad_cuotas` INTEGER NULL,
    `coeficiente_interes` DECIMAL(8, 6) NULL,
    `valor_porcentaje` DECIMAL(8, 4) NULL,
    `tope_reintegro` DECIMAL(10, 2) NULL,
    `descripcion` TEXT NULL,
    `dias_aplicables` VARCHAR(191) NULL,
    `vigencia_desde` DATETIME(3) NOT NULL,
    `vigencia_hasta` DATETIME(3) NULL,
    `activa` BOOLEAN NOT NULL DEFAULT true,
    `orden` INTEGER NULL,
    `creado_por_id` INTEGER NOT NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `medios_pago` ADD CONSTRAINT `medios_pago_creado_por_id_fkey` FOREIGN KEY (`creado_por_id`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bancos` ADD CONSTRAINT `bancos_creado_por_id_fkey` FOREIGN KEY (`creado_por_id`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `descuentos_especiales` ADD CONSTRAINT `descuentos_especiales_medio_pago_id_fkey` FOREIGN KEY (`medio_pago_id`) REFERENCES `medios_pago`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `descuentos_especiales` ADD CONSTRAINT `descuentos_especiales_creado_por_id_fkey` FOREIGN KEY (`creado_por_id`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `promociones_bancarias` ADD CONSTRAINT `promociones_bancarias_banco_id_fkey` FOREIGN KEY (`banco_id`) REFERENCES `bancos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `promociones_bancarias` ADD CONSTRAINT `promociones_bancarias_creado_por_id_fkey` FOREIGN KEY (`creado_por_id`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
