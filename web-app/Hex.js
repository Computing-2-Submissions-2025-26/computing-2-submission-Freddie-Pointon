import R from "./ramda.js";

/**
 * Hex.js models and plays the board game Hex.
 * https://en.wikipedia.org/wiki/Hex_(board_game)
 *
 * The board is a rhombus-shaped grid of hexagonal cells.
 * Player 1 (Red)  wins by forming a connected path from the top edge
 * to the bottom edge.
 * Player 2 (Blue) wins by forming a connected path from the left edge
 * to the right edge.
 * @namespace Hex
 * @author [Your Name]
 * @version 2024/25
 */
const Hex = Object.create(null);

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

/**
 * A Board is a square 2-D grid of cells.
 * It is represented as an array of rows, where each row is an array of cells.
 * `board[row][col]` gives the cell at that position.
 * Row 0 is the top edge; row (size-1) is the bottom edge.
 * Col 0 is the left edge; col (size-1) is the right edge.
 * @memberof Hex
 * @typedef {Hex.Cell[][]} Board
 */

/**
 * A Cell holds either a player's token or is empty.
 * @memberof Hex
 * @typedef {(Hex.Player | 0)} Cell
 */

/**
 * A Player is either 1 (Red, connects top–bottom)
 * or 2 (Blue, connects left–right).
 * @memberof Hex
 * @typedef {(1 | 2)} Player
 */

/**
 * A Position is a [row, col] coordinate pair on the board.
 * @memberof Hex
 * @typedef {number[]} Position
 */

// ---------------------------------------------------------------------------
// Board creation
// ---------------------------------------------------------------------------

/**
 * Creates a new empty board.
 * Every cell is initialised to 0 (empty).
 * @memberof Hex
 * @function
 * @param {number} [size=11] The width and height of the board.
 * @returns {Hex.Board} A new empty board ready to start a game.
 */
Hex.empty_board = function (size = 11) {
    // R.repeat(value, n) produces an array of n copies of value.
    // We repeat an empty row (itself an array of 0s) `size` times.
    // R.map(R.identity) forces a deep copy so each row is independent.
    return R.map(
        R.always(R.repeat(0, size)),
        R.range(0, size)
    );
};

/**
 * Returns the size (width and height) of the board.
 * @memberof Hex
 * @function
 * @param {Hex.Board} board The board to measure.
 * @returns {number} The size of the board.
 */
Hex.size = function (board) {
    return board.length;
};

// ---------------------------------------------------------------------------
// Game state queries
// ---------------------------------------------------------------------------

/**
 * Returns which player should make the next move.
 * Player 1 always goes first.
 * The player to move is determined by counting tokens:
 * if counts are equal it is Player 1's turn, otherwise Player 2's.
 * @memberof Hex
 * @function
 * @param {Hex.Board} board The current board.
 * @returns {Hex.Player} The player whose turn it is.
 */
Hex.player_to_move = function (board) {
    // R.flatten collapses the 2-D board to a 1-D array of cells.
    // R.count(R.equals(n), arr) counts occurrences of n.
    const flat = R.flatten(board);
    const count_1 = R.count(R.equals(1), flat);
    const count_2 = R.count(R.equals(2), flat);
    return (count_1 === count_2) ? 1 : 2;
};

/**
 * Returns whether a given cell position is within the board boundaries.
 * @memberof Hex
 * @function
 * @param {number} size The size of the board.
 * @param {Hex.Position} position The [row, col] to check.
 * @returns {boolean} True if the position is on the board.
 */
Hex.is_in_bounds = function (size, [row, col]) {
    return row >= 0 && row < size && col >= 0 && col < size;
};

/**
 * Returns whether a specific cell on the board is empty.
 * @memberof Hex
 * @function
 * @param {Hex.Board} board The board to query.
 * @param {Hex.Position} position The [row, col] position to check.
 * @returns {boolean} True if the cell is empty (0).
 */
Hex.is_empty = function (board, [row, col]) {
    return board[row][col] === 0;
};

// ---------------------------------------------------------------------------
// The six neighbours of a hex cell
// ---------------------------------------------------------------------------

// In a hex grid represented as a square array, each cell [r, c] has exactly
// six neighbours. These offsets encode those six directions:
//
//   NW  NE
//  W  [r,c]  E
//   SW  SE
//
// In offset coordinates the six neighbours are:
const HEX_NEIGHBOURS = [
    [-1, 0],   // North
    [-1, 1],   // North-East
    [0, -1],   // West
    [0,  1],   // East
    [1, -1],   // South-West
    [1,  0]    // South
];

/**
 * Returns all valid on-board neighbours of a cell.
 * @memberof Hex
 * @function
 * @param {number} size The size of the board.
 * @param {Hex.Position} position The [row, col] of the cell.
 * @returns {Hex.Position[]} An array of valid neighbouring positions.
 */
Hex.neighbours = function (size, [row, col]) {
    return HEX_NEIGHBOURS
        .map(([dr, dc]) => [row + dr, col + dc])
        .filter((pos) => Hex.is_in_bounds(size, pos));
};

// ---------------------------------------------------------------------------
// Win detection — BFS flood fill
// ---------------------------------------------------------------------------

// The win condition requires a connected path of same-colour cells from one
// edge to the opposite edge. We detect this using a Breadth-First Search
// (BFS). We seed the queue with all cells on the "start" edge owned by the
// player, then flood through connected same-colour neighbours. If we reach
// any cell on the "end" edge, the player has won.

