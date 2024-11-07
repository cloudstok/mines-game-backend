import {cashOutAmount, cashOutPartial, createGameData, revealCells} from "../module/bets/bet-session.js";
import { appConfig } from "../utilities/app-config.js";
import { generateUUIDv7 } from "../utilities/common-function.js";
import { getCache, deleteCache, setCache } from "../utilities/redis-connection.js";
import { createLogger } from "../utilities/logger.js";
import { logEventAndEmitResponse, MinesData } from "../utilities/helper-function.js";
const gameLogger = createLogger('Game', 'jsonl');
const betLogger = createLogger('Bets', 'jsonl');
const cashoutLogger = createLogger('Cashout', 'jsonl');
const partialCashoutLogger = createLogger('PartialCashout', 'jsonl');
const cachedGameLogger = createLogger('cachedGame', 'jsonl');

const getPlayerDetailsAndGame = async (socket) => {
    const cachedPlayerDetails = await getCache(`PL:${socket.id}`);
    if (!cachedPlayerDetails) return { error: 'Invalid Player Details' };
    const playerDetails = JSON.parse(cachedPlayerDetails);

    const cachedGame = await getCache(`GM:${playerDetails.id}`);
    if (!cachedGame) return { error: 'Game Details not found' };
    const game = JSON.parse(cachedGame);

    return { playerDetails, game };
};

export const emitMinesMultiplier = (socket)=> {
    socket.emit('mines', JSON.stringify(MinesData));
} 

export const startGame = async(socket, betData) => {
    const betAmount = Number(betData[0]) || null;
    const mineCount = Number(betData[1]) || null;
    if(!betAmount || !mineCount) return socket.emit('betError', 'Bet Amount and mine count is missing');
    const cachedPlayerDetails = await getCache(`PL:${socket.id}`);
    if(!cachedPlayerDetails) return socket.emit('betError', 'Invalid Player Details');
    const playerDetails = JSON.parse(cachedPlayerDetails);
    const gameLog = { logId: generateUUIDv7(), player: playerDetails, betAmount};
    if(Number(playerDetails.balance) < betAmount) return logEventAndEmitResponse(gameLog, 'Insufficient Balance', 'game', socket);
    if((betAmount < appConfig.minBetAmount) || (betAmount > appConfig.maxBetAmount)) return logEventAndEmitResponse(gameLog, 'Invalid Bet', 'game', socket);
    const matchId = generateUUIDv7();
    const game = await createGameData(matchId, betAmount, mineCount, playerDetails, socket);
    await setCache(`GM:${playerDetails.id}`, JSON.stringify(game), 3600);
    gameLogger.info(JSON.stringify({ ...gameLog, game}));
    const gameData = {matchId: game.matchId, bank: game.bank};
    return socket.emit("game_started", gameData);
};

export const revealCell = async(socket, cellData) => {
    const row = Number(cellData[0]);
    const col = Number(cellData[1]);
    if(!row || !col) return socket.emit('betError', 'Row or Col is missing in request');
    const { playerDetails, game, error } = await getPlayerDetailsAndGame(socket);
    const betLog = { logId: generateUUIDv7(), socketId: socket.id};
    if (error) return logEventAndEmitResponse(betLog, error, 'bet', socket);
    Object.assign(betLog, { game, playerDetails});
    const result = await revealCells(game, playerDetails, row, col, socket);
    betLogger.info(JSON.stringify({ ...betLog, result}));
    return socket.emit("revealed_cell", result);
};

export const cashOut = async(socket) => {
    const { playerDetails, game, error } = await getPlayerDetailsAndGame(socket);
    const cashoutLog = { logId: generateUUIDv7(), socketId: socket.id};
    if (error) return logEventAndEmitResponse(cashoutLog, error, 'cashout', socket);
    if(Number(game.bank) <= 0) return logEventAndEmitResponse(cashoutLog, 'Cashout amount cannot be less than or 0', 'cashout', socket);
    const winData = await cashOutAmount(game, playerDetails, socket);
    cashoutLogger.info(JSON.stringify({ ...cashoutLog, game, playerDetails, winData}));
    socket.emit("cash_out_complete", winData);
};


export const disconnect = async(socket) => {
    await deleteCache(`PL:${socket.id}`);
    console.log("User disconnected:", socket.id);
};

export const reconnect = async(socket) => {
    const cachedPlayerDetails = await getCache(`PL:${socket.id}`);
    if(!cachedPlayerDetails) return socket.disconnect(true);
    const playerDetails = JSON.parse(cachedPlayerDetails);
    const cachedGame = await getCache(`GM:${playerDetails.id}`);
    if(!cachedGame) return;
    const game = JSON.parse(cachedGame); 
    cachedGameLogger.info(JSON.stringify({ logId: generateUUIDv7(), playerDetails, game }))
    socket.emit("game_status", { 
        matchId: game.matchId,
        bank: game.bank,
        revealedCells: game.revealedCells,
        multiplier: game.multiplier
    });
}
