const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

describe("Escrow Contract", function () {
  let Escrow;
  let escrow;
  let owner;
  let beneficiary;
  let recipient;
  let amount;
  let DummyToken;
  let token;

  beforeEach(async function () {
    [owner, beneficiary, signer, recipient] = await ethers.getSigners();

    Escrow = await ethers.getContractFactory("Escrow");
    escrow = await Escrow.deploy();
    await escrow.deployed();

    DummyToken = await ethers.getContractFactory("DummyToken");
    token = await DummyToken.deploy();
    await token.deployed();

    amount = ethers.utils.parseEther("1");
  });

  it("should deposit and release funds of ETH into escrow", async function () {
    const depositAmount = BigNumber.from(ethers.utils.parseEther("1"));

    const initialBalance = await ethers.provider.getBalance(escrow.address);

    const depositTx = await escrow.deposit(
      beneficiary.address,
      ethers.constants.AddressZero,
      depositAmount,
      { value: depositAmount }
    );
    await depositTx.wait();

    const deposit = await escrow.deposits(1);
    expect(deposit.amount).to.equal(amount);
    expect(await ethers.provider.getBalance(escrow.address)).to.equal(
      initialBalance.add(amount)
    );

    const message = ethers.utils.solidityKeccak256(
      ["address", "uint256", "bytes32", "uint256", "address"],
      [
        escrow.address,
        1,
        ethers.utils.keccak256(
          ethers.utils.defaultAbiCoder.encode(
            ["address"],
            [beneficiary.address]
          )
        ),
        depositAmount,
        recipient.address,
      ]
    );
    const sig = await beneficiary.signMessage(ethers.utils.arrayify(message));

    await escrow.connect(owner).release(1, sig, recipient.address);

    expect(await ethers.provider.getBalance(escrow.address)).to.equal(
      initialBalance
    );
    expect(await ethers.provider.getBalance(recipient.address)).to.equal(
      ethers.utils.parseEther("10001")
    );
  });

  it("should deposit and release token funds into escrow", async function () {
    const depositAmount = ethers.utils.parseEther("100");
    const recipientAddress = recipient.address;

    await token.connect(owner).approve(escrow.address, depositAmount);
    await token.connect(owner).mint(owner.address, depositAmount);

    await escrow
      .connect(owner)
      .deposit(beneficiary.address, token.address, depositAmount);

    console.log("Deposited");

    const depositId = (await escrow.depositId()) - 1;
    const deposit = await escrow.deposits(depositId);

    expect(deposit.amount.toString()).to.equal(depositAmount.toString());
    expect(deposit.tokenAddress).to.equal(token.address);
    expect(deposit.depositor).to.equal(owner.address);

    const message = ethers.utils.solidityKeccak256(
      ["address", "uint256", "bytes32", "uint256", "address"],
      [
        escrow.address,
        depositId,
        ethers.utils.keccak256(
          ethers.utils.defaultAbiCoder.encode(
            ["address"],
            [beneficiary.address]
          )
        ),
        depositAmount,
        recipientAddress,
      ]
    );
    console.log("Message: is correct", message);
    const chainId = await ethers.provider
      .getNetwork()
      .then((network) => network.chainId);

      const signature = await beneficiary.signMessage(ethers.utils.arrayify(message));
    console.log("Signature: ", signature);

    const signatureBytes = ethers.utils.arrayify(signature);

    expect(signatureBytes.length).to.equal(65, "Invalid signature length");

    const recoveredSigner = ethers.utils.verifyMessage(ethers.utils.arrayify(message), signature);
    // const recoveredSigner = ethers.utils.verifyMessage(
    //   ethers.utils.arrayify(message),
    //   signature
    // );
    console.log("Recovered signer: ", recoveredSigner);
    expect(recoveredSigner.toLowerCase()).to.equal(
      beneficiary.address.toLowerCase(),
      "Recovered signer does not match expected beneficiary"
    );

    await escrow
      .connect(owner)
      .release(depositId, signatureBytes, recipientAddress);
    console.log("Released");

    const recipientBalance = await token.balanceOf(recipientAddress);
    expect(recipientBalance).to.equal(depositAmount);
  });
});
