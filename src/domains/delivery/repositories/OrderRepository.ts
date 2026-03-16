// ────────────────────────────────────────────────────────────
// src/domains/delivery/repositories/OrderRepository.ts
//
// Domain port — what the delivery bounded context needs from
// any persistence provider. Zero infrastructure imports.
// ────────────────────────────────────────────────────────────

import type { Order, OrderProps } from '@/domains/delivery/entities/Order';
import type { OrderStatus, Coords, PaginatedResult } from '@/shared/types';

// ── Input Value Objects ───────────────────────────────────────

/**
 * CreateOrderInput
 *
 * Value Object — the exact data required to place a new delivery
 * order. No ID (the database assigns that). No status (always
 * starts as 'pending'). No driverId (not assigned yet).
 *
 * Think of it as the filled-in delivery request form a customer
 * submits. The form itself has no identity — only its contents
 * matter.
 */
export interface CreateOrderInput {
  customerId:         string;
  pickupAddress:      string;
  dropoffAddress:     string;
  pickupCoords:       Coords;
  dropoffCoords:      Coords;
  packageDescription: string;
  packageSize:        OrderProps['packageSize'];
  distanceKm:         number;
  fareAmount:         number;
}

/**
 * OrderRepository
 *
 * The single source of truth for delivery order persistence
 * within the delivery bounded context.
 *
 * Rules:
 *  - All methods are async.
 *  - Nullable returns mean "not found" — not a failure.
 *  - Throw only for genuine persistence or business rule failures.
 *  - This repository manages ONLY the orders table.
 *    Driver status changes triggered by order events belong in
 *    the use case layer — not here.
 */
export interface OrderRepository {

  // ── Queries ──────────────────────────────────────────────

  /**
   * Find an order by its unique ID.
   * Returns null if no order with that ID exists.
   */
  getById(id: string): Promise<Order | null>;

  /**
   * Find the single active (in-progress) order for a customer.
   * Active means status is pending, assigned, or in_transit.
   * Returns null if the customer has no active order.
   * A customer may only have one active order at a time.
   */
  getActiveOrderForCustomer(customerId: string): Promise<Order | null>;

  /**
   * Returns all orders currently in 'pending' status,
   * ordered oldest first — so the longest-waiting order
   * is always at the top of the queue.
   */
  getPendingOrders(): Promise<Order[]>;

  /**
   * Returns a paginated history of completed or cancelled
   * orders for a specific customer, newest first.
   * Cursor is the requestedAt ISO string of the last record.
   */
  getHistoryForCustomer(
    customerId: string,
    cursor?: string,
  ): Promise<PaginatedResult<Order>>;

  /**
   * Returns a paginated list of ALL orders across all customers,
   * newest first. For admin use.
   * Cursor is the requestedAt ISO string of the last record.
   */
  getAllOrders(cursor?: string): Promise<PaginatedResult<Order>>;

  // ── Commands ─────────────────────────────────────────────

  /**
   * Atomically creates a new order.
   * Always created with status 'pending' and no driver assigned.
   * Throws on persistence failure.
   *
   * "Atomic" signals that this operation must fully succeed or
   * fully fail — no partial writes.
   */
  createAtomic(input: CreateOrderInput): Promise<Order>;

  /**
   * Atomically assigns a driver to a pending order.
   * Uses an optimistic lock — only succeeds if the order is
   * still 'pending' at the moment of update, preventing two
   * drivers from accepting the same order simultaneously.
   *
   * Throws 'ORDER_NOT_AVAILABLE' if the order was already taken.
   *
   * ⚠️  NOTE FOR USE CASE LAYER: After calling this method,
   * the use case must separately call DriverRepository.updateStatus()
   * to set the driver to 'busy'. This repository does not touch
   * the drivers table.
   */
  acceptOrderAtomic(orderId: string, driverId: string): Promise<Order>;

  /**
   * Marks an order as delivered and attaches the proof-of-delivery
   * photo URL. Throws if the order is not found.
   */
  confirmDelivery(orderId: string, photoUrl: string): Promise<Order>;

  /**
   * Cancels an order. Records the cancellation timestamp.
   * Throws if the order is not found.
   */
  cancel(orderId: string): Promise<Order>;

  /**
   * General-purpose status updater for lifecycle transitions
   * not covered by the specific methods above
   * (e.g. pending → in_transit).
   * Throws if the order is not found.
   */
  updateStatus(orderId: string, status: OrderStatus): Promise<Order>;
}