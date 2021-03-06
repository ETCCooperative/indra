import { MessagingService } from "@connext/messaging";
import { FactoryProvider } from "@nestjs/common/interfaces";
import { utils } from "ethers";

import { LoggerService } from "../logger/logger.service";
import { MessagingProviderId, SwapRateProviderId } from "../constants";
import { AbstractMessagingProvider } from "../messaging/abstract.provider";
import { ConfigService } from "../config/config.service";

import { SwapRateService } from "./swapRate.service";

const { getAddress } = utils;

export class SwapRateMessaging extends AbstractMessagingProvider {
  constructor(
    log: LoggerService,
    messaging: MessagingService,
    private readonly configService: ConfigService,
    private readonly swapRateService: SwapRateService,
  ) {
    super(log, messaging);
    this.log.setContext("SwapRateMessaging");
  }

  async getLatestSwapRate(subject: string): Promise<string> {
    const [, , , from, to] = subject.split(".");
    return this.swapRateService.getOrFetchRate(getAddress(from), getAddress(to));
  }

  async setupSubscriptions(): Promise<void> {
    await super.connectRequestReponse(
      `*.${this.configService.getPublicIdentifier()}.swap-rate.>`,
      this.getLatestSwapRate.bind(this),
    );
  }
}

export const swapRateProviderFactory: FactoryProvider<Promise<MessagingService>> = {
  inject: [LoggerService, MessagingProviderId, SwapRateService, ConfigService],
  provide: SwapRateProviderId,
  useFactory: async (
    log: LoggerService,
    messaging: MessagingService,
    swapRateService: SwapRateService,
    configService: ConfigService,
  ): Promise<MessagingService> => {
    const swapRate = new SwapRateMessaging(log, messaging, configService, swapRateService);
    await swapRate.setupSubscriptions();
    return messaging;
  },
};
