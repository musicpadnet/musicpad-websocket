import { Redis } from "ioredis";
import { Socket } from "socket.io";
import roomModel from "./models/room/room.model";

class Queue {

  async addToQueue (connections: any[string], socket: Socket, redis: Redis, pubClient: Redis): Promise<{success: boolean, waitlist?: any[] | null}> {

    try {
  
      let res = {success: false, waitlist: null};

      const userRoom = await roomModel.findOne({slug: connections[socket.id].room});

      if (!userRoom) throw "room doesn't exist";

      const vRoom = await redis.get(`rooms:${userRoom.id}`);

      if (!vRoom) throw "room doesn't exist in redis";

      const parsedvRoom = JSON.parse(vRoom);

      if (await this.checkPos(parsedvRoom.waitlist, connections[socket.id].user.id) === -1 && (parsedvRoom.current_dj.user == null ? null : parsedvRoom.current_dj.user.id) !== connections[socket.id].user.id) {

        res.success = true;

        let usrObj = {
          id: connections[socket.id].user.id,
          username: connections[socket.id].user.username,
          pfp: connections[socket.id].user.profile_image
        }

        parsedvRoom.waitlist.push(usrObj);

        await redis.set(`rooms:${userRoom.id}`, JSON.stringify(parsedvRoom));

        if (parsedvRoom.waitlist[0] && parsedvRoom.current_dj.user === null) {

          pubClient.publish(`room:${parsedvRoom.id}`, JSON.stringify({"type": "method", "method": "calladvance"}));

        }

        res.waitlist = parsedvRoom.waitlist;

      }

      return res;

    } catch (err) {
  
      throw err;

    }
  
  }

  // check position of user in waitlist. it returns -1 if not found
  async checkPos (waitlist: any[], userid: string): Promise<number> {

    const position = waitlist.findIndex(obj => obj.id === userid);

    return position;

  }

  // leave queue method
  async leaveQueue (connections: any[string], socket: Socket, redis: Redis, pubClient: Redis): Promise<{success: boolean, waitlist?: any[] | null}> {

    try {

      let res = {success: false, waitlist: null};

      if (!connections[socket.id].room) return res;
      
      const room = await roomModel.findOne({slug: connections[socket.id].room});

      if (!room) return res;

      const vRoom = await redis.get(`rooms:${room.id}`);

      if (!vRoom) return res;

      const parsedVRoom = JSON.parse(vRoom);
      
      const position = await this.checkPos(parsedVRoom.waitlist, connections[socket.id].user.id);

      if (parsedVRoom.current_dj.user?.id === connections[socket.id].user.id) {

        if (parsedVRoom.waitlist.length === 0) {
  
          pubClient.publish(`room:${parsedVRoom.id}`, JSON.stringify({"type": "method", "method": "calladvance", "ignoreCycle": true, "dontadd": true}));

          res.success = true;

          res.waitlist = parsedVRoom.waitlist;

        } else {

          pubClient.publish(`room:${parsedVRoom.id}`, JSON.stringify({"type": "method", "method": "calladvance", "dontadd": true}));

          res.success = true;

          res.waitlist = parsedVRoom.waitlist;

        }

      } else {

        if (position !== -1 || parsedVRoom.current_dj.user?.id === connections[socket.id].user.id) {

          res.success = true;
  
          parsedVRoom.waitlist.splice(position, 1);
  
          await redis.set(`rooms:${room.id}`, JSON.stringify(parsedVRoom));
  
          console.log(parsedVRoom.waitlist.length);
  
          if (parsedVRoom.current_dj.user?.id === connections[socket.id].user.id) {
  
            const vRoom2 = await redis.get(`rooms:${room.id}`);
  
            if (!vRoom2) return res;
  
            const parsedVRoom2 = JSON.parse(vRoom2);
  
            if (parsedVRoom2) {
  
              if (parsedVRoom2.waitlist.length === 0) {
  
                pubClient.publish(`room:${parsedVRoom.id}`, JSON.stringify({"type": "method", "method": "calladvance", "ignoreCycle": true}));
  
              } else {
  
                pubClient.publish(`room:${parsedVRoom.id}`, JSON.stringify({"type": "method", "method": "calladvance"}));
  
              }
  
            }
  
          }
  
          res.waitlist = parsedVRoom.waitlist;
  
        }

      }

      return res;

    } catch (err) {

      throw err;

    }

  }

}

export default new Queue();