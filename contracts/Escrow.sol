// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol"
import "hardhat/console.sol";

contract Escrow is ReentrancyGuard {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    uint256 public depositId;
    mapping(uint256 => Deposit) public deposits;

    error InvalidBeneficiary(address beneficiary);
    error InvalidTokenAddressOrAmount();
    error InvalidAmount();
    error InvalidDepositId(uint256 depositId);
    error UnauthorizedAccess(uint256 depositId);
    error FundsAlreadyReleased(uint256 depositId);

    struct Deposit {
        address depositor;
        bytes32 beneficiaryHash;
        uint256 amount;
        address tokenAddress;
        bool released;
        address beneficiary;
        address recipient;
    }

    event Deposited(address indexed depositor, uint256 indexed depositId);
    event Released(
        address indexed recipient,
        address indexed beneficiary,
        uint256 indexed depositId,
        uint256 amount
    );

    constructor() {
        depositId = 1;
    }

    function deposit(
        address _beneficiary,
        IERC20 _token,
        uint256 _amount
    ) external payable {
        if (_beneficiary == address(0)) revert InvalidBeneficiary(_beneficiary);
        if (_amount == 0) revert InvalidAmount();
        if (address(_token) == address(0) && msg.value != _amount)
            revert InvalidTokenAddressOrAmount();
        if (address(_token) != address(0) && msg.value != 0)
            revert InvalidTokenAddressOrAmount();

        uint256 _depositId = depositId;

        deposits[_depositId] = Deposit({
            depositor: msg.sender,
            beneficiaryHash: keccak256(abi.encode(_beneficiary)),
            amount: _amount,
            tokenAddress: address(_token),
            released: false,
            beneficiary: address(0),
            recipient: address(0)
        });

        unchecked {
            depositId++;
        }

        if (address(_token) != address(0)) {
            _token.safeTransferFrom(msg.sender, address(this), _amount);
        }

        emit Deposited(msg.sender, _depositId);
    }

    function release(
        uint256 _depositId,
        bytes calldata _sig,
        address _recipient
    ) external nonReentrant {
        Deposit storage escrow = deposits[_depositId];

        if (escrow.depositor == address(0)) revert InvalidDepositId(_depositId);
        if (escrow.released) revert FundsAlreadyReleased(_depositId);

        bytes32 _message = keccak256(
            abi.encodePacked(
                address(this),
                _depositId,
                escrow.beneficiaryHash,
                escrow.amount,
                _recipient
            )
        );
        console.logBytes32(_message);
        // address _signer = ECDSA.recover(_message, _sig);
        ethSignedMessageHash = MessageHashUtils.toEthSignedMessageHash(_message);
        console.log("signer: %s", _signer);

        if (escrow.beneficiaryHash != keccak256(abi.encode(_signer)))
            revert UnauthorizedAccess(_depositId);

        escrow.recipient = _recipient;
        escrow.beneficiary = _signer;
        escrow.released = true;

        if (escrow.tokenAddress == address(0)) {
            payable(_recipient).transfer(escrow.amount);
        } else {
            IERC20(escrow.tokenAddress).safeTransfer(_recipient, escrow.amount);
        }

        emit Released(_recipient, _signer, _depositId, escrow.amount);
    }
}
