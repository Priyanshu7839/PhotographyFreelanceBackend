import { AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CreateMultipartUploadCommand, GetObjectCommand, PutObjectCommand, UploadPartCommand, } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2 } from "./r2client.js";
import { supabase } from "./supabase.js";
import jwt from "jsonwebtoken";

export const getUploadUrl = async (req, res) => {
  try {
    const { fileName, fileType } = req.body;

    const key = `uploads/${Date.now()}-${fileName}`;

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      ContentType: fileType,
    });

    const url = await getSignedUrl(r2, command, { expiresIn: 3600 });

    res.json({
      uploadUrl: url,
      key,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
};

export const startMultipartUpload = async (req, res) => {
  try {
    const { fileName, fileType } = req.body;

    const key = `uploads/${Date.now()}-${fileName}`;

    const command = new CreateMultipartUploadCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      ContentType: fileType,
    });

    const response = await r2.send(command);

    res.json({
      uploadId: response.UploadId,
      key,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to start multipart upload" });
  }
};


export const getMultipartUploadUrl = async (req, res) => {
  try {
    const { key, uploadId, partNumber } = req.body;

    const command = new UploadPartCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    });

    const signedUrl = await getSignedUrl(r2, command, {
      expiresIn: 300, // 5 minutes
    });

    res.json({ url: signedUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate part URL" });
  }
};



export const completeMultipartUpload = async (req, res) => {
  try {
    const { key, uploadId, parts } = req.body;

    const command = new CompleteMultipartUploadCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts,
      },
    });

    await r2.send(command);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to complete multipart upload" });
  }
};



export const abortMultipartUpload = async (req, res) => {
  try {
    const { key, uploadId } = req.body;

    const command = new AbortMultipartUploadCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      UploadId: uploadId,
    });

    await r2.send(command);

    res.json({ aborted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to abort multipart upload" });
  }
};

export const saveFile = async (req, res) => {
  try {
    const { key, name, size, mediaType, variantType, clientId } = req.body;
    

    const { data, error } = await supabase
      .from("files")
      .insert([
        {
          storage_key: key,
          original_name: name,
          media_type: mediaType,
          variant_type: variantType,
          size,
          client_id: clientId,
        },
      ])
      .select();

    if (error) throw error;

    res.json(data[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save file" });
  }
};

export const saveFileHomepage = async (req, res) => {
  try {
    const { key, mediaType, variantType } = req.body;
    

    const { data, error } = await supabase
      .from("Homepagefiles")
      .insert([
        {
          storage_key: key,
          media_type: mediaType,
          variant_type: variantType,
        },
      ])
      .select();

    if (error) throw error;

    res.json(data[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save file" });
  }
};

export const CreateClient = async(req,res) => {
  try {
    const { name,email,date,location,role,password,eventName } = req.body;

    const payload = {
    name,
    email
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET);

  console.log(token)



    const { data, error } = await supabase
      .from("clients")
      .insert([
        {
          name: name,
          email: email,
          access_token: token,
          event_date:date,
          event_location:location,
          user_role:role,
          password:password,
          event_name:eventName
        },
      ])
      .select();

    if (error) throw error;

    res.status(200).json({msg:"Client Created"});
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: err.message });
  }
}


export const GetClients = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("clients")
      .select("*");

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save file" });
  }
};

export const GetSize = async (req,res) =>{
  const{clientId} = req.body
  try {
    const { data, error } = await supabase
  .from("files")
  .select("size")
  .eq("client_id", clientId);

if (error) {
  console.error(error);
   res.status(500).json({ error: "Failed to Calculate Size" });
} else {
  const totalSize = data.reduce((acc, file) => acc + file.size, 0);
  console.log("Total bytes:", totalSize);
   res.status(200).json({ size: totalSize});
}
  } catch (error) {
    console.error(err);
    res.status(500).json({ error: "Failed to Calculate Size" });
  }
}


export async function getPreviewKey(req,res) {

  const {key} = req.body;

  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: key,
  });

  const url = await getSignedUrl(r2, command, { expiresIn: 3600 });
  return res.json(url);
}

export async function GetClientImages(req,res){
  const {clientId} = req.body
 try {
    const { data, error } = await supabase
      .from("files")
      .select("*")
      .eq("client_id", clientId);

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to Fetch files" });
  }

}


export async function GetHomepageImages(req,res){
  
//  try {
//     const { data, error } = await supabase
//       .from("Homepagefiles")
//       .select("*")
      

//     if (error) throw error;

//     res.json(data);
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: "Failed to Fetch files" });
//   }


  

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const variantType = req.query.variant_type;

  console.log(variantType)


  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from('Homepagefiles')
    .select('*', { count: 'exact' });

  // 🔴 Apply filter ONLY if it exists
  if (variantType && variantType !== 'All') {
    query = query.eq('variant_type', variantType);
  }

  // Always apply order + range at the end
  const { data, count, error } = await query
    .range(from, to);


  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({
    data,
    total: count,
    page,
    totalPages: Math.ceil(count / limit)
  });

}


export async function GetClientData(req,res){
  const {clientId} = req.body
 try {
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .eq("id", clientId);

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to Fetch files" });
  }

}
export async function SelectImage(req,res){
  const {imageId} = req.body
 try {
    const { data } = await supabase
      .from("files")
      .select("selected")
      .eq("pk_id", imageId)
      .single();

      console.log(data)

      const newValue = !data.selected;

    await supabase
  .from("users")
  .update({ selected: newValue })
  .eq("pk_id", imageId);


    if (error) throw error;

    res.json({msg:'selected'});
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to Fetch files" });
  }

}