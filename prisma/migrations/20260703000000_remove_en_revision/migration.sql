-- Migrate any EN_REVISION records back to BORRADOR before removing the enum value
UPDATE `inventories` SET `status` = 'BORRADOR' WHERE `status` = 'EN_REVISION';

-- Remove EN_REVISION from the InventoryStatus enum
ALTER TABLE `inventories` MODIFY `status` ENUM('BORRADOR', 'CONFIRMADO') NOT NULL DEFAULT 'BORRADOR';
