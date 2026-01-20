import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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

    const url = new URL(req.url);
    const tokenId = url.searchParams.get("token");

    console.log("[validate-upload-token] Request received for token:", tokenId);

    if (!tokenId) {
      console.log("[validate-upload-token] No token provided");
      return new Response(
        JSON.stringify({ valid: false, error: "Token is required" }),
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
      console.error("[validate-upload-token] Token lookup error:", tokenError);
      return new Response(
        JSON.stringify({ valid: false, error: "Database error" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!token) {
      console.log("[validate-upload-token] Token not found");
      return new Response(
        JSON.stringify({ valid: false, error: "Invalid token" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("[validate-upload-token] Token found:", {
      id: token.id,
      name: token.name,
      is_active: token.is_active,
      upload_count: token.upload_count,
      max_uploads: token.max_uploads,
      expires_at: token.expires_at
    });

    if (!token.is_active) {
      console.log("[validate-upload-token] Token is inactive");
      return new Response(
        JSON.stringify({ valid: false, error: "Token is inactive" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const now = new Date();
    const expiresAt = new Date(token.expires_at);
    if (now > expiresAt) {
      console.log("[validate-upload-token] Token expired");
      return new Response(
        JSON.stringify({ valid: false, error: "Token has expired" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (token.upload_count >= token.max_uploads) {
      console.log("[validate-upload-token] Max uploads reached");
      return new Response(
        JSON.stringify({ valid: false, error: "Maximum uploads reached" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const uploadId = crypto.randomUUID();
    const storagePath = `pending/${tokenId}/${uploadId}.jpg`;

    console.log("[validate-upload-token] Generating signed URL for:", storagePath);

    const { data: signedUrlData, error: signedUrlError } = await supabase
      .storage
      .from("photo-uploads")
      .createSignedUploadUrl(storagePath);

    if (signedUrlError) {
      console.error("[validate-upload-token] Signed URL error:", signedUrlError);
      return new Response(
        JSON.stringify({ valid: false, error: `Upload URL generation failed: ${signedUrlError.message}` }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!signedUrlData || !signedUrlData.signedUrl) {
      console.error("[validate-upload-token] Invalid signed URL data:", signedUrlData);
      return new Response(
        JSON.stringify({ valid: false, error: "Invalid upload credentials generated" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("[validate-upload-token] Success! Signed URL generated");

    const response = {
      valid: true,
      uploadId,
      tokenId,
      folderPath: storagePath,
      signedUrl: signedUrlData.signedUrl,
      token: signedUrlData.token,
      path: signedUrlData.path,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[validate-upload-token] Unexpected error:", error);
    return new Response(
      JSON.stringify({ valid: false, error: `Server error: ${error.message || 'Unknown'}` }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});