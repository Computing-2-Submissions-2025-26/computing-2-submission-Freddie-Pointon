import Hex from "../Hex.js";
import R from "../ramda.js";

// ---------------------------------------------------------------------------
// Display helper — used in error messages so failing tests show the board
// ---------------------------------------------------------------------------

const display_board = function (board) {
    try {
        return "\n" + Hex.to_string(board);
    } catch (ignore) {
        return "\n" + JSON.stringify(board);
    }
};

// ---------------------------------------------------------------------------
// Board validity helper
// A valid Hex board must satisfy all of the following:
//   1. It is a non-empty square 2-D array.
//   2. Every cell contains only 0, 1, or 2.
//   3. Player 1 token count equals Player 2 count, or is exactly one more.
//   4. At most one player has a winning configuration.
// ---------------------------------------------------------------------------

/**
 * Throws a descriptive error if the board violates any validity constraint.
 * @param {Hex.Board} board The board to validate.
 * @throws {Error} If the board is invalid.
 */
const throw_if_invalid = function (board) {
    // 1. Must be a non-empty square 2D array.
    if (!Array.isArray(board) || !Array.isArray(board[0])) {
        throw new Error("Board is not a 2D array: " + display_board(board));
    }
    const size = board.length;
    const square = R.all((row) => row.length === size, board);
    if (!square) {
        throw new Error("Board is not square: " + display_board(board));
    }

    // 2. All cells must be 0, 1, or 2.
    const valid_cells = R.pipe(
        R.flatten,
        R.all((cell) => [0, 1, 2].includes(cell))
    )(board);
    if (!valid_cells) {
        throw new Error(
            "Board contains invalid cell values: " + display_board(board)
        );
    }

    // 3. Token counts must be balanced (P1 = P2 or P1 = P2 + 1).
    const flat = R.flatten(board);
    const count_1 = R.count(R.equals(1), flat);
    const count_2 = R.count(R.equals(2), flat);
    if (!(count_1 === count_2 || count_1 === count_2 + 1)) {
        throw new Error(
            `Token imbalance — Player 1: ${count_1}, Player 2: ${count_2}: ` +
            display_board(board)
        );
    }

    // 4. Both players cannot simultaneously have a winning path.
    if (
        Hex.is_winning_for_player(1, board) &&
        Hex.is_winning_for_player(2, board)
    ) {
        throw new Error(
            "Board is winning for both players: " + display_board(board)
        );
    }
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("Empty Board", function () {

    it("An empty board is a valid board.", function () {
        throw_if_invalid(Hex.empty_board());
    });

    it("An empty board has the correct default size of 11.", function () {
        const board = Hex.empty_board();
        if (Hex.size(board) !== 11) {
            throw new Error(
                `Expected size 11, got ${Hex.size(board)}: ` +
                display_board(board)
            );
        }
    });

    it("An empty board of a custom size has that size.", function () {
        const board = Hex.empty_board(5);
        if (Hex.size(board) !== 5) {
            throw new Error(
                `Expected size 5, got ${Hex.size(board)}: ` +
                display_board(board)
            );
        }
    });

    it("An empty board contains only empty cells.", function () {
        const board = Hex.empty_board();
        const all_empty = R.all(
            R.equals(0),
            R.flatten(board)
        );
        if (!all_empty) {
            throw new Error(
                "Empty board has non-empty cells: " + display_board(board)
            );
        }
    });

    it("An empty board is not ended.", function () {
        const board = Hex.empty_board();
        if (Hex.is_ended(board)) {
            throw new Error(
                "Empty board should not be ended: " + display_board(board)
            );
        }
    });

    it("An empty board has no winner.", function () {
        const board = Hex.empty_board();
        if (Hex.winner(board) !== 0) {
            throw new Error(
                "Empty board should have no winner: " + display_board(board)
            );
        }
    });

    it("On an empty board, Player 1 is next to move.", function () {
        const board = Hex.empty_board();
        if (Hex.player_to_move(board) !== 1) {
            throw new Error(
                "Player 1 should move first on an empty board: " +
                display_board(board)
            );
        }
    });
});

// ---------------------------------------------------------------------------

describe("Placing tokens", function () {

    it(
        `Given an empty board,
When Player 1 places a token at a valid position,
Then the resulting board is valid and the cell contains Player 1's token.`,
        function () {
            const board = Hex.empty_board();
            const next = Hex.place_token(1, [0, 0], board);
            throw_if_invalid(next);
            if (next[0][0] !== 1) {
                throw new Error(
                    "Cell [0][0] should contain 1 after Player 1's move: " +
                    display_board(next)
                );
            }
        }
    );

    it(
        `Given a board after Player 1's move,
When Player 2 places a token at a different position,
Then the resulting board is valid and it is Player 1's turn again.`,
        function () {
            const board = Hex.empty_board();
            const after_p1 = Hex.place_token(1, [0, 0], board);
            const after_p2 = Hex.place_token(2, [1, 1], after_p1);
            throw_if_invalid(after_p2);
            if (Hex.player_to_move(after_p2) !== 1) {
                throw new Error(
                    "After P1 and P2 each play, it should be P1's turn: " +
                    display_board(after_p2)
                );
            }
        }
    );

    it(
        `Given any board state,
When a player attempts to place a token on an occupied cell,
Then the move returns undefined.`,
        function () {
            const board = Hex.empty_board();
            const after_p1 = Hex.place_token(1, [5, 5], board);
            const illegal = Hex.place_token(2, [5, 5], after_p1);
            if (illegal !== undefined) {
                throw new Error(
                    "Placing on an occupied cell should return undefined."
                );
            }
        }
    );

    it(
        `Given any board state,
When a player attempts to move out of turn,
Then the move returns undefined.`,
        function () {
            const board = Hex.empty_board();
            const illegal = Hex.place_token(2, [0, 0], board);
            if (illegal !== undefined) {
                throw new Error(
                    "Player 2 moving first should return undefined."
                );
            }
        }
    );

    it(
        `Given an ended board,
When any player attempts to place a token,
Then the move returns undefined.`,
        function () {
            // Build a minimal winning board for Player 1 (top-to-bottom
            // diagonal path down column 0).
            const size = 11;
            let board = Hex.empty_board(size);
            // Player 1 fills column 0 top-to-bottom, Player 2 fills column 1.
            // Interleave moves: P1 at col 0, P2 at col 1.
            R.range(0, size).forEach(function (row) {
                board = Hex.place_token(1, [row, 0], board);
                if (row < size - 1) {
                    board = Hex.place_token(2, [row, 1], board);
                }
            });
            if (!Hex.is_ended(board)) {
                throw new Error(
                    "Board should be ended after P1 fills column 0: " +
                    display_board(board)
                );
            }
            const illegal = Hex.place_token(2, [0, 2], board);
            if (illegal !== undefined) {
                throw new Error(
                    "Should not be able to place a token on an ended board."
                );
            }
        }
    );

    it(
        `Given any board,
When place_token is called,
Then the original board is not mutated.`,
        function () {
            const board = Hex.empty_board(5);
            const original = JSON.stringify(board);
            Hex.place_token(1, [2, 2], board);
            if (JSON.stringify(board) !== original) {
                throw new Error("place_token must not mutate the original board.");
            }
        }
    );
});

// ---------------------------------------------------------------------------

describe("Win detection — Player 1 (top to bottom)", function () {

    it(
        `Given a board where Player 1 has a connected path
from the top edge to the bottom edge,
Then is_winning_for_player(1, board) returns true.`,
        function () {
            // Build a vertical path in column 0 using interleaved moves.
            const size = 5;
            let board = Hex.empty_board(size);
            R.range(0, size).forEach(function (row) {
                board = Hex.place_token(1, [row, 0], board);
                if (row < size - 1) {
                    board = Hex.place_token(2, [row, 4], board);
                }
            });
            if (!Hex.is_winning_for_player(1, board)) {
                throw new Error(
                    "Player 1 should win with a top-to-bottom path: " +
                    display_board(board)
                );
            }
        }
    );

    it(
        `Given a board where Player 1 has tokens on the top edge
but no complete path to the bottom edge,
Then is_winning_for_player(1, board) returns false.`,
        function () {
            // P1 has only placed on row 0.
            const board = Hex.place_token(1, [0, 3], Hex.empty_board());
            if (Hex.is_winning_for_player(1, board)) {
                throw new Error(
                    "Player 1 should not win with only a top-edge token: " +
                    display_board(board)
                );
            }
        }
    );
});

// ---------------------------------------------------------------------------

describe("Win detection — Player 2 (left to right)", function () {

    it(
        `Given a board where Player 2 has a connected path
from the left edge to the right edge,
Then is_winning_for_player(2, board) returns true.`,
        function () {
            // Build a valid game where P2 fills row 0 (left-to-right path).
            // P1 always moves first so we alternate: P1 at row 1, P2 at row 0.
            // Sequence: P1[1,0], P2[0,0], P1[1,1], P2[0,1], ...
            const size = 5;
            let board = Hex.empty_board(size);
            R.range(0, size).forEach(function (col) {
                board = Hex.place_token(1, [1, col], board);
                board = Hex.place_token(2, [0, col], board);
            });
            if (!Hex.is_winning_for_player(2, board)) {
                throw new Error(
                    "Player 2 should win with a left-to-right path: " +
                    display_board(board)
                );
            }
        }
    );

    it(
        `Given a board where Player 2 has tokens on the left edge
but no complete path to the right edge,
Then is_winning_for_player(2, board) returns false.`,
        function () {
            // P1 places first, then P2 on left edge only.
            let board = Hex.empty_board();
            board = Hex.place_token(1, [5, 5], board);
            board = Hex.place_token(2, [0, 0], board);
            if (Hex.is_winning_for_player(2, board)) {
                throw new Error(
                    "Player 2 should not win with only a left-edge token: " +
                    display_board(board)
                );
            }
        }
    );
});

// ---------------------------------------------------------------------------

describe("Neighbours", function () {

    it(
        `Given a corner cell on a size-5 board,
Then it has exactly 2 neighbours.`,
        function () {
            const n = Hex.neighbours(5, [0, 0]);
            if (n.length !== 2) {
                throw new Error(
                    `Corner cell [0,0] should have 2 neighbours, got ${n.length}.`
                );
            }
        }
    );

    it(
        `Given an edge (non-corner) cell on a size-5 board,
Then it has either 3 or 4 neighbours.`,
        function () {
            const n = Hex.neighbours(5, [0, 2]);
            if (n.length !== 3 && n.length !== 4) {
                throw new Error(
                    `Edge cell [0,2] should have 3 or 4 neighbours, got ${n.length}.`
                );
            }
        }
    );

    it(
        `Given an interior cell on a size-5 board,
Then it has exactly 6 neighbours.`,
        function () {
            const n = Hex.neighbours(5, [2, 2]);
            if (n.length !== 6) {
                throw new Error(
                    `Interior cell [2,2] should have 6 neighbours, got ${n.length}.`
                );
            }
        }
    );
});
