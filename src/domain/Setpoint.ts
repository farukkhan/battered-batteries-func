export type Setpoint = {
  readonly deviceId: string;
  readonly valueKw: number;
  readonly endTime: Date;
  readonly eventTime: Date;
};
