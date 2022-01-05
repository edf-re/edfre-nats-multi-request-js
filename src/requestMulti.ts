import Timeout from "await-timeout";
import { NatsError, Msg, NatsConnection } from "nats";

export const requestMultiCallback =
  (
    responses: Msg[],
    waitAllReceivedResolve: null | ((arg: number) => void),
    setNatsError: (arg: NatsError) => void,
    expected: number
  ) =>
  (err: NatsError | null, msg: Msg) => {
    if (err) {
      setNatsError(err);
    } else {
      responses.push(msg);
      if (waitAllReceivedResolve && responses.length === expected) {
        waitAllReceivedResolve(expected);
      }
    }
  };

const requestMulti = async (
  nc: NatsConnection,
  subject: string,
  payload: Uint8Array,
  { timeout = 0.5, expected = 1 }: { timeout?: number; expected?: number } = {}
): Promise<Msg | Msg[]> => {
  if (expected < 1) {
    throw new Error("expected cannot be less than one")
  }

  if (expected === 1) {
    return await nc.request(subject, payload, { timeout });
  }

  const responses: Msg[] = [];
  let natsError: NatsError | null = null;
  let waitAllReceivedResolve: ((arg: number) => void) | null = null;
  const waitAllReceived = new Promise(
    (resolve) => (waitAllReceivedResolve = resolve)
  );

  const randomInt = (max: number) => Math.floor(Math.random() * max);
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const randomInboxId = Array(22).fill(0).map(() => chars[randomInt(chars.length)]).join('')
  const inbox = `_INBOX.${randomInboxId}`;

  const inboxSub = await nc.subscribe(inbox, {
    max: expected,
    callback: requestMultiCallback(
      responses,
      waitAllReceivedResolve,
      (err: NatsError) => (natsError = err),
      expected
    ),
  });

  await Timeout.set(10)

  await nc.publish(subject, payload, {
    reply: inbox,
  });

  const timeoutReason = "requestMulti NATS Timeout";
  try {
    await Timeout.wrap(waitAllReceived, timeout, timeoutReason);
  } catch (err) {
    // Ignore NATS timeout error
    if (!(err instanceof Error && err.message === timeoutReason)) {
      throw err;
    }
  }

  await inboxSub.unsubscribe();

  if (natsError !== null) {
    throw natsError;
  }

  if (responses.length === 0) {
    throw new Error("NATS multi-request timeout");
  }

  return responses;
};

export default requestMulti;
