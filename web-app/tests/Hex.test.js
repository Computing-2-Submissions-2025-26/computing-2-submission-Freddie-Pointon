import Hex from "../Hex.js";
import R from "../ramda.js";

// ---------------------------------------------------------------------------
// Display helper — included in failure messages so a failing test shows the
// board that caused it.
// ---------------------------------------------------------------------------

const display_board = function (board) {
    try {
        return "\n" + Hex.to_string(board);
    } catch (ignore) {
        return "\n" + JSON.stringify(board);
    }
};

// Sets a single cell, returning a new board (used to build test boards).
const set_cell = function (board, [row, col], token) {
    return R.update(row, R.update(col, token, board[row]), board);
};

// Builds a board by placing `token` at every position in `positions`.
const board_with = function (size, token, positions) {
    return R.reduce(
        function (board, position) {
            return set_cell(board, position, token);
        },
        Hex.empty_board(size),
        positions
    );
};

// True when every consecutive pair in `path` is adjacent on a board of the
// given size — i.e. the path is a genuine connected chain of cells, not just
// cells drawn from the right rows. Verifies winning_path returns a real route.
const is_connected_chain = function (size, path) {
    const pairs = R.aperture(2, path);
    const is_adjacent_pair = function ([from, to]) {
        return R.any(R.equals(to), Hex.neighbours(size, from));
    };
    return R.all(is_adjacent_pair, pairs);
};


// ---------------------------------------------------------------------------
// Validity oracle.
// A board is valid when:
//   1. It is a non-empty square 2-D array.
//   2. Every cell is 0, 1, or 2.
//   3. The two players' stone counts differ by at most one. (Players
//      alternate, so normally Player 1 leads by 0 or 1; the swap rule can
//      legitimately make Player 2 lead by 1, hence "differ by at most one".)
//   4. At most one player has a winning connection.
// This is written independently of the module's own logic, so it can catch a
// faulty implementation rather than merely echoing it.
// ---------------------------------------------------------------------------

const throw_if_invalid = function (board) {
    // 1. Non-empty square 2-D array.
    if (!Array.isArray(board) || !Array.isArray(board[0])) {
        throw new Error("Board is not a 2-D array: " + display_board(board));
    }
    const size = board.length;
    const is_square = R.all(
        function (row) {
            return row.length === size;
        },
        board
    );
    if (!is_square) {
        throw new Error("Board is not square: " + display_board(board));
    }

    // 2. Only 0, 1, 2 appear.
    const only_valid_cells = R.pipe(
        R.flatten,
        R.all(function (cell) {
            return R.includes(cell, [0, 1, 2]);
        })
    )(board);
    if (!only_valid_cells) {
        throw new Error(
            "Board has invalid cell values: " + display_board(board)
        );
    }

    // 3. Stone counts differ by at most one.
    const flat = R.flatten(board);
    const count_1 = R.count(R.equals(1), flat);
    const count_2 = R.count(R.equals(2), flat);
    if (Math.abs(count_1 - count_2) > 1) {
        throw new Error(
            `Stone imbalance — Player 1: ${count_1}, Player 2: ${count_2}: `
            + display_board(board)
        );
    }

    // 4. Not winning for both players at once.
    if (
        Hex.is_winning_for_player(1, board)
        && Hex.is_winning_for_player(2, board)
    ) {
        throw new Error(
            "Board is winning for both players: " + display_board(board)
        );
    }
};

// ---------------------------------------------------------------------------
// Empty board and new game
// ---------------------------------------------------------------------------

describe("Empty board and new game", function () {
    it("An empty board is a valid board.", function () {
        throw_if_invalid(Hex.empty_board());
    });

    it("An empty board has the default size of 11.", function () {
        const board = Hex.empty_board();
        if (Hex.size(board) !== 11) {
            throw new Error(
                `Expected size 11, got ${Hex.size(board)}.`
            );
        }
    });

    it("An empty board of a custom size has that size.", function () {
        if (Hex.size(Hex.empty_board(7)) !== 7) {
            throw new Error("Custom-size empty board has the wrong size.");
        }
    });

    it("An empty board contains only empty cells.", function () {
        const board = Hex.empty_board();
        const all_empty = R.all(R.equals(0), R.flatten(board));
        if (!all_empty) {
            throw new Error(
                "Empty board has a non-empty cell: " + display_board(board)
            );
        }
    });

    it("An empty board has no winner and is not won.", function () {
        const board = Hex.empty_board();
        if (Hex.winner(board) !== 0 || Hex.is_won(board)) {
            throw new Error(
                "Empty board should have no winner: " + display_board(board)
            );
        }
    });

    it("A new game has Player 1 to move first.", function () {
        if (Hex.player_to_move(Hex.new_game()) !== 1) {
            throw new Error("Player 1 should move first in a new game.");
        }
    });
});

