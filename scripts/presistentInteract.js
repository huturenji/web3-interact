/*
 * @Author: huturenji huturenji@126.com
 * @Date: 2026-03-05 21:14:20
 * @LastEditors: huturenji huturenji@126.com
 * @LastEditTime: 2026-03-05 21:20:27
 * @FilePath: \web3-interact\scripts\presistentInteract.js
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
// scripts/presistentInteract.js  用来验证，每次交易后，余额都会变化
import {
  network
} from "hardhat";

// 获取 ethers 对象
const {
  ethers
} = await network.connect();

async function main() {
  // 1. 连接到本地运行的 Hardhat 节点 RPC
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");

  // 2. 从环境变量或安全的地方获取私钥（这里使用Hardhat节点提供的第一个测试账户私钥）
  // 注意：在生产环境中，绝不能用明文存储私钥。此处仅为演示。
  const privateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // 来自`npx hardhat node`输出
  const wallet = new ethers.Wallet(privateKey, provider);

  const receiverAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // 第二个测试账户地址

  // 3. 查询当前余额
  let balance = await provider.getBalance(wallet.address);
  console.log(`发送者 ${wallet.address} 当前余额: ${ethers.formatEther(balance)} ETH`);

  // 4. 构造并发送交易
  const tx = await wallet.sendTransaction({
    to: receiverAddress,
    value: ethers.parseEther("1")
  });
  console.log(`\n交易已发送，哈希: ${tx.hash}`);
  console.log("等待确认...");

  const receipt = await tx.wait();
  console.log(`交易确认，区块: ${receipt.blockNumber}`);

  // 5. 再次查询余额，确认已扣除转账金额和Gas费
  balance = await provider.getBalance(wallet.address);
  console.log(`发送者最新余额: ${ethers.formatEther(balance)} ETH`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});