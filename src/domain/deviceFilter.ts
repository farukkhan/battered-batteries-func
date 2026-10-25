const ACCEPTED_DEVICE: readonly string[] = [
  "BB00001",
  "BB00005",
  "BB00006",
  "BB00007",
  "BB00293",
];

export function isAcceptedDevice(deviceId: string): boolean {
  return ACCEPTED_DEVICE.includes(deviceId);
}