// ---------------------------------------------------------------------------
// Placing stones
// ---------------------------------------------------------------------------

describe("Placing stones", function () {
    it(
        `Given a new game,
When Player 1 places a stone on an empty cell,
Then the board is valid, the cell holds Player 1's stone,
and Player 2 is next to move.`,
        function () {
            const next = Hex.place_stone(1, [0, 0], Hex.new_game());
            throw_if_invalid(next.board);
            if (next.board[0][0] !== 1) {
                throw new Error(
                    "Cell should hold Player 1: " + display_board(next.board)
                );
            }
            if (Hex.player_to_move(next) !== 2) {
                throw new Error("Player 2 should be next to move.");
            }
        }
    );

    it(
        `Given a new game,
When Player 2 tries to move first,
Then the move is illegal and returns undefined.`,
        function () {
            if (Hex.place_stone(2, [0, 0], Hex.new_game()) !== undefined) {
                throw new Error("Player 2 moving first should be illegal.");
            }
        }
    );

    it(
        `Given a stone already on a cell,
When a player tries to place on that same cell,
Then the move is illegal and returns undefined.`,
        function () {
            const after_p1 = Hex.place_stone(1, [3, 3], Hex.new_game());
            if (Hex.place_stone(2, [3, 3], after_p1) !== undefined) {
                throw new Error("Placing on an occupied cell should fail.");
            }
        }
    );

    it(
        `Given a position off the board,
When a player tries to place there,
Then the move is illegal and returns undefined.`,
        function () {
            if (Hex.place_stone(1, [99, 99], Hex.new_game()) !== undefined) {
                throw new Error("Out-of-bounds placement should fail.");
            }
        }
    );

    it(
        `Given any game,
When a stone is placed,
Then the original game is not mutated.`,
        function () {
            const game = Hex.new_game(5);
            const snapshot = JSON.stringify(game);
            Hex.place_stone(1, [2, 2], game);
            if (JSON.stringify(game) !== snapshot) {
                throw new Error("place_stone must not mutate its input.");
            }
        }
    );

    it(
        `Given a game that has been won,
When a player tries to place a stone,
Then the move is illegal and returns undefined.`,
        function () {
            // Build a real won game by alternating legal moves: Player 1
            // fills column 0 top-to-bottom; Player 2 fills column 1.
            const size = 5;
            let game = Hex.new_game(size);
            R.range(0, size).forEach(function (row) {
                game = Hex.place_stone(1, [row, 0], game);
                if (row < size - 1) {
                    game = Hex.place_stone(2, [row, 1], game);
                }
            });
            if (!Hex.is_won(game.board)) {
                throw new Error(
                    "Board should be won: " + display_board(game.board)
                );
            }
            if (Hex.place_stone(2, [0, 2], game) !== undefined) {
                throw new Error("Placing on a won board should fail.");
            }
        }
    );
});

// ---------------------------------------------------------------------------
// Turn-order invariant
// For a game that is not yet won, every legal move must produce a valid
// board that is either won by the player who just moved, or not won with the
// other player next to move. This checks behaviour across many states rather
// than a few hand-picked ones.
// ---------------------------------------------------------------------------

const throw_if_bad_move = function (game) {
    const board = game.board;
    const size = Hex.size(board);
    const player = Hex.player_to_move(game);
    const other = 3 - player;
    R.range(0, size).forEach(function (row) {
        R.range(0, size).forEach(function (col) {
            if (board[row][col] !== 0) {
                return;
            }
            const next = Hex.place_stone(player, [row, col], game);
            throw_if_invalid(next.board);
            if (Hex.is_won(next.board)) {
                if (Hex.is_winning_for_player(other, next.board)) {
                    throw new Error(
                        "A player who did not move has won: "
                        + display_board(next.board)
                    );
                }
            } else if (Hex.player_to_move(next) !== other) {
                throw new Error(
                    "Wrong player is next after a move: "
                    + display_board(next.board)
                );
            }
        });
    });
};

