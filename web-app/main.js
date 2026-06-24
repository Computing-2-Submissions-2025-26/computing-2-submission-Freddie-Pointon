/*jslint browser */
import R from "./ramda.js";
import Hex from "./Hex.js";

// main.js is the user-interface layer. All game rules live in Hex.js; this
// file only reads game state, draws it, and turns user events into calls on
// the module.

// ---------------------------------------------------------------------------
// Fixed page elements
// ---------------------------------------------------------------------------

const game_board_el = document.getElementById("game_board");
const turn_status_el = document.getElementById("turn_status");
const player_1_panel_el = document.getElementById("player_1_panel");
const player_2_panel_el = document.getElementById("player_2_panel");
const player_1_cue_el = document.getElementById("player_1_cue");
const player_2_cue_el = document.getElementById("player_2_cue");
const player_1_name_el = document.getElementById("player_1_name");
const player_2_name_el = document.getElementById("player_2_name");
const size_select_el = document.getElementById("board_size");
const restart_el = document.getElementById("restart");
const undo_el = document.getElementById("undo");
const confirm_dialog_el = document.getElementById("confirm_dialog");
const confirm_start_el = document.getElementById("confirm_start");
const confirm_cancel_el = document.getElementById("confirm_cancel");
const player_1_won_el = document.getElementById("player_1_won");
const player_1_lost_el = document.getElementById("player_1_lost");
const player_2_won_el = document.getElementById("player_2_won");
const player_2_lost_el = document.getElementById("player_2_lost");
const player_1_record_size_el = document.getElementById("player_1_record_size");
const player_2_record_size_el = document.getElementById("player_2_record_size");

// ---------------------------------------------------------------------------
// Mutable state — only this layer touches it
// ---------------------------------------------------------------------------

let game = Hex.new_game(9);
let cell_els = [];      // cell_els[row][col] holds each cell's <div>.
let history = [];       // previous game states, for undo.
let pending_size;       // board size awaiting confirmation.
let win_recorded = false;   // has this game's result been tallied?
let audio_context;          // created lazily on the first move (a gesture).

// ---------------------------------------------------------------------------
// Sound — short synthesised cues, so no audio files need shipping. The audio
// context is created lazily on the first move (a user gesture), which is what
// browsers require before they will play sound.
// ---------------------------------------------------------------------------

const get_audio = function () {
    if (window.AudioContext === undefined) {
        return undefined;
    }
    if (audio_context === undefined) {
        audio_context = new window.AudioContext();
    }
    if (audio_context.state === "suspended") {
        audio_context.resume();
    }
    return audio_context;
};

// Plays one tone with a quick fade in and out, so it sounds like a soft blip
// rather than a hard click or a sustained beep.
const play_tone = function (frequency, start_offset, duration, peak, wave) {
    const context = get_audio();
    if (context === undefined) {
        return;
    }
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const start_at = context.currentTime + start_offset;
    const end_at = start_at + duration;
    oscillator.type = wave;
    oscillator.frequency.value = frequency;
    envelope.gain.setValueAtTime(0.0001, start_at);
    envelope.gain.exponentialRampToValueAtTime(peak, start_at + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, end_at);
    oscillator.connect(envelope);
    envelope.connect(context.destination);
    oscillator.start(start_at);
    oscillator.stop(end_at + 0.02);
};

// A soft tap when a stone is placed.
const play_tap = function () {
    play_tone(330, 0, 0.08, 0.16, "triangle");
};

// A short rising arpeggio when the game is won.
const play_victory = function () {
    play_tone(523.25, 0, 0.16, 0.16, "sine");
    play_tone(659.25, 0.12, 0.16, 0.16, "sine");
    play_tone(783.99, 0.24, 0.16, 0.16, "sine");
    play_tone(1046.5, 0.36, 0.34, 0.18, "sine");
};

// ---------------------------------------------------------------------------
// Small display helpers
// ---------------------------------------------------------------------------

const colour_word = function (player) {
    return (
        player === 1
        ? "Gold"
        : "Black"
    );
};

const player_name = function (player) {
    const field = (
        player === 1
        ? player_1_name_el
        : player_2_name_el
    );
    const typed = field.value.trim();
    const label = (
        typed === ""
        ? "Player " + player
        : typed
    );
    return label + " (" + colour_word(player) + ")";
};

const position_key = function ([row, col]) {
    return `${row},${col}`;
};

