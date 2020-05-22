import {
  EventNames,
  IStoreService,
  MethodNames,
  MethodParams,
  MethodResults,
  ProtocolNames,
  SolidityValueType,
  UpdateStateMessage,
  PublicIdentifier,
} from "@connext/types";
import { toBN } from "@connext/utils";
import { INVALID_ARGUMENT } from "ethers/errors";
import { BigNumber } from "ethers/utils";
import { jsonRpcMethod } from "rpc-server";

import {
  IMPROPERLY_FORMATTED_STRUCT,
  INVALID_ACTION,
  NO_APP_INSTANCE_FOR_TAKE_ACTION,
  STATE_OBJECT_NOT_ENCODABLE,
  NO_APP_INSTANCE_FOR_GIVEN_HASH,
  NO_STATE_CHANNEL_FOR_APP_IDENTITY_HASH,
  NO_MULTISIG_IN_PARAMS,
} from "../../errors";
import { ProtocolRunner } from "../../machine";
import { RequestHandler } from "../../request-handler";

import { NodeController } from "../controller";
import { StateChannel } from "../../models/state-channel";
import RpcRouter from "../../rpc-router";

export class TakeActionController extends NodeController {
  @jsonRpcMethod(MethodNames.chan_takeAction)
  public executeMethod = super.executeMethod;

  protected async getRequiredLockName(
    requestHandler: RequestHandler,
    params: MethodParams.TakeAction,
  ): Promise<string> {
    if (!params.multisigAddress) {
      throw new Error(NO_MULTISIG_IN_PARAMS(params));
    }
    return params.multisigAddress;
  }

  protected async beforeExecution(
    requestHandler: RequestHandler,
    params: MethodParams.TakeAction,
    preProtocolStateChannel: StateChannel | undefined,
  ): Promise<void> {
    const { appIdentityHash, action } = params;

    if (!appIdentityHash) {
      throw new Error(NO_APP_INSTANCE_FOR_TAKE_ACTION);
    }

    if (!preProtocolStateChannel) {
      throw new Error(NO_STATE_CHANNEL_FOR_APP_IDENTITY_HASH(appIdentityHash));
    }

    const appInstance = preProtocolStateChannel.appInstances.get(appIdentityHash);
    if (!appInstance) {
      throw new Error(NO_APP_INSTANCE_FOR_GIVEN_HASH);
    }

    try {
      appInstance.encodeAction(action);
    } catch (e) {
      if (e.code === INVALID_ARGUMENT) {
        throw new Error(`${IMPROPERLY_FORMATTED_STRUCT}: ${e.message}`);
      }
      throw new Error(STATE_OBJECT_NOT_ENCODABLE);
    }
  }

  protected async executeMethodImplementation(
    requestHandler: RequestHandler,
    params: MethodParams.TakeAction,
    preProtocolStateChannel: StateChannel | undefined,
  ): Promise<MethodResults.TakeAction> {
    const { store, publicIdentifier, protocolRunner, router } = requestHandler;
    const { appIdentityHash, action, stateTimeout } = params;

    const app = preProtocolStateChannel!.appInstances.get(appIdentityHash)!;

    const { channel } = await runTakeActionProtocol(
      appIdentityHash,
      store,
      router,
      protocolRunner,
      publicIdentifier,
      preProtocolStateChannel!.userIdentifiers.find((id) => id !== publicIdentifier)!,
      action,
      stateTimeout || toBN(app.defaultTimeout),
    );

    const appInstance = channel.getAppInstance(appIdentityHash);
    if (!appInstance) {
      throw new Error(NO_APP_INSTANCE_FOR_GIVEN_HASH);
    }

    return { newState: appInstance.state };
  }

  protected async afterExecution(
    requestHandler: RequestHandler,
    params: MethodParams.TakeAction,
    returnValue: MethodResults.TakeAction,
  ): Promise<void> {
    const { router, publicIdentifier } = requestHandler;
    const { appIdentityHash, action } = params;

    const msg = {
      from: publicIdentifier,
      type: EventNames.UPDATE_STATE_EVENT,
      data: { appIdentityHash, action, newState: returnValue.newState },
    } as UpdateStateMessage;

    await router.emit(msg.type, msg, `outgoing`);
  }
}

async function runTakeActionProtocol(
  appIdentityHash: string,
  store: IStoreService,
  router: RpcRouter,
  protocolRunner: ProtocolRunner,
  initiatorIdentifier: PublicIdentifier,
  responderIdentifier: PublicIdentifier,
  action: SolidityValueType,
  stateTimeout: BigNumber,
) {
  const stateChannel = await store.getStateChannelByAppIdentityHash(appIdentityHash);
  if (!stateChannel) {
    throw new Error(NO_STATE_CHANNEL_FOR_APP_IDENTITY_HASH(appIdentityHash));
  }

  try {
    return await protocolRunner.initiateProtocol(router, ProtocolNames.takeAction, {
      initiatorIdentifier,
      responderIdentifier,
      appIdentityHash,
      action,
      multisigAddress: stateChannel.multisigAddress,
      stateTimeout,
    });
  } catch (e) {
    if (e.toString().indexOf(`VM Exception`) !== -1) {
      // TODO: Fetch the revert reason
      throw new Error(`${INVALID_ACTION}: ${e.message}`);
    }
    throw new Error(`Couldn't run TakeAction protocol: ${e.message}`);
  }
}
