import { MessagingService } from "@connext/messaging";
import {
  ConnextEventEmitter,
  IMessagingService,
  MessagingConfig,
  Message,
  VerifyNonceDtoType,
  IChannelSigner,
} from "@connext/types";
import { ChannelSigner, ColorfulLogger, delay } from "@connext/utils";
import axios, { AxiosResponse } from "axios";
import { Wallet } from "ethers";

import { env } from "./env";
import { combineObjects } from "./misc";

const log = new ColorfulLogger("Messaging", env.logLevel);

// TYPES
export type MessageCounter = {
  sent: number;
  received: number;
};

type DetailedMessageCounter = MessageCounter & {
  ceiling?: Partial<MessageCounter>;
  delay?: Partial<MessageCounter>;
};

export type TestMessagingConfig = {
  nodeUrl: string;
  messagingConfig: MessagingConfig;
  protocolDefaults: {
    [protocol: string]: DetailedMessageCounter;
  };
  count: DetailedMessageCounter;
  signer: IChannelSigner;
};

export const RECEIVED = "RECEIVED";
export const SEND = "SEND";
export const CONNECT = "CONNECT";
export const DISCONNECT = "DISCONNECT";
export const FLUSH = "FLUSH";
export const PUBLISH = "PUBLISH";
export const REQUEST = "REQUEST";
export const SUBSCRIBE = "SUBSCRIBE";
export const UNSUBSCRIBE = "UNSUBSCRIBE";
export const SUBJECT_FORBIDDEN = "SUBJECT_FORBIDDEN";
export const MessagingEvents = {
  [RECEIVED]: RECEIVED,
  [SEND]: SEND,
  [CONNECT]: CONNECT,
  [DISCONNECT]: DISCONNECT,
  [FLUSH]: FLUSH,
  [PUBLISH]: PUBLISH,
  [REQUEST]: REQUEST,
  [SUBSCRIBE]: SUBSCRIBE,
  [UNSUBSCRIBE]: UNSUBSCRIBE,
  [SUBJECT_FORBIDDEN]: SUBJECT_FORBIDDEN,
};
export type MessagingEvent = keyof typeof MessagingEvents;
export type MessagingEventData = {
  subject?: string;
  data?: any;
};

export const getProtocolFromData = (msg: MessagingEventData) => {
  const { subject, data } = msg;
  if (!data || !subject) {
    return;
  }
  if (data.data && data.data.protocol) {
    // fast forward
    return data.data.protocol;
  }
};

const defaultCount = (details: string[] = []): MessageCounter | DetailedMessageCounter => {
  if (details.includes("delay") && details.includes("ceiling")) {
    return {
      ...zeroCounter(),
      ceiling: undefined,
      delay: zeroCounter(),
    };
  }

  if (details.includes("delay")) {
    return {
      ...zeroCounter(),
      delay: zeroCounter(),
    };
  }
  return {
    ...zeroCounter(),
    ceiling: undefined,
  };
};

const zeroCounter = (): MessageCounter => {
  return { sent: 0, received: 0 };
};

const defaultOpts = (): TestMessagingConfig => {
  return {
    nodeUrl: env.nodeUrl,
    messagingConfig: {
      // TODO:
      messagingUrl: "nats://172.17.0.1:4222",
    },
    protocolDefaults: {
      install: defaultCount(),
      "install-virtual-app": defaultCount(),
      setup: defaultCount(),
      propose: defaultCount(),
      takeAction: defaultCount(),
      uninstall: defaultCount(),
      "uninstall-virtual-app": defaultCount(),
      update: defaultCount(),
      withdraw: defaultCount(),
    },
    count: defaultCount(),
    signer: new ChannelSigner(
      Wallet.createRandom().privateKey,
      env.ethProviderUrl,
    ),
  };
};

export class TestMessagingService extends ConnextEventEmitter implements IMessagingService {
  private connection: MessagingService;
  private protocolDefaults: {
    [protocol: string]: DetailedMessageCounter;
  };
  private countInternal: DetailedMessageCounter;
  public options: TestMessagingConfig;

