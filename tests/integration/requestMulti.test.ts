/* eslint-disable @typescript-eslint/ban-ts-comment */
import "jest-extended";
import Timeout from "await-timeout";
import { connect, JSONCodec, NatsConnection } from "nats";

import requestMulti from "../../src/requestMulti";

const jsonCodec = JSONCodec();

let nc: NatsConnection;

const NATS_URL = "nats://nats:4222";
const subject = "test";
const timeout = 200;
const natsResponse = jsonCodec.encode({ response: true });
const payload = jsonCodec.encode({ payload: true });

describe("nats-request-multi", () => {
  beforeAll(async () => {
    nc = await connect({
      servers: NATS_URL,
      name: "nats-request-multi-integration-tests",
      timeout: 15 * 1000,
    });
    console.log(`connected to NATS ${NATS_URL}`);
  });

  afterAll(async () => {
    nc.drain();
    nc.close();
  });

  const requestMultiTest = async (expected: number, receive: number) => {
    const subs = [];
    for (let i = 0; i < receive; i++) {
      subs.push(
        await nc.subscribe(subject, {
          max: 1,
          callback: async (err, msg) => {
            if (err) console.error(err);
            if (msg.reply) {
              await nc.publish(msg.reply, natsResponse);
            }
          },
        })
      );
    }

    await Timeout.set(50);

    const responses = await requestMulti(nc, subject, payload, {
      expected,
      timeout,
    });

    for (let i = 0; i < receive; i++) {
      await subs[i].unsubscribe();
    }
    return responses;
  };

  describe("requestMulti successes", () => {
    it("receives 1 expected response", async () => {
      const response = await requestMultiTest(1, 1);
      expect(response).not.toBeInstanceOf(Array);
    });

    it("receives 3 expected response", async () => {
      const responses = await requestMultiTest(3, 3);
      if (Array.isArray(responses)) {
        expect(responses.length).toEqual(3);
      } else {
        throw new Error("expected array");
      }
    });

    it("receives 2 of 3 expected response", async () => {
      const responses = await requestMultiTest(3, 2);
      if (Array.isArray(responses)) {
        expect(responses.length).toEqual(2);
      } else {
        throw new Error("expected array");
      }
    });
  });

  describe("requestMulti failures", () => {
    it("fails when 0 received, expected 1", async () => {
      await expect(requestMultiTest(1, 0)).rejects.toThrow(/TIMEOUT/);
    });

    it("fails when 0 received, expected 3", async () => {
      await expect(requestMultiTest(3, 0)).rejects.toThrow(/timeout/);
    });
  });
});
