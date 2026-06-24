import R from "./ramda.js";

/**
 * Hex.js models and plays the board game Hex.
 * https://en.wikipedia.org/wiki/Hex_(board_game)
 *
 * Hex is played on a rhombus of hexagonal cells. Two players take turns
 * placing a stone of their colour on an empty cell.
 * - Player 1 wins by connecting the top edge to the bottom edge.
 * - Player 2 wins by connecting the left edge to the right edge.
 *
 * The game identifies players as player 1 and player 2. However in the UI
 * player 1 uses gold and black and player 2 uses black and silver. This
 * allows colourblind players to differentiate them, improving accessibility.
 *
 * Because Hex can never end in a draw, a game ends exactly when one player
 * completes a connecting path.
 *
 * The game structure is built in two parts:
 * - Game progression functions act on a {@link Hex.Game} state and know
 *   about turns and the swap rule.
 * - Board analysis functions act on a {@link Hex.Board} and know only about
 *   board geometry and connection.
 * @namespace Hex
 * @author Freddie Pointon
 * @version 2026
 */
const Hex = Object.create(null);

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

/**
 * A Player is one of the two competitors.
 * Player 1 connects the top edge to the bottom edge; Player 2 connects the
 * left edge to the right edge.
 * @memberof Hex
 * @typedef {(1 | 2)} Player
 */

/**
 * A Cell is a single position on the board. It is empty (0) or holds the
 * stone of a player.
 * @memberof Hex
 * @typedef {(Hex.Player | 0)} Cell
 */

/**
 * A Board is a square grid of cells, represented as an array of rows.
 * `board[row][col]` is the cell at that position.
 * Row 0 is the top edge and row (size - 1) is the bottom edge.
 * Column 0 is the left edge and column (size - 1) is the right edge.
 * @memberof Hex
 * @typedef {Hex.Cell[][]} Board
 */

/**
 * A Position is a [row, column] coordinate pair on the board.
 * @memberof Hex
 * @typedef {number[]} Position
 */

/**
 * A Game is the full state needed to continue play: the board, and how many
 * moves have been made. The move count is what determines whose turn it is,
 * which keeps the turn correct even after a swap (see {@link Hex.swap}).
 * @memberof Hex
 * @typedef {object} Game
 * @property {Hex.Board} board The current board.
 * @property {Hex.Player} first_player The player who made the opening move.
 * @property {number} moves_played How many moves have been made so far.
 */

// ---------------------------------------------------------------------------
// Board creation
// ---------------------------------------------------------------------------

/**
 * Creates a new empty board of the given size.
 * Every cell starts empty (0).
 * @memberof Hex
 * @function
 * @param {number} [size=11] The width and height of the board.
 * @returns {Hex.Board} A new empty board.
 */
Hex.empty_board = function (size = 11) {
    const empty_row = R.repeat(0, size);
    return R.repeat(empty_row, size);
};

/**
 * Returns the size (width and height) of a board.
 * @memberof Hex
 * @function
 * @param {Hex.Board} board The board to measure.
 * @returns {number} The size of the board.
 */
Hex.size = function (board) {
    return board.length;
};

// ---------------------------------------------------------------------------
// Game creation and turn order
// ---------------------------------------------------------------------------

/**
 * Starts a new game: an empty board with no moves played yet. The starting
 * player can be chosen so the caller may, for example, randomise it.
 * @memberof Hex
 * @function
 * @param {number} [size=11] The board size to play on.
 * @param {Hex.Player} [first_player=1] The player who moves first.
 * @returns {Hex.Game} A fresh game ready for the first player to move.
 */
Hex.new_game = function (size = 11, first_player = 1) {
    return {
        "board": Hex.empty_board(size),
        "first_player": first_player,
        "moves_played": 0
    };
};

