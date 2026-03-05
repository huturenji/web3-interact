import { network } from "hardhat";

// 获取 ethers 对象
const { ethers } = await network.connect();

async function main() {
  //获取签名者
  const [sender, receiver] = await ethers.getSigners();
  console.log("Sender address:", sender.address);
  console.log("Receiver address:", receiver.address);

  // 获取发送者的初始余额
  const initBalance = await ethers.provider.getBalance(sender.address);

  console.log("Initial balance of sender:", ethers.formatEther(initBalance));

  // 构建一笔交易
  const tx2 = await sender.sendTransaction({
    to: receiver.address,
    value: ethers.parseEther("1.0"), //发送1个以太币到接收者地址
  });
  console.log("Transaction hash:", tx2.hash);
  console.log("waiting for transaction to be mined...");

  // 等待交易被旷工打包
  const receipt2 = await tx2.wait();
  console.log("Transaction receipt:", receipt2);
  console.log("Gas used:", receipt2.gasUsed);

  // 获取发送者的最终余额
  const finalBalance2 = await ethers.provider.getBalance(sender.address);
  console.log("Final balance of sender:", ethers.formatEther(finalBalance2));
  console.log(
    "Balance difference:",
    ethers.formatEther(initBalance - finalBalance2),
  );
}

main().catch((error) => {
  console.error("Error:", error);
  process.exitCode = 1;
});
