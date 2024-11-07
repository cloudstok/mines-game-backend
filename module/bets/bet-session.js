import { appConfig } from "../../utilities/app-config.js";
import { updateBalanceFromAccount } from "../../utilities/common-function.js";
import { generateGrid, getNextMultiplier } from "../../utilities/helper-function.js";
import { setCache, deleteCache } from "../../utilities/redis-connection.js";
import { insertSettlement } from "./bet-db.js";

export const createGameData = async(matchId, betAmount, mineCount, playerDetails, socket) => {
    const userIP = socket.handshake.headers?.['x-forwarded-for']?.split(',')[0].trim() || socket.handshake.address;
    const playerId = playerDetails.id.split(':')[1];

    const updateBalanceData = {
        id: matchId,
        bet_amount: betAmount,
        socket_id: playerDetails.socketId,
        user_id: playerId,
        ip: userIP
    };

    const transaction = await updateBalanceFromAccount(updateBalanceData, "DEBIT", playerDetails);
    if (!transaction) return socket.emit('betError', 'Bet Cancelled by Upstream');

    playerDetails.balance = (playerDetails.balance - betAmount).toFixed(2);
    await setCache(`PL:${playerDetails.socketId}`, JSON.stringify(playerDetails));
    socket.emit('info', { user_id: playerDetails.userId, operator_id: playerDetails.operatorId, balance: playerDetails.balance });

    const gameData = {
        matchId: matchId,
        lobbyId: Date.now(),
        bank: 0.00,
        bet: betAmount,
        playerGrid: generateGrid(mineCount),
        revealedCells: [],
        revealedCellCount : mineCount,
        txn_id : transaction.txn_id 
    }
    return gameData;
}

export const revealCells = async (game, playerDetails, row, col, socket) => {
    const playerGrid = game.playerGrid;
    if(!(playerGrid && playerGrid[row][col])) return socket.emit('betError', 'Invalid Row or Column Passed');
    if(playerGrid[row][col].revealed) return socket.emit('betError', 'Block is already revealed');
    if(playerGrid[row][col].isMine){
        await deleteCache(`GM:${playerDetails.id}`);
        game.playerGrid[row][col].revealed = true;
        game.revealedCells.push(`${row}:${col}`);
        game.revealedCellCount++;
        await insertSettlement({
            roundId: game.matchId,
            matchId: game.lobbyId,
            gameData: JSON.stringify(game),
            userId: playerDetails.userId,
            operatorId: playerDetails.operatorId,
            bet_amount: game.bet,
            max_mult: 0.00,
            status: 'LOSS'
        });
        game.matchId = '', game.bank = 0.00, game.multiplier = 0;
        return socket.emit('match_ended', game);
    } 
    game.playerGrid[row][col].revealed = true;
    game.revealedCells.push(`${row}:${col}`);
    game.revealedCellCount++;
    game.bank = (game.bet * game.multiplier).toFixed(2);
    game.multiplier = getNextMultiplier(game.revealedCellCount);
    await setCache(`GM:${playerDetails.id}`);
    return { 
        matchId: game.matchId,
        bank: game.bank,
        revealedCells: game.revealedCells,
        multiplier: game.multiplier
    }
}


export const cashOutAmount = async (game, playerDetails, socket) => {
    const winAmount = Math.min(game.bank, appConfig.maxCashoutAmount).toFixed(2);
    const userIP = socket.handshake.headers?.['x-forwarded-for']?.split(',')[0].trim() || socket.handshake.address;
    const updateBalanceData = {
        id: game.matchId,
        winning_amount: winAmount,
        socket_id: playerDetails.socketId,
        txn_id: game.txn_id,
        user_id: playerDetails.id.split(':')[1],
        ip: userIP
    };
    const isTransactionSuccessful = await updateBalanceFromAccount(updateBalanceData, "CREDIT", playerDetails);
    if (!isTransactionSuccessful) console.error(`Credit failed for user: ${playerDetails.userId} for round ${game.roundId}`);
    playerDetails.balance = (Number(playerDetails.balance) + Number(winAmount)).toFixed(2);
    await setCache(`PL:${playerDetails.socketId}`, JSON.stringify(playerDetails));
    socket.emit('info', { user_id: playerDetails.userId, operator_id: playerDetails.operatorId, balance: playerDetails.balance });
    await deleteCache(`GM:${playerDetails.id}`);
    await insertSettlement({
        roundId: game.matchId,
        matchId: game.lobbyId,
        gameData: JSON.stringify(game),
        userId: playerDetails.userId,
        operatorId: playerDetails.operatorId,
        bet_amount: game.bet,
        max_mult: game.multiplier,
        status: 'WIN'
    });
    return {
        payout: winAmount,
        matchId: '',
        playerGrid: game.playerGrid,
        multiplier: game.multiplier
    };
}

