import Timeout from "await-timeout";
import { NatsError, Msg, NatsConnection, Subscription } from "nats";
import * as env from "env-var";
/*
import * as fs from 'fs';
import { configure, getLogger } from "log4js";

configure({
  appenders: {
    console: {
      type: "console",
      layout: {
        type: "pattern",
        pattern: "%d [%p] %f{1}:%l %m",
      },
    },
  },
  categories: {
    default: {
      appenders: ["console"],
      level: "debug",
      enableCallStack: true,
    },
  },
});
const logger = getLogger();*/

const NATS_REQUEST_MULTI_RETRIES = env.get("NATS_REQUEST_MULTI_RETRIES").default(1).asInt();
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
        //logger.debug("Calling waitAllReceivedResolve");
        waitAllReceivedResolve(expected);
      }
    }
    //logger.debug(`requestMultiCallback responses.length=${responses.length}, subject=${msg.subject}, sid=${msg.sid}, reply=${msg.reply}, data=${msg.data}`);
  };

const requestMulti = async (
  nc: NatsConnection,
  subject: string,
  payload: Uint8Array,
  { timeout = 0.5, expected = 1 }: { timeout?: number; expected?: number } = {},
  retries: number | null = null
): Promise<Msg | Msg[]> => {
  //logger.info("requestMulti starting with subject", subject, "payload", payload, "timeout", timeout, "expected", expected);

  if (expected < 1) {
    throw new Error("expected cannot be less than one")
  }
  if(retries === null) {
    retries = NATS_REQUEST_MULTI_RETRIES
  }
  if(retries < 0) {
    throw new Error("expected cannot be less than one")
  }

  let responses: Msg[] = [];
  let natsError: NatsError | null = null;
  let waitAllReceivedResolve: ((arg: number) => void) | null = null;
  let waitAllReceived: Promise<number> | null = null;
  const randomInt = (max: number) => Math.floor(Math.random() * max);
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const randomInboxId = Array(22).fill(0).map(() => chars[randomInt(chars.length)]).join('')
  const inbox = `_INBOX.${randomInboxId}`;
  let inboxSub: Subscription | null = null;

  if(expected > 1) {
    waitAllReceived = new Promise(
      (resolve) => (waitAllReceivedResolve = resolve)
    );

    inboxSub = await nc.subscribe(inbox, {
      max: expected,
      callback: requestMultiCallback(
        responses,
        waitAllReceivedResolve,
        (err: NatsError) => (natsError = err),
        expected
      ),
    });

    // Wait 10ms, I guess to ensure the subscription is in place?
    await Timeout.set(10)
  }

  let i = 0;
  while(true) {
    i++;
    if (expected === 1) {
      try {
        const msg = await nc.request(subject, payload, {timeout});
        return msg;
      } catch (error) {
        if (i < retries + 1 && error && typeof error == "object" && "code" in error && error.code === "503") {
          //logger.debug("NATS returned code 503, ServiceUnavailableError.  Trying again.");
          continue;
        }
        //logger.error(`nc.request error: ${error} from subject ${subject} with payload '${payload}'`);
        throw error;
      }
    }
    else {
      responses.length = 0;
      await nc.publish(subject, payload, {
        reply: inbox,
      });

      try {
        // Wait timeout secs for waitAllReceived to complete.
        if (waitAllReceived) {
          await Timeout.wrap(waitAllReceived, timeout * 1000, "NATS Timeout");
          //logger.debug("Done with waitAllReceived.");
        }
      } catch (error) {
        if (error && typeof error == "object" && "code" in error) {
          natsError = error as NatsError;
        } else {
          let errStr = "Unknown";
          if (typeof error === "string") {
            errStr = error;
          } else if (error && typeof error === "object" && "message" in error) {
            errStr = (error as { message: string }).message;
          }
          //logger.error("multiRequest error:", errStr, "from subject", subject, "with payload", payload);
          throw error;
        }
      }

      if (i < retries + 1 && natsError && natsError.code === "503") {
        // It's not ideal to resend the message to all subscribers when only one failed to
        // respond, but there is no way to know which subscriber failed or to re-send to only one
        // subscriber.
        //logger.debug("NATS returned code 503, ServiceUnavailableError.  Trying again.");
        continue;
      }
      //waitAllReceivedResolve(expected);
      if (inboxSub) {
        await inboxSub.unsubscribe();
      }
      if (natsError !== null) {
        throw natsError;
      }
      break;
    }
  }

  if (responses.length === 0) {
    throw new Error("NATS multi-request timeout");
  }

  //logger.debug(`NATS requestMulti returning ${responses}`);
  return responses;
};

export default requestMulti;
