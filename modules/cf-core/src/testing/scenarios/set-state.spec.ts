import { NetworkContext } from "@connext/types";
import { getRandomAddress, toBN } from "@connext/utils";
import { Contract, Wallet } from "ethers";
import { WeiPerEther, AddressZero } from "ethers/constants";

import { SetStateCommitment } from "../../ethereum";
import { FreeBalanceClass, StateChannel } from "../../models";

import { ChallengeRegistry } from "../contracts";
import { toBeEq } from "../bignumber-jest-matcher";
import { getRandomChannelSigners } from "../random-signing-keys";
import { getAddress } from "ethers/utils";

// The ChallengeRegistry.setState call _could_ be estimated but we haven't
// written this test to do that yet
const SETSTATE_COMMITMENT_GAS = 6e9;

let wallet: Wallet;
let network: NetworkContext;
let appRegistry: Contract;

expect.extend({ toBeEq });

beforeAll(async () => {
  wallet = global["wallet"];
  network = global["network"];
  appRegistry = new Contract(network.ChallengeRegistry, ChallengeRegistry.abi, wallet);
});

/**
 * @summary Setup a StateChannel then set state on ETH Free Balance
 */
describe("set state on free balance", () => {
  it("should have the correct versionNumber", async done => {
    const [initiatorNode, responderNode] = getRandomChannelSigners(2);
    // State channel testing values
    let stateChannel = StateChannel.setupChannel(
      network.IdentityApp,
      {
        proxyFactory: network.ProxyFactory,
        multisigMastercopy: network.MinimumViableMultisig,
      },
      getAddress(getRandomAddress()),
      initiatorNode.publicIdentifier,
      responderNode.publicIdentifier,
    );

    expect(stateChannel.userIdentifiers[0]).toEqual(initiatorNode.publicIdentifier);
    expect(stateChannel.userIdentifiers[1]).toEqual(responderNode.publicIdentifier);

    // Set the state to some test values
    stateChannel = stateChannel.setFreeBalance(
      FreeBalanceClass.createWithFundedTokenAmounts(stateChannel.multisigOwners, WeiPerEther, [
        AddressZero,
      ]),
    );

    const freeBalanceETH = stateChannel.freeBalance;

    const setStateCommitment = new SetStateCommitment(
      network.ChallengeRegistry,
      freeBalanceETH.identity,
      freeBalanceETH.hashOfLatestState,
      toBN(freeBalanceETH.versionNumber),
      toBN(freeBalanceETH.stateTimeout),
    );
    const setStateCommitmentHash = setStateCommitment.hashToSign();

    await setStateCommitment.addSignatures(
      await initiatorNode.signMessage(setStateCommitmentHash),
      await responderNode.signMessage(setStateCommitmentHash),
    );

    const setStateTx = await setStateCommitment.getSignedTransaction();

    await wallet.sendTransaction({
      ...setStateTx,
      gasLimit: SETSTATE_COMMITMENT_GAS,
    });

    const contractAppState = await appRegistry.appChallenges(freeBalanceETH.identityHash);

    expect(contractAppState.versionNumber).toBeEq(setStateCommitment.versionNumber);

    done();
  });
});