/**
 * Returns which player should make the next move.
 * Players alternate strictly, so the turn follows from the number of moves
 * already made: an even count is the first player's turn, an odd count the
 * other player's. This holds even after a swap, because a swap is itself one
 * move. An older state without a recorded first player is treated as Player 1
 * first, preserving the original behaviour.
 * @memberof Hex
 * @function
 * @param {Hex.Game} game The current game state.
 * @returns {Hex.Player} The player whose turn it is.
 */
Hex.player_to_move = function (game) {
    const first_player = (
        game.first_player === undefined
        ? 1
        : game.first_player
    );
    const second_player = (
        first_player === 1
        ? 2
        : 1
    );
    return (
        game.moves_played % 2 === 0
        ? first_player
        : second_player
    );
};

/**
 * Returns whether the swap (pie) rule is available right now.
 * The swap is offered to the second player to move, whoever did not open,
 * and only as the second move of the game.
 * @memberof Hex
 * @function
 * @param {Hex.Game} game The current game state.
 * @returns {boolean} True if the second player may swap this turn.
 */
Hex.can_swap = function (game) {
    return game.moves_played === 1;
};

// ---------------------------------------------------------------------------
// Board geometry: bounds, emptiness, and neighbours
// ---------------------------------------------------------------------------

/**
 * Returns whether a position lies on a board of the given size.
 * @memberof Hex
 * @function
 * @param {number} size The size of the board.
 * @param {Hex.Position} position The [row, column] to check.
 * @returns {boolean} True if the position is on the board.
 */
Hex.is_on_board = function (size, [row, col]) {
    return row >= 0 && row < size && col >= 0 && col < size;
};

/**
 * Returns whether a specific cell is empty.
 * @memberof Hex
 * @function
 * @param {Hex.Board} board The board to query.
 * @param {Hex.Position} position The [row, column] to check.
 * @returns {boolean} True if the cell holds no stone.
 */
Hex.is_empty = function (board, [row, col]) {
    return board[row][col] === 0;
};

// In a hex grid laid out as a square array, each cell has six neighbours.
// These are the six coordinate offsets that reach them:
//
//        N   NE
//      W   *   E
//        SW   S
//
const hex_directions = [
    [-1, 0],   // North
    [-1, 1],   // North-East
    [0, -1],   // West
    [0, 1],    // East
    [1, -1],   // South-West
    [1, 0]     // South
];

/**
 * Returns a function that shifts an offset by a fixed starting position.
 * @function
 * @private
 * @param {Hex.Position} position The position to shift from.
 * @returns {function} A function mapping an offset to a new position.
 */
const shift_from = function (position) {
    return function ([d_row, d_col]) {
        return [position[0] + d_row, position[1] + d_col];
    };
};

/**
 * Returns all on-board neighbours of a cell.
 * Built by composition: shift the six directions from the cell, then keep
 * only the positions that land on the board.
 * @memberof Hex
 * @function
 * @param {number} size The size of the board.
 * @param {Hex.Position} position The [row, column] of the cell.
 * @returns {Hex.Position[]} The neighbouring positions that are on the board.
 */
Hex.neighbours = function (size, position) {
    const stays_on_board = function (candidate) {
        return Hex.is_on_board(size, candidate);
    };
    return R.pipe(
        R.map(shift_from(position)),
        R.filter(stays_on_board)
    )(hex_directions);
};

// ---------------------------------------------------------------------------
// Win detection
//
// Player 1 needs a top-to-bottom path; Player 2 needs a left-to-right path.
// Rather than write the search twice, we write it once for the top-to-bottom
// case. For Player 2 we transpose the board (swapping rows and columns):
// a left-to-right connection on the original board is a top-to-bottom
// connection on the transposed board. Hex adjacency is preserved by
// transposition, so the same neighbour rule still applies.
// ---------------------------------------------------------------------------

/**
 * Encodes a position as a "row,col" string for use as a Set/Map key.
 * @function
 * @private
 * @param {Hex.Position} position The position to encode.
 * @returns {string} The string key.
 */
