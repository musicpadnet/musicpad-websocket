import mongoose from "mongoose";
import { IConfig } from "config";
import "./models/account/account.model";

export default async (config: IConfig) => {

  try {

    await mongoose.connect(config.get("mongo"));

    console.log("connected to mongo database");

  } catch (err) {

    console.log("unable to connect to mongo");

  }

}