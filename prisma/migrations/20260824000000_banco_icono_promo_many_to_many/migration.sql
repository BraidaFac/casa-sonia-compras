-- Add icono field to bancos
ALTER TABLE `bancos` ADD COLUMN `icono` VARCHAR(191) NULL;

-- Create junction table for many-to-many PromocionBancaria <-> Banco
CREATE TABLE `_PromoBancos` (
    `A` INTEGER NOT NULL,
    `B` INTEGER NOT NULL,

    UNIQUE INDEX `_PromoBancos_AB_unique`(`A`, `B`),
    INDEX `_PromoBancos_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Add foreign keys to junction table
ALTER TABLE `_PromoBancos` ADD CONSTRAINT `_PromoBancos_A_fkey`
    FOREIGN KEY (`A`) REFERENCES `bancos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `_PromoBancos` ADD CONSTRAINT `_PromoBancos_B_fkey`
    FOREIGN KEY (`B`) REFERENCES `promociones_bancarias`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing data: each promo keeps its current banco
INSERT INTO `_PromoBancos` (`A`, `B`)
SELECT `banco_id`, `id` FROM `promociones_bancarias`;

-- Drop old FK and column
ALTER TABLE `promociones_bancarias` DROP FOREIGN KEY `promociones_bancarias_banco_id_fkey`;
ALTER TABLE `promociones_bancarias` DROP COLUMN `banco_id`;
