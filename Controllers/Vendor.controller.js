import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { supabase } from "../supabase.js";
import { r2 } from "../r2client.js";

const vendorFields = "vendor_id, vendor_name, vendor_type, contact_email, contact_phone, created_at";

export const listVendors = async (req, res) => {
  try {
    const { clientId } = req.params;
    const { data, error } = await supabase.from("vendors").select(vendorFields).eq("client_id", clientId).order("vendor_name");
    if (error) throw error;
    return res.json({ success: true, data });
  } catch (error) {
    console.error("List Vendors Error:", error);
    return res.status(500).json({ success: false, message: "Unable to load vendors" });
  }
};

export const createVendor = async (req, res) => {
  try {
    const { clientId } = req.params;
    const { vendor_name, vendor_type, contact_email, contact_phone } = req.body;
    if (!vendor_name?.trim() || !vendor_type?.trim()) {
      return res.status(400).json({ success: false, message: "Vendor name and type are required" });
    }
    const { data, error } = await supabase
      .from("vendors")
      .insert({
        client_id: clientId,
        vendor_name: vendor_name.trim(),
        vendor_type: vendor_type.trim(),
        contact_email: contact_email?.trim() || null,
        contact_phone: contact_phone?.trim() || null,
        created_by: req.user.member_id,
      })
      .select(vendorFields)
      .single();
    if (error) throw error;
    return res.status(201).json({ success: true, data, message: "Vendor created" });
  } catch (error) {
    console.error("Create Vendor Error:", error);
    return res.status(500).json({ success: false, message: "Unable to create vendor" });
  }
};

export const setVendorConsent = async (req, res) => {
  try {
    const { clientId } = req.params;
    if (req.body.accepted !== true) return res.status(400).json({ success: false, message: "Consent must be explicitly accepted" });
    const { data, error } = await supabase
      .from("clients")
      .update({ vendor_media_consent: true, vendor_media_consent_at: new Date().toISOString() })
      .eq("client_id", clientId)
      .select("vendor_media_consent, vendor_media_consent_at")
      .single();
    if (error) throw error;
    return res.json({ success: true, data });
  } catch (error) {
    console.error("Vendor Consent Error:", error);
    return res.status(500).json({ success: false, message: "Unable to save consent" });
  }
};

export const getVendorMedia = async (req, res) => {
  try {
    const { clientId } = req.params;
    // The consent screen is a client-only acknowledgement. Enforce it here as
    // well so a client cannot bypass the screen by calling the API directly.
    if (req.user.user_type === "client") {
      const { data: client, error: consentError } = await supabase
        .from("clients")
        .select("vendor_media_consent")
        .eq("client_id", clientId)
        .single();
      if (consentError) throw consentError;
      if (!client?.vendor_media_consent) {
        return res.status(403).json({ success: false, message: "Vendor media consent is required" });
      }
    }
    const [{ data: vendors, error: vendorError }, { data: files, error: fileError }] = await Promise.all([
      supabase.from("vendors").select(vendorFields).eq("client_id", clientId).order("vendor_name"),
      supabase.from("files").select("file_id, file_name, file_type, file_size, created_at, object_storage_key, vendor_id").eq("client_id", clientId).eq("is_vendor_shared", true).not("vendor_id", "is", null).order("created_at", { ascending: false }),
    ]);
    if (vendorError) throw vendorError;
    if (fileError) throw fileError;

    const groups = await Promise.all(
      vendors.map(async (vendor) => {
        const vendorFiles = files.filter((file) => String(file.vendor_id) === String(vendor.vendor_id));
        const filesWithPreview = await Promise.all(vendorFiles.map(async (file) => ({
          ...file,
          preview_url: await getSignedUrl(r2, new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: file.object_storage_key }), { expiresIn: 900 }),
        })));
        return { ...vendor, file_count: filesWithPreview.length, files: filesWithPreview };
      })
    );
    return res.json({ success: true, data: groups.filter((group) => group.file_count > 0) });
  } catch (error) {
    console.error("Vendor Media Error:", error);
    return res.status(500).json({ success: false, message: "Unable to load vendor media" });
  }
};
