// SPDX-License-Identifier:MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract AdvancedToken is ERC20, AccessControl, Pausable, ReentrancyGuard {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    struct TokenConfig {
        uint256 maxTransferAmount; // 最大转账金额
        uint256 dailyLimit; // 每日限额
        uint32 cooldownPeriod; // 冷却期
        bool transfersEnabled; // 是否允许转账
    }

    TokenConfig public config;

    // 用户状态跟踪
    struct UserState {
        uint64 lastTransferTime; // 上次转账时间
        uint256 amountTransferredToday; // 今日转账金额
    }

    mapping(address => UserState) private _userStates;

    // 事件
    event ConfigUpdated(
        uint256 maxTransferAmount,
        uint256 dailyLimit,
        uint32 cooldownPeriod,
        bool transfersEnabled
    );

    event EmergencyWidthdraw(address indexed to, uint256 amount);
    event DailyLimitReset(address indexed user);

    // 错误定义
    error ExceedMaxTransfer(uint256 amount, uint256 max);
    error ExceedDailyLimit(uint256 amount, uint256 remaining);
    error CooldownNotPassed(uint256 remainingTime);
    error TransfersDisabled();

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 initialSupply,
        address admin
    ) ERC20(name_, symbol_) {
        uint256 decimalFactor = 10 ** uint256(decimals());
        config = TokenConfig({
            maxTransferAmount: 10000 * decimalFactor,
            dailyLimit: 50000 * decimalFactor,
            cooldownPeriod: 300, //5 minutes
            transfersEnabled: true
        });

        // 设置管理员
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(BURNER_ROLE, admin);

        // 铸造初始供应商
        if (initialSupply > 0) {
            _mint(admin, initialSupply);
        }
    }

    /**
     * @dev 安全铸造函数
     * @param to 接收者地址
     * @param amount 要铸造的代币数量
     */
    function safeMint(
        address to,
        uint256 amount
    ) external onlyRole(MINTER_ROLE) whenNotPaused nonReentrant {
        require(to != address(0), "0 address not allowed");
        require(amount > 0, "amount must be greater than 0");

        _mint(to, amount);
    }

    /**
     * @dev 安全销毁函数
     * @param from 销毁者地址
     * @param amount 要销毁的代币数量
     */
    function safeBurn(
        address from,
        uint256 amount
    ) external onlyRole(BURNER_ROLE) whenNotPaused nonReentrant {
        require(balanceOf(from) >= amount, "Burn amount exceeds balance");
        _burn(from, amount);
    }

    /**
     * @dev 重写父类方法，验证转账
     */

    function _update(
        address from,
        address to,
        uint256 value
    ) internal override {
        super._update(from, to, value);

        if (from != address(0) && to != address(0)) {
            _validateTransfer(from, value);
            _updateUserState(from, value);
        }
    }

    function _validateTransfer(address from, uint256 amount) private view {
        if (!config.transfersEnabled) {
            revert TransfersDisabled();
        }
        if (amount > config.maxTransferAmount) {
            revert ExceedMaxTransfer(amount, config.maxTransferAmount);
        }

        UserState memory state = _userStates[from];

        if (block.timestamp - state.lastTransferTime > 1 days) {
            // 今日限额已用完
            if (amount > config.dailyLimit) {
                revert ExceedDailyLimit(amount, config.dailyLimit);
            }
        } else {
            // 今日限额未用完
            if (state.amountTransferredToday + amount > config.dailyLimit) {
                uint256 remaining = config.dailyLimit -
                    state.amountTransferredToday;
                revert ExceedDailyLimit(amount, remaining);
            }
        }

        if (block.timestamp < state.lastTransferTime + config.cooldownPeriod) {
            uint256 remainingTime = state.lastTransferTime +
                config.cooldownPeriod -
                block.timestamp;
            revert CooldownNotPassed(remainingTime);
        }
    }

    function _updateUserState(address user, uint256 amount) private {
        UserState storage state = _userStates[user];

        if (block.timestamp - state.lastTransferTime > 1 days) {
            state.amountTransferredToday = uint128(amount);
            emit DailyLimitReset(user);
        } else {
            unchecked {
                state.amountTransferredToday += uint128(amount);
            }
        }

        state.lastTransferTime = uint64(block.timestamp);
    }

    function updateConfig(
        uint256 maxTransferAmount,
        uint256 dailyLimit,
        uint32 cooldownPeriod,
        bool transfersEnabled
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        config = TokenConfig({
            maxTransferAmount: maxTransferAmount,
            dailyLimit: dailyLimit,
            cooldownPeriod: cooldownPeriod,
            transfersEnabled: transfersEnabled
        });
        emit ConfigUpdated(
            maxTransferAmount,
            dailyLimit,
            cooldownPeriod,
            transfersEnabled
        );
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function emergencyWithdraw(
        address to,
        uint256 amount
    ) external onlyRole(DEFAULT_ADMIN_ROLE) whenPaused nonReentrant {
        require(to != address(0), "0 address not allowed");
        require(balanceOf(address(this)) >= amount, "Insufficient balance");
        _transfer(address(this), to, amount);
        emit EmergencyWidthdraw(to, amount);
    }

    function getUserState(
        address user
    )
        external
        view
        returns (
            uint64 lastTransferTime,
            uint256 amountTransferredToday,
            uint256 remainingDailyLimit
        )
    {
        UserState memory state = _userStates[user];
        lastTransferTime = state.lastTransferTime;
        amountTransferredToday = state.amountTransferredToday;

        if (block.timestamp - state.lastTransferTime > 1 days) {
            remainingDailyLimit = uint256(config.dailyLimit);
        } else {
            remainingDailyLimit =
                uint256(config.dailyLimit) -
                state.amountTransferredToday;
        }
    }

    receive() external payable {
        revert("Not allowed to receive ETH");
    }

    function withdrawETH(
        address payable to,
        uint256 amount
    ) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        require(address(this).balance >= amount, "Insufficient ETH balance");
        to.transfer(amount);
    }
}
