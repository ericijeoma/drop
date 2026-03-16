
// ────────────────────────────────────────────────────────────
// src/domains/drivers/usecases/UpdateDriverStatusUseCase.ts
// ────────────────────────────────────────────────────────────

import type { DriverRepository } from '../repositories/DriverRepository';
import type { DriverStatus }     from '@/shared/types';
import { DomainError }           from '@/shared/types';

export class UpdateDriverStatusUseCase {
  constructor(private readonly driverRepository: DriverRepository) {}

  async execute(driverUserId: string, newStatus: DriverStatus): Promise<void> {
    const driver = await this.driverRepository.getByUserId(driverUserId);
    if (!driver) throw new DomainError('Driver profile not found.', 'DRIVER_NOT_FOUND');

    // Apply business rules through the entity
    if (newStatus === 'online')  driver.goOnline();
    if (newStatus === 'offline') driver.goOffline();

    await this.driverRepository.updateStatus(driver.id, newStatus);
  }
}


