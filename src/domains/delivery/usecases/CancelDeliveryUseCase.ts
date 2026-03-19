// ────────────────────────────────────────────────────────────
// src/domains/delivery/usecases/CancelDeliveryUseCase.ts
// ────────────────────────────────────────────────────────────

import type { OrderRepository }  from '../repositories/OrderRepository';
import type { DriverRepository } from '@/domains/driver/repositories/DriverRepository';
import { DomainError }           from '@/shared/types';

export class CancelDeliveryUseCase {
  constructor(
    private readonly orderRepository:  OrderRepository,
    private readonly driverRepository: DriverRepository,
  ) {}

  async execute(orderId: string, driverUserId: string): Promise<void> {
    const order = await this.orderRepository.getById(orderId);
    if (!order) throw new DomainError('Order not found.', 'ORDER_NOT_FOUND');

    await this.orderRepository.cancel(orderId);

    // Return driver to online — best effort, non-fatal if it fails
    const driver = await this.driverRepository.getByUserId(driverUserId);
    if (driver) {
      await this.driverRepository.updateStatus(driver.id, 'online');
    }
  }
}