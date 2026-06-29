// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract AIJudge {
    uint256 public constant MAX_SUBMISSIONS = 10;
    uint256 public constant MAX_ANSWER_LENGTH = 2_000;

    uint256 public nextBountyId = 1;

    struct Submission {
        address submitter;
        bytes32 commitment;
        string answer;
        bytes32 salt;
        bool revealed;
        bytes encryptedAnswer;
    }

    struct PrivateSubmission {
        address submitter;
        bytes32 commitment;
        bytes encryptedAnswer;
    }

    struct Bounty {
        address owner;
        string title;
        string rubric;
        uint256 reward;
        uint256 deadline;
        bool judged;
        bool finalized;
        bytes aiReview;
        uint256 winnerIndex;
        string revealedAnswersRef;
        bytes32 revealedAnswersHash;
        Submission[] submissions;
        uint256[] revealedSubmissionIndices;
    }

    mapping(uint256 => Bounty) public bounties;
    mapping(uint256 => bool) private bountyIsPrivate;
    mapping(uint256 => PrivateSubmission[]) private privateSubmissions;
    mapping(uint256 => mapping(address => uint256)) private submissionIndexByBounty;
    mapping(uint256 => mapping(address => uint256)) private privateSubmissionIndexByBounty;

    event BountyCreated(
        uint256 indexed bountyId,
        address indexed owner,
        string title,
        uint256 reward,
        uint256 deadline
    );

    event CommitmentSubmitted(
        uint256 indexed bountyId,
        uint256 indexed submissionIndex,
        address indexed submitter,
        bytes32 commitment
    );

    event PrivateCommitmentSubmitted(
        uint256 indexed bountyId,
        uint256 indexed submissionIndex,
        address indexed submitter,
        bytes32 commitment
    );

    event AnswerRevealed(
        uint256 indexed bountyId, uint256 indexed submissionIndex, address indexed submitter
    );

    event AllAnswersJudged(uint256 indexed bountyId, bytes aiReview);

    event RevealedAnswersBundleCommitted(
        uint256 indexed bountyId,
        string revealedAnswersRef,
        bytes32 revealedAnswersHash
    );

    event WinnerFinalized(
        uint256 indexed bountyId,
        uint256 indexed winnerIndex,
        address indexed winner,
        uint256 reward
    );

    modifier onlyOwner(uint256 bountyId) {
        require(msg.sender == bounties[bountyId].owner, "not bounty owner");
        _;
    }

    modifier bountyExists(uint256 bountyId) {
        require(bounties[bountyId].owner != address(0), "bounty not found");
        _;
    }

    function createBounty(string calldata title, string calldata rubric, uint256 deadline)
        external
        payable
        returns (uint256 bountyId)
    {
        require(msg.value > 0, "reward required");
        require(deadline > block.timestamp, "deadline in past");

        bountyId = nextBountyId++;

        Bounty storage bounty = bounties[bountyId];
        bounty.owner = msg.sender;
        bounty.title = title;
        bounty.rubric = rubric;
        bounty.reward = msg.value;
        bounty.deadline = deadline;
        bounty.winnerIndex = type(uint256).max;
        bounty.revealedAnswersHash = bytes32(0);

        emit BountyCreated(bountyId, msg.sender, title, msg.value, deadline);
    }

    function createPrivateBounty(string calldata title, string calldata rubric, uint256 deadline)
        external
        payable
        returns (uint256 bountyId)
    {
        require(msg.value > 0, "reward required");
        require(deadline > block.timestamp, "deadline in past");

        bountyId = nextBountyId++;

        Bounty storage bounty = bounties[bountyId];
        bounty.owner = msg.sender;
        bounty.title = title;
        bounty.rubric = rubric;
        bounty.reward = msg.value;
        bounty.deadline = deadline;
        bounty.winnerIndex = type(uint256).max;
        bounty.revealedAnswersHash = bytes32(0);

        bountyIsPrivate[bountyId] = true;

        emit BountyCreated(bountyId, msg.sender, title, msg.value, deadline);
    }

    function submitCommitment(uint256 bountyId, bytes32 commitment)
        external
        bountyExists(bountyId)
    {
        Bounty storage bounty = bounties[bountyId];

        require(block.timestamp < bounty.deadline, "submissions closed");
        require(!bountyIsPrivate[bountyId], "private bounty");
        require(!bounty.judged, "already judged");
        require(!bounty.finalized, "already finalized");
        require(bounty.submissions.length < MAX_SUBMISSIONS, "too many submissions");
        require(submissionIndexByBounty[bountyId][msg.sender] == 0, "already submitted");

        bounty.submissions
            .push(
                Submission({
                    submitter: msg.sender,
                    commitment: commitment,
                    answer: "",
                    salt: bytes32(0),
                    revealed: false,
                    encryptedAnswer: bytes("")
                })
            );

        uint256 submissionIndex = bounty.submissions.length;
        submissionIndexByBounty[bountyId][msg.sender] = submissionIndex;

        emit CommitmentSubmitted(bountyId, submissionIndex - 1, msg.sender, commitment);
    }

    function submitEncryptedCommitment(
        uint256 bountyId,
        bytes32 commitment,
        bytes calldata encryptedAnswer
    ) external bountyExists(bountyId) {
        Bounty storage bounty = bounties[bountyId];

        require(bountyIsPrivate[bountyId], "public bounty");
        require(block.timestamp < bounty.deadline, "submissions closed");
        require(!bounty.judged, "already judged");
        require(!bounty.finalized, "already finalized");
        require(privateSubmissions[bountyId].length < MAX_SUBMISSIONS, "too many submissions");
        require(privateSubmissionIndexByBounty[bountyId][msg.sender] == 0, "already submitted");

        privateSubmissions[bountyId].push(
            PrivateSubmission({
                submitter: msg.sender,
                commitment: commitment,
                encryptedAnswer: encryptedAnswer
            })
        );

        uint256 submissionIndex = privateSubmissions[bountyId].length;
        privateSubmissionIndexByBounty[bountyId][msg.sender] = submissionIndex;

        emit PrivateCommitmentSubmitted(
            bountyId, submissionIndex - 1, msg.sender, commitment
        );
    }

    function revealAnswer(uint256 bountyId, string calldata answer, bytes32 salt)
        external
        bountyExists(bountyId)
    {
        Bounty storage bounty = bounties[bountyId];

        require(block.timestamp >= bounty.deadline, "reveal not open");
        require(!bountyIsPrivate[bountyId], "private bounty");
        require(!bounty.judged, "already judged");
        require(!bounty.finalized, "already finalized");
        require(bytes(answer).length <= MAX_ANSWER_LENGTH, "answer too long");

        uint256 submissionIndex = submissionIndexByBounty[bountyId][msg.sender];
        require(submissionIndex != 0, "no commitment");

        Submission storage submission = bounty.submissions[submissionIndex - 1];
        require(!submission.revealed, "already revealed");
        require(submission.submitter == msg.sender, "invalid submitter");

        bytes32 expectedCommitment = keccak256(abi.encode(answer, salt, msg.sender, bountyId));
        require(submission.commitment == expectedCommitment, "bad reveal");

        submission.answer = answer;
        submission.salt = salt;
        submission.revealed = true;
        bounty.revealedSubmissionIndices.push(submissionIndex - 1);

        emit AnswerRevealed(bountyId, submissionIndex - 1, msg.sender);
    }

    function judgeAll(uint256 bountyId, bytes calldata llmInput)
        external
        bountyExists(bountyId)
        onlyOwner(bountyId)
    {
        Bounty storage bounty = bounties[bountyId];

        require(block.timestamp >= bounty.deadline, "judging not open");
        require(!bounty.judged, "already judged");
        require(!bounty.finalized, "already finalized");
        if (bountyIsPrivate[bountyId]) {
            require(privateSubmissions[bountyId].length > 0, "no submissions");
        } else {
            require(bounty.revealedSubmissionIndices.length > 0, "no revealed answers");
        }

        bounty.judged = true;
        bounty.aiReview = llmInput;

        emit AllAnswersJudged(bountyId, llmInput);
    }

    function commitRevealedAnswersBundle(
        uint256 bountyId,
        string calldata revealedAnswersRef,
        bytes32 revealedAnswersHash
    ) external bountyExists(bountyId) onlyOwner(bountyId) {
        Bounty storage bounty = bounties[bountyId];

        require(bounty.judged, "not judged yet");
        require(!bounty.finalized, "already finalized");
        require(bytes(revealedAnswersRef).length > 0, "bundle ref required");
        require(revealedAnswersHash != bytes32(0), "bundle hash required");

        bounty.revealedAnswersRef = revealedAnswersRef;
        bounty.revealedAnswersHash = revealedAnswersHash;

        emit RevealedAnswersBundleCommitted(
            bountyId, revealedAnswersRef, revealedAnswersHash
        );
    }

    function finalizeWinner(uint256 bountyId, uint256 winnerIndex)
        external
        bountyExists(bountyId)
        onlyOwner(bountyId)
    {
        Bounty storage bounty = bounties[bountyId];

        require(bounty.judged, "not judged yet");
        require(!bounty.finalized, "already finalized");
        if (bountyIsPrivate[bountyId]) {
            require(winnerIndex < privateSubmissions[bountyId].length, "invalid winner index");
        } else {
            require(winnerIndex < bounty.revealedSubmissionIndices.length, "invalid winner index");
        }

        bounty.finalized = true;
        bounty.winnerIndex = winnerIndex;

        address winner;
        if (bountyIsPrivate[bountyId]) {
            winner = privateSubmissions[bountyId][winnerIndex].submitter;
        } else {
            uint256 submissionIndex = bounty.revealedSubmissionIndices[winnerIndex];
            winner = bounty.submissions[submissionIndex].submitter;
        }
        uint256 reward = bounty.reward;
        bounty.reward = 0;

        (bool ok,) = payable(winner).call{ value: reward }("");
        require(ok, "payment failed");

        emit WinnerFinalized(bountyId, winnerIndex, winner, reward);
    }

    function getBounty(uint256 bountyId)
        external
        view
        bountyExists(bountyId)
        returns (
            address owner,
            string memory title,
            string memory rubric,
            uint256 reward,
            uint256 deadline,
            bool judged,
            bool finalized,
            uint256 submissionCount,
            uint256 revealedSubmissionCount,
            uint256 winnerIndex,
            bytes memory aiReview
        )
    {
        Bounty storage bounty = bounties[bountyId];
        uint256 countedSubmissionCount;
        uint256 countedRevealedSubmissionCount;
        if (bountyIsPrivate[bountyId]) {
            countedSubmissionCount = privateSubmissions[bountyId].length;
        } else {
            countedSubmissionCount = bounty.submissions.length;
            countedRevealedSubmissionCount = bounty.revealedSubmissionIndices.length;
        }

        return (
            bounty.owner,
            bounty.title,
            bounty.rubric,
            bounty.reward,
            bounty.deadline,
            bounty.judged,
            bounty.finalized,
            countedSubmissionCount,
            countedRevealedSubmissionCount,
            bounty.winnerIndex,
            bounty.aiReview
        );
    }

    function getSubmissionCount(uint256 bountyId)
        external
        view
        bountyExists(bountyId)
        returns (uint256)
    {
        return bounties[bountyId].submissions.length;
    }

    function getRevealedSubmissionCount(uint256 bountyId)
        external
        view
        bountyExists(bountyId)
        returns (uint256)
    {
        return bounties[bountyId].revealedSubmissionIndices.length;
    }

    function isJudged(uint256 bountyId) external view bountyExists(bountyId) returns (bool) {
        return bounties[bountyId].judged;
    }

    function isFinalized(uint256 bountyId) external view bountyExists(bountyId) returns (bool) {
        return bounties[bountyId].finalized;
    }

    function getWinnerIndex(uint256 bountyId)
        external
        view
        bountyExists(bountyId)
        returns (uint256)
    {
        return bounties[bountyId].winnerIndex;
    }

    function getReward(uint256 bountyId) external view bountyExists(bountyId) returns (uint256) {
        return bounties[bountyId].reward;
    }

    function getAIReview(uint256 bountyId)
        external
        view
        bountyExists(bountyId)
        returns (bytes memory)
    {
        return bounties[bountyId].aiReview;
    }

    function getRevealedAnswersBundle(uint256 bountyId)
        external
        view
        bountyExists(bountyId)
        returns (string memory revealedAnswersRef, bytes32 revealedAnswersHash)
    {
        Bounty storage bounty = bounties[bountyId];
        return (bounty.revealedAnswersRef, bounty.revealedAnswersHash);
    }

    function getSubmission(uint256 bountyId, uint256 index)
        external
        view
        bountyExists(bountyId)
        returns (
            address submitter,
            bytes32 commitment,
            string memory answer,
            bytes32 salt,
            bool revealed,
            bytes memory encryptedAnswer
        )
    {
        Bounty storage bounty = bounties[bountyId];
        require(!bountyIsPrivate[bountyId], "private bounty");

        require(index < bounty.submissions.length, "invalid index");

        Submission storage submission = bounty.submissions[index];

        return (
            submission.submitter,
            submission.commitment,
            submission.answer,
            submission.salt,
            submission.revealed,
            submission.encryptedAnswer
        );
    }

    function getPrivateSubmission(uint256 bountyId, uint256 index)
        external
        view
        bountyExists(bountyId)
        returns (address submitter, bytes32 commitment, bytes memory encryptedAnswer)
    {
        require(bountyIsPrivate[bountyId], "public bounty");
        require(index < privateSubmissions[bountyId].length, "invalid index");

        PrivateSubmission storage submission = privateSubmissions[bountyId][index];
        return (submission.submitter, submission.commitment, submission.encryptedAnswer);
    }

    function getPrivateSubmissionCount(uint256 bountyId)
        external
        view
        bountyExists(bountyId)
        returns (uint256)
    {
        return privateSubmissions[bountyId].length;
    }

    function isPrivateBounty(uint256 bountyId)
        external
        view
        bountyExists(bountyId)
        returns (bool)
    {
        return bountyIsPrivate[bountyId];
    }

    function getRevealedSubmission(uint256 bountyId, uint256 revealedIndex)
        external
        view
        bountyExists(bountyId)
        returns (
            uint256 submissionIndex,
            address submitter,
            bytes32 commitment,
            string memory answer,
            bytes32 salt
        )
    {
        Bounty storage bounty = bounties[bountyId];

        require(revealedIndex < bounty.revealedSubmissionIndices.length, "invalid index");

        submissionIndex = bounty.revealedSubmissionIndices[revealedIndex];
        Submission storage submission = bounty.submissions[submissionIndex];

        return (
            submissionIndex,
            submission.submitter,
            submission.commitment,
            submission.answer,
            submission.salt
        );
    }

    function getSubmissionIndex(uint256 bountyId, address submitter)
        external
        view
        bountyExists(bountyId)
        returns (uint256)
    {
        return submissionIndexByBounty[bountyId][submitter];
    }

}
