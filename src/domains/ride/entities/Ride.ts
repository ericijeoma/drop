// src/domains/rides/entities/Ride.ts
// Aggregate root for the rides domain.
// Enforces all ride state transition rules.

import type {
  Coords,
  RideStatus,
  VehicleType,
  PaymentStatus,
} from "@/shared/types";
import { DomainError } from "@/shared/types";

// State machine: which transitions are legal from each state
const ALLOWED_TRANSITIONS: Record<RideStatus, RideStatus[]> = {
  pending: ["active", "cancelled", "timed_out"],
  active: ["completed", "cancelled"],
  completed: [], // terminal — no transitions from completed
  cancelled: [], // terminal — no transitions from cancelled
  timed_out: [], // terminal — no transitions from timed_out
};

export interface RideProps {
  readonly id: string;
  readonly customerId: string;
  readonly driverId: string | null;
  readonly vehicleType: VehicleType;
  readonly pickupAddress: string;
  readonly dropoffAddress: string;
  readonly pickupCoords: Coords;
  readonly dropoffCoords: Coords;
  readonly distanceKm: number;
  readonly fareAmount: number;
  readonly status: RideStatus;
  readonly paymentStatus: PaymentStatus;
  readonly requestedAt: Date;
  readonly acceptedAt: Date | null;
  readonly completedAt: Date | null;
  readonly cancelledAt: Date | null;
}

export class Ride {
  private _status: RideStatus;
  private _driverId: string | null;
  private _paymentStatus: PaymentStatus;
  private _acceptedAt: Date | null;
  private _completedAt: Date | null;
  private _cancelledAt: Date | null;

  private constructor(private readonly props: RideProps) {
    this._status = props.status;
    this._driverId = props.driverId;
    this._paymentStatus = props.paymentStatus;
    this._acceptedAt = props.acceptedAt;
    this._completedAt = props.completedAt;
    this._cancelledAt = props.cancelledAt;
  }

  static create(props: RideProps): Ride {
    Ride.validateFare(props.fareAmount);
    Ride.validateDistance(props.distanceKm);
    Ride.validateCoords(props.pickupCoords, "pickup");
    Ride.validateCoords(props.dropoffCoords, "dropoff");
    Ride.validatePickupDropoffDifferent(
      props.pickupCoords,
      props.dropoffCoords,
    );
    return new Ride(props);
  }

  // ── Accessors ──────────────────────────────────────────────
  get id(): string {
    return this.props.id;
  }
  get customerId(): string {
    return this.props.customerId;
  }
  get driverId(): string | null {
    return this._driverId;
  }
  get vehicleType(): VehicleType {
    return this.props.vehicleType;
  }
  get pickupAddress(): string {
    return this.props.pickupAddress;
  }
  get dropoffAddress(): string {
    return this.props.dropoffAddress;
  }
  get pickupCoords(): Coords {
    return this.props.pickupCoords;
  }
  get dropoffCoords(): Coords {
    return this.props.dropoffCoords;
  }
  get distanceKm(): number {
    return this.props.distanceKm;
  }
  get fareAmount(): number {
    return this.props.fareAmount;
  }
  get status(): RideStatus {
    return this._status;
  }
  get paymentStatus(): PaymentStatus {
    return this._paymentStatus;
  }
  get requestedAt(): Date {
    return this.props.requestedAt;
  }
  get acceptedAt(): Date | null {
    return this._acceptedAt;
  }
  get completedAt(): Date | null {
    return this._completedAt;
  }
  get cancelledAt(): Date | null {
    return this._cancelledAt;
  }

  // ── State machine ──────────────────────────────────────────

  /**
   * Transition to a new status.
   * Throws DomainError if the transition is illegal.
   * This is the ONLY way to change ride status.
   */
  transition(newStatus: RideStatus): void {
    const allowed = ALLOWED_TRANSITIONS[this._status];
    if (!allowed.includes(newStatus)) {
      throw new DomainError(
        `INVALID_RIDE_TRANSITION: Cannot transition ride from '${this._status}' to '${newStatus}'.`,
        "INVALID_RIDE_TRANSITION",
      );
    }
    this._status = newStatus;
    if (newStatus === "completed") this._completedAt = new Date();
    if (newStatus === "cancelled") this._cancelledAt = new Date();
  }

  assignDriver(driverId: string): void {
    if (this._status !== "pending") {
      throw new DomainError(
        "Can only assign a driver to a pending ride.",
        "RIDE_NOT_PENDING",
      );
    }
    if (this._driverId !== null) {
      throw new DomainError(
        "Ride already has a driver assigned.",
        "DRIVER_ALREADY_ASSIGNED",
      );
    }
    this._driverId = driverId;
    this._acceptedAt = new Date();
    this._status = "active";
  }

  markPaymentCaptured(): void {
    if (this._status !== "completed") {
      throw new DomainError(
        "Payment can only be captured on a completed ride.",
        "PAYMENT_INVALID_STATE",
      );
    }
    this._paymentStatus = "captured";
  }

  // ── Queries ────────────────────────────────────────────────
  isPending(): boolean {
    return this._status === "pending";
  }
  isActive(): boolean {
    return this._status === "active";
  }
  isCompleted(): boolean {
    return this._status === "completed";
  }
  isCancelled(): boolean {
    return this._status === "cancelled";
  }
  isTerminal(): boolean {
    return ["completed", "cancelled", "timed_out"].includes(this._status);
  }

  // ── Validation ─────────────────────────────────────────────

  private static validateFare(fare: number): void {
    if (fare <= 0) {
      throw new DomainError("Fare must be greater than zero.", "INVALID_FARE");
    }
  }

  private static validateDistance(distanceKm: number): void {
    if (distanceKm <= 0) {
      throw new DomainError(
        "Distance must be greater than zero.",
        "INVALID_DISTANCE",
      );
    }
    if (distanceKm > 500) {
      throw new DomainError(
        "Distance exceeds maximum allowed (500km).",
        "DISTANCE_TOO_LARGE",
      );
    }
  }

  private static validateCoords(coords: Coords, label: string): void {
    if (coords.lat < -90 || coords.lat > 90) {
      throw new DomainError(
        `Invalid ${label} latitude: ${coords.lat}`,
        "INVALID_COORDS",
      );
    }
    if (coords.lng < -180 || coords.lng > 180) {
      throw new DomainError(
        `Invalid ${label} longitude: ${coords.lng}`,
        "INVALID_COORDS",
      );
    }
  }

  private static validatePickupDropoffDifferent(
    pickup: Coords,
    dropoff: Coords,
  ): void {
    const SAME_LOCATION_THRESHOLD_KM = 0.05; // 50 metres
    const latDiff = Math.abs(pickup.lat - dropoff.lat);
    const lngDiff = Math.abs(pickup.lng - dropoff.lng);
    // Approximate degree-to-km: 1 degree ≈ 111km
    const approxDistKm = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff) * 111;
    if (approxDistKm < SAME_LOCATION_THRESHOLD_KM) {
      throw new DomainError(
        "Pickup and dropoff cannot be at the same location.",
        "SAME_PICKUP_DROPOFF",
      );
    }
  }

  // ── Serialization ──────────────────────────────────────────
  toJSON() {
    return {
      ...this.props,
      status: this._status,
      driverId: this._driverId,
      paymentStatus: this._paymentStatus,
      acceptedAt: this._acceptedAt,
      completedAt: this._completedAt,
      cancelledAt: this._cancelledAt,
    };
  }
}
