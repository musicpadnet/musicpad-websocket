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

import mongoose from "mongoose";
import IAccount from "../account/account.type";

export default interface IRoom extends mongoose.Schema {
  id: string,
  name: string,
  slug: string,
  queue_cycle?: boolean,
  queue_locked?: boolean,
  welcome_message?: string,
  description?: string,
  owner?: IAccount,
  usercount?: number,
  perma_bans?: {
    user: IAccount,
    by: IAccount,
    at: Date
  }[],
  perma_mutes?: {
    user: IAccount,
    by: IAccount,
    at: Date
  }[],
  perma_queue_bans?: {
    user: IAccount,
    by: IAccount,
    at: Date
  }[],
  staff?: {
    user: IAccount,
    promoted_by: IAccount,
    rank: number,
    at: Date
  }[],
  current_dj: {
    user: IAccount,
    song: {
      title: string,
      duration: number,
      time: number,
      upvotes: number,
      downvotes: number,
      thumbnail: string,
      grabs: number
    }
  },
  users: IAccount[],
  queue_history?: {
    cid: string,
    title: string,
    duration: number,
    thumbnail: string,
    played_by: IAccount,
    timestamp: Date,
    upvotes: number,
    grabs: number,
    downvotes: number
  }[]
}