export type BatterySetpointRequest = {
  data: {
    readonly startTime: number;
    readonly endTime: number;
    readonly value: number;
  };
};
