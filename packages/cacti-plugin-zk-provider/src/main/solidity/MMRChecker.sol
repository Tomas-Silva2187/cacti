// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.17;

import "./interfaces/MMRTree.sol";
import "./lib/StatelessMmr.sol";

contract MMRChecker {
    bytes32 treeRoot_local;
    bytes32[] treePeaks_local;
    uint elementsCount_local;

    function append(bytes32 element) external returns (uint, bytes32, bytes32[] memory) {
        // Append element to the tree
        (
            uint nextElementsCount,
            bytes32 nextRootHash,
            bytes32[] memory nextPeaks
        ) = StatelessMmr.appendWithPeaksRetrieval(
                element,
                treePeaks_local,
                elementsCount_local,
                treeRoot_local
            );

        return (nextElementsCount, nextRootHash, nextPeaks);
    }

    function rootUpdate(bytes32 element, bytes32 newRoot, bytes32[] calldata new_peaks, uint new_elements_count) external returns (bool) {
        (
            uint nextElementsCount,
            bytes32 nextRootHash,
            bytes32[] memory nextPeaks
        ) = StatelessMmr.appendWithPeaksRetrieval(
                element,
                treePeaks_local,
                elementsCount_local,
                treeRoot_local
            );
        require(newRoot == nextRootHash, "Root mismatch");
        require(new_elements_count == nextElementsCount, "Elements count mismatch");
        require(keccak256(abi.encodePacked(new_peaks)) == keccak256(abi.encodePacked(nextPeaks)), "Peaks mismatch");
        treePeaks_local = nextPeaks;
        elementsCount_local = nextElementsCount;
        treeRoot_local = nextRootHash;
        return true;
    }
}
