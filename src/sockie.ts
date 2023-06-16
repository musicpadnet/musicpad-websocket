/*
  __  __           _                      _ 
 |  \/  |         (_)                    | |
 | \  / |_   _ ___ _  ___ _ __   __ _  __| |
 | |\/| | | | / __| |/ __| '_ \ / _` |/ _` |
 | |  | | |_| \__ \ | (__| |_) | (_| | (_| |
 |_|  |_|\__,_|___/_|\___| .__/ \__,_|\__,_|
                         | |                
                         |_|                

* Author: Jordan (LIFELINE) <hello@lifeline1337.dev>
* Copyright (C) 2023 LIFELINE
* Repo: https://github.com/musicpadnet/musicpad-core
* LICENSE: MIT <https://github.com/musicpadnet/musicpad-core/blob/main/LICENSE>
*/

import config from "config";
import { createClient } from "redis";
import { Server, Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import accessTokenModel from "./models/access_token/access_token.model";
import initDB from "./db";
import { initRooms } from "./initRooms";
import roomModel from "./models/room/room.model";
import accountModel from "./models/account/account.model";

export class sockie {

  io: Server;

  connections: any[string] = {};

  constructor () {

    this.dbinit();

    initRooms();

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

          }

        }

      });

      await this.handleDisconnectRoomLeave(socket);

      socket.on("disconnect", () => {

        setTimeout(() => {

          delete this.connections[socket.id];

        }, 3000);

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

        await roomModel.updateOne({slug: this.connections[socket.id].room}, {$pull: {users: this.connections[socket.id].user.id}});

        const r = await roomModel.findOne({slug: this.connections[socket.id].room}).populate("users").exec();

        if (!r) return console.log("room doesn't exists wtf!!!");

        const users = r.users.map((usr) => {

          return {
            id: usr.id,
            username: usr.username,
            pfp: usr.profile_image
          }
  
        });

        this.io.to(this.connections[socket.id].room).emit("message", {"type": "event", "event": "userLeft", "users": users});

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

      await roomModel.updateOne({slug: this.connections[socket.id].room}, {$pull: {users: this.connections[socket.id].user.id}});

        const r = await roomModel.findOne({slug: this.connections[socket.id].room}).populate("users").exec();

        if (!r) return console.log("room doesn't exists wtf!!!");

        const users = r.users.map((usr) => {

          return {
            id: usr.id,
            username: usr.username,
            pfp: usr.profile_image
          }
  
        });

        this.io.to(this.connections[socket.id].room).emit("message", {"type": "event", "event": "userLeft", "users": users});

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

      await roomModel.updateOne({slug: room}, {$addToSet: {users: this.connections[socket.id].user.id}});

      const updatedRoom = await roomModel.findOne({_id: r.id}).populate("users").exec();

      if (!updatedRoom) return console.log("unable to get updated room");

      const users = updatedRoom.users.map((usr) => {

        return {
          id: usr.id,
          username: usr.username,
          pfp: usr.profile_image
        }

      });

      this.connections[socket.id].room = room;

      this.io.to(room).emit("message", {"type": "event", "event": "userJoined", "users": users});

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

}