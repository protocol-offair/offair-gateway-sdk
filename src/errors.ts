export class AirPayGatewayError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly details: unknown;

  constructor(message: string, options: { status: number; statusText: string; details?: unknown }) {
    super(message);
    this.name = "AirPayGatewayError";
    this.status = options.status;
    this.statusText = options.statusText;
    this.details = options.details;
  }
}

export class AirPayGatewayValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AirPayGatewayValidationError";
  }
}
