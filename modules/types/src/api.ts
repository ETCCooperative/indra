import { AppRegistry } from "./app";

import {
  Address,
  Bytes32,
  DecString,
  PublicIdentifier,
  StringMapping,
  Transaction,
  UrlString,
} from "./basic";
import { IChannelProvider } from "./channelProvider";
import { IChannelSigner } from "./crypto";
import { NodeResponses } from "./node";
import { IMessagingService } from "./messaging";
import { ILoggerService } from "./logger";
import { JsonRpcProvider } from "ethers/providers";
import { IClientStore } from "./store";

export interface AsyncNodeInitializationParameters extends NodeInitializationParameters {
  ethProvider: JsonRpcProvider;
  messaging: IMessagingService;
  messagingUrl?: string;
  store?: IClientStore;
  signer?: IChannelSigner;
  channelProvider?: IChannelProvider;
}

export interface NodeInitializationParameters {
  nodeUrl: string;
  messaging: IMessagingService;
  logger?: ILoggerService;
  userIdentifier?: Address;
  nodeIdentifier?: Address;
  channelProvider?: IChannelProvider;
}

export interface INodeApiClient {
  nodeUrl: UrlString;
  messaging: IMessagingService;
  latestSwapRates: StringMapping;
  log: ILoggerService;
  userIdentifier: PublicIdentifier | undefined;
  nodeIdentifier: PublicIdentifier | undefined;
  config: NodeResponses.GetConfig | undefined;
  channelProvider: IChannelProvider | undefined;
  acquireLock(lockName: string, callback: (...args: any[]) => any, timeout: number): Promise<any>;
  appRegistry(
    appDetails?:
      | {
          name: string;
          chainId: number;
        }
      | { appDefinitionAddress: Address },
  ): Promise<AppRegistry>;
  getConfig(): Promise<NodeResponses.GetConfig>;
  createChannel(): Promise<NodeResponses.CreateChannel>;
  clientCheckIn(): Promise<void>;
  getChannel(): Promise<NodeResponses.GetChannel>;
  getLatestSwapRate(from: Address, to: Address): Promise<DecString>;
  getRebalanceProfile(assetId?: Address): Promise<NodeResponses.GetRebalanceProfile>;
  getHashLockTransfer(lockHash: Bytes32, assetId?: Address): Promise<NodeResponses.GetHashLockTransfer>;
  getPendingAsyncTransfers(): Promise<NodeResponses.GetPendingAsyncTransfers>;
  getTransferHistory(userAddress?: Address): Promise<NodeResponses.GetTransferHistory>;
  getLatestWithdrawal(): Promise<Transaction>;
  requestCollateral(assetId: Address): Promise<NodeResponses.RequestCollateral | void>;
  fetchLinkedTransfer(paymentId: Bytes32): Promise<NodeResponses.GetLinkedTransfer>;
  fetchSignedTransfer(paymentId: Bytes32): Promise<NodeResponses.GetSignedTransfer>;
  resolveLinkedTransfer(paymentId: Bytes32): Promise<NodeResponses.ResolveLinkedTransfer>;
  resolveSignedTransfer(paymentId: Bytes32): Promise<NodeResponses.ResolveSignedTransfer>;
  recipientOnline(recipientAddress: Address): Promise<boolean>;
  restoreState(userAddress: Address): Promise<NodeResponses.ChannelRestore>;
  subscribeToSwapRates(from: Address, to: Address, callback: any): Promise<void>;
  unsubscribeFromSwapRates(from: Address, to: Address): Promise<void>;
}
