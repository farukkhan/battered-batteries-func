import { describe, it, expect, vi } from "vitest";
import axios, { AxiosInstance } from "axios";
import { BatteredBatteriesClient } from "../../src/batteredBatteries/BatteredBatteriesClient";
import { SetpointSender } from "../../src/batteredBatteries/SetpointSender";
import { DeliveryOutcome } from "../../src/application/ISetpointSender";
import { Setpoint } from "../../src/domain/Setpoint";

// Replace axios so no real HTTP request is made.
vi.mock("axios");

describe("SetpointSender", () => {
  it("retries when the API returns 429", async () => {
    //Arrange
    const post = vi
      .fn()
      .mockResolvedValueOnce({ status: 429 })
      .mockResolvedValueOnce({ status: 200 });

    vi.mocked(axios.create).mockReturnValue({
      post,
    } as unknown as AxiosInstance);

    const sender = new SetpointSender(
      new BatteredBatteriesClient("http://test", "fake-key"),
      [0, 0, 0], // no real waiting between attempts
    );

    const setpoint: Setpoint = {
      deviceId: "BB00001",
      valueKw: 2.5,
      endTime: new Date(Date.now() + 10 * 60_000), // active for 10 minutes
      eventTime: new Date(),
    };

    //Act
    const result = await sender.send(setpoint);

    //Assert
    expect(post).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      outcome: DeliveryOutcome.Delivered,
      attempts: 2,
      reason: "HTTP 200",
    });
  });
});

// TODO list: remaining tests, ordered by risk (most important first).
//
// TODO: Add test for SetpointSender.send if the API returns 429 four times, should stop after 4 attempts and return FailedRetryable
// TODO: Add test for setpointConsumer if a setpoint ends with FailedRetryable, should throw so Service Bus redelivers the batch
// TODO: Add test for setpointConsumer if all setpoints are delivered, permanent or expired, should complete without throwing
// TODO: Add test for SetpointSender.send if the API returns 400, 401 or 404, should not retry and return FailedPermanent
// TODO: Add test for SetpointSender.send if the API returns 500 or 503, should retry like a 429
// TODO: Add test for BatteredBatteriesClient.postSetpoint if the request times out or the network fails, should return Retryable
// TODO: Add test for SetpointProcessorService.process if a batch contains several setpoints for one device, should send only the one with the newest eventTime
// TODO: Add test for SetpointProcessorService.process if two setpoints for one device have the same eventTime, should send the later one in the batch
// TODO: Add test for SetpointProcessorService.process if a setpoint has a device_id that is not in the accepted list, should not send it and log a warning
// TODO: Add test for mapToApiRequest if the setpoint is negative kW (grid: battery charges), should send positive watts
// TODO: Add test for mapToApiRequest if the setpoint is positive kW (grid: battery discharges), should send negative watts rounded to whole watts
// TODO: Add test for mapToApiRequest, should round startTime up to the next whole epoch second and endTime down to the previous one
// TODO: Add test for SetpointSender.send if the setpoint endTime has already passed, should not call the API and return Expired
// TODO: Add test for SetpointSender.send if the setpoint ends while retrying, should stop retrying and return Expired
// TODO: Add test for SetpointSender.send when retrying, should rebuild startTime from the current time on every attempt
// TODO: Add test for parseSetpointMessage if a required field is missing or has the wrong type (device_id, value, unit, endTime, eventTime), should return isValid false with the reason
// TODO: Add test for parseSetpointMessage if the body is a JSON string instead of an object, should parse it the same way
// TODO: Add test for BatteredBatteriesClient.postSetpoint, should POST to /{device_id}/setpoint with the Ocp-Apim-Subscription-Key header
