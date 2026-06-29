// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../contracts/AIJudge.sol";

interface Vm {
    function warp(uint256) external;

    function prank(address) external;

    function deal(address who, uint256 newBalance) external;

    function expectRevert(bytes calldata) external;
}

contract Test {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function assertEq(uint256 a, uint256 b) internal pure {
        require(a == b, "assertEq(uint256)");
    }

    function assertEq(address a, address b) internal pure {
        require(a == b, "assertEq(address)");
    }

    function assertEq(bytes32 a, bytes32 b) internal pure {
        require(a == b, "assertEq(bytes32)");
    }

    function assertEq(bytes memory a, bytes memory b) internal pure {
        require(keccak256(a) == keccak256(b), "assertEq(bytes)");
    }

    function assertTrue(bool value) internal pure {
        require(value, "assertTrue");
    }

    function makeAddr(string memory name) internal pure returns (address) {
        return address(uint160(uint256(keccak256(bytes(name)))));
    }
}

contract AIJudgeTest is Test {
    AIJudge private judge;
    address private owner;
    address private alice;
    address private bob;

    function setUp() public {
        judge = new AIJudge();
        owner = makeAddr("owner");
        alice = makeAddr("alice");
        bob = makeAddr("bob");
    }

    function _createBounty(uint256 reward, uint256 deadline) internal returns (uint256 bountyId) {
        vm.deal(owner, reward);
        vm.prank(owner);
        bountyId = judge.createBounty{ value: reward }(
            "Privacy Bounty", "Reward the best answer", deadline
        );
    }

    function _createPrivateBounty(uint256 reward, uint256 deadline)
        internal
        returns (uint256 bountyId)
    {
        vm.deal(owner, reward);
        vm.prank(owner);
        bountyId = judge.createPrivateBounty{ value: reward }(
            "Private Privacy Bounty", "Judge encrypted submissions in TEE", deadline
        );
    }

    function _commitment(uint256 bountyId, address submitter, string memory answer, bytes32 salt)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(answer, salt, submitter, bountyId));
    }

    function testCommitAndRevealHappyPath() public {
        uint256 bountyId = _createBounty(1 ether, block.timestamp + 1 days);
        bytes32 salt = keccak256("salt-1");
        string memory answer = "Use commit-reveal and batch judging.";
        bytes32 commitment = _commitment(bountyId, alice, answer, salt);

        vm.prank(alice);
        judge.submitCommitment(bountyId, commitment);

        uint256 submissionCount = judge.getSubmissionCount(bountyId);
        uint256 revealedCount = judge.getRevealedSubmissionCount(bountyId);
        bytes memory ignoredReview = judge.getAIReview(bountyId);
        assertEq(submissionCount, 1);
        assertEq(revealedCount, 0);
        assertEq(ignoredReview, bytes(""));

        vm.warp(block.timestamp + 2 days);
        vm.prank(alice);
        judge.revealAnswer(bountyId, answer, salt);

        revealedCount = judge.getRevealedSubmissionCount(bountyId);
        bytes memory ignoredReviewAfter = judge.getAIReview(bountyId);
        assertEq(revealedCount, 1);
        assertEq(ignoredReviewAfter, bytes(""));

        (
            address submitter,
            bytes32 storedCommitment,
            string memory storedAnswer,
            bytes32 storedSalt,
            bool revealed,
            bytes memory encryptedAnswer
        ) = judge.getSubmission(bountyId, 0);

        assertEq(submitter, alice);
        assertEq(storedCommitment, commitment);
        assertEq(bytes(storedAnswer), bytes(answer));
        assertEq(storedSalt, salt);
        assertTrue(revealed);
        assertEq(encryptedAnswer, bytes(""));
    }

    function testRevealBeforeDeadlineReverts() public {
        uint256 bountyId = _createBounty(1 ether, block.timestamp + 1 days);
        bytes32 salt = keccak256("salt-2");
        string memory answer = "Too early";
        bytes32 commitment = _commitment(bountyId, alice, answer, salt);

        vm.prank(alice);
        judge.submitCommitment(bountyId, commitment);

        vm.prank(alice);
        vm.expectRevert(bytes("reveal not open"));
        judge.revealAnswer(bountyId, answer, salt);
    }

    function testRevealWithWrongSaltReverts() public {
        uint256 bountyId = _createBounty(1 ether, block.timestamp + 1 days);
        bytes32 salt = keccak256("salt-3");
        string memory answer = "Correct content";
        bytes32 commitment = _commitment(bountyId, alice, answer, salt);

        vm.prank(alice);
        judge.submitCommitment(bountyId, commitment);
        vm.warp(block.timestamp + 2 days);

        vm.prank(alice);
        vm.expectRevert(bytes("bad reveal"));
        judge.revealAnswer(bountyId, answer, keccak256("wrong-salt"));
    }

    function testJudgeAllUsesRevealedSubmissions() public {
        uint256 bountyId = _createBounty(1 ether, block.timestamp + 1 days);
        bytes32 aliceSalt = keccak256("salt-4");
        bytes32 bobSalt = keccak256("salt-5");
        string memory aliceAnswer = "Answer from Alice";
        string memory bobAnswer = "Answer from Bob";

        vm.prank(alice);
        judge.submitCommitment(bountyId, _commitment(bountyId, alice, aliceAnswer, aliceSalt));
        vm.prank(bob);
        judge.submitCommitment(bountyId, _commitment(bountyId, bob, bobAnswer, bobSalt));

        vm.warp(block.timestamp + 2 days);
        vm.prank(alice);
        judge.revealAnswer(bountyId, aliceAnswer, aliceSalt);
        vm.prank(bob);
        judge.revealAnswer(bountyId, bobAnswer, bobSalt);

        vm.prank(owner);
        judge.judgeAll(bountyId, bytes("Batch judged"));

        bool judged = judge.isJudged(bountyId);
        bytes memory aiReview = judge.getAIReview(bountyId);
        assertTrue(judged);
        assertEq(bytes(aiReview), bytes("Batch judged"));
    }

    function testPrivateBountyUsesEncryptedSubmissions() public {
        uint256 bountyId = _createPrivateBounty(1 ether, block.timestamp + 1 days);
        bytes32 salt = keccak256("private-salt");
        string memory answer = "Hidden until TEE judging";
        bytes memory encryptedAnswer = bytes("encrypted-answer-blob");
        bytes32 commitment = _commitment(bountyId, alice, answer, salt);

        vm.prank(alice);
        judge.submitEncryptedCommitment(bountyId, commitment, encryptedAnswer);

        uint256 count = judge.getPrivateSubmissionCount(bountyId);
        assertEq(count, 1);

        (address submitter, bytes32 storedCommitment, bytes memory storedEncryptedAnswer) =
            judge.getPrivateSubmission(bountyId, 0);
        assertEq(submitter, alice);
        assertEq(storedCommitment, commitment);
        assertEq(storedEncryptedAnswer, encryptedAnswer);

        vm.warp(block.timestamp + 2 days);
        vm.prank(owner);
        judge.judgeAll(bountyId, bytes("Private batch judged"));

        bool judged = judge.isJudged(bountyId);
        assertTrue(judged);

        vm.prank(owner);
        judge.finalizeWinner(bountyId, 0);
        assertTrue(judge.isFinalized(bountyId));
    }

    function testBundleCommitAfterJudging() public {
        uint256 bountyId = _createPrivateBounty(1 ether, block.timestamp + 1 days);
        bytes32 salt = keccak256("bundle-salt");
        string memory answer = "Hidden bundle answer";
        bytes memory encryptedAnswer = bytes("encrypted-bundle-blob");
        bytes32 commitment = _commitment(bountyId, alice, answer, salt);

        vm.prank(alice);
        judge.submitEncryptedCommitment(bountyId, commitment, encryptedAnswer);

        vm.warp(block.timestamp + 2 days);
        vm.prank(owner);
        judge.judgeAll(bountyId, bytes("bundle review"));

        vm.prank(owner);
        judge.commitRevealedAnswersBundle(
            bountyId,
            "ipfs://bundle-ref",
            keccak256("bundle-hash")
        );

        (string memory revealedAnswersRef, bytes32 revealedAnswersHash) =
            judge.getRevealedAnswersBundle(bountyId);
        assertEq(bytes(revealedAnswersRef), bytes("ipfs://bundle-ref"));
        assertEq(revealedAnswersHash, keccak256("bundle-hash"));
    }

    function testBundleCommitBeforeJudgingReverts() public {
        uint256 bountyId = _createPrivateBounty(1 ether, block.timestamp + 1 days);

        vm.prank(owner);
        vm.expectRevert(bytes("not judged yet"));
        judge.commitRevealedAnswersBundle(
            bountyId,
            "ipfs://bundle-ref",
            keccak256("bundle-hash")
        );
    }

    function testBundleCommitRejectsEmptyValues() public {
        uint256 bountyId = _createPrivateBounty(1 ether, block.timestamp + 1 days);
        bytes32 salt = keccak256("bundle-salt-empty");
        bytes32 commitment = _commitment(bountyId, alice, "Hidden bundle answer", salt);
        vm.prank(alice);
        judge.submitEncryptedCommitment(
            bountyId,
            commitment,
            bytes("encrypted-bundle-blob")
        );

        vm.warp(block.timestamp + 2 days);
        vm.prank(owner);
        judge.judgeAll(bountyId, bytes("bundle review"));

        vm.prank(owner);
        vm.expectRevert(bytes("bundle ref required"));
        judge.commitRevealedAnswersBundle(bountyId, "", keccak256("bundle-hash"));

        vm.prank(owner);
        vm.expectRevert(bytes("bundle hash required"));
        judge.commitRevealedAnswersBundle(bountyId, "ipfs://bundle-ref", bytes32(0));
    }

    function testFinalizeWinnerPaysRevealedWinner() public {
        uint256 bountyId = _createBounty(2 ether, block.timestamp + 1 days);
        bytes32 aliceSalt = keccak256("salt-6");
        bytes32 bobSalt = keccak256("salt-7");
        string memory aliceAnswer = "Alice answer";
        string memory bobAnswer = "Bob answer";

        vm.prank(alice);
        judge.submitCommitment(bountyId, _commitment(bountyId, alice, aliceAnswer, aliceSalt));
        vm.prank(bob);
        judge.submitCommitment(bountyId, _commitment(bountyId, bob, bobAnswer, bobSalt));

        vm.warp(block.timestamp + 2 days);
        vm.prank(alice);
        judge.revealAnswer(bountyId, aliceAnswer, aliceSalt);
        vm.prank(bob);
        judge.revealAnswer(bountyId, bobAnswer, bobSalt);

        vm.prank(owner);
        judge.judgeAll(bountyId, bytes("Winner ready"));

        uint256 bobBalanceBefore = bob.balance;

        vm.prank(owner);
        judge.finalizeWinner(bountyId, 1);

        bool finalized = judge.isFinalized(bountyId);
        uint256 winnerIndex = judge.getWinnerIndex(bountyId);
        uint256 reward = judge.getReward(bountyId);
        bytes memory ignoredReviewAfterFinalize = judge.getAIReview(bountyId);

        assertTrue(finalized);
        assertEq(winnerIndex, 1);
        assertEq(reward, 0);
        assertEq(bob.balance, bobBalanceBefore + 2 ether);
        assertEq(ignoredReviewAfterFinalize, bytes("Winner ready"));
    }
}
