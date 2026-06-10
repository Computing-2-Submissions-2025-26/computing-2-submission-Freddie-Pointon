/*jslint browser */
// main.js is the UI layer only.
// It calls Hex.js for all game logic — no game rules live here.

import R from "./ramda.js";
import Hex from "./Hex.js";

// ---------------------------------------------------------------------------
// Constants — display strings and UI config
// ---------------------------------------------------------------------------

const PLAYER_NAMES = {1: "Player 1 (Red)", 2: "Player 2 (Blue)"};

const STATUS = {
    active:  "Your turn",
    waiting: "Waiting…",
    won:     "Winner! 🎉",
    lost:    "Better luck next time"
};

// ---------------------------------------------------------------------------
// Module-level state
// All mutable state lives here — only main.js touches it.
// ---------------------------------------------------------------------------

let board = Hex.empty_board(11);

// ---------------------------------------------------------------------------
// DOM references — resolved once at startup
// ---------------------------------------------------------------------------

const game_board_el    = document.getElementById("game_board");
const result_dialog    = document.getElementById("result_dialog");
const result_message   = document.getElementById("result_message");
const new_game_button  = document.getElementById("new_game_button");
const p1_status        = document.getElementById("player_1_status");
const p2_status        = document.getElementById("player_2_status");

// ---------------------------------------------------------------------------
// Board generation
// We build all cell elements once and store references in a 2-D array
// (cell_els[row][col]) so redraw() can update them without querying the DOM.
// ---------------------------------------------------------------------------

/**
 * Builds the grid of cell elements and appends them to #game_board.
 * Returns a 2-D array of the created elements for use by redraw().
 * @param {number} size The board size.
 * @returns {HTMLElement[][]} 2-D array of cell div elements.
 */
const build_board_elements = function (size) {
    game_board_el.innerHTML = "";

    return R.range(0, size).map(function (row) {
        const row_div = document.createElement("div");
        row_div.className = "hex_row";
        // Each row is offset right by half a cell to create the hex slant.
        // Row 0 has no offset; row 1 has half a cell; row n has n * half.
        row_div.style.marginLeft = `${row * 24}px`;
        game_board_el.append(row_div);

        return R.range(0, size).map(function (col) {
            const cell = document.createElement("div");
            cell.className = "hex_cell";
            // tabIndex=0 makes the cell keyboard-focusable (accessibility).
            cell.tabIndex = 0;
            cell.setAttribute("role", "gridcell");
            cell.setAttribute("aria-label", `Row ${row + 1}, Column ${col + 1}`);

            // Click handler — delegates to handle_move.
            cell.onclick = function () {
                handle_move(row, col);
            };

            // Keyboard handler — Enter/Space to place, arrows to navigate.
            cell.onkeydown = function (event) {
                if (event.key === "Enter" || event.key === " ") {
                    handle_move(row, col);
                }
                if (event.key === "ArrowRight" && col < size - 1) {
                    cell_els[row][col + 1].focus();
                }
                if (event.key === "ArrowLeft" && col > 0) {
                    cell_els[row][col - 1].focus();
                }
                if (event.key === "ArrowDown" && row < size - 1) {
                    cell_els[row + 1][col].focus();
                }
                if (event.key === "ArrowUp" && row > 0) {
                    cell_els[row - 1][col].focus();
                }
            };

            row_div.append(cell);
            return cell;
        });
    });
};

const cell_els = build_board_elements(Hex.size(board));

// ---------------------------------------------------------------------------
// Redraw — the single function that maps game state → DOM
// This is the key architectural pattern from the exemplar:
// state changes happen in Hex.js, then we call redraw() to sync the UI.
// ---------------------------------------------------------------------------

/**
 * Reads the current board state and updates every DOM element to match.
 * This is the only place that writes to the DOM (other than build_board_elements).
 */
const redraw = function () {
    const size = Hex.size(board);
    const current_player = Hex.player_to_move(board);
    const ended = Hex.is_ended(board);
    const winning_player = Hex.winner(board);

    // Update each cell's CSS class to reflect its state.
    R.range(0, size).forEach(function (row) {
        R.range(0, size).forEach(function (col) {
            const cell = cell_els[row][col];
            const token = board[row][col];

            // Reset all state classes, then apply the current one.
            cell.className = "hex_cell";
            if (token === 1) {
                cell.classList.add("player_1", "occupied");
                cell.setAttribute("aria-label", `Row ${row + 1}, Col ${col + 1} — Red`);
            } else if (token === 2) {
                cell.classList.add("player_2", "occupied");
                cell.setAttribute("aria-label", `Row ${row + 1}, Col ${col + 1} — Blue`);
            }
            // Remove keyboard focus from occupied cells — they can't be clicked.
            cell.tabIndex = (token === 0 && !ended) ? 0 : -1;
        });
    });

    // Update sidebar status messages.
    if (ended) {
        p1_status.textContent = (winning_player === 1) ? STATUS.won : STATUS.lost;
        p2_status.textContent = (winning_player === 2) ? STATUS.won : STATUS.lost;
        p1_status.className = "status_message";
        p2_status.className = "status_message";
    } else {
        p1_status.textContent = (current_player === 1) ? STATUS.active : STATUS.waiting;
        p2_status.textContent = (current_player === 2) ? STATUS.active : STATUS.waiting;
        p1_status.className = (current_player === 1)
            ? "status_message active"
            : "status_message";
        p2_status.className = (current_player === 2)
            ? "status_message active"
            : "status_message";
    }
};

// ---------------------------------------------------------------------------
// Move handler
// ---------------------------------------------------------------------------

/**
 * Attempts to place the current player's token at [row, col].
 * If the move is legal, updates the board state and redraws.
 * If the game is now over, shows the result dialog.
 * @param {number} row
 * @param {number} col
 */
const handle_move = function (row, col) {
    if (Hex.is_ended(board)) {
        return;
    }
    const player = Hex.player_to_move(board);
    const next_board = Hex.place_token(player, [row, col], board);

    // place_token returns undefined for illegal moves — silently ignore.
    if (next_board === undefined) {
        return;
    }

    board = next_board;
    redraw();

    if (Hex.is_ended(board)) {
        const winning_player = Hex.winner(board);
        result_message.textContent = (
            `${PLAYER_NAMES[winning_player]} wins! ` +
            (winning_player === 1
                ? "A path from top to bottom has been formed."
                : "A path from left to right has been formed.")
        );
        result_dialog.showModal();
    }
};

// ---------------------------------------------------------------------------
// New game
// ---------------------------------------------------------------------------

/**
 * Resets the board to a fresh state and rebuilds the DOM.
 */
const start_new_game = function () {
    board = Hex.empty_board(11);
    // Rebuild the board elements (handles any size change if we extend later).
    build_board_elements(Hex.size(board));
    // Re-populate cell_els by reassigning each row/col reference.
    const size = Hex.size(board);
    R.range(0, size).forEach(function (row) {
        R.range(0, size).forEach(function (col) {
            cell_els[row][col] = (
                game_board_el.children[row].children[col]
            );
        });
    });
    redraw();
    result_dialog.close();
    // Return focus to the top-left cell.
    cell_els[0][0].focus();
};

new_game_button.onclick = start_new_game;
new_game_button.onkeydown = function (event) {
    if (event.key === "Enter" || event.key === " ") {
        start_new_game();
    }
};

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

redraw();
cell_els[0][0].focus();