// Win tallies kept per board size, so the record on screen always matches the
// size being played. Keyed by the size as a string (a plain object with
// numeric keys is a JSLint error), via Object.create(null) so there are no
// inherited keys to trip over.
const win_counts = Object.create(null);

const counts_for = function (size) {
    const key = String(size);
    if (win_counts[key] === undefined) {
        win_counts[key] = {"player_1": 0, "player_2": 0};
    }
    return win_counts[key];
};

// delta is +1 to record a win, -1 to take one back (used by undo).
const record_win = function (size, player, delta) {
    const counts = counts_for(size);
    if (player === 1) {
        counts.player_1 += delta;
    } else {
        counts.player_2 += delta;
    }
};

// One player's wins are the other's losses, so both columns come from the same
// pair of tallies.
const render_stats = function (size) {
    const counts = counts_for(size);
    const label = size + " \u00d7 " + size;
    player_1_record_size_el.textContent = label;
    player_2_record_size_el.textContent = label;
    player_1_won_el.textContent = String(counts.player_1);
    player_1_lost_el.textContent = String(counts.player_2);
    player_2_won_el.textContent = String(counts.player_2);
    player_2_lost_el.textContent = String(counts.player_1);
};

// While a swap is available there is exactly one stone on the board; this
// finds it so its cell can be marked. This only reads state for display —
// the swap rule itself lives in Hex.swap.
const swappable_position = function () {
    const size = Hex.size(game.board);
    let found;
    R.range(0, size).forEach(function (row) {
        R.range(0, size).forEach(function (col) {
            if (game.board[row][col] !== 0) {
                found = [row, col];
            }
        });
    });
    return found;
};

// ---------------------------------------------------------------------------
// Redraw — the single place that maps game state onto the DOM
// ---------------------------------------------------------------------------

const redraw = function () {
    const size = Hex.size(game.board);
    const won = Hex.is_won(game.board);
    const winning_player = Hex.winner(game.board);
    const current_player = Hex.player_to_move(game);
    const can_swap = Hex.can_swap(game);

    const winning_keys = new Set(
        Hex.winning_path(game.board).map(position_key)
    );
    const swap_target = (
        can_swap
        ? swappable_position()
        : undefined
    );
    const swap_key = (
        swap_target === undefined
        ? ""
        : position_key(swap_target)
    );

    R.range(0, size).forEach(function (row) {
        R.range(0, size).forEach(function (col) {
            const cell = cell_els[row][col];
            const label = cell.firstElementChild;
            const token = game.board[row][col];
            const key = position_key([row, col]);

            cell.className = "hex_cell";
            label.textContent = "";

            // Place the player's stone on owned cells.
            if (token === 1) {
                cell.classList.add("player_1");
            }
            if (token === 2) {
                cell.classList.add("player_2");
            }

            if (won && winning_keys.has(key)) {
                cell.classList.add("winning");
            }

            const is_swap_target = key === swap_key;
            if (is_swap_target) {
                cell.classList.add("swappable");
            }

            // A cell is reachable by keyboard when it is a legal target:
            // an empty cell mid-game, or the swappable opening stone.
            const is_playable = (!won && token === 0) || is_swap_target;
            cell.tabIndex = (
                is_playable
                ? 0
                : -1
            );
            cell.setAttribute(
                "aria-label",
                `Row ${row + 1}, column ${col + 1}: ` + (
                    token === 0
                    ? "empty"
                    : player_name(token)
                )
            );
        });
    });

    // Whose turn it is, shown by lighting up that player's sidebar.
    player_1_panel_el.classList.toggle("turn", !won && current_player === 1);
    player_2_panel_el.classList.toggle("turn", !won && current_player === 2);

    // Opening cues inside the glowing banner: an instruction for the very
    // first move, then the swap option on move two. After that, the glow alone
    // signals the turn and no banner text is shown.
    const cue_for = function (player) {
        if (won || current_player !== player) {
            return "";
        }
        if (game.moves_played === 0) {
            return colour_word(player) + " to start — place a stone.";
        }
        if (can_swap) {
            return "Place a stone, or click the marked stone to swap.";
        }
        return "";
    };
    player_1_cue_el.textContent = cue_for(1);
    player_2_cue_el.textContent = cue_for(2);

    // The middle line shows the result on screen. During play it is hidden,
    // but still announces the turn and swap option to screen readers.
    if (won) {
        turn_status_el.textContent = player_name(winning_player) + " wins!";
        turn_status_el.classList.remove("sr_only");
        turn_status_el.classList.add("win");
        turn_status_el.classList.toggle("win_p1", winning_player === 1);
        turn_status_el.classList.toggle("win_p2", winning_player === 2);
    } else {
        const turn_line = player_name(current_player) + "'s turn.";
        turn_status_el.textContent = (
            can_swap
            ? turn_line + " Click the marked stone to swap, or play."
            : turn_line
        );
        turn_status_el.classList.add("sr_only");
        turn_status_el.classList.remove("win");
        turn_status_el.classList.remove("win_p1");
        turn_status_el.classList.remove("win_p2");
    }

    // Tally the result the first time the game is won, then mirror the record
    // for the size in play into both sidebars.
    if (won && !win_recorded) {
        record_win(size, winning_player, 1);
        win_recorded = true;
    }
    render_stats(size);

    undo_el.disabled = history.length === 0;
    if (won) {
        restart_el.classList.add("attention");
    } else {
        restart_el.classList.remove("attention");
    }
};

