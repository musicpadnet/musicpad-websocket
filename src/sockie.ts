import config from "config";
import { createClient } from "redis";
import { Server, Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import accessTokenModel from "./models/access_token/access_token.model";
import initDB from "./db";
import roomModel from "./models/room/room.model";
import accountModel from "./models/account/account.model";
import Redis from "ioredis";
import queue from "./queue";

export class sockie {

  io: Server;

  connections: any[string] = {};

  pubClient: Redis;

  subClient: Redis;

  redis: Redis;

  constructor () {

    this.dbinit();

    this.redis = new Redis(config.get("redis3"));

    this.io = new Server({
      pingInterval: 30000,
      pingTimeout: 60000
    });

    const pubClient = createClient({ url: "redis://localhost:6379" });
    const subClient = pubClient.duplicate();

    pubClient.connect().then();

    subClient.connect().then();
      
    this.io.adapter(createAdapter(pubClient, subClient));

    this.io.listen(config.get("port"));

    this.handleConnections();

    this.pubClient = new Redis(config.get("redis"));

    this.subClient = this.pubClient.duplicate();

    console.log(`socket server is now running on port ${config.get("port")}`);
    
  }

  async dbinit () {

    await initDB(config);

  }

  /**
   * handle connections method
   */
  handleConnections () {

    this.io.on("connection", async (socket) => {

      this.connections[socket.id] = {socket: socket};

      socket.on("message", async (message) => {

        if (message.type === "method") {

          // hanlde messages
          switch (message.method) {

            case "auth":
              return this.hanldeAuthMethod(socket, message.token);

            case "joinroom":
              console.log("joinroom fired");
              return await this.handleJoinRoomMethod(socket, message.room);

            case "leaveroom":
              return await this.handleLeaveRoomMethod(socket);

            case "chatmessage":
              return await this.handleChatMessageMethod(socket, message.message);

            case "joinqueue":
              return await this.handleJoinQueueMethod(socket);
            
            case "leavequeue":
              return this.handleLeaveQueueMethod(socket);

          }

        }

      });
      
      await this.handleDisconnectRoomLeave(socket);

      socket.on("disconnect", () => {

        setTimeout(() => {

          delete this.connections[socket.id];

        }, 10000);

      });

    });

  }

  /**
   * hanldeAuthMethod
   * @param socket 
   * @param token 
   */
  async hanldeAuthMethod (socket:Socket, token: string) {

    const t = await accessTokenModel.findOne({access_token: token}).populate("user").exec();

    if (!t) return socket.emit("autherror");

    this.connections[socket.id].auth = true;

    this.connections[socket.id].user = t.user;

    socket.emit("authenticated");

  }

  /**
   * handleDisconnectRoomLeave
   * @param socket 
   */
  async handleDisconnectRoomLeave (socket: Socket) {

    socket.on("disconnect", async () => {

      if (this.connections[socket.id].room) {

        const r = await roomModel.findOne({slug: this.connections[socket.id].room});

        if (!r) return console.log("unable to find room");

        const rRoom = await this.redis.get(`rooms:${r.id}`);

        if (rRoom) {

          const parsedRoom = JSON.parse(rRoom);

          const findUserIndex = parsedRoom.users.findIndex((usr:any) => usr.id === this.connections[socket.id].user.id);

          if (findUserIndex !== -1) {

            parsedRoom.users.splice(findUserIndex, 1);

            await this.redis.set(`rooms:${r.id}`, JSON.stringify(parsedRoom));

            this.io.to(this.connections[socket.id].room).emit("message", {"type": "event", "event": "userLeft", "users": parsedRoom.users});

            const res = await queue.leaveQueue(this.connections, socket, this.redis);

            if (res.success) {

              this.io.to(this.connections[socket.id].room).emit("message", {type: "event", "event": "userleavewaitlist", "waitlist": res.waitlist});

            }

            this.connections[socket.id].room = null;

          }

        }

      }

    });

  }

  /**
   * handleLeaveRoomMethod
   * @param socket 
   */
  async handleLeaveRoomMethod (socket: Socket) {

    try {

      if (!this.connections[socket.id].room) socket.emit("notinaroomerror");

      socket.leave(this.connections[socket.id].room);

      const r = await roomModel.findOne({slug: this.connections[socket.id].room});

      if (!r) return console.log("unable to find room");

      const rRoom = await this.redis.get(`rooms:${r.id}`);

      if (rRoom) {

        console.log("room exists");

        const parsedRoom = JSON.parse(rRoom);

        const findUserIndex = parsedRoom.users.findIndex((usr:any) => usr.id === this.connections[socket.id].user.id);

        if (findUserIndex !== -1) {

          parsedRoom.users.splice(findUserIndex, 1);

          await this.redis.set(`rooms:${r.id}`, JSON.stringify(parsedRoom));

          this.io.to(this.connections[socket.id].room).emit("message", {"type": "event", "event": "userLeft", "users": parsedRoom.users});

          this.connections[socket.id].room = null;

        }

      }

    } catch (err) {

      console.log(err);

    }

  }

  /**
   * handleJoinRoomMethod
   * @param socket 
   * @param room 
   */
  async handleJoinRoomMethod (socket: Socket, room: string) {

    try {

      if (!this.connections[socket.id].auth) return socket.emit("unauthenicated");

      if (this.connections[socket.id].room) return socket.emit("alreadyinaroom");

      const r = await roomModel.findOne({slug: room}).populate("users").exec();

      if (!r) return socket.emit("message", {"type": "event", "event": "room doesn't exist"});

      socket.join(room);

      const rRoom = await this.redis.get(`rooms:${r.id}`);

      if (rRoom) {

        const parsedRoom = JSON.parse(rRoom);

        const u = {
          id: this.connections[socket.id].user.id,
          username: this.connections[socket.id].user.username,
          pfp: this.connections[socket.id].user.profile_image
        }

        parsedRoom.users.push(u);

        await this.redis.set(`rooms:${r.id}`, JSON.stringify(parsedRoom));

        this.connections[socket.id].room = room;

        this.io.to(room).emit("message", {"type": "event", "event": "userJoined", "users": parsedRoom.users});

      }

    } catch (err) {
      console.log(err);
    }

  }

  /**
   * handleChatMessageMethod
   * @param socket 
   * @param message 
   */
  async handleChatMessageMethod (socket: Socket, message: string) {

    try {

      if (this.connections[socket.id].room) {

        this.io.to(this.connections[socket.id].room).emit("message", {type: "event", event: "chatmessage", message, pfp: this.connections[socket.id].user.profile_image, username: this.connections[socket.id].user.username, id: this.connections[socket.id].user.id});

      }

    } catch (err) {

      console.log(err);

    }

  }

  // hanldeJoinQueueMethod
  async handleJoinQueueMethod (socket: Socket) {

    // ensure user is authenticated and is in a room
    if (this.connections[socket.id].auth === true && this.connections[socket.id].room !== null) {

      const res = await queue.addToQueue(this.connections, socket, this.redis);

      if (!res.success) {

        socket.emit("message", {type: "event", "event": "joinqueueerror"});

      } else {

        this.io.to(this.connections[socket.id].room).emit("message", {type: "event", "event": "userjoinqueue", "waitlist": res.waitlist});

        socket.emit("message", {type: "event", "event": "joinedqueue"});

      }

    }

  }

  // handleLeaveQueueMethod
  async handleLeaveQueueMethod (socket: Socket) {

    try {

      if (this.connections[socket.id].auth === true && this.connections[socket.id].room !== null) {

        const res = await queue.leaveQueue(this.connections, socket, this.redis);

        if (res.success) {

          this.io.to(this.connections[socket.id].room).emit("message", {type: "event", "event": "userleavewaitlist", "waitlist": res.waitlist});

          socket.emit("message", {type: "event", "event": "leftqueue"});

        }

      }

    } catch (err) {

      throw err;

    }

  }

}