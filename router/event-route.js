import { startGame, disconnect, revealCell, cashOut, emitMinesMultiplier } from '../services/game-event.js';

export const registerEvents = async (socket) => {
    socket.on('message', (data) => {
        console.log({data})
        const event = data.split(':')
        switch (event[0]) {
            case 'MD': return emitMinesMultiplier(socket, event.slice(1, event.length));
            case 'SG': return startGame(socket, event.slice(1, event.length));
            case 'RC': return revealCell(socket, event.slice(1, event.length));
            case 'CO': return cashOut(socket);
        }
    })
    socket.on('disconnect', ()=> disconnect(socket));
}