// ---------------------------------------------------------------------------
// Acting on a cell — click or keyboard
// ---------------------------------------------------------------------------

const activate_cell = function (row, col) {
    if (Hex.is_won(game.board)) {
        return;
    }
    // Clicking the lone opening stone while a swap is offered performs the
    // swap; anything else is a normal placement.
    const next = (
        (Hex.can_swap(game) && game.board[row][col] !== 0)
        ? Hex.swap(game)
        : Hex.place_stone(Hex.player_to_move(game), [row, col], game)
    );
    if (next === undefined) {
        return;
    }
    history.push(game);
    game = next;
    if (Hex.is_won(game.board)) {
        play_victory();
    } else {
        play_tap();
    }
    redraw();
};

// Steps back to the previous game state. Because each move pushed the whole
// prior state, this also reverses a swap.
const undo = function () {
    if (history.length === 0) {
        return;
    }
    if (win_recorded && Hex.is_won(game.board)) {
        record_win(Hex.size(game.board), Hex.winner(game.board), -1);
        win_recorded = false;
    }
    game = history.pop();
    redraw();
};

const move_focus = function (row, col, key) {
    const size = Hex.size(game.board);
    const moves = {
        "ArrowDown": [row + 1, col],
        "ArrowLeft": [row, col - 1],
        "ArrowRight": [row, col + 1],
        "ArrowUp": [row - 1, col]
    };
    const target = moves[key];
    if (target !== undefined && Hex.is_on_board(size, target)) {
        cell_els[target[0]][target[1]].focus();
    }
};

// ---------------------------------------------------------------------------
// Board-boundary stroke
//
// We draw a thick coloured line along only the outward-facing edges of the
// boundary cells, so the colour marks the board edge rather than tinting whole
// cells. Each of a hex cell's six edges faces one neighbour direction; an edge
// is on the boundary when that neighbour is off the board. Top and bottom
// edges belong to Player 1 (gold); left and right to Player 2 (black). The two
// diagonal edges sit at the corners, where the colours meet — which is honest,
// since a corner can complete either player's connection.
//
// Coordinates come from each cell's rendered position, so the overlay always
// lines up with the cells regardless of size or scaling.
// ---------------------------------------------------------------------------

const SVG_NS = "http://www.w3.org/2000/svg";

const hex_edges = [
    {"from": "UL", "side": "p1", "step": [-1, 0], "to": "T"},
    {"from": "T", "side": "ne", "step": [-1, 1], "to": "UR"},
    {"from": "UR", "side": "p2", "step": [0, 1], "to": "LR"},
    {"from": "LR", "side": "p1", "step": [1, 0], "to": "B"},
    {"from": "B", "side": "sw", "step": [1, -1], "to": "LL"},
    {"from": "LL", "side": "p2", "step": [0, -1], "to": "UL"}
];

const edge_colour_class = function (side, row, size) {
    if (side === "p1") {
        return "edge_red";
    }
    if (side === "p2") {
        return "edge_blue";
    }
    if (side === "ne") {
        return (
            row === 0
            ? "edge_red"
            : "edge_blue"
        );
    }
    // "sw"
    return (
        row === size - 1
        ? "edge_red"
        : "edge_blue"
    );
};

