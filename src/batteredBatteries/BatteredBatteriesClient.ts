import axios, { AxiosInstance } from "axios";
import { BatterySetpointRequest } from "./BatterySetpointRequest";

// String enum, so logs show "Retryable" instead of 1.
export enum SendOutcome {
  Success = "Success",
  Retryable = "Retryable",
  Permanent = "Permanent",
}

export type SendResult = {
  outcome: SendOutcome;
  reason: string;
};

export interface IBatteredBatteriesClient {
  postSetpoint(
    deviceId: string,
    request: BatterySetpointRequest,
  ): Promise<SendResult>;
}

export class BatteredBatteriesClient implements IBatteredBatteriesClient {
  private readonly http: AxiosInstance;

  constructor(baseUrl: string, apiKey: string) {
    this.http = axios.create({
      baseURL: baseUrl,
      timeout: 10_000,
      headers: { "Ocp-Apim-Subscription-Key": apiKey },
      // axios throws on every non-2xx status by default. Turn that off so it
      validateStatus: () => true,
    });
  }

  async postSetpoint(
    deviceId: string,
    request: BatterySetpointRequest,
  ): Promise<SendResult> {
    try {
      const response = await this.http.post(`/${deviceId}/setpoint`, request);
      return {
        outcome: BatteredBatteriesClient.toOutcome(response.status),
        reason: `HTTP ${response.status}`,
      };
    } catch (error) {
      // Only reached when there is no response at all: timeout, network down.
      return { outcome: SendOutcome.Retryable, reason: String(error) };
    }
  }

  private static toOutcome(status: number): SendOutcome {
    if (status >= 200 && status < 300) {
      return SendOutcome.Success;
    }
    // 429 too many requests, 5xx server error: may work next time.
    if (status === 429 || status >= 500) {
      return SendOutcome.Retryable;
    }
    // 400 bad request, 401 wrong key, 404 unknown device: will never work.
    return SendOutcome.Permanent;
  }
}
