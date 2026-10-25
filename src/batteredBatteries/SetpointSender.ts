import { Setpoint } from "../domain/Setpoint";
import {
  IBatteredBatteriesClient,
  SendOutcome,
} from "./BatteredBatteriesClient";
import {
  ISetpointSender,
  DeliveryOutcome,
  DeliveryResult,
} from "../application/ISetpointSender";
import { mapToApiRequest } from "./mapToApiRequest";

export class SetpointSender implements ISetpointSender {
  constructor(
    private readonly client: IBatteredBatteriesClient,
    private readonly retryDelaysMs: readonly number[] = [1_000, 2_000, 4_000],
  ) {}

  async send(setpoint: Setpoint): Promise<DeliveryResult> {
    const maxAttempts = this.retryDelaysMs.length + 1;
    let lastReason = "";

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // Build the request again on every attempt so startTime is "now".
      const request = mapToApiRequest(setpoint, new Date());
      if (request.data.startTime >= request.data.endTime) {
        return {
          outcome: DeliveryOutcome.Expired,
          attempts: attempt - 1,
          reason: "setpoint is no longer active",
        };
      }

      const result = await this.client.postSetpoint(setpoint.deviceId, request);

      if (result.outcome === SendOutcome.Success) {
        return {
          outcome: DeliveryOutcome.Delivered,
          attempts: attempt,
          reason: result.reason,
        };
      }
      if (result.outcome === SendOutcome.Permanent) {
        return {
          outcome: DeliveryOutcome.FailedPermanent,
          attempts: attempt,
          reason: result.reason,
        };
      }

      // Retryable: wait, then go round the loop again (unless it was the last).
      lastReason = result.reason;
      const delayMs = this.retryDelaysMs[attempt - 1];
      if (delayMs !== undefined) {
        await delay(delayMs);
      }
    }

    return {
      outcome: DeliveryOutcome.FailedRetryable,
      attempts: maxAttempts,
      reason: lastReason,
    };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
