import { generateValidationMiddleware } from "@connext/apps";
import { ChannelProvider } from "@connext/channel-provider";
import { Node as CFCore } from "@connext/cf-core";
import {
  CFChannelProviderOptions,
  ChannelMethods,
  ChannelProviderConfig,
  ConnextClientStorePrefix,
  ConnextEventEmitter,
  CreateChannelMessage,
  EventNames,
  IChannelProvider,
  IChannelSigner,
  IClientStore,
  ILoggerService,
  INodeApiClient,
  IRpcConnection,
  JsonRpcRequest,
  MethodName,
  MethodResults,
  MinimalTransaction,
  NodeResponses,
  Opcode,
  SetStateCommitmentJSON,
  StateChannelJSON,
  WalletDepositParams,
  WithdrawalMonitorObject,
  ConditionalTransactionCommitmentJSON,
} from "@connext/types";
import {
  deBigNumberifyJson,
  stringify,
  delayAndThrow,
  getPublicKeyFromPublicIdentifier,
  toBN,
} from "@connext/utils";
import { Contract } from "ethers";
import { AddressZero } from "ethers/constants";
import tokenAbi from "human-standard-token-abi";

export const createCFChannelProvider = async ({
  ethProvider,
  signer,
  node,
  logger,
  store,
}: CFChannelProviderOptions): Promise<IChannelProvider> => {
  let config: NodeResponses.GetConfig;
  if (!node.config) {
    config = await node.getConfig();
  } else {
    config = node.config;
  }
  const contractAddresses = config.contractAddresses;
  const messaging = node.messaging;
  const nodeConfig = { STORE_KEY_PREFIX: ConnextClientStorePrefix };
  const lockService = { acquireLock: node.acquireLock.bind(node) };
  const cfCore = await CFCore.create(
    messaging,
    store,
    contractAddresses,
    nodeConfig,
    ethProvider,
    signer,
    lockService,
    undefined,
    logger,
  );

  // register any default middlewares
  cfCore.injectMiddleware(
    Opcode.OP_VALIDATE,
    await generateValidationMiddleware(contractAddresses),
  );

  const connection = new CFCoreRpcConnection(cfCore, store, signer, node, logger);
  const channelProvider = new ChannelProvider(connection);
  await channelProvider.enable();
  return channelProvider;
};

export class CFCoreRpcConnection extends ConnextEventEmitter implements IRpcConnection {
  public connected: boolean = true;
  public cfCore: CFCore;
  public store: IClientStore;

  private signer: IChannelSigner;
  private node: INodeApiClient;
  private logger: ILoggerService;
  private config: ChannelProviderConfig;

  constructor(
    cfCore: CFCore,
    store: IClientStore,
    signer: IChannelSigner,
    node: INodeApiClient,
    logger: ILoggerService,
  ) {
    super();
    this.cfCore = cfCore;
    this.store = store;
    this.signer = signer;
    this.node = node;
    this.logger = logger;
    this.config = {
      nodeUrl: node.nodeUrl,
      signerAddress: signer.address,
      userIdentifier: signer.publicIdentifier,
    };
  }

  public async send<T = any>(payload: JsonRpcRequest): Promise<T> {
    const { method, params } = payload;
    let result;
    switch (method) {
      case ChannelMethods.chan_isSigner:
        result = true;
        break;
      case ChannelMethods.chan_config:
        result = this.config;
        break;
      case ChannelMethods.chan_enable:
        result = await this.enableChannel();
        break;
      case ChannelMethods.chan_setUserWithdrawal:
        result = await this.setUserWithdrawal(params.withdrawalObject, params.remove);
        break;
      case ChannelMethods.chan_getUserWithdrawal:
        result = await this.getUserWithdrawals();
        break;
      case ChannelMethods.chan_signMessage:
        result = await this.signMessage(params.message);
        break;
      case ChannelMethods.chan_encrypt:
        result = await this.encrypt(params.message, params.publicIdentifier);
        break;
      case ChannelMethods.chan_decrypt:
        result = await this.decrypt(params.encryptedPreImage);
        break;
      case ChannelMethods.chan_restoreState:
        result = await this.restoreState();
        break;
      case ChannelMethods.chan_setStateChannel:
        result = await this.setStateChannel(
          params.state,
          params.setupCommitment,
          params.setStateCommitments,
          params.conditionalCommitments,
        );
        break;
      case ChannelMethods.chan_walletDeposit:
        result = await this.walletDeposit(params);
        break;
      case ChannelMethods.chan_getSchemaVersion:
        result = await this.getSchemaVersion();
        break;
      case ChannelMethods.chan_updateSchemaVersion:
        result = await this.updateSchemaVersion(params.version);
        break;
      default:
        result = await this.routerDispatch(method, params);
        break;
    }
    return result;
  }

  public on = (
    event: string | EventNames | MethodName,
    listener: (...args: any[]) => void,
  ): any => {
    this.cfCore.on(event as any, listener);
    return this.cfCore;
  };

  public once = (
    event: string | EventNames | MethodName,
    listener: (...args: any[]) => void,
  ): any => {
    this.cfCore.once(event as any, listener);
    return this.cfCore;
  };

  public open(): Promise<void> {
    return Promise.resolve();
  }

  public close(): Promise<void> {
    return Promise.resolve();
  }

  ///////////////////////////////////////////////
  ///// PRIVATE METHODS

  private signMessage(message: string): Promise<string> {
    return this.signer.signMessage(message);
  }

  private encrypt(message: string, publicIdentifier: string): Promise<string> {
    return this.signer.encrypt(message, getPublicKeyFromPublicIdentifier(publicIdentifier));
  }

