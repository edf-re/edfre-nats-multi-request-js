/* eslint-disable @typescript-eslint/ban-ts-comment */
import Timeout from "await-timeout";
import { JSONCodec, NatsConnection, NatsError, Msg } from "nats";

import requestMulti from "../../src/requestMulti";

const jsonCodec = JSONCodec();

const TIMEOUT = 0.1;
const RESPONSE_DELAY = 0.01;
const subject = "test";

const natsErrorBase = {
  isAuthError: () => true, isPermissionError: () => false, isProtocolError: () => false, isJetStreamError: () => false, jsError: () => null,
}

describe("nats-request-multi tests", () => {
  const subscribeMock = jest.fn();
  const publishMock = jest.fn();
  const unsubscribeMock = jest.fn();
  const ncMock = {
    subscribe: subscribeMock,
    publish: publishMock,
  } as unknown as NatsConnection;

  afterEach(() => {
    subscribeMock.mockReset();
    publishMock.mockReset();
    unsubscribeMock.mockReset();
  });

  const testRequestMulti = async (
    expected: number,
    received: number,
    {
      payload = new Uint8Array(),
      natsError = null,
    }: {
      payload?: Uint8Array;
      natsError?: NatsError | null;
    } = {}
  ) => {
    const bytesPayload = jsonCodec.encode(payload);

    let callback: (arg0: NatsError | null, arg1: Msg) => void;
    subscribeMock.mockImplementation(async (inbox, options) => {
      ({ callback } = options);
      return { unsubscribe: unsubscribeMock };
    });

    publishMock.mockResolvedValue(true);

    const sendResponses = async () => {
      await Timeout.set(RESPONSE_DELAY);
      for (let i = 0; i < received; i++) {
        callback(natsError, {
          subject,
          sid: 0,
          data: jsonCodec.encode(true),
          respond: () => true,
        });
      }
    };

    let caughtError;
    let responses;
    const start = new Date().getTime();
    try {
      [, responses] = await Promise.all([
        sendResponses(),
        requestMulti(ncMock, subject, bytesPayload, {
          timeout: TIMEOUT,
          expected,
        }),
      ]);
    } catch (err) {
      caughtError = err;
    }

    expect(subscribeMock.mock.calls.length).toEqual(1);
    expect(unsubscribeMock.mock.calls.length).toEqual(1);
    expect(publishMock.mock.calls.length).toEqual(1);
    expect(publishMock.mock.calls[0][1]).toEqual(bytesPayload);

    if (caughtError) throw caughtError;

    return { duration: new Date().getTime() - start, responses };
  };

  describe("requestMulti() successes", () => {
    it("runs nc.request if expected === 1", async () => {
      const expectedReturnValue = true;
      const requestMock = jest.fn().mockResolvedValue(expectedReturnValue);
      const ncMock = { request: requestMock } as unknown as NatsConnection;
      const returnValue = await requestMulti(
        ncMock,
        "test",
        jsonCodec.encode({})
      );

      expect(requestMock.mock.calls.length).toEqual(1);
      expect(returnValue).toEqual(expectedReturnValue);
    });

    it("succeeds early when responses.length === expected > 1", async () => {
      const { duration, responses } = await testRequestMulti(3, 3);
      expect(duration).toBeCloseTo(duration, RESPONSE_DELAY);
      expect(responses).toBeInstanceOf(Array);
      if (responses instanceof Array) expect(responses.length).toEqual(3);
    });

    it("succeeds and times out when expected > 1 and expected > received > 0", async () => {
      const { duration, responses } = await testRequestMulti(3, 2);
      expect(duration).toBeCloseTo(duration, TIMEOUT);
      expect(responses).toBeInstanceOf(Array);
      if (responses instanceof Array) expect(responses.length).toEqual(2);
    });
  });

  describe("requestMulti() errors", () => {
    it("error if expected === 0", async () => {
      await expect(requestMulti(ncMock, subject, jsonCodec.encode({}), { expected: 0 })).rejects.toThrow(/less than one/);
    });

    it("error if expected < 0", async () => {
      await expect(requestMulti(ncMock, subject, jsonCodec.encode({}), { expected: -1 })).rejects.toThrow(/less than one/);
    });

    it("times out when expected > 1 and received === 0", async () => {
      const start = new Date().getTime();
      await expect(testRequestMulti(3, 0)).rejects.toThrow(/timeout/);
      expect((new Date().getTime() - start) / 1000).toBeCloseTo(TIMEOUT, 0);
    });

    it("returns any NATS errors when expected > 1 and received === expected", async () => {
      const natsError = { ...natsErrorBase, code: "err", name: "err", message: "test error" };
      try {
        await testRequestMulti(3, 3, ({ natsError }));
        throw new Error("should throw an error");
      } catch (err) {
        expect(err).toEqual(natsError);
      }
    });

    it("returns any NATS errors when expected > 1 and received < expected", async () => {
      const natsError = { ...natsErrorBase, code: "err", name: "err", message: "test error" };
      try {
        await testRequestMulti(3, 2, ({ natsError }));
        throw new Error("should throw an error");
      } catch (err) {
        expect(err).toEqual(natsError);
      }
    });
  });
});
