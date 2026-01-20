#!/bin/bash

# This script helps redeploy the Supabase function that is causing the 500 error.
# Run this script from the root directory of your project.

echo "Attempting to redeploy the 'validate-upload-token' function..."

# The '--no-verify-jwt' flag is often needed for self-hosted instances
# if you are not using the standard Supabase auth.
# The project-ref is read from your supabase/config.toml file.
supabase functions deploy validate-upload-token --no-verify-jwt

echo ""
echo "Deployment command finished."
echo "If the command was successful, your function has been updated."
echo "Please try uploading a photo from the mobile app again."
echo ""
echo "If you saw an error message above, please provide it so I can help further."
