# battered-batteries-func

An Azure Function (TypeScript, v4 programming model) that consumes batches of setpoints from the Service Bus queue `sbq-batbat-spt` and forwards them to the Battered Batteries API.

## What it does

```
Service Bus batch (unknown[])
  │
  ├─ parse & validate each message ........ invalid → logged and skipped
  ├─ filter on the accepted device list .... unknown device → logged and skipped
  ├─ keep only the newest setpoint per device (by eventTime)
  ├─ map to the API format:
  │     value     = round(-kW × 1000)       kW → W, grid → battery perspective
  │     startTime = ceil(now)               epoch seconds, active from arrival
  │     endTime   = floor(endTime)          epoch seconds, never past the end
  ├─ POST /{device}/setpoint per device (in parallel, max one per device)
  │     with in-process retries for temporary errors
  │
  └─ any temporary failure left? ── yes → throw  → whole batch is redelivered
                                 └─ no  → return → whole batch is completed
```

## Prerequisites (local development)

- **Node.js 22 or 24** (LTS)
- **[Azure Functions Core Tools v4](https://learn.microsoft.com/azure/azure-functions/functions-run-local)**, which provides the `func` command
- **[Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite)** running locally, because `AzureWebJobsStorage` is set to `UseDevelopmentStorage=true`
- **A Service Bus queue named `sbq-batbat-spt`**, either in Azure or in the [Service Bus emulator](https://learn.microsoft.com/azure/service-bus-messaging/overview-emulator)

> ⚠️ `BATBAT_API_BASE_URL` in `local.settings.example.json` points at the **real** API. To run locally without sending real setpoints, point it at a fake or mock endpoint.

## Running it

```powershell
npm install
copy local.settings.example.json local.settings.json   # then fill in the values
npm start                                              # build + func start
npm run test:run                                       # run the tests once
```

| Setting | Purpose |
| --- | --- |
| `CONNECTION-STRING-SBQ-BATBAT-SPT` | Service Bus connection string (name given by the assignment) |
| `BATBAT_API_BASE_URL` | Base URL of the Battered Batteries API |
| `BATBAT_API_KEY` | Subscription key, sent as `Ocp-Apim-Subscription-Key` |

`local.settings.json` is only used locally. In Azure, these values go into the Function App's application settings.

The two `BATBAT_` settings are read once at startup. If one is missing, the function fails at startup instead of failing every batch, so messages aren't burned into the dead-letter queue by a configuration mistake.

`host.json` sets a maximum batch size of 50, `autoCompleteMessages: true` and a function timeout of 2 minutes. A batch takes at most about 47 s: 4 attempts × 10 s HTTP timeout, plus 7 s of retry waits, with all devices sent in parallel. The limit stays below the 5-minute default lock renewal, so a slow batch can't lose its message locks and be picked up by another instance while still running.

I tested it locally end to end against the Service Bus emulator and a small fake API that only logs requests, so the real API was never called. That tooling is kept outside this repository, because it isn't part of the assignment.

## Architecture

```
src/
├── functions/          composition root: reads config, wires objects, registers the trigger
├── messages/           inbound adapter: raw Service Bus message → validated Setpoint
├── application/        SetpointProcessorService + ports (ILogger, ISetpointSender)
├── domain/             Setpoint, accepted device list
└── batteredBatteries/  outbound adapter: API client, retry (SetpointSender), mapping
```

- **Ports and adapters.** The application layer only depends on the domain and on its own interfaces. It has no knowledge of Azure Functions, axios or the API format. `InvocationContext` satisfies `ILogger` structurally, so the handler simply passes it in.
- **Messages are checked and typed once, at the boundary ("parse, don't validate").** Messages arrive as `unknown`. The parser turns them into a typed `Setpoint` or a reason why it couldn't. Only valid domain objects go further.
- **Expected failures are values, not exceptions.** The client and the sender return an outcome (`Delivered`, `Expired`, `FailedRetryable`, `FailedPermanent`). Only the handler throws, and only when Service Bus should redeliver.

**This is probably overkill for a function of this size.** A single file with a few functions would work too. I chose this structure because it keeps the business rules testable without Azure or HTTP, and because it's the structure I use in larger projects. For a production function this small, I would discuss with the team which level of structure we want to keep.

## Error handling and retries

| API response | Classified as | What happens |
| --- | --- | --- |
| 2xx | success | Logged |
| 429, 5xx, timeout, no response | retryable | Up to 4 attempts in process: retries after 1 s, 2 s and 4 s |
| other 4xx (400, 401, 404, …) | permanent | Logged as an error, **not** retried. A retry would get the same answer and only load the API. |

- **The request is rebuilt on every attempt,** so `startTime` is always "now". Retrying stops as soon as the setpoint has ended (`Expired`), because a setpoint in the past is useless.
- **If a setpoint still fails temporarily after 4 attempts,** the handler throws and Service Bus redelivers the batch, up to the queue's max delivery count, then the dead-letter queue.
- **401/403 is a configuration problem, not a message problem.** With the current classification, setpoints are dropped (logged as errors) until the key is fixed. That needs an alert in production.

## Assumptions and open points to discuss

These are decisions I made to keep moving. I would discuss each with the team.

1. **`startTime` "should be in the future".** The swagger says `startTime` should be in the future, while the assignment says setpoints are active from the moment of arrival. It's not clear how far in the future the API expects it, or what it does with a time in the past. For now I use the current time rounded **up** to the next whole second (`ceil(now)`).

2. **Unknown devices are logged, not abandoned.** The assignment says to abandon messages from unknown devices. With a batch trigger and only `@azure/functions`, messages can't be settled one by one. Abandoning would also make Service Bus redeliver the message right away, up to the max delivery count, before it ends up in the dead-letter queue. That's a lot of churn for a message that can never succeed. So I log a warning and let it complete with the batch. If the producer needs to see these messages, dead-lettering them would be the better option, but that needs per-message settlement (see 3).

3. **The whole batch is retried, not only the failed setpoints.** Batch settlement is all-or-nothing: if one setpoint fails temporarily, the whole batch is redelivered, including the ones that already succeeded. They get sent again, which is harmless but unnecessary. Completing handled messages individually is possible with `@azure/functions-extensions-servicebus` (message settlement actions), but the assignment lists the packages to use. I didn't know whether other packages are allowed, so I kept to that list.

4. **Ordering is only guaranteed within a batch.** Within one batch I keep the newest setpoint per device, based on `eventTime`. Across batches there is no guarantee. Several function instances can process batches in parallel, so an older setpoint in a later batch could override a newer one. The Service Bus way to fix this is **sessions**: if the producer sets `sessionId = device_id` on a session-enabled queue, all messages of one device are handled serially by one instance. That requires a change on the producer side and a queue recreated with sessions enabled.

5. **The same setpoint can be sent more than once.** A function timeout is unlikely: a batch takes at most about 47 s and the limit is 2 minutes. Duplicates can still happen in these cases:
   - **Another setpoint in the batch fails temporarily.** The whole batch is redelivered, including setpoints the API already accepted (see 3). This is the most common case.
   - **The HTTP request times out after the API already received it.** The client can't tell this from "not received", so it retries.
   - **The host stops or crashes** (deployment, scale-in, restart) after the API accepted a setpoint but before the batch is completed. Service Bus delivers at least once, so the batch comes back.

    Because a new setpoint overrides the old one, resending the *same* setpoint is mostly harmless. Resending an *older* one after a newer one has been sent is not. A small state table storing the last sent `eventTime` per device would solve both this and point 4: skip anything not newer than what was already sent.

6. **Equal `eventTime` within a batch.** The message that comes later in the batch wins.

## Tests

The assignment asks for one real test, plus the other tests as descriptive TODO comments. Both are in `tests/batteredBatteries/SetpointSender.test.ts`.

- **The real test** checks that a **429** from the API is retried. axios is replaced by a fake that answers 429 and then 200. The real `BatteredBatteriesClient` and the real `SetpointSender` are used, so the test covers both "429 is classified as retryable" and "retryable is retried".
- **The TODO list** describes the remaining tests per function.