describe("Turn-order invariant", function () {
    it(
        `Given any not-won game (including one reached through a swap),
When the current player makes any legal move,
Then the board stays valid and the correct player is next to move.`,
        function () {
            // A fresh game.
            const empty_game = Hex.new_game(5);

            // A short mid-game line.
            let mid_game = Hex.new_game(5);
            mid_game = Hex.place_stone(1, [2, 2], mid_game);
            mid_game = Hex.place_stone(2, [1, 1], mid_game);
            mid_game = Hex.place_stone(1, [0, 3], mid_game);

            // A line that uses the swap, then continues.
            let swap_game = Hex.new_game(5);
            swap_game = Hex.place_stone(1, [2, 2], swap_game);
            swap_game = Hex.swap(swap_game);
            swap_game = Hex.place_stone(1, [0, 0], swap_game);
            swap_game = Hex.place_stone(2, [4, 4], swap_game);

            [empty_game, mid_game, swap_game].forEach(throw_if_bad_move);
        }
    );
});

// ---------------------------------------------------------------------------
// The swap (pie) rule
// ---------------------------------------------------------------------------

describe("Swap (pie) rule", function () {
    it(
        `Given a game after Player 1's first move,
Then a swap is available.`,
        function () {
            const after_p1 = Hex.place_stone(1, [2, 2], Hex.new_game());
            if (!Hex.can_swap(after_p1)) {
                throw new Error("Swap should be available on move two.");
            }
        }
    );

    it(
        `Given a game after Player 1's first move,
When Player 2 swaps,
Then the stone becomes Player 2's, the board is valid,
and Player 1 is next to move.`,
        function () {
            const after_p1 = Hex.place_stone(1, [2, 2], Hex.new_game());
            const swapped = Hex.swap(after_p1);
            throw_if_invalid(swapped.board);
            if (swapped.board[2][2] !== 2) {
                throw new Error(
                    "Swapped stone should belong to Player 2: "
                    + display_board(swapped.board)
                );
            }
            if (Hex.player_to_move(swapped) !== 1) {
                throw new Error("Player 1 should move after a swap.");
            }
        }
    );

    it(
        `Given a fresh game with no moves played,
When a swap is attempted,
Then it is illegal and returns undefined.`,
        function () {
            if (Hex.swap(Hex.new_game()) !== undefined) {
                throw new Error("Swap before any move should be illegal.");
            }
        }
    );

    it(
        `Given a game where two moves have already been played,
When a swap is attempted,
Then it is illegal and returns undefined.`,
        function () {
            let game = Hex.new_game(5);
            game = Hex.place_stone(1, [2, 2], game);
            game = Hex.place_stone(2, [3, 3], game);
            if (Hex.swap(game) !== undefined) {
                throw new Error("Swap after move two should be illegal.");
            }
        }
    );
});

// ---------------------------------------------------------------------------
// Starting player (supports randomising who opens)
// ---------------------------------------------------------------------------

describe("Starting player", function () {
    it(
        `Given a new game told that Player 2 starts,
Then Player 2 is to move first.`,
        function () {
            if (Hex.player_to_move(Hex.new_game(11, 2)) !== 2) {
                throw new Error("Player 2 should move first when chosen.");
            }
        }
    );

    it(
        `Given a Player-2-first game after the opening move,
When the first player swaps,
Then the stone becomes Player 1's and Player 2 is next to move.`,
        function () {
            const opening = Hex.place_stone(2, [2, 2], Hex.new_game(5, 2));
            if (!Hex.can_swap(opening)) {
                throw new Error("Swap should be available on move two.");
            }
            const swapped = Hex.swap(opening);
            throw_if_invalid(swapped.board);
            if (swapped.board[2][2] !== 1) {
                throw new Error(
                    "Swapped stone should become Player 1's: "
                    + display_board(swapped.board)
                );
            }
            if (Hex.player_to_move(swapped) !== 2) {
                throw new Error("Player 2 should move after the swap.");
            }
        }
    );
});

