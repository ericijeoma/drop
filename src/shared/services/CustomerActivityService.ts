// ────────────────────────────────────────────────────────────
// src/shared/services/CustomerActivityService.ts
//
// Answers cross-domain questions about a customer's activity.
// Neither the ride nor delivery domain owns this — it spans both.
// ────────────────────────────────────────────────────────────

import type { RideRepository }  from '@/domains/ride/repositories/RideRepository';
import type { OrderRepository } from '@/domains/delivery/repositories/OrderRepository';
import { DomainError }          from '@/shared/types';

export class CustomerActivityService {
  constructor(
    private readonly rideRepository:  RideRepository,
    private readonly orderRepository: OrderRepository,
  ) {}

  async assertNoActiveActivity(customerId: string): Promise<void> {
    const [activeRide, activeOrder] = await Promise.all([
      this.rideRepository.getActiveRideForCustomer(customerId),
      this.orderRepository.getActiveOrderForCustomer(customerId),
    ]);

    if (activeRide) {
      throw new DomainError(
        'You have an active ride. Cancel it before sending a package.',
        'CUSTOMER_HAS_ACTIVE_RIDE',
      );
    }
    if (activeOrder) {
      throw new DomainError(
        'You already have an active delivery. Wait for it to complete.',
        'CUSTOMER_HAS_ACTIVE_ORDER',
      );
    }
  }
}