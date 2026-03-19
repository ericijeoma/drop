// ────────────────────────────────────────────────────────────
// src/domains/delivery/usecases/PlaceOrderUseCase.ts
// ────────────────────────────────────────────────────────────

import type { OrderRepository } from '../repositories/OrderRepository';
import type { AuthRepository }  from '@/domains/auth/repositories/AuthRepository';
import type { CustomerActivityService } from '@/shared/services/CustomerActivityService';
import { getRoute }             from '@/shared/utils/directions';
import { calculateFare }        from '@/shared/utils/fare';
import { DomainError }          from '@/shared/types';
import type { PackageSize, Coords } from '@/shared/types';
import { logger }               from '@/shared/lib/logger';

export interface PlaceOrderInput {
  readonly customerId:          string;
  readonly pickupAddress:       string;
  readonly dropoffAddress:      string;
  readonly pickupCoords:        Coords;
  readonly dropoffCoords:       Coords;
  readonly packageDescription:  string;
  readonly packageSize:         PackageSize;
}

export class PlaceOrderUseCase {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly authRepository:  AuthRepository,
    private readonly customerActivity:     CustomerActivityService,
  ) {}

  async execute(input: PlaceOrderInput): Promise<{ orderId: string; fareAmount: number }> {
    const user = await this.authRepository.getUserById(input.customerId);
    if (!user) throw new DomainError('Customer not found.', 'USER_NOT_FOUND');
    user.assertNotBanned();
    user.assertIsCustomer();

    // ✅ Cross-domain check delegated to shared service
    await this.customerActivity.assertNoActiveActivity(input.customerId);
    

    if (!input.packageDescription.trim()) {
      throw new DomainError('Please describe the package.', 'MISSING_PACKAGE_DESC');
    }

    const route = await getRoute(input.pickupCoords, input.dropoffCoords);
    // Deliveries use 'motorbike' pricing by default (van for large packages)
    const vehicleType = input.packageSize === 'large' ? 'van' as const : 'motorbike' as const;
    const fareBreakdown = calculateFare(route.distanceKm, vehicleType);

    const order = await this.orderRepository.createAtomic({
      customerId:          input.customerId,
      pickupAddress:       input.pickupAddress,
      dropoffAddress:      input.dropoffAddress,
      pickupCoords:        input.pickupCoords,
      dropoffCoords:       input.dropoffCoords,
      packageDescription:  input.packageDescription,
      packageSize:         input.packageSize,
      distanceKm:          route.distanceKm,
      fareAmount:          fareBreakdown.totalFare,
    });

    logger.info('Order placed', { orderId: order.id, customerId: input.customerId });
    return { orderId: order.id, fareAmount: order.fareAmount };
  }
}


