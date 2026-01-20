import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CompleteUploadRequest {
  tokenId: string;
  uploadId: string;
  storagePath: string;
  fileSize: number;
  mimeType: string;
  metadata?: Record<string, unknown>;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (req.method !== "POST") {
      console.log("[complete-upload] Invalid method:", req.method);
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        {
          status: 405,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const body: CompleteUploadRequest = await req.json();
    const { tokenId, uploadId, storagePath, fileSize, mimeType, metadata } = body;

    console.log("[complete-upload] Request:", {
      tokenId,
      uploadId,
      storagePath,
      fileSize,
      mimeType
    });

    if (!tokenId || !uploadId || !storagePath || !fileSize || !mimeType) {
      console.log("[complete-upload] Missing required fields");
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: token, error: tokenError } = await supabase
      .from("upload_tokens")
      .select("*")
      .eq("id", tokenId)
      .maybeSingle();

    if (tokenError) {
      console.error("[complete-upload] Token lookup error:", tokenError);
      return new Response(
        JSON.stringify({ error: "Database error looking up token" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!token) {
      console.log("[complete-upload] Token not found:", tokenId);
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("[complete-upload] Creating upload record...");

    const { data: upload, error: uploadError } = await supabase
      .from("pending_uploads")
      .insert({
        id: uploadId,
        token_id: tokenId,
        storage_path: storagePath,
        file_size: fileSize,
        mime_type: mimeType,
        status: "pending",
        metadata: metadata || {},
      })
      .select()
      .single();

    if (uploadError) {
      console.error("[complete-upload] Upload record error:", uploadError);
      return new Response(
        JSON.stringify({ error: `Could not create upload record: ${uploadError.message}` }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("[complete-upload] Upload record created, updating token count...");

    const { error: updateError } = await supabase
      .from("upload_tokens")
      .update({ upload_count: token.upload_count + 1 })
      .eq("id", tokenId);

    if (updateError) {
      console.error("[complete-upload] Token update error:", updateError);
    } else {
      console.log("[complete-upload] Token count updated successfully");
    }

    console.log("[complete-upload] Success!");

    return new Response(
      JSON.stringify({ success: true, upload }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[complete-upload] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: `Server error: ${error.message || 'Unknown'}` }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});