  constructor(opts: Partial<TestMessagingConfig>) {
    super();
    const defaults = defaultOpts();
    opts.signer = opts.signer || defaults.signer;
    // create options
    this.options = {
      nodeUrl: opts.nodeUrl || defaults.nodeUrl,
      messagingConfig: combineObjects(opts.messagingConfig, defaults.messagingConfig),
      count: combineObjects(opts.count, defaults.count),
      protocolDefaults: combineObjects(opts.protocolDefaults, defaults.protocolDefaults),
      signer: typeof opts.signer === "string" 
        ? new ChannelSigner(opts.signer) 
        : opts.signer,
    };
    const getSignature = (msg: string) => this.options.signer.signMessage(msg);

    const getBearerToken = async (
      userIdentifier: string,
      getSignature: (nonce: string) => Promise<string>,
    ): Promise<string> => {
      try {
        const nonce = await axios.get(`${this.options.nodeUrl}/auth/${userIdentifier}`);
        const sig = await getSignature(nonce.data);
        const bearerToken: AxiosResponse<string> = await axios.post(
          `${this.options.nodeUrl}/auth`,
          {
            sig,
            userIdentifier: userIdentifier,
          } as VerifyNonceDtoType,
        );
        return bearerToken.data;
      } catch (e) {
        return e;
      }
    };

    // NOTE: high maxPingOut prevents stale connection errors while time-travelling
    const key = `INDRA`;
    this.connection = new MessagingService(this.options.messagingConfig, key, () =>
      getBearerToken(this.options.signer.publicIdentifier, getSignature),
    );
    this.protocolDefaults = this.options.protocolDefaults;
    this.countInternal = this.options.count;
  }

  ////////////////////////////////////////
  // Getters / setters

  get setup(): DetailedMessageCounter {
    return this.protocolDefaults.setup;
  }

  get install(): DetailedMessageCounter {
    return this.protocolDefaults.install;
  }

  get installVirtual(): DetailedMessageCounter {
    return this.protocolDefaults["install-virtual-app"];
  }

  get propose(): DetailedMessageCounter {
    return this.protocolDefaults.propose;
  }

  get takeAction(): DetailedMessageCounter {
    return this.protocolDefaults.takeAction;
  }

  get uninstall(): DetailedMessageCounter {
    return this.protocolDefaults.uninstall;
  }

  get uninstallVirtual(): DetailedMessageCounter {
    return this.protocolDefaults["uninstall-virtual-app"];
  }

  get update(): DetailedMessageCounter {
    return this.protocolDefaults.update;
  }

  get withdraw(): DetailedMessageCounter {
    return this.protocolDefaults.withdraw;
  }

  get count(): DetailedMessageCounter {
    return this.countInternal;
  }

  ////////////////////////////////////////
  // IMessagingService Methods
  async onReceive(subject: string, callback: (msg: Message) => void): Promise<void> {
    // return connection callback
    return this.connection.onReceive(subject, async (msg: Message) => {
      this.emit(RECEIVED, { subject, data: msg } as MessagingEventData);
      // wait out delay
      await this.awaitDelay();
      if (
        this.hasCeiling({ type: "received" }) &&
        this.count.ceiling!.received! <= this.count.received
      ) {
        log.warn(
          `Reached ceiling (${
            this.count.ceiling!.received
          }), refusing to process any more messages. Received ${this.count.received} messages`,
        );
        return;
      }
      // handle overall protocol count
      this.count.received += 1;

      // check if any protocol messages are increased
      const protocol = this.getProtocol(msg);
      if (!protocol || !this.protocolDefaults[protocol]) {
        // Could not find protocol corresponding to received message,
        // proceeding with callback
        return callback(msg);
      }
      // wait out delay
      await this.awaitDelay(false, protocol);
      // verify ceiling exists and has not been reached
      if (
        this.hasCeiling({ protocol, type: "received" }) &&
        this.protocolDefaults[protocol].ceiling!.received! <=
          this.protocolDefaults[protocol].received
      ) {
        const msg = `Refusing to process any more messages, ceiling for ${protocol} has been reached. ${
          this.protocolDefaults[protocol].received
        } received, ceiling: ${this.protocolDefaults[protocol].ceiling!.received!}`;
        log.warn(msg);
        return;
      }
      this.protocolDefaults[protocol].received += 1;
      // perform callback
      return callback(msg);
    });
  }