const key_of = function ([row, col]) {
    return `${row},${col}`;
};

/**
 * Returns the top-edge cells owned by a player: the starting points for a
 * top-to-bottom search.
 * @function
 * @private
 * @param {Hex.Player} player The player to seed for.
 * @param {Hex.Board} board The board to read.
 * @returns {Hex.Position[]} The owned cells on row 0.
 */
const top_edge_seeds = function (player, board) {
    const size = board.length;
    const is_owned_top = function (col) {
        return board[0][col] === player;
    };
    const to_position = function (col) {
        return [0, col];
    };
    return R.map(to_position, R.filter(is_owned_top, R.range(0, size)));
};

/**
 * Breadth-first search for a top-to-bottom path of one player's stones.
 * Returns the path of positions from the top edge to the bottom edge, or
 * the empty array if there is none.
 *
 * The queue, the visited set and the came-from map are local to this call.
 * They are never exposed and the board is never changed, so the function is
 * pure: the same board always yields the same path.
 * @function
 * @private
 * @param {Hex.Player} player The player whose stones form the path.
 * @param {Hex.Board} board The board to search.
 * @returns {Hex.Position[]} A connecting path, or [] if none exists.
 */
const top_bottom_path = function (player, board) {
    const size = board.length;
    const visited = new Set();
    const came_from = new Map();
    const queue = top_edge_seeds(player, board);
    queue.forEach(function (position) {
        visited.add(key_of(position));
    });

    // Visits one cell: queue its owned, unvisited neighbours and record the
    // step taken to reach each. Defined once here, above the search loop, so
    // that no function is created inside the loop.
    const visit = function (current) {
        Hex.neighbours(size, current).forEach(function (next) {
            const next_key = key_of(next);
            const is_owned = board[next[0]][next[1]] === player;
            if (is_owned && !visited.has(next_key)) {
                visited.add(next_key);
                came_from.set(next_key, current);
                queue.push(next);
            }
        });
    };

    let reached;
    while (queue.length > 0 && reached === undefined) {
        const current = queue.shift();
        if (current[0] === size - 1) {
            reached = current;
        } else {
            visit(current);
        }
    }

    if (reached === undefined) {
        return [];
    }

    // Walk the came-from links back from the bottom edge to a seed.
    const path = [];
    let step = reached;
    while (step !== undefined) {
        path.push(step);
        step = came_from.get(key_of(step));
    }
    return R.reverse(path);
};

/**
 * Returns whether the board is won for a given player.
 * Player 1 is checked top-to-bottom; Player 2 is checked on the transposed
 * board so the same search serves both.
 * @memberof Hex
 * @function
 * @param {Hex.Player} player The player to check.
 * @param {Hex.Board} board The board to evaluate.
 * @returns {boolean} True if that player has a connecting path.
 */
Hex.is_winning_for_player = function (player, board) {
    return (
        player === 1
        ? top_bottom_path(1, board).length > 0
        : top_bottom_path(2, R.transpose(board)).length > 0
    );
};

/**
 * Returns the winning player, or 0 if neither player has won.
 * @memberof Hex
 * @function
 * @param {Hex.Board} board The board to check.
 * @returns {(Hex.Player | 0)} The winning player, or 0 for no winner yet.
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

/**
 * Returns whether the game has been won.
 * Hex cannot end in a draw, so this is the same as "the game is over".
 * @memberof Hex
 * @function
 * @param {Hex.Board} board The board to check.
 * @returns {boolean} True if either player has won.
 */
Hex.is_won = function (board) {
    return Hex.winner(board) !== 0;
};

/**
 * Returns the connecting path of the winning player as an array of
 * positions, or the empty array if the game is not yet won.
 * Intended for the user interface to highlight the winning line.
 * @memberof Hex
 * @function
 * @param {Hex.Board} board The board to analyse.
 * @returns {Hex.Position[]} The winning path, or [].
 */