  private decrypt(encryptedPreImage: string): Promise<string> {
    return this.signer.decrypt(encryptedPreImage);
  }

  private walletDeposit = async (params: WalletDepositParams): Promise<string> => {
    let recipient = this.config.multisigAddress;
    if (!recipient) {
      throw new Error(`Cannot make deposit without channel created - missing multisigAddress`);
    }
    let hash;
    if (params.assetId === AddressZero) {
      const tx = await this.signer.sendTransaction({
        to: recipient,
        value: toBN(params.amount),
      });
      hash = tx.hash;
    } else {
      const erc20 = new Contract(params.assetId, tokenAbi, this.signer);
      const tx = await erc20.transfer(recipient, toBN(params.amount));
      hash = tx.hash;
    }
    return hash;
  };

  private getUserWithdrawals = async (): Promise<WithdrawalMonitorObject[]> => {
    return this.store.getUserWithdrawals();
  };

  private setUserWithdrawal = async (
    value: WithdrawalMonitorObject,
    remove: boolean = false,
  ): Promise<void> => {
    if (remove) {
      return this.store.removeUserWithdrawal(value);
    }
    return this.store.saveUserWithdrawal(value);
  };

  private setStateChannel = async (
    channel: StateChannelJSON,
    setupCommitment: MinimalTransaction,
    setStateCommitments: [string, SetStateCommitmentJSON][], // [appId, json]
    conditionalCommitments: [string, ConditionalTransactionCommitmentJSON][],
    // [appId, json]
  ): Promise<void> => {
    await this.store.updateSchemaVersion();
    // save the channel + setup commitment + latest free balance set state
    const freeBalanceSetStates = setStateCommitments
      .filter(([id, json]) => id === channel.freeBalanceAppInstance.identityHash)
      .sort((a, b) =>
        toBN(b[1].versionNumber)
          .sub(toBN(a[1].versionNumber))
          .toNumber(),
      );

    if (!freeBalanceSetStates[0]) {
      throw new Error(
        `Could not find latest free balance set state commitment: ${stringify(
          freeBalanceSetStates,
        )}`,
      );
    }
    await this.store.createStateChannel(channel, setupCommitment, freeBalanceSetStates[0][1]);
    // save all the app proposals + set states
    const proposals = [...channel.proposedAppInstances]
      .map(([id, json]) => json)
      .sort((a, b) => a.appSeqNo - b.appSeqNo);
    for (const proposal of proposals) {
      const [_, setState] = setStateCommitments.find(
        ([id, json]) => id === proposal.identityHash && toBN(json.versionNumber).eq(1),
      );
      if (!setState) {
        throw new Error(
          `Could not find set state commitment for proposal ${proposal.identityHash}`,
        );
      }
      await this.store.createAppProposal(
        channel.multisigAddress,
        proposal,
        proposal.appSeqNo,
        setState,
      );
    }
    // save all the app instances + conditionals
    const appInstances = [...channel.appInstances]
      .map(([id, json]) => json)
      .sort((a, b) => a.appSeqNo - b.appSeqNo);
    for (const app of appInstances) {
      if (app.identityHash === channel.freeBalanceAppInstance.identityHash) {
        continue;
      }
      const [_, conditional] = conditionalCommitments.find(([id, _]) => id === app.identityHash);
      if (!conditional) {
        throw new Error(`Could not find set state commitment for proposal ${app.identityHash}`);
      }
      await this.store.createAppInstance(
        channel.multisigAddress,
        app,
        channel.freeBalanceAppInstance, // fb state saved on create
        ({
          appIdentityHash: channel.freeBalanceAppInstance.identityHash,
          versionNumber: app.appSeqNo,
        } as unknown) as SetStateCommitmentJSON,
        // latest free balance saved when channel created, use dummy values
        // with increasing app numbers so they get deleted properly
        conditional,
      );
    }
  };

  private restoreState = async (): Promise<void> => {
    await this.store.restore();
  };

  private async getSchemaVersion() {
    return this.store.getSchemaVersion();
  }

  private async updateSchemaVersion(version?: number) {
    return this.store.updateSchemaVersion(version);
  }

  private async enableChannel() {
    const channel = await this.node.getChannel();

    let multisigAddress: string;

    if (channel) {
      multisigAddress = channel.multisigAddress;
    } else {
      this.logger.debug("no channel detected, creating channel..");
      const creationEventData = await Promise.race([
        delayAndThrow(30_000, "Create channel event not fired within 30s"),
        new Promise(
          async (res: any): Promise<any> => {
            this.cfCore.once(
              EventNames.CREATE_CHANNEL_EVENT,
              (data: CreateChannelMessage): void => {
                this.logger.debug(`Received CREATE_CHANNEL_EVENT`);
                res(data.data);
              },
            );

            // FYI This continues async in the background after CREATE_CHANNEL_EVENT is recieved
            const creationData = await this.node.createChannel();
            this.logger.debug(`created channel, transaction: ${stringify(creationData)}`);
          },
        ),
      ]);
      multisigAddress = (creationEventData as MethodResults.CreateChannel).multisigAddress;
    }

    this.logger.debug(`multisigAddress: ${multisigAddress}`);
    this.config.multisigAddress = multisigAddress;

    return this.config;
  }

  private routerDispatch = async (method: string, params: any = {}) => {
    const ret = await this.cfCore.rpcRouter.dispatch({
      id: Date.now(),
      methodName: method,
      parameters: deBigNumberifyJson(params),
    });
    return ret.result.result;
  };
}
