import {
  MultisigCommitment,
  ConditionalTransactionCommitment,
  SetStateCommitment,
  SetupCommitment,
} from "@connext/contracts";
import { OutcomeType } from "@connext/types";
import { toBN } from "@connext/utils";
import { AddressZero } from "ethers/constants";

import { Context } from "../types";
import { StateChannel, AppInstance } from "../models";

const getConditionalTransactionCommitment = (
  context: Context,
  stateChannel: StateChannel,
  appInstance: AppInstance,
): ConditionalTransactionCommitment =>
  new ConditionalTransactionCommitment(
    context.network,
    stateChannel.multisigAddress,
    stateChannel.multisigOwners,
    appInstance.identityHash,
    stateChannel.freeBalance.identityHash,
    appInstance.outcomeType === OutcomeType.MULTI_ASSET_MULTI_PARTY_COIN_TRANSFER
      ? context.network.MultiAssetMultiPartyCoinTransferInterpreter
      : appInstance.outcomeType === OutcomeType.SINGLE_ASSET_TWO_PARTY_COIN_TRANSFER
      ? context.network.SingleAssetTwoPartyCoinTransferInterpreter
      : appInstance.outcomeType === OutcomeType.TWO_PARTY_FIXED_OUTCOME
      ? context.network.TwoPartyFixedOutcomeInterpreter
      : AddressZero,
    appInstance.encodedInterpreterParams,
  );

const getSetStateCommitment = (context: Context, appInstance: AppInstance) =>
  new SetStateCommitment(
    context.network.ChallengeRegistry,
    appInstance.identity,
    appInstance.hashOfLatestState,
    toBN(appInstance.versionNumber),
    toBN(appInstance.stateTimeout),
  );

const getSetupCommitment = (context: Context, stateChannel: StateChannel): SetupCommitment =>
  new SetupCommitment(
    context.network,
    stateChannel.multisigAddress,
    stateChannel.multisigOwners,
    stateChannel.freeBalance.identity,
  );

export {
  MultisigCommitment,
  getConditionalTransactionCommitment,
  ConditionalTransactionCommitment,
  getSetStateCommitment,
  SetStateCommitment,
  getSetupCommitment,
  SetupCommitment,
};