// ---------------------------------------------------------------------------
// Win detection — Player 1 (top to bottom)
// ---------------------------------------------------------------------------

describe("Win detection — Player 1 (top to bottom)", function () {
    it(
        `Given a board where Player 1 connects the top edge to the bottom edge,
Then Player 1 is the winner and the winning path spans every row.`,
        function () {
            const size = 5;
            const column = R.map(
                function (row) {
                    return [row, 0];
                },
                R.range(0, size)
            );
            const board = board_with(size, 1, column);
            if (Hex.winner(board) !== 1) {
                throw new Error(
                    "Player 1 should win: " + display_board(board)
                );
            }
            const path = Hex.winning_path(board);
            const spans = (
                path.length === size
                && path[0][0] === 0
                && path[size - 1][0] === size - 1
            );
            if (!spans) {
                throw new Error(
                    "Winning path should span top to bottom: "
                    + JSON.stringify(path)
                );
            }
            if (!is_connected_chain(size, path)) {
                throw new Error(
                    "Winning path is not a connected chain: "
                    + JSON.stringify(path)
                );
            }
        }
    );

    it(
        `Given a board where Player 1 has only a stone on the top edge,
Then Player 1 is not winning.`,
        function () {
            const board = board_with(5, 1, [[0, 2]]);
            if (Hex.is_winning_for_player(1, board)) {
                throw new Error(
                    "A single top-edge stone is not a win: "
                    + display_board(board)
                );
            }
        }
    );

    it(
        `Given a near-complete path with a single gap,
Then Player 1 is not winning.`,
        function () {
            // Column 0 filled except for the row-3 cell — no connection.
            const board = board_with(5, 1, [[0, 0], [1, 0], [2, 0], [4, 0]]);
            if (Hex.winner(board) !== 0) {
                throw new Error(
                    "A path with a gap must not win: " + display_board(board)
                );
            }
        }
    );
});

// ---------------------------------------------------------------------------
// Win detection — Player 2 (left to right)
// Exercises the transpose used inside is_winning_for_player.
// ---------------------------------------------------------------------------

describe("Win detection — Player 2 (left to right)", function () {
    it(
        `Given a board where Player 2 connects the left edge to the right edge,
Then Player 2 is the winner and the winning path spans every column.`,
        function () {
            const size = 5;
            const row = R.map(
                function (col) {
                    return [0, col];
                },
                R.range(0, size)
            );
            const board = board_with(size, 2, row);
            if (Hex.winner(board) !== 2) {
                throw new Error(
                    "Player 2 should win: " + display_board(board)
                );
            }
            const path = Hex.winning_path(board);
            const spans = (
                path.length === size
                && path[0][1] === 0
                && path[size - 1][1] === size - 1
            );
            if (!spans) {
                throw new Error(
                    "Winning path should span left to right: "
                    + JSON.stringify(path)
                );
            }
            if (!is_connected_chain(size, path)) {
                throw new Error(
                    "Winning path is not a connected chain: "
                    + JSON.stringify(path)
                );
            }
        }
    );

    it(
        `Given a board where Player 2 has only a stone on the left edge,
Then Player 2 is not winning.`,
        function () {
            const board = board_with(5, 2, [[2, 0]]);
            if (Hex.is_winning_for_player(2, board)) {
                throw new Error(
                    "A single left-edge stone is not a win: "
                    + display_board(board)
                );
            }
        }
    );
});

// ---------------------------------------------------------------------------
// Neighbours
// ---------------------------------------------------------------------------

describe("Neighbours", function () {
    it("A corner cell has exactly 2 neighbours.", function () {
        if (Hex.neighbours(5, [0, 0]).length !== 2) {
            throw new Error("Corner cell should have 2 neighbours.");
        }
    });

    it("A top-edge cell has 3 or 4 neighbours.", function () {
        const count = Hex.neighbours(5, [0, 2]).length;
        if (count !== 3 && count !== 4) {
            throw new Error("Edge cell should have 3 or 4 neighbours.");
        }
    });

    it("An interior cell has exactly 6 neighbours.", function () {
        if (Hex.neighbours(5, [2, 2]).length !== 6) {
            throw new Error("Interior cell should have 6 neighbours.");
        }
    });
});
