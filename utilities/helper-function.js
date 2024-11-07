import { variableConfig } from "./load-config.js";
import { createLogger } from "./logger.js";
const failedBetLogger = createLogger('failedBets', 'jsonl');
const failedPartialCashoutLogger = createLogger('failedPartialCashout', 'jsonl');
const failedCashoutLogger = createLogger('failedCashout', 'jsonl');
const failedGameLogger = createLogger('failedGame', 'jsonl');
export const logEventAndEmitResponse = (req, res, event, socket) => {
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
  const size = Number(variableConfig.boardSize) || 5;
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

const defaultData = {
  1: 1.01,
  2: 1.05,
  3: 1.10,
  4: 1.15,
  5: 1.21,
  6: 1.27,
  7: 1.34,
  8: 1.42,
  9: 1.51,
  10: 1.61,
  11: 1.73,
  12: 1.86,
  13: 2.02,
  14: 2.20,
  15: 2.42,
  16: 2.69,
  17: 3.03,
  18: 3.46,
  19: 4.04,
  20: 4.85,
  21: 6.06,
  22: 8.08,
  23: 12.12,
  24: 24.25,
  25: 29.25,
}

export const MinesData = variableConfig.mineData || defaultData;

export const getNextMultiplier = (mineCount) => {
  return MinesData[mineCount];
}