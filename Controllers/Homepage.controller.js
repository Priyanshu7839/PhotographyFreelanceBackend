import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { supabase } from "../supabase.js";
import { r2 } from "../r2client.js";

export const getHomepageFolders =
  async (req, res) => {
    try {
      const {
        data: files,
        error,
      } = await supabase
        .from("Homepagefiles")
        .select(`
          id,
          storage_key,
          media_type,
          variant_type
        `)
        .eq(
          "media_type",
          "image"
        );

      if (error) {
        throw error;
      }

      const foldersMap = {};

      files.forEach((file) => {
        const variantType =
          file.variant_type;

        if (
          !foldersMap[
            variantType
          ]
        ) {
          foldersMap[
            variantType
          ] = [];
        }

        foldersMap[
          variantType
        ].push(file);
      });

      const response =
        await Promise.all(
          Object.entries(
            foldersMap
          ).map(
            async ([
              variantType,
              images,
            ]) => {
              const randomImage =
                images[
                  Math.floor(
                    Math.random() *
                      images.length
                  )
                ];

              const command =
                new GetObjectCommand({
                  Bucket:
                    process.env
                      .R2_BUCKET,
                  Key:
                    randomImage.storage_key,
                });

              const coverImage =
                await getSignedUrl(
                  r2,
                  command,
                  {
                    expiresIn:
                      3600,
                  }
                );

              return {
                variant_type:
                  variantType,

                number_of_images:
                  images.length,

                cover_image:
                  coverImage,
              };
            }
          )
        );

      return res.status(200).json({
        success: true,
        data: response,
      });
    } catch (error) {
      console.error(
        "Homepage Folder Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error?.message ||
          "Internal Server Error",
      });
    }
  };


  export const getHomepageFolderImages =
  async (req, res) => {
    try {
      const { variantType } =
        req.params;

      const {
        data: files,
        error,
      } = await supabase
        .from("Homepagefiles")
        .select(`
          id,
          storage_key,
          variant_type,
          created_at
        `)
        .eq(
          "variant_type",
          variantType
        )
        .eq(
          "media_type",
          "image"
        )
        .order(
          "created_at",
          {
            ascending: false,
          }
        );

      if (error) {
        throw error;
      }

      const images =
        await Promise.all(
          files.map(
            async (file) => {
              const command =
                new GetObjectCommand({
                  Bucket:
                    process.env
                      .R2_BUCKET,
                  Key:
                    file.storage_key,
                });

              const imageUrl =
                await getSignedUrl(
                  r2,
                  command,
                  {
                    expiresIn:
                      3600,
                  }
                );

              return {
                id: file.id,
                image_url:
                  imageUrl,
              };
            }
          )
        );

      return res.status(200).json({
        success: true,
        variant_type:
          variantType,
        total_images:
          images.length,
        data: images,
      });
    } catch (error) {
      console.error(
        "Folder Images Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error?.message ||
          "Internal Server Error",
      });
    }
  };


  export const saveFile = async (req, res) => {
  try {
    const { clientId,key, name, size, mediaType, variantType,vendorshared  } = req.body;
    
const member_id = req.user.member_id
    const { data, error } = await supabase
      .from("files")
      .insert([
        {
            client_id:clientId,
            uploaded_by:member_id,
            object_storage_key:key,
          
          file_name: name,
          file_type: mediaType,
          file_category: variantType,
          file_size:size,
          is_vendor_shared: vendorshared,
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