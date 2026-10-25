import { Setpoint } from "../domain/Setpoint";

export enum DeliveryOutcome {
  Delivered = "Delivered",
  Expired = "Expired",
  FailedRetryable = "FailedRetryable",
  FailedPermanent = "FailedPermanent",
}

export type DeliveryResult = {
  outcome: DeliveryOutcome;
  attempts: number;
  reason: string;
};

export interface ISetpointSender {
  send(setpoint: Setpoint): Promise<DeliveryResult>;
}
