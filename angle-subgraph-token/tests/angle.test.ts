import { clearStore, test, assert, newMockEvent, logStore } from "matchstick-as/assembly/index";
import { ethereum, BigInt, Address, } from "@graphprotocol/graph-ts"
import { ANGLE } from "../generated/schema";
import { Transfer } from "../generated/Angle/ERC20Votes"
import { handleTransfer } from "../src/mapping/angle"


function createMockTransferEvent(from: string, to: string, value: BigInt): Transfer {
    const mockEvent = newMockEvent();

    mockEvent.parameters = [
        new ethereum.EventParam("from", ethereum.Value.fromAddress(Address.fromString(from))),
        new ethereum.EventParam("to", ethereum.Value.fromAddress(Address.fromString(to))),
        new ethereum.EventParam("value", ethereum.Value.fromUnsignedBigInt(value))
    ];
    const transfer = new Transfer(
        mockEvent.address, mockEvent.logIndex, mockEvent.transactionLogIndex,
        mockEvent.logType, mockEvent.block, mockEvent.transaction, mockEvent.parameters
    );

    return transfer;
}


test("simple test", () => {
    const angle = new ANGLE("0x1230000000000000000000000000000000000000");
    angle.balance = BigInt.fromString("123")
    angle.save();

    // const angle2 = new ANGLE("0x1230000000000000000000000000000000000000");
    // angle2.balance = BigInt.fromString("456")
    // angle2.save();

    const transferValue = BigInt.fromString("30");
    const transferEvent = createMockTransferEvent("0x1230000000000000000000000000000000000000", "0x4560000000000000000000000000000000000000", transferValue);
    handleTransfer(transferEvent);

    logStore()
    clearStore();
});

