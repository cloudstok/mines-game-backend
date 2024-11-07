import { appConfig } from "./app-config.js";
import { createLogger } from "./logger.js";
const failedBetLogger = createLogger('failedBets', 'jsonl');
const failedPartialCashoutLogger = createLogger('failedPartialCashout', 'jsonl');
const failedCashoutLogger = createLogger('failedCashout', 'jsonl');
const failedGameLogger = createLogger('failedGame', 'jsonl');
export const logEventAndEmitResponse = (req, res, event, socket)=> {
    let logData = JSON.stringify({ req, res })
    if (event === 'bet') {
        failedBetLogger.error(logData)
    }
    if (event === 'game') {
        failedGameLogger.error(logData)
    }
    if (event === 'cashout') {
        failedCashoutLogger.error(logData);
    }
    if (event === 'partialCashout') {
        failedPartialCashoutLogger.error(logData);
    }
    return socket.emit('betError', res);
}

export const generateGrid = (mineCount) => {
    const size = appConfig.boardSize || 5; 
    const grid = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => ({
        isMine: false,
        revealed: false,
      }))
    );
  
    let minesPlaced = 0;
  
    // Randomly place mines
    while (minesPlaced < mineCount) {
      const row = Math.floor(Math.random() * size);
      const col = Math.floor(Math.random() * size);
  
      if (!grid[row][col].isMine) {
        grid[row][col].isMine = true;
        minesPlaced++;
      }
    }
  
    return grid;
}