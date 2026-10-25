import { Setpoint } from "../domain/Setpoint";

export type ParseResult =
  | { isValid: true; value: Setpoint }
  | { isValid: false; error: string };

export function parseSetpointMessage(rawMessage: unknown): ParseResult {
  const parsedMessage =
    typeof rawMessage === "string" ? tryParseJson(rawMessage) : rawMessage;

  if (!isObject(parsedMessage)) {
    return invalid("message is not a JSON object");
  }

  const deviceId = parsedMessage.device_id;
  if (typeof deviceId !== "string" || deviceId.trim() === "") {
    return invalid("device_id is missing or empty");
  }

  const setpoint = parsedMessage.setpoint;
  if (!isObject(setpoint)) {
    return invalid("setpoint is missing or not an object");
  }

  const value = setpoint.value;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return invalid("setpoint.value is not a finite number");
  }

  if (setpoint.unit !== "kW") {
    return invalid(`unsupported setpoint.unit: ${String(setpoint.unit)}`);
  }

  const endTime = parseDate(setpoint.endTime);
  if (!endTime) {
    return invalid("setpoint.endTime is not a valid ISO date");
  }

  const eventTime = parseDate(parsedMessage.eventTime);
  if (!eventTime) {
    return invalid("eventTime is not a valid ISO date");
  }

  return {
    isValid: true,
    value: { deviceId, valueKw: value, endTime, eventTime },
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function parseDate(value: unknown): Date | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function invalid(error: string): ParseResult {
  return { isValid: false, error };
}
