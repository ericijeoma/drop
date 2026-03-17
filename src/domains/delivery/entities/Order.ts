// src/domains/delivery/entities/Order.ts

import type { Coords, OrderStatus, PaymentStatus, PackageSize } from '@/shared/types';
import { DomainError } from '@/shared/types';

const ALLOWED_ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending:    ['assigned', 'cancelled'],
  assigned:   ['in_transit', 'cancelled'],
  in_transit: ['delivered', 'cancelled'],
  delivered:  [],
  cancelled:  [],
};

export interface OrderProps {
  readonly id: string;
  readonly customerId: string;
  readonly driverId: string | null;
  readonly status: OrderStatus;
  readonly pickupAddress: string;
  readonly dropoffAddress: string;
  readonly pickupCoords: Coords;
  readonly dropoffCoords: Coords;
  readonly packageDescription: string;
  readonly packageSize: PackageSize;
  readonly deliveryPhotoUrl: string | null;
  readonly distanceKm: number;
  readonly fareAmount: number;
  readonly paymentStatus: PaymentStatus;
  readonly requestedAt: Date;
  readonly deliveredAt: Date | null;
}

export class Order {
  private _status: OrderStatus;
  private _driverId: string | null;
  private _deliveryPhotoUrl: string | null;
  private _deliveredAt: Date | null;
  private _paymentStatus: PaymentStatus;

  private constructor(private readonly props: OrderProps) {
    this._status           = props.status;
    this._driverId         = props.driverId;
    this._deliveryPhotoUrl = props.deliveryPhotoUrl;
    this._deliveredAt      = props.deliveredAt;
    this._paymentStatus    = props.paymentStatus;
  }

  static create(props: OrderProps): Order {
    if (!props.packageDescription.trim()) {
      throw new DomainError('Package description is required.', 'MISSING_PACKAGE_DESC');
    }
    return new Order(props);
  }

  get id(): string                      { return this.props.id; }
  get customerId(): string              { return this.props.customerId; }
  get driverId(): string | null         { return this._driverId; }
  get status(): OrderStatus             { return this._status; }
  get pickupAddress(): string           { return this.props.pickupAddress; }
  get dropoffAddress(): string          { return this.props.dropoffAddress; }
  get pickupCoords(): Coords            { return this.props.pickupCoords; }
  get dropoffCoords(): Coords           { return this.props.dropoffCoords; }
  get packageDescription(): string      { return this.props.packageDescription; }
  get packageSize(): PackageSize        { return this.props.packageSize; }
  get deliveryPhotoUrl(): string | null { return this._deliveryPhotoUrl; }
  get distanceKm(): number              { return this.props.distanceKm; }
  get fareAmount(): number              { return this.props.fareAmount; }
  get paymentStatus(): PaymentStatus    { return this._paymentStatus; }
  get requestedAt(): Date               { return this.props.requestedAt; }
  get deliveredAt(): Date | null        { return this._deliveredAt; }

  transition(newStatus: OrderStatus): void {
    const allowed = ALLOWED_ORDER_TRANSITIONS[this._status];
    if (!allowed.includes(newStatus)) {
      throw new DomainError(
        `Cannot transition order from '${this._status}' to '${newStatus}'.`,
        'INVALID_ORDER_TRANSITION'
      );
    }
    this._status = newStatus;
    if (newStatus === 'delivered') this._deliveredAt = new Date();
  }

  confirmDelivery(photoUrl: string): void {
    if (this._status !== 'in_transit') {
      throw new DomainError(
        'Can only confirm delivery for an order in transit.',
        'ORDER_NOT_IN_TRANSIT'
      );
    }
    if (!photoUrl.trim()) {
      throw new DomainError('Delivery photo is required for confirmation.', 'MISSING_PHOTO');
    }
    this._deliveryPhotoUrl = photoUrl;
    this.transition('delivered');
  }

  assignDriver(driverId: string): void {
    if (this._status !== 'pending') {
      throw new DomainError('Can only assign driver to pending order.', 'ORDER_NOT_PENDING');
    }
    this._driverId = driverId;
    this.transition('assigned');
  }

  isPending(): boolean   { return this._status === 'pending'; }
  isDelivered(): boolean { return this._status === 'delivered'; }
  isTerminal(): boolean  { return ['delivered', 'cancelled'].includes(this._status); }

  toJSON() {
    return {
      ...this.props,
      status:           this._status,
      driverId:         this._driverId,
      deliveryPhotoUrl: this._deliveryPhotoUrl,
      deliveredAt:      this._deliveredAt,
      paymentStatus:    this._paymentStatus,
    };
  }
}


