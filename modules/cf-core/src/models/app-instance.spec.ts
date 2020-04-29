import { OutcomeType } from "@connext/types";
import { getRandomAddress, toBN } from "@connext/utils";
import { AddressZero, Zero } from "ethers/constants";
import { getAddress } from "ethers/utils";

import { AppInstance } from "./app-instance";
import { getRandomPublicIdentifier } from "../testing/random-signing-keys";

describe("AppInstance", () => {
  it("should be able to instantiate", () => {
    const participants = [
      getRandomPublicIdentifier(),
      getRandomPublicIdentifier(),
    ];

    const appInstance = new AppInstance(
      /* initiator */ participants[0],
      /* responder*/ participants[1],
      /* default timeout */ toBN(Math.ceil(Math.random() * 2e10)).toHexString(),
      /* appInterface */ {
        addr: getAddress(getRandomAddress()),
        stateEncoding: "tuple(address foo, uint256 bar)",
        actionEncoding: undefined,
      },
      /* appSeqNo */ Math.ceil(Math.random() * 2e10),
      /* latestState */ { foo: getAddress(getRandomAddress()), bar: 0 },
      /* latestVersionNumber */ 999,
      /* stateTimeout */ toBN(Math.ceil(1000 * Math.random())).toHexString(),
      /* outcomeType */ OutcomeType.TWO_PARTY_FIXED_OUTCOME,
      /* multisigAddress */ getRandomAddress(),
      /* meta */ undefined,
      /* latestAction */ undefined,
      /* twoPartyOutcomeInterpreterParamsInternal */ {
        playerAddrs: [AddressZero, AddressZero],
        amount: Zero,
        tokenAddress: AddressZero,
      },
      /* multiAssetMultiPartyCoinTransferInterpreterParamsInternal */ undefined,
      /* singleAssetTwoPartyCoinTransferInterpreterParamsInternal */ undefined,
    );

    expect(appInstance).not.toBe(null);
    expect(appInstance).not.toBe(undefined);
    expect(appInstance.initiatorIdentifier).toBe(participants[0]);
    expect(appInstance.responderIdentifier).toBe(participants[1]);

    // TODO: moar tests pl0x
  });
});
