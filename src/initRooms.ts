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

import roomModel from "./models/room/room.model"

export const initRooms = async () => {

  try {

    await roomModel.updateMany({}, {$set: {users: [], current_dj: {
      user: null,
      song: {
        title: null,
        duration: null,
        time: null,
        upvotes: 0,
        grabs: 0,
        downvotes: 0,
        thumbnail: null
      }
    }}});

  } catch (err) {

    console.log(err);

  }

}