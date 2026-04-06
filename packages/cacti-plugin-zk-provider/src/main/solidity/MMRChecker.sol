// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.17;

import "./interfaces/MMRTree.sol";
import "./lib/StatelessMmr.sol";

contract MMRChecker {
    bytes32 treeRoot_local;
    bytes32[] treePeaks_local;
    uint elementsCount_local;

    function append(bytes32 element) internal returns (uint, bytes32[], bytes32[] memory) {
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

    function rootUpdate(bytes32 element, bytes32 newRoot, bytes32[] calldata peaks) external returns (bool) {
        //(
        //    uint nextElementsCount,
        //    bytes32 nextRootHash,
        //    bytes32[] nextPeaks,
        //)
        return true;
    }
}