/**
 * Returns the seed positions (start edge) for a player's win check.
 * Player 1 starts at row 0 (top).
 * Player 2 starts at col 0 (left).
 * @function
 * @param {Hex.Player} player
 * @param {number} size
 * @returns {Hex.Position[]}
 */
const start_edge = function (player, size) {
    return R.range(0, size).map(
        (i) => (player === 1 ? [0, i] : [i, 0])
    );
};

/**
 * Returns whether a position is on the winning end edge for a player.
 * Player 1's end edge is row (size-1) (bottom).
 * Player 2's end edge is col (size-1) (right).
 * @function
 * @param {Hex.Player} player
 * @param {number} size
 * @param {Hex.Position} position
 * @returns {boolean}
 */
const is_end_edge = function (player, size, [row, col]) {
    return (player === 1)
        ? row === size - 1
        : col === size - 1;
};

/**
 * BFS flood fill to check connectivity across the board for one player.
 * Returns true if the player has a winning connected path.
 * @function
 * @param {Hex.Player} player The player to check.
 * @param {Hex.Board} board The board to analyse.
 * @returns {boolean} Whether the player has a winning path.
 */
const player_has_won = function (player, board) {
    const size = Hex.size(board);

    // Seeds: all cells on the start edge that belong to this player.
    const seeds = start_edge(player, size).filter(
        ([r, c]) => board[r][c] === player
    );

    // BFS using a queue and a visited Set.
    // We encode positions as "row,col" strings for the Set (Sets use ===).
    const visited = new Set();
    const queue = [...seeds];

    seeds.forEach(([r, c]) => visited.add(`${r},${c}`));

    // Standard BFS loop: dequeue front, check goal, enqueue unvisited neighbours.
    while (queue.length > 0) {
        const [r, c] = queue.shift();

        if (is_end_edge(player, size, [r, c])) {
            return true;
        }

        Hex.neighbours(size, [r, c]).forEach(function ([nr, nc]) {
            const key = `${nr},${nc}`;
            if (!visited.has(key) && board[nr][nc] === player) {
                visited.add(key);
                queue.push([nr, nc]);
            }
        });
    }

    return false;
};

/**
 * Returns whether the board is in a winning state for a given player.
 * A player wins by having a connected chain of their tokens from their
 * start edge to their end edge.
 * @memberof Hex
 * @function
 * @param {Hex.Player} player The player to check.
 * @param {Hex.Board} board The board to evaluate.
 * @returns {boolean} True if the specified player has won.
 */
Hex.is_winning_for_player = function (player, board) {
    return player_has_won(player, board);
};

/**
 * Returns whether the game has ended.
 * A Hex game ends only when one player has a winning path —
 * the board can never fill up without a winner (a known mathematical property
 * of the game). We check both players for robustness.
 * @memberof Hex
 * @function
 * @param {Hex.Board} board The board to check.
 * @returns {boolean} True if the game is over.
 */
Hex.is_ended = function (board) {
    return (
        Hex.is_winning_for_player(1, board) ||
        Hex.is_winning_for_player(2, board)
    );
};

/**
 * Returns the winning player if the game is over, otherwise returns 0.
 * @memberof Hex
 * @function
 * @param {Hex.Board} board The board to check.
 * @returns {(Hex.Player | 0)} The winning player (1 or 2), or 0 if no winner.
 */
Hex.winner = function (board) {
    if (Hex.is_winning_for_player(1, board)) {
        return 1;
    }
    if (Hex.is_winning_for_player(2, board)) {
        return 2;
    }
    return 0;
};

// ---------------------------------------------------------------------------
// Making a move
// ---------------------------------------------------------------------------

/**
 * Places a token for the given player at the specified position.
 * Returns the new board if the move is legal, otherwise returns undefined.
 *
 * A move is legal when:
 * - The game has not already ended.
 * - It is that player's turn.
 * - The target cell is empty and within bounds.
 * @memberof Hex
 * @function
 * @param {Hex.Player} player The player making the move.
 * @param {Hex.Position} position The [row, col] to place the token.
 * @param {Hex.Board} board The current board state.
 * @returns {(Hex.Board | undefined)} The new board after the move,
 *     or undefined if the move is illegal.
 */
Hex.place_token = function (player, [row, col], board) {
    // Guard: game must not be over.
    if (Hex.is_ended(board)) {
        return undefined;
    }
    // Guard: must be this player's turn.
    if (Hex.player_to_move(board) !== player) {
        return undefined;
    }
    // Guard: cell must be in bounds and empty.
    if (!Hex.is_in_bounds(Hex.size(board), [row, col])) {
        return undefined;
    }
    if (!Hex.is_empty(board, [row, col])) {
        return undefined;
    }
    // R.update(index, value, array) returns a new array with value at index.
    // We update the cell within its row, then update that row within the board.
    // Neither the original row nor the original board is mutated.
    const new_row = R.update(col, player, board[row]);
    return R.update(row, new_row, board);
};

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * Returns a string representation of the board for console debugging.
 * Empty cells are ".", Player 1 cells are "R", Player 2 cells are "B".
 * @memberof Hex
 * @function
 * @param {Hex.Board} board The board to display.
 * @returns {string} A human-readable board string.
 */
Hex.to_string = function (board) {
    const symbols = [".", "R", "B"];
    return board.map(function (row, row_index) {
        // Indent each row by its index to give the hex slant visually.
        const indent = " ".repeat(row_index);
        return indent + row.map((cell) => symbols[cell]).join(" ");
    }).join("\n");
};

export default Object.freeze(Hex);