  async send(to: string, msg: Message): Promise<void> {
    this.emit(SEND, { subject: to, data: msg } as MessagingEventData);
    // wait out delay
    await this.awaitDelay(true);
    if (this.hasCeiling({ type: "sent" }) && this.count.sent >= this.count.ceiling!.sent!) {
      log.warn(
        `Reached ceiling (${this.count.ceiling!.sent!}), refusing to send any more messages. Sent ${
          this.count.sent
        } messages`,
      );
      return;
    }

    // check protocol ceiling
    const protocol = this.getProtocol(msg);
    if (!protocol || !this.protocolDefaults[protocol]) {
      // Could not find protocol corresponding to received message,
      // proceeding with sending
      return this.connection.send(to, msg);
    }
    // wait out delay
    await this.awaitDelay(true, protocol);
    if (
      this.hasCeiling({ type: "sent", protocol }) &&
      this.protocolDefaults[protocol].sent >= this.protocolDefaults[protocol].ceiling!.sent!
    ) {
      const msg = `Refusing to send any more messages, ceiling for ${protocol} has been reached. ${
        this.protocolDefaults[protocol].sent
      } sent, ceiling: ${this.protocolDefaults[protocol].ceiling!.sent!}`;
      log.warn(msg);
      return;
    }
    // handle counts
    this.count.sent += 1;
    this.protocolDefaults[protocol].sent += 1;

    // send message, if its a stale connection, retry
    return this.connection.send(to, msg);
  }

  private awaitDelay = async (isSend: boolean = false, protocol?: string): Promise<any> => {
    const key = isSend ? "sent" : "received";
    if (!protocol) {
      if (!this.count.delay) {
        return;
      }
      return delay(this.count.delay[key] || 0);
    }
    if (!this.protocolDefaults[protocol] || !this.protocolDefaults[protocol]["delay"]) {
      return;
    }
    return delay(this.protocolDefaults[protocol]!.delay![key] || 0);
  };

  ////////////////////////////////////////
  // More generic methods

  async connect(): Promise<void> {
    this.emit(CONNECT, {} as MessagingEventData);
    await this.connection.connect();
  }

  async disconnect(): Promise<void> {
    this.emit(DISCONNECT, {} as MessagingEventData);
    await this.connection.disconnect();
  }

  async flush(): Promise<void> {
    this.emit(FLUSH, {} as MessagingEventData);
    return this.connection.flush();
  }

  async publish(subject: string, data: any): Promise<void> {
    // make sure that client is allowed to send message
    this.emit(PUBLISH, { data, subject } as MessagingEventData);
    return this.connection.publish(subject, data);
  }

  async request(
    subject: string,
    timeout: number,
    data: object,
    callback?: (response: any) => any,
  ): Promise<any> {
    // make sure that client is allowed to send message
    // note: when sending via node.ts uses request
    // make sure that client is allowed to send message

    this.emit(REQUEST, { data, subject } as MessagingEventData);
    return this.connection.request(subject, timeout, data);
  }

  async subscribe(subject: string, callback: (msg: Message) => void): Promise<void> {
    return this.connection.subscribe(subject, callback);
  }

  async unsubscribe(subject: string): Promise<void> {
    return this.connection.unsubscribe(subject);
  }

  ////////////////////////////////////////
  // Private methods
  private getProtocol(msg: any): string | undefined {
    if (!msg.data) {
      // no .data field found, cannot find protocol of msg
      return undefined;
    }
    const protocol = msg.data.protocol;
    if (!protocol) {
      // no .data.protocol field found, cannot find protocol of msg
      return undefined;
    }

    return protocol;
  }

  private hasCeiling(opts: Partial<{ type: "sent" | "received"; protocol: string }> = {}): boolean {
    const { type, protocol } = opts;
    const exists = (value: any | undefined | null): boolean => {
      // will return true if value is null, and will
      // return false if value is 0
      return value !== undefined && value !== null;
    };
    if (!protocol) {
      if (!type) {
        return exists(this.count.ceiling);
      }
      return exists(this.count.ceiling) && exists(this.count.ceiling![type]);
    }
    if (!type) {
      return exists(this.protocolDefaults[protocol].ceiling);
    }
    return (
      exists(this.protocolDefaults[protocol].ceiling) &&
      exists(this.protocolDefaults[protocol].ceiling![type!])
    );
  }
}
