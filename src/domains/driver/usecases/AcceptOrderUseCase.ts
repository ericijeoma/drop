// ────────────────────────────────────────────────────────────
// src/domains/delivery/usecases/AcceptOrderUseCase.ts
//
// Coordinates the delivery and driver bounded contexts.
// Owns the full "driver accepts order" transaction.
// ────────────────────────────────────────────────────────────

import type { OrderRepository } from "@/domains/delivery/repositories/OrderRepository";
import type { DriverRepository } from "@/domains/driver/repositories/DriverRepository";
import type { Order } from "@/domains/delivery/entities/Order";
import { DomainError } from "@/shared/types";
import { logger } from "@/shared/lib/logger";

export class AcceptOrderUseCase {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly driverRepository: DriverRepository,
  ) {}

  async execute(orderId: string, driverUserId: string): Promise<Order> {
    // ── Step 1: Resolve driver profile from the user account ──
    //
    // The caller (screen/controller) knows the driverUserId — who
    // the person IS in the auth domain. We need their driverId —
    // who they are in the driver domain — to act on their profile.
    const driver = await this.driverRepository.getByUserId(driverUserId);
    if (!driver) {
      throw new DomainError("Driver profile not found.", "DRIVER_NOT_FOUND");
    }

    // ── Step 2: Enforce domain rules through the entity ────────
    //
    // A driver must be online and verified before accepting orders.
    // These checks live on the entity — not here — because they
    // are business rules, not infrastructure concerns.
    if (driver.status !== "busy") {
      driver.assertVerified();
      driver.assertOnline();
    } else {
      throw new DomainError(
        "You already have an active delivery.",
        "DRIVER_ALREADY_BUSY",
      );
    }

    // ── Step 3: Atomically claim the order ─────────────────────
    //
    // The optimistic lock inside acceptOrderAtomic ensures that if
    // two drivers try to accept the same order simultaneously,
    // only one wins. The loser gets ORDER_NOT_AVAILABLE thrown.
    let acceptedOrder: Order;
    try {
      acceptedOrder = await this.orderRepository.acceptOrderAtomic(
        orderId,
        driver.id,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === "ORDER_NOT_AVAILABLE") {
        throw new DomainError(
          "This order has already been taken.",
          "ORDER_NOT_AVAILABLE",
        );
      }
      throw err; // unexpected error — rethrow as-is
    }

    // ── Step 4: Mark driver as busy ────────────────────────────
    //
    // This is the step the order repository was wrongly doing.
    // It now lives here — in the use case that owns the full story.
    //
    // We deliberately do NOT roll back the order acceptance if this
    // step fails. The order is correctly assigned. A stuck driver
    // status is recoverable (next status update fixes it). A rolled-
    // back order would confuse the customer and the system both.
    try {
      await this.driverRepository.updateStatus(driver.id, "busy");
    } catch (err) {
      // Non-fatal: log for ops team to investigate. The driver's
      // next status ping or order completion will correct the state.
      logger.error("AcceptOrderUseCase: failed to set driver busy", {
        driverId: driver.id,
        orderId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return acceptedOrder;
  }
}
