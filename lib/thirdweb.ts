import { createThirdwebClient } from "thirdweb";

// Replace with your actual Thirdweb Client ID from dashboard.thirdweb.com
const clientId = process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || "YOUR_CLIENT_ID";

export const client = createThirdwebClient({
    clientId: clientId,
});
