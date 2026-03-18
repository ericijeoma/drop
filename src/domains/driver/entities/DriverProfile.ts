// ────────────────────────────────────────────────────────────
// src/domains/drivers/entities/DriverProfile.ts
// ────────────────────────────────────────────────────────────

import type { DriverStatus, VehicleType } from "@/shared/types";
import { DomainError, Coords } from "@/shared/types";

export interface DriverProfileProps {
  readonly id: string;
  readonly userId: string;
  readonly vehicleType: VehicleType;
  readonly vehiclePlate: string;
  readonly vehicleModel: string;
  readonly status: DriverStatus;
  readonly currentLocation: Coords | null;
  readonly rating: number;
  readonly totalTrips: number;
  readonly isVerified: boolean;
  readonly fcmToken: string | null;
}

export class DriverProfile {
  private _status: DriverStatus;
  private _currentLocation: Coords | null;

  private constructor(private readonly props: DriverProfileProps) {
    this._status = props.status;
    this._currentLocation = props.currentLocation;
  }

  static create(props: DriverProfileProps): DriverProfile {
    if (!props.isVerified) {
      throw new DomainError(
        "Driver account must be verified before going online.",
        "DRIVER_NOT_VERIFIED",
      );
    }
    return new DriverProfile(props);
  }

  // Allow creating unverified driver (for registration flow)
  static createUnverified(props: DriverProfileProps): DriverProfile {
    return new DriverProfile(props);
  }

  get id(): string {
    return this.props.id;
  }
  get userId(): string {
    return this.props.userId;
  }
  get vehicleType(): VehicleType {
    return this.props.vehicleType;
  }
  get vehiclePlate(): string {
    return this.props.vehiclePlate;
  }
  get vehicleModel(): string {
    return this.props.vehicleModel;
  }
  get status(): DriverStatus {
    return this._status;
  }
  get currentLocation(): Coords | null {
    return this._currentLocation;
  }
  get rating(): number {
    return this.props.rating;
  }
  get totalTrips(): number {
    return this.props.totalTrips;
  }
  get isVerified(): boolean {
    return this.props.isVerified;
  }
  get fcmToken(): string | null {
    return this.props.fcmToken;
  }

  // Add to DriverProfile entity if not already there

  assertVerified(): void {
    if (!this.props.isVerified) {
      throw new DomainError(
        "Your driver account is pending verification.",
        "DRIVER_NOT_VERIFIED",
      );
    }
  }

  // ✅ Fixed — reads the live mutable field, same as every other method
  assertOnline(): void {
    if (this._status !== "online") {
      throw new DomainError(
        "You must be online to accept orders.",
        "DRIVER_NOT_ONLINE",
      );
    }
  }

  isOnline(): boolean {
    return this._status === "online";
  }
  isOffline(): boolean {
    return this._status === "offline";
  }
  isBusy(): boolean {
    return this._status === "busy";
  }

  canAcceptRide(): boolean {
    return this._status === "online" && this.props.isVerified;
  }

  goOnline(): void {
    if (!this.props.isVerified) {
      throw new DomainError(
        "Driver must be verified to go online.",
        "DRIVER_NOT_VERIFIED",
      );
    }
    if (this._status === "busy") {
      throw new DomainError(
        "Cannot go online while on an active trip.",
        "DRIVER_BUSY",
      );
    }
    this._status = "online";
  }

  goOffline(): void {
    if (this._status === "busy") {
      throw new DomainError(
        "Cannot go offline during an active trip.",
        "DRIVER_BUSY",
      );
    }
    this._status = "offline";
  }

  setBusy(): void {
    this._status = "busy";
  }

  updateLocation(coords: Coords): void {
    if (this._status === "offline") {
      throw new DomainError(
        "Location updates are only accepted when online.",
        "DRIVER_OFFLINE",
      );
    }
    this._currentLocation = coords;
  }

  toJSON() {
    return {
      ...this.props,
      status: this._status,
      currentLocation: this._currentLocation,
    };
  }
}
