export type SetpointMessage = {
  readonly device_id: string;
  readonly setpoint: {
    readonly value: number;
    readonly unit: "kW";
    readonly endTime: string;
  };
  readonly eventTime: string;
};
