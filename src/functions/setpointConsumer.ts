import { app, InvocationContext } from "@azure/functions";
import { Setpoint } from "../domain/Setpoint";
import { parseSetpointMessage } from "../messages/parseSetpointMessage";
import { loadConfig } from "../config";
import { SetpointSender } from "../batteredBatteries/SetpointSender";
import { BatteredBatteriesClient } from "../batteredBatteries/BatteredBatteriesClient";
import { SetpointProcessorService } from "../application/SetpointProcessorService";

const config = loadConfig();
const sender = new SetpointSender(
  new BatteredBatteriesClient(config.apiBaseUrl, config.apiKey),
);
const setpointProcessorService = new SetpointProcessorService(sender);

export async function setpointConsumer(
  messages: unknown[],
  context: InvocationContext,
): Promise<void> {
  const setpoints: Setpoint[] = [];

  for (const message of messages) {
    const result = parseSetpointMessage(message);

    if (!result.isValid) {
      context.warn(
        `Message ${JSON.stringify(message)} is invalid: ${result.error}`,
      );
      continue;
    }

    setpoints.push(result.value);
  }

  const retryBatch = await setpointProcessorService.process(setpoints, context);

  // Throwing makes Service Bus redeliver the whole batch later.
  if (retryBatch) {
    throw new Error(
      "One or more setpoints failed temporarily; batch will be retried.",
    );
  }
}

app.serviceBusQueue("setpointConsumer", {
  connection: "CONNECTION-STRING-SBQ-BATBAT-SPT",
  queueName: "sbq-batbat-spt",
  handler: setpointConsumer,
  cardinality: "many",
});
