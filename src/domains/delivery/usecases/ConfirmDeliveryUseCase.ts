// ────────────────────────────────────────────────────────────
// src/domains/delivery/usecases/ConfirmDeliveryUseCase.ts
// ────────────────────────────────────────────────────────────

import type { OrderRepository }   from '../repositories/OrderRepository';
import type { DriverRepository }  from '@/domains/driver/repositories/DriverRepository';
import type { PaymentRepository } from '@/domains/payment/repositories/PaymentRepository';
import { DomainError }            from '@/shared/types';
import { logger }                 from '@/shared/lib/logger';

export class ConfirmDeliveryUseCase {
  constructor(
    private readonly orderRepository:   OrderRepository,
    private readonly driverRepository:  DriverRepository,
    private readonly paymentRepository: PaymentRepository
  ) {}

  async execute(orderId: string, driverUserId: string, photoUrl: string): Promise<void> {
    if (!photoUrl.trim()) {
      throw new DomainError('Delivery photo is required.', 'MISSING_PHOTO');
    }

    const driver = await this.driverRepository.getByUserId(driverUserId);
    if (!driver) throw new DomainError('Driver not found.', 'DRIVER_NOT_FOUND');

    const order = await this.orderRepository.getById(orderId);
    if (!order) throw new DomainError('Order not found.', 'ORDER_NOT_FOUND');

    if (order.driverId !== driver.id) {
      throw new DomainError('You are not assigned to this order.', 'UNAUTHORIZED');
    }

    if (order.status !== 'in_transit') {
      throw new DomainError(
        `Cannot confirm delivery for order with status '${order.status}'.`,
        'ORDER_NOT_IN_TRANSIT'
      );
    }

    await this.orderRepository.confirmDelivery(orderId, photoUrl);
    await this.driverRepository.updateStatus(driver.id, 'online');

    const idempotencyKey = `${orderId}:payment:${Date.now()}`;
    await this.paymentRepository.create({
      rideId:         null,
      orderId:        orderId,
      customerId:     order.customerId,
      amount:         order.fareAmount,
      currency:       'NGN',
      idempotencyKey,
    });

    logger.info('Delivery confirmed', { orderId, driverId: driver.id });
  }
}

