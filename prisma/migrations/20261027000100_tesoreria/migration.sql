-- CreateTable
CREATE TABLE `tesoreria_operaciones` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tipo` ENUM('PAGO', 'COBRO', 'GASTO', 'INGRESO', 'MOVIMIENTO', 'SOCIOS', 'PAGO_CHEQUES_PROPIOS', 'CAMBIO_RECIBO', 'CAMBIO_ENTREGO') NOT NULL,
    `estado` ENUM('BORRADOR', 'PROCESANDO', 'COMPLETADA', 'PENDIENTE_DEBITO', 'REQUIERE_ATENCION', 'ANULANDO', 'ANULADA') NOT NULL DEFAULT 'BORRADOR',
    `fecha_contable` DATE NOT NULL,
    `contacto_id` INTEGER NULL,
    `contacto_nombre` VARCHAR(191) NULL,
    `observacion` TEXT NULL,
    `total` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `datos` JSON NOT NULL,
    `error` TEXT NULL,
    `creado_por_id` INTEGER NOT NULL,
    `confirmado_por_id` INTEGER NULL,
    `confirmado_en` DATETIME(3) NULL,
    `anulado_por_id` INTEGER NULL,
    `anulado_en` DATETIME(3) NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL,

    INDEX `tesoreria_operaciones_fecha_contable_idx`(`fecha_contable`),
    INDEX `tesoreria_operaciones_estado_idx`(`estado`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tesoreria_pasos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `operacion_id` INTEGER NOT NULL,
    `fase` ENUM('EJECUCION', 'ANULACION') NOT NULL,
    `orden` INTEGER NOT NULL,
    `tipo` VARCHAR(191) NOT NULL,
    `payload` JSON NOT NULL,
    `estado` ENUM('PENDIENTE', 'EN_CURSO', 'OK', 'ERROR') NOT NULL DEFAULT 'PENDIENTE',
    `odoo_modelo` VARCHAR(191) NULL,
    `odoo_id` INTEGER NULL,
    `referencia` VARCHAR(191) NOT NULL,
    `error` TEXT NULL,
    `error_tecnico` TEXT NULL,
    `intentos` INTEGER NOT NULL DEFAULT 0,
    `iniciado_en` DATETIME(3) NULL,
    `finalizado_en` DATETIME(3) NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `tesoreria_pasos_operacion_id_fase_orden_key`(`operacion_id`, `fase`, `orden`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tesoreria_eventos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `operacion_id` INTEGER NOT NULL,
    `tipo` VARCHAR(191) NOT NULL,
    `empleado_id` INTEGER NOT NULL,
    `detalle` TEXT NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `tesoreria_eventos_operacion_id_idx`(`operacion_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tesoreria_diarios` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `odoo_journal_id` INTEGER NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `tipo` ENUM('EFECTIVO', 'BANCO', 'CHEQUES') NOT NULL,
    `orden` INTEGER NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `creado_por_id` INTEGER NOT NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tesoreria_diarios_odoo_journal_id_key`(`odoo_journal_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tesoreria_cuentas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `odoo_account_id` INTEGER NOT NULL,
    `codigo` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `uso` ENUM('GASTO', 'INGRESO', 'SOCIO') NOT NULL,
    `creado_por_id` INTEGER NOT NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tesoreria_cuentas_odoo_account_id_uso_key`(`odoo_account_id`, `uso`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tesoreria_config` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `cuenta_ganancia_id` INTEGER NULL,
    `cuenta_perdida_id` INTEGER NULL,
    `cuenta_puente_id` INTEGER NULL,
    `diario_ajustes_id` INTEGER NULL,
    `diario_compras_id` INTEGER NULL,
    `diario_efectivo_default_id` INTEGER NULL,
    `creado_por_id` INTEGER NOT NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `tesoreria_operaciones` ADD CONSTRAINT `tesoreria_operaciones_creado_por_id_fkey` FOREIGN KEY (`creado_por_id`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tesoreria_operaciones` ADD CONSTRAINT `tesoreria_operaciones_confirmado_por_id_fkey` FOREIGN KEY (`confirmado_por_id`) REFERENCES `employees`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tesoreria_operaciones` ADD CONSTRAINT `tesoreria_operaciones_anulado_por_id_fkey` FOREIGN KEY (`anulado_por_id`) REFERENCES `employees`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tesoreria_pasos` ADD CONSTRAINT `tesoreria_pasos_operacion_id_fkey` FOREIGN KEY (`operacion_id`) REFERENCES `tesoreria_operaciones`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tesoreria_eventos` ADD CONSTRAINT `tesoreria_eventos_operacion_id_fkey` FOREIGN KEY (`operacion_id`) REFERENCES `tesoreria_operaciones`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tesoreria_eventos` ADD CONSTRAINT `tesoreria_eventos_empleado_id_fkey` FOREIGN KEY (`empleado_id`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tesoreria_diarios` ADD CONSTRAINT `tesoreria_diarios_creado_por_id_fkey` FOREIGN KEY (`creado_por_id`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tesoreria_cuentas` ADD CONSTRAINT `tesoreria_cuentas_creado_por_id_fkey` FOREIGN KEY (`creado_por_id`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tesoreria_config` ADD CONSTRAINT `tesoreria_config_creado_por_id_fkey` FOREIGN KEY (`creado_por_id`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

