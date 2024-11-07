import {cashOutAmount, cashOutPartial, createGameData, spinGem} from "../module/bets/bet-session.js";
import { appConfig } from "../utilities/app-config.js";
import { generateUUIDv7 } from "../utilities/common-function.js";
import { getCache, deleteCache, setCache } from "../utilities/redis-connection.js";
import { createLogger } from "../utilities/logger.js";
import { logEventAndEmitResponse } from "../utilities/helper-function.js";
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


export const startGame = async(io, socket, betAmount) => {
    const cachedPlayerDetails = await getCache(`PL:${socket.id}`);
    if(!cachedPlayerDetails) return socket.emit('betError', 'Invalid Player Details');
    const playerDetails = JSON.parse(cachedPlayerDetails);
    const gameLog = { logId: generateUUIDv7(), player: playerDetails, betAmount};
    if(Number(playerDetails.balance) < betAmount) return logEventAndEmitResponse(gameLog, 'Insufficient Balance', 'game', socket);
    if((betAmount < appConfig.minBetAmount) || (betAmount > appConfig.maxBetAmount)) return logEventAndEmitResponse(gameLog, 'Invalid Bet', 'game', socket);
    const matchId = generateUUIDv7();
    const game = createGameData(matchId, betAmount);
    await setCache(`GM:${playerDetails.id}`, JSON.stringify(game), 3600);
    gameLogger.info(JSON.stringify({ ...gameLog, game}));
    socket.emit("game_started", game);
    const result = await spinGem(game, playerDetails, socket, io);
    betLogger.info(JSON.stringify({ ...gameLog, result}));
    return socket.emit("spin_result", result);
};

export const spin = async(io, socket) => {
    const { playerDetails, game, error } = await getPlayerDetailsAndGame(socket);
    const betLog = { logId: generateUUIDv7(), socketId: socket.id};
    if (error) return logEventAndEmitResponse(betLog, error, 'bet', socket);
    Object.assign(betLog, { game, playerDetails});
    if(Number(playerDetails.balance) < game.bet) return logEventAndEmitResponse(betLog, 'Insufficient Balance', 'bet', socket);
    const result = await spinGem(game, playerDetails, socket, io);
    betLogger.info(JSON.stringify({ ...betLog, result}));
    return socket.emit("spin_result", result);
};

export const cashOutAll = async(socket) => {
    const { playerDetails, game, error } = await getPlayerDetailsAndGame(socket);
    const cashoutLog = { logId: generateUUIDv7(), socketId: socket.id};
    if (error) return logEventAndEmitResponse(cashoutLog, error, 'cashout', socket);
    const {payout, matchId} = await cashOutAmount(game, playerDetails, socket);
    cashoutLogger.info(JSON.stringify({ ...cashoutLog, game, playerDetails, payout}));
    socket.emit("cash_out_complete", { payout, matchId });
};

export const cashOutPart = async(socket) => {
    const { playerDetails, game, error } = await getPlayerDetailsAndGame(socket);
    const partialCashoutLog = { logId: generateUUIDv7(), socketId: socket.id};
    if (error) return logEventAndEmitResponse(partialCashoutLog, error, 'partialCashout', socket);
    const cashoutData = await cashOutPartial(game, playerDetails, socket);
    partialCashoutLogger.info(JSON.stringify({ ...partialCashoutLog, game, playerDetails, cashoutData}));
    socket.emit("cash_out_partial", cashoutData);
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
        roundId: game.roundId, 
        bank: game.bank,
        sections: { 
            green: game.green, 
            orange: game.orange, 
            purple: game.purple 
        }, 
        result: game.result, 
        darkGem: game.darkGem, 
        stone: game.stone, 
        multiplier: game.multiplier
    });
}
