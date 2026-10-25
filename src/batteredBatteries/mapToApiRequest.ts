import { Setpoint } from "../domain/Setpoint";
import { BatterySetpointRequest } from "./BatterySetpointRequest";

export function mapToApiRequest(
  setpoint: Setpoint,
  now: Date,
): BatterySetpointRequest {
  return {
    data: {
      startTime: Math.ceil(now.getTime() / 1000),
      endTime: Math.floor(setpoint.endTime.getTime() / 1000),
      value: Math.round(setpoint.valueKw * -1000), //Grid perspective for setpoint value: negative means charging and positive means discharging, API perspective setpoint value: negative means discharging and positive means charging.
    },
  };
}
