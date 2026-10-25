import { Setpoint } from "../domain/Setpoint";
import { isAcceptedDevice } from "../domain/deviceFilter";
import { ISetpointSender, DeliveryOutcome } from "./ISetpointSender";
import { ILogger } from "./ILogger";

export class SetpointProcessorService {
  constructor(private readonly sender: ISetpointSender) {}

  async process(
    setpoints: readonly Setpoint[],
    logger: ILogger,
  ): Promise<boolean> {
    const perDeviceSetpoint = this.collapseToPerDeviceSetpoint(
      setpoints,
      logger,
    );

    const setpointsToSend = Object.values(perDeviceSetpoint);

    const results = await Promise.all(
      setpointsToSend.map(async (setpoint) => ({
        setpoint,
        result: await this.sender.send(setpoint),
      })),
    );

    let retryBatch = false;

    for (const { setpoint, result } of results) {
      const text = `${setpoint.deviceId}: ${result.outcome} after ${result.attempts} attempt(s) (${result.reason})`;

      if (result.outcome === DeliveryOutcome.FailedRetryable) {
        logger.warn(text);
        retryBatch = true;
      } else if (result.outcome === DeliveryOutcome.FailedPermanent) {
        logger.error(text);
      } else {
        logger.log(text);
      }
    }

    return retryBatch;
  }

  private collapseToPerDeviceSetpoint(
    setpoints: readonly Setpoint[],
    logger: ILogger,
  ): Record<string, Setpoint> {
    const perDeviceSetpoint: Record<string, Setpoint> = {};

    for (const setpoint of setpoints) {
      if (!isAcceptedDevice(setpoint.deviceId)) {
        logger.warn(
          `The deviceid: ${setpoint.deviceId} of the setpoint: ${JSON.stringify(setpoint)} is not accepted.`,
        );
        continue;
      }

      const existing = perDeviceSetpoint[setpoint.deviceId];

      if (existing === undefined || setpoint.eventTime >= existing.eventTime) {
        perDeviceSetpoint[setpoint.deviceId] = setpoint;
      }
    }

    return perDeviceSetpoint;
  }
}
