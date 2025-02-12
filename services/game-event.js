import {cashOutAmount, createGameData, revealedCells} from "../module/bets/bet-session.js";
import { appConfig } from "../utilities/app-config.js";
import { generateUUIDv7 } from "../utilities/common-function.js";
import { getCache, deleteCache, setCache } from "../utilities/redis-connection.js";
import { createLogger } from "../utilities/logger.js";
import { getRandomRowCol, logEventAndEmitResponse, MinesData } from "../utilities/helper-function.js";
const gameLogger = createLogger('Game', 'jsonl');
const betLogger = createLogger('Bets', 'jsonl');
const cashoutLogger = createLogger('Cashout', 'jsonl');

const getPlayerDetailsAndGame = async (socket) => {
    const cachedPlayerDetails = await getCache(`PL:${socket.id}`);
    if (!cachedPlayerDetails) return { error: 'Invalid Player Details' };
    const playerDetails = JSON.parse(cachedPlayerDetails);

    const cachedGame = await getCache(`GM:${playerDetails.id}`);
    if (!cachedGame) return { error: 'Game Details not found' };
    const game = JSON.parse(cachedGame);

    return { playerDetails, game };
};

const emitBetError = (socket, error) => socket.emit('betError', error);

export const emitMinesMultiplier = (socket, data)=> {
    const [number = "3", boardSize = "5"] = data
    socket.emit('mines', JSON.stringify(MinesData(number, boardSize)));
}; 

export const startGame = async(socket, betData) => {
    const [betAmount, boardSize, mineCount] = betData.map(Number);
    if(!betAmount || !mineCount || !boardSize) return socket.emit('betError', 'Bet Amount, Board Size and mine count is missing');
    const cachedPlayerDetails = await getCache(`PL:${socket.id}`);
    if(!cachedPlayerDetails) return socket.emit('betError', 'Invalid Player Details');
    const playerDetails = JSON.parse(cachedPlayerDetails);
    const gameLog = { logId: generateUUIDv7(), player: playerDetails, betAmount};
    if(Number(playerDetails.balance) < betAmount) return logEventAndEmitResponse(gameLog, 'Insufficient Balance', 'game', socket);
    if((betAmount < appConfig.minBetAmount) || (betAmount > appConfig.maxBetAmount)) return logEventAndEmitResponse(gameLog, 'Invalid Bet', 'game', socket);
    const matchId = generateUUIDv7();
    const game = await createGameData(matchId, betAmount, mineCount, boardSize, playerDetails, socket);
    gameLogger.info(JSON.stringify({ ...gameLog, game}));
    if (game.error) {
        return emitBetError(socket, game.error)
    };
    await setCache(`GM:${playerDetails.id}`, JSON.stringify(game), 3600);
    return socket.emit("game_started", {matchId: game.matchId, bank: game.bank});
};

export const revealCell = async(socket, cellData) => {
    const [row, col] = cellData.map(Number);
    const { playerDetails, game, error } = await getPlayerDetailsAndGame(socket);
    if (error) return logEventAndEmitResponse({ socketId: socket.id }, error, 'bet', socket);
    const result = await revealedCells(game, playerDetails, row, col, socket);
    betLogger.info(JSON.stringify({ matchId: game.matchId, playerDetails, result }));
    if (result.error) return emitBetError(socket, result.error);
    if (result.eventName) return socket.emit(result.eventName, result.game || result.cashoutData);
    return socket.emit("revealed_cell", result);
};

export const cashOut = async(socket) => {
    const { playerDetails, game, error } = await getPlayerDetailsAndGame(socket);
    if (error) return logEventAndEmitResponse({ socketId: socket.id }, error, 'cashout', socket);
    if(Number(game.bank) <= 0) return logEventAndEmitResponse({ socketId: socket.id, matchId: game.matchId, player: playerDetails }, 'Cashout amount cannot be less than or 0', 'cashout', socket);
    const winData = await cashOutAmount(game, playerDetails, socket);
    cashoutLogger.info(JSON.stringify({ socketId: socket.id, matchId: game.matchId, playerDetails, winData }));
    return socket.emit("cash_out_complete", winData);
};


export const disconnect = async(socket) => {
    const cachedPlayerDetails = await getCache(`PL:${socket.id}`);
    if(!cachedPlayerDetails) return socket.disconnect(true);
    const playerDetails = JSON.parse(cachedPlayerDetails);
    const cachedGame = await getCache(`GM:${playerDetails.id}`);
    if(cachedGame) await cashOut(socket);
    await deleteCache(`PL:${socket.id}`);
    console.log("User disconnected:", socket.id);
};
