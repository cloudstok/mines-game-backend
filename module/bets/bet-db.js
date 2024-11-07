import { write } from "../../utilities/db-connection.js";


export const insertSettlement = async(data)=> {
    try{
        const { roundId, matchId, userId, operatorId, bet_amount, max_mult, status} = data;
        const decodeUserId = decodeURIComponent(userId);
        await write(`INSERT INTO settlement (bet_id, lobby_id, user_id, operator_id, bet_amount, max_mult, status) VALUES(?, ?, ?, ?, ?, ?, ?)`, [roundId, matchId, decodeUserId, operatorId, bet_amount, max_mult, status]);
        console.log(`Settlement data inserted successfully`);
    }catch(err){
        console.error(`Err while inserting data in table is:::`, err);
    }
}