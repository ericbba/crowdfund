// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.18;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

interface IERC20 {
    function transfer(address recipient, uint256 amount)
        external
        returns (bool);

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) external returns (bool);
}

contract CrowdFunding is OwnableUpgradeable {
    struct FundInfo {
        address funder;
        uint256 amount;
    }
    struct CrowdfundProject {
        address owner;
        string name;
        string description;
        uint256 period;
        uint256 fundingGoal;
        address fundToken;
        uint256 createdAt;
        uint256 totalFunded;
        bool paused;
        bool claimed;
    }

    address public fundToken;
    uint256 public lastProjectId;
    mapping(uint256 => CrowdfundProject) public crowdfundProject;
    // CrowdFund project ID => FundInfo
    mapping(uint256 => FundInfo[]) private fundInfo;
    // CrowdFund project ID => Customer address => fund amount
    mapping(uint256 => mapping(address => uint256)) public fundedOf;

    event CreatedProject(
        address indexed owner,
        uint256 indexed projectId,
        string name,
        string description,
        uint256 period,
        uint256 fundingGoal,
        address fundToken,
        uint256 createdAt
    );

    event AddFund(
        address indexed funder,
        uint256 indexed projectId,
        address token,
        uint256 amount,
        uint256 createdAt
    );

    event Refund(
        address indexed funder,
        uint256 indexed projectId,
        uint256 fundingAmount,
        uint256 createdAt
    );

    event Claim(
        address indexed funder,
        uint256 indexed projectId,
        uint256 fundingAmount,
        uint256 createdAt
    );

    function initialize(address _fundToken) external initializer {
        __Ownable_init();

        fundToken = _fundToken;
    }

    function createProject(
        string memory _name,
        string memory _description,
        uint256 _period,
        uint256 _fundingGoal
    ) external {
        lastProjectId += 1;
        crowdfundProject[lastProjectId].owner = msg.sender;
        crowdfundProject[lastProjectId].name = _name;
        crowdfundProject[lastProjectId].description = _description;
        crowdfundProject[lastProjectId].period = _period;
        crowdfundProject[lastProjectId].fundingGoal = _fundingGoal;
        crowdfundProject[lastProjectId].fundToken = fundToken;
        crowdfundProject[lastProjectId].createdAt = block.timestamp;

        emit CreatedProject(msg.sender, lastProjectId, _name, _description, _period, _fundingGoal, fundToken, block.timestamp);
    }

    function addFundTo(uint256 _projectId, uint256 _amount) external {
        CrowdfundProject memory project = crowdfundProject[_projectId];
        require(!project.paused, "Paused");
        require(
            block.timestamp <= project.period + project.createdAt,
            "Not started project or Finished funding period"
        );

        IERC20(project.fundToken).transferFrom(msg.sender, address(this), _amount);

        if (fundedOf[_projectId][msg.sender] > 0) {
            FundInfo[] memory _fundInfo = fundInfo[_projectId];
            for (uint256 i = 0; i < _fundInfo.length; i++) {
                if (_fundInfo[i].funder == msg.sender) {
                    fundInfo[_projectId][i].amount += _amount;
                    break;
                }
            }
        } else {
            fundInfo[_projectId].push(
                FundInfo({funder: msg.sender, amount: _amount})
            );
        }
        fundedOf[_projectId][msg.sender] += _amount;
        crowdfundProject[_projectId].totalFunded += _amount;

        emit AddFund(msg.sender, _projectId, project.fundToken, _amount, block.timestamp);
    }

    function refund(uint256 _projectId) external {
        CrowdfundProject memory project = crowdfundProject[_projectId];
        uint256 fundedAmountOfUser = fundedOf[_projectId][msg.sender];
        require(fundedAmountOfUser > 0, "Not funder");
        require(
            block.timestamp > project.period + project.createdAt,
            "Not finished funding period"
        );
        require(
            project.totalFunded < project.fundingGoal,
            "Met funding goal"
        );
        IERC20(project.fundToken).transfer(msg.sender, fundedAmountOfUser);

        emit Refund(msg.sender, _projectId, fundedAmountOfUser, block.timestamp);
    }

    function claim(uint256 _projectId) external {
        CrowdfundProject memory project = crowdfundProject[_projectId];
        require(project.owner == msg.sender, "Not project owner");
        require(
            block.timestamp > project.period + project.createdAt,
            "Not finished funding period"
        );
        require(project.totalFunded >= project.fundingGoal, "Met a funding goal, can not refund");
        require(!project.claimed, "Already claimed");

        IERC20(project.fundToken).transfer(msg.sender, project.totalFunded);
        crowdfundProject[_projectId].claimed = true;

        emit Claim(msg.sender, _projectId, project.totalFunded, block.timestamp);
    }

    function changeFundToken(address _new) external onlyOwner {
        fundToken = _new;
    }

    function setProjectPaused(uint256 _projectId, bool _isPause) external {
        require(crowdfundProject[_projectId].owner == msg.sender, "Not project owner");
        crowdfundProject[_projectId].paused = _isPause;
    }

    function getFundInfoOf(uint256 _projectId) external view returns (FundInfo[] memory) {
        return fundInfo[_projectId];
    }

    receive() external payable {}
}