Hex.winning_path = function (board) {
    const winning_player = Hex.winner(board);
    if (winning_player === 1) {
        return top_bottom_path(1, board);
    }
    if (winning_player === 2) {
        // The path is found on the transposed board, so swap each
        // [row, col] back to original-board coordinates.
        const flip = function ([row, col]) {
            return [col, row];
        };
        return R.map(flip, top_bottom_path(2, R.transpose(board)));
    }
    return [];
};

// ---------------------------------------------------------------------------
// Making a move
// ---------------------------------------------------------------------------

/**
 * Places a player's stone at a position, returning the new game state.
 * Returns undefined for an illegal move. A move is legal when the game is
 * not already won, it is that player's turn, and the target cell is empty
 * and on the board.
 * @memberof Hex
 * @function
 * @param {Hex.Player} player The player placing the stone.
 * @param {Hex.Position} position The [row, column] to place at.
 * @param {Hex.Game} game The current game state.
 * @returns {(Hex.Game | undefined)} The new game state, or undefined if the
 *     move is illegal.
 */
Hex.place_stone = function (player, [row, col], game) {
    const board = game.board;
    if (Hex.is_won(board)) {
        return undefined;
    }
    if (Hex.player_to_move(game) !== player) {
        return undefined;
    }
    if (!Hex.is_on_board(Hex.size(board), [row, col])) {
        return undefined;
    }
    if (!Hex.is_empty(board, [row, col])) {
        return undefined;
    }
    const new_row = R.update(col, player, board[row]);
    const new_board = R.update(row, new_row, board);
    return {
        "board": new_board,
        "first_player": game.first_player,
        "moves_played": game.moves_played + 1
    };
};

/**
 * Finds the single stone on a board that has had exactly one move played.
 * @function
 * @private
 * @param {Hex.Board} board The board to scan.
 * @returns {Hex.Position} The position of the only stone.
 */
const only_stone = function (board) {
    const size = board.length;
    const all_positions = R.chain(function (row) {
        return R.map(function (col) {
            return [row, col];
        }, R.range(0, size));
    }, R.range(0, size));
    return all_positions.find(function ([row, col]) {
        return board[row][col] !== 0;
    });
};

/**
 * Applies the swap (pie) rule: the second player takes over the opening
 * stone instead of placing their own. The stone keeps its position but
 * becomes the second player's, and the turn passes back to the first player.
 *
 * The swap is legal only as the second move of the game; otherwise this
 * returns undefined. It exists to offset the first player's opening
 * advantage, and works whichever player opened.
 * @memberof Hex
 * @function
 * @param {Hex.Game} game The current game state.
 * @returns {(Hex.Game | undefined)} The new game state, or undefined if a
 *     swap is not allowed right now.
 */
Hex.swap = function (game) {
    if (!Hex.can_swap(game)) {
        return undefined;
    }
    const swapper = Hex.player_to_move(game);
    const [row, col] = only_stone(game.board);
    const new_row = R.update(col, swapper, game.board[row]);
    const new_board = R.update(row, new_row, game.board);
    return {
        "board": new_board,
        "first_player": game.first_player,
        "moves_played": game.moves_played + 1
    };
};

// ---------------------------------------------------------------------------
// Debug helper
// ---------------------------------------------------------------------------

/**
 * Returns a human-readable string of the board for console debugging.
 * Empty cells show as ".", Player 1 as "1", Player 2 as "2". Each row is
 * indented to suggest the rhombus shape.
 * @memberof Hex
 * @function
 * @param {Hex.Board} board The board to display.
 * @returns {string} A printable representation of the board.
 */
Hex.to_string = function (board) {
    const symbols = [".", "1", "2"];
    const row_to_string = function (row, row_index) {
        const indent = " ".repeat(row_index);
        const cells = R.map(function (cell) {
            return symbols[cell];
        }, row);
        return indent + cells.join(" ");
    };
    return board.map(row_to_string).join("\n");
};

export default Object.freeze(Hex);