// The six hexagon vertices for a cell occupying the rectangle (x, y, w, h).
const hex_vertices = function (x, y, w, h) {
    return {
        "B": [x + w / 2, y + h],
        "LL": [x, y + h * 0.75],
        "LR": [x + w, y + h * 0.75],
        "T": [x + w / 2, y],
        "UL": [x, y + h * 0.25],
        "UR": [x + w, y + h * 0.25]
    };
};

const make_edge_line = function (from_point, to_point, colour_class) {
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", from_point[0]);
    line.setAttribute("y1", from_point[1]);
    line.setAttribute("x2", to_point[0]);
    line.setAttribute("y2", to_point[1]);
    line.setAttribute("class", "edge_line " + colour_class);
    return line;
};

const draw_board_edges = function (size) {
    const board_rect = game_board_el.getBoundingClientRect();
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "board_edges");
    svg.setAttribute("width", board_rect.width);
    svg.setAttribute("height", board_rect.height);
    svg.setAttribute("aria-hidden", "true");

    R.range(0, size).forEach(function (row) {
        R.range(0, size).forEach(function (col) {
            const rect = cell_els[row][col].getBoundingClientRect();
            const vertex = hex_vertices(
                rect.left - board_rect.left,
                rect.top - board_rect.top,
                rect.width,
                rect.height
            );
            hex_edges.forEach(function (edge) {
                const n_row = row + edge.step[0];
                const n_col = col + edge.step[1];
                const off_board = (
                    n_row < 0 || n_row >= size
                    || n_col < 0 || n_col >= size
                );
                if (off_board) {
                    svg.append(make_edge_line(
                        vertex[edge.from],
                        vertex[edge.to],
                        edge_colour_class(edge.side, row, size)
                    ));
                }
            });
        });
    });
    game_board_el.append(svg);
};

// ---------------------------------------------------------------------------
// Building the board elements
// ---------------------------------------------------------------------------

const build_board = function (size) {
    game_board_el.innerHTML = "";
    cell_els = R.range(0, size).map(function (row) {
        const row_el = document.createElement("div");
        row_el.className = "hex_row";
        row_el.setAttribute("role", "row");
        // The stylesheet reads --row to stagger the row into the rhombus.
        row_el.style.setProperty("--row", row);
        game_board_el.append(row_el);

        return R.range(0, size).map(function (col) {
            const cell = document.createElement("div");
            cell.className = "hex_cell";
            cell.setAttribute("role", "gridcell");

            const label = document.createElement("span");
            label.className = "label";
            cell.append(label);

            cell.onclick = function () {
                activate_cell(row, col);
            };
            cell.onkeydown = function (event) {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    activate_cell(row, col);
                } else {
                    move_focus(row, col, event.key);
                }
            };

            row_el.append(cell);
            return cell;
        });
    });
    draw_board_edges(size);
};

// ---------------------------------------------------------------------------
// Starting and restarting games
// ---------------------------------------------------------------------------

// The opening move is given to a random player each game, so neither colour
// always starts. The randomness lives here in the UI; Hex.new_game stays pure.
const random_first_player = function () {
    return (
        Math.random() < 0.5
        ? 1
        : 2
    );
};

const start_new_game = function (size) {
    game = Hex.new_game(size, random_first_player());
    history = [];
    win_recorded = false;
    build_board(size);
    redraw();
};

// Returns keyboard focus to the board after a player-triggered new game.
const focus_board = function () {
    cell_els[0][0].focus();
};

// Starts a new game, but checks first if a game is in progress so the player
// is not caught out by an accidental restart or size change.
const request_new_game = function (size) {
    const in_progress = game.moves_played > 0 && !Hex.is_won(game.board);
    if (in_progress) {
        pending_size = size;
        confirm_dialog_el.showModal();
    } else {
        start_new_game(size);
        focus_board();
    }
};

// ---------------------------------------------------------------------------
// Wiring up controls
// ---------------------------------------------------------------------------

undo_el.onclick = undo;
player_1_name_el.oninput = redraw;
player_2_name_el.oninput = redraw;

// The board changes only when New game is clicked, using the selected size.
restart_el.onclick = function () {
    request_new_game(Number(size_select_el.value));
};

confirm_start_el.onclick = function () {
    confirm_dialog_el.close();
    start_new_game(pending_size);
    focus_board();
};

// Cancelling (button or Escape) just keeps the current game.
const cancel_new_game = function () {
    confirm_dialog_el.close();
};

confirm_cancel_el.onclick = cancel_new_game;
confirm_dialog_el.oncancel = cancel_new_game;

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

start_new_game(Number(size_select_el.value));