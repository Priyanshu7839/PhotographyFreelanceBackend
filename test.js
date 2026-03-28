import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { r2 } from "./r2client.js";
import { supabase } from "./supabase.js";

async function testR2() {
  try {
    const result = await r2.send(
      new ListObjectsV2Command({
        Bucket: process.env.R2_BUCKET,
      })
    );

    console.log("Connected to R2");
    // console.log(result);

    
  } catch (err) {
    console.error("❌ R2 connection failed");
    console.error(err);
  }
}


async function testSupabase() {
    try {
        const { data, error } = await supabase
  .from("clients")
  .select("*")
  .limit(1);
    console.log("Connected to Supabase");

// console.log(data, error);
    } catch (error) {
        console.error('Supabase Connection Failed')
        console.error(error)
    }
}



export default {testR2,testSupabase};