const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("Crowd Funding Contract Test", function () {
  let crowdFund;
  let token;
  let ceo;
  let user1;
  let user2;
  let user3;
  let user4;

  const period = 60 * 60 * 24 * 7; // 7 days
  const goal = hre.ethers.utils.parseEther("100000"); // 100000 Tokens - decimals is 18
  const distributeAmount = hre.ethers.utils.parseEther("10000");
  const addFundingAmount = hre.ethers.utils.parseEther("5000");

  before(async function () {
    [ceo, user1, user2, user3, user4] = await ethers.getSigners();

    const TestToken = await hre.ethers.getContractFactory("TestToken");
    token = await TestToken.deploy();

    const CrowdFund = await hre.ethers.getContractFactory("CrowdFunding");
    crowdFund = await upgrades.deployProxy(CrowdFund, [
      token.address
    ]);

    // Distribute test token to users
    await token.connect(ceo).transfer(user1.address, distributeAmount);
    await token.connect(ceo).transfer(user2.address, distributeAmount);
    await token.connect(ceo).transfer(user3.address, distributeAmount);
  });

  describe("Create new project test", function () {
    it("Should create new project", async function () {
      const name = "Project 1";
      const describe = "This is a project 1";
      let lastProjectId = await crowdFund.lastProjectId();
      let block = await hre.ethers.provider.getBlock('latest');

      await expect(await crowdFund.connect(user1).createProject(
        name,
        describe,
        period,
        goal
      )).to.emit(
        crowdFund,
        "CreatedProject"
      ).withArgs(user1.address, lastProjectId + 1, name, describe, period, goal, token.address, block.timestamp + 1);

      expect(await await crowdFund.lastProjectId()).to.equal(lastProjectId + 1);
      // const crowdfundProject = await crowdFund.crowdfundProject(projectId);
      // expect(crowdfundProject.totalFunded).to.equal(addFundingAmount);

      lastProjectId = await crowdFund.lastProjectId();
      const name2 = "Project 2";
      const describe2 = "This is a project 2";

      await crowdFund.connect(user2).createProject(
        name2,
        describe2,
        period * 2,
        goal
      );

      expect(await await crowdFund.lastProjectId()).to.equal(lastProjectId.add(1));
    });
  });

  describe("Add funding test with first project", function () {
    const projectId = 1;
    describe("Success case", function () {
      beforeEach(async function () {
        await token.connect(user1).approve(crowdFund.address, addFundingAmount);
        await token.connect(user2).approve(crowdFund.address, addFundingAmount);
      });

      it("Should first add Funds ", async function () {
        let block = await hre.ethers.provider.getBlock('latest');

        await expect(await crowdFund.connect(user1).addFundTo(
          projectId, addFundingAmount
        )).to.emit(
          crowdFund,
          "AddFund"
        ).withArgs(user1.address, projectId, token.address, addFundingAmount, block.timestamp + 1);

        expect(await crowdFund.fundedOf(projectId, user1.address)).to.equal(addFundingAmount);
        let crowdfundProject = await crowdFund.crowdfundProject(projectId);
        expect(crowdfundProject.totalFunded).to.equal(addFundingAmount);
        // const fundingInfo = await crowdFund.getFundInfoOf(projectId);
        // console.log('bbb', [[user1.address, addFundingAmount]]);
        // expect(fundingInfo.length()).to.equal(1);

        // user2 add fund
        await crowdFund.connect(user2).addFundTo(
          projectId, addFundingAmount
        );
        expect(await crowdFund.fundedOf(projectId, user2.address)).to.equal(addFundingAmount);
        crowdfundProject = await crowdFund.crowdfundProject(projectId);
        expect(crowdfundProject.totalFunded).to.equal(addFundingAmount.mul(2));
      });

      it("Should second add Funds", async function () {
        const user1FundAmount = await crowdFund.fundedOf(projectId, user1.address);
        let block = await hre.ethers.provider.getBlock('latest');
        const crowdfundProject = await crowdFund.crowdfundProject(projectId);
        await expect(await crowdFund.connect(user1).addFundTo(
          projectId, addFundingAmount
        )).to.emit(
          crowdFund,
          "AddFund"
        ).withArgs(user1.address, projectId, token.address, addFundingAmount, block.timestamp + 1);

        expect(await crowdFund.fundedOf(projectId, user1.address)).to.equal(user1FundAmount.add(addFundingAmount));
        expect((await crowdFund.crowdfundProject(projectId)).totalFunded).to.equal(crowdfundProject.totalFunded.add(addFundingAmount));
      });
    });

    describe("Fail case", function () {
      it("Should fail if add funds to not started project", async function () {
        await expect(crowdFund.connect(user1).addFundTo(10, addFundingAmount)).to.be.revertedWith('Not started project or Finished funding period');
      })

      it("Should fail if paused project", async function () {
        await expect(crowdFund.connect(user2).setProjectPaused(projectId, true)).to.be.revertedWith('Not project owner');
        await crowdFund.connect(user1).setProjectPaused(projectId, true);
        await expect(crowdFund.connect(user1).addFundTo(projectId, addFundingAmount)).to.be.revertedWith('Paused');
        await crowdFund.connect(user1).setProjectPaused(projectId, false);
      });
    });
  });

  describe("Refund test with first project", function () {
    const projectId = 1;
    describe("Fail case", function () {
      it("Should fail if caller is not funder", async function () {
        await expect(crowdFund.connect(user3).refund(projectId)).to.be.revertedWith('Not funder');
      });
      it("Should fail if project is not finished yet", async function () {
        await expect(crowdFund.connect(user2).refund(projectId)).to.be.revertedWith('Not finished funding period');
      });
    });

    describe("Success case", async function () {
      await ethers.provider.send("evm_increaseTime", [period]);
      await ethers.provider.send("evm_mine", []);

      it("Should refund ", async function () {
        const balanceOf = await token.balanceOf(user1.address);
        const fundingAmount = await crowdFund.fundedOf(projectId, user1.address);
        let block = await hre.ethers.provider.getBlock('latest');

        await expect(await crowdFund.connect(user1).refund(
          projectId
        )).to.emit(
          crowdFund,
          "Refund"
        ).withArgs(user1.address, projectId, fundingAmount, block.timestamp + 1);

        expect(await crowdFund.fundedOf(projectId, user1.address)).to.equal(0);
        expect(await token.balanceOf(user1.address)).to.equal(balanceOf.add(fundingAmount));
      });
    });
  })

  describe("Claim test with first project", function () {
    const projectId = 2;
    describe("Fail case", function () {
      it("Should fail if caller is not funder", async function () {
        await expect(crowdFund.connect(user3).claim(projectId)).to.be.revertedWith('Not project owner');
      });
      it("Should fail if project is not finished yet", async function () {
        await expect(crowdFund.connect(user2).claim(projectId)).to.be.revertedWith('Not finished funding period');
      });
    });

    describe("Success case", async function () {
      await token.connect(user3).approve(crowdFund.address, goal);
      await crowdFund.connect(user3).addFundTo(projectId, goal);

      await ethers.provider.send("evm_increaseTime", [period]);
      await ethers.provider.send("evm_mine", []);

      await expect(crowdFund.connect(user3).refund(projectId)).to.be.revertedWith('Met a funding goal, can not refund');

      it("Should claim", async function () {
        const balanceOf = await token.balanceOf(user2.address);
        const totalFundingAmount = (await crowdFund.crowdfundProject(projectId)).totalFunded;
        let block = await hre.ethers.provider.getBlock('latest');

        await expect(await crowdFund.connect(user2).claim(
          projectId
        )).to.emit(
          crowdFund,
          "Claim"
        ).withArgs(user2.address, projectId, totalFundingAmount, block.timestamp + 1);

        expect(await token.balanceOf(user2.address)).to.equal(balanceOf.add(totalFundingAmount));
        expect((await crowdFund.crowdfundProject(projectId)).claimed).to.equal(true);
        await expect(crowdFund.connect(user2).claim(projectId)).to.be.revertedWith('Already claimed');
      });
    });
  })
});
