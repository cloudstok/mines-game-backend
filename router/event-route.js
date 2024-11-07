import { startGame, spin, cashOutAll, cashOutPart, disconnect } from '../services/game-event.js';

export const registerEvents = async (io, socket) => {
    socket.on('message', (data) => {
        const event = data.split(':')
        switch (event[0]) {
            case 'SG': return startGame(io, socket, Number(event[1]));
            case 'SP': return spin(io, socket);
            case 'COA': return cashOutAll(socket);
            case 'COP' : return cashOutPart(socket);
        }
    })
    socket.on('disconnect', ()=> disconnect(socket));
